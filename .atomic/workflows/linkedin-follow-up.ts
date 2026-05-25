import { defineWorkflow } from "@bastani/workflows";
import { basename, join } from "node:path";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { WorkflowRunContext } from "@bastani/workflows";
import {
  buildProcessUnreadPrompt,
  buildReviewDocument,
  buildSendApprovedPrompt,
  normalizeLinkedInTargetUrl,
  isRecord,
  parseApprovedFollowUps,
  readNumber,
  readString,
  readStringArray,
  type ApprovedFollowUp,
  type ApprovedFollowUpWithMessagePath,
  type GeneratedFollowUp,
  type ProcessedLinkedInTargets,
} from "./lib/linkedin-follow-up-helpers.js";

// Pin TMPDIR so playwright-cli's daemon socket path stays under Darwin's
// ~104-byte sun_path limit. macOS's default $TMPDIR (/var/folders/...) plus
// the session-suffixed sock filename overflows and the daemon refuses to bind.
// Setting it here propagates to the daemon, the agent CLI subprocesses, and
// any tmpdir()-derived paths in this file.
process.env.TMPDIR = "/tmp";

interface LinkedinFollowUpInputs {
  readonly template?: string;
  readonly max_messages?: number;
}

interface RunSetup {
  readonly templatePath: string;
  readonly resultsPath: string;
  readonly sendResultsPath: string;
  readonly approvalPath: string;
  readonly approvedMessagesDir: string;
  readonly artifactsDir: string;
  readonly profileDir: string;
  readonly sessionName: string;
  readonly loginScriptPath: string;
  readonly loginStatusPath: string;
  readonly template: string;
}

interface CleanupArgs {
  readonly sessionName: string;
  readonly profileDir: string;
}

interface LoginStatus {
  readonly status?: string;
  readonly url?: string;
  readonly error?: string;
}

interface LastResult {
  readonly index?: number;
  readonly status: string;
  readonly reason?: string;
  readonly profileUrl?: string;
  readonly conversationUrl?: string;
}

const BROWSER_STAGE_TOOLS = ["bash", "read"];
const DEFAULT_MAX_MESSAGES = 100;

function readInputs(ctx: WorkflowRunContext): LinkedinFollowUpInputs {
  return ctx.inputs as LinkedinFollowUpInputs;
}

function normalizeMaxMessages(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MAX_MESSAGES;
  return Math.max(1, Math.floor(value));
}

function buildPrepareReport(args: {
  template: string;
  maxMessages: number;
  profileDir: string;
  resultsPath: string;
}): string {
  return [
    "You are preparing a LinkedIn unread-message follow-up generation batch.",
    "",
    "<template>",
    args.template,
    "</template>",
    "",
    `<max_messages>${args.maxMessages}</max_messages>`,
    `<chrome_profile_dir>${args.profileDir}</chrome_profile_dir>`,
    `<generated_results_jsonl>${args.resultsPath}</generated_results_jsonl>`,
    "",
    "Validate and report:",
    "1. Placeholders: find every '[...]' token in the template (case-insensitive). List each verbatim. Placeholders are flexible guidance, not rigid fields.",
    "2. Confirm scope: main LinkedIn Messaging inbox unread conversations only; generate follow-up text after reading the unread message(s), the last 3 messages from the sender in that conversation history, and the sender profile.",
    "3. Confirm the hard safety invariant for generation: this phase must NEVER click Send, press Enter to send, submit a message, or write text into a LinkedIn composer. It only records generated messages for a later human approval gate.",
    "4. Confirm final-send gating: no LinkedIn message may be sent until the workflow user approves the editable batch in the Atomic workflow UI.",
    "5. Confirm mandatory personalization context: every generated draft must inspect the sender profile first, reusing the LinkedIn connect workflow's visible-profile depth — Experience, About, Featured, and Activity when visible.",
    "6. Mention pacing: random 60-180s between conversations/sends, 5-15min coffee break every 5-8 items.",
    "7. One-line LinkedIn TOS / automation warning.",
    "",
    "Keep the whole report under 14 short lines. Do not run any commands; this stage is validation only.",
  ].join("\n");
}

function buildSummarizePrompt(args: {
  resultsPath: string;
  sendResultsPath: string;
  approvalPath: string;
  artifactsDir: string;
  maxMessages: number;
  reachedCap: boolean;
  approvedCount: number;
}): string {
  return [
    "Summarize the LinkedIn unread-message follow-up batch you just finished.",
    "",
    `Generated results JSONL: ${args.resultsPath}`,
    `Send results JSONL: ${args.sendResultsPath}`,
    `Approval document: ${args.approvalPath}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Safety cap: ${args.maxMessages}`,
    `Reached cap before done: ${String(args.reachedCap)}`,
    `Approved messages count: ${args.approvedCount}`,
    "",
    `Read ${args.resultsPath}. Each line is a JSON object with status generated | skip | fail | done and fields for sender/profile/message/draft/screenshots.`,
    `Read ${args.sendResultsPath} if it exists. Each line is a JSON object with status sent | skip | fail for approved send attempts.`,
    "If either file is missing, invalid, or has no rows, say so explicitly and then summarize whatever rows are present.",
    "",
    "Print, in this exact order, with no preamble:",
    "1. If `Reached cap before done` is true, a warning that the run stopped at the safety cap and may not have processed every unread conversation.",
    "2. A markdown table for generated follow-ups with these columns in this order: index, senderName, company, status, reason, profileUrl, conversationUrl, unreadMessageSummary, draft, screenshots. One row per non-`done` generated result line, in index order. Keep draft cells concise but faithful.",
    "3. A markdown table for approved send results with these columns in this order: index, senderName, status, reason, profileUrl, conversationUrl, screenshots. If no messages were approved, say `No messages were approved for sending.`",
    "4. A `Totals:` line of the form `Totals: generated=<n> approved=<n> sent=<n> skipped=<n> failed=<n> done=<true|false>`.",
    `5. An \`Artifacts:\` section listing ${args.artifactsDir} on its own line, followed by ${args.approvalPath}, then a bullet list of every screenshot path referenced in the rows (dedup, preserve order).`,
    "6. A final safety note: LinkedIn messages were sent only for human-approved entries from the Atomic workflow approval gate.",
    "",
    "Do not run the workflow again. Do not open a browser. This stage is read-and-report only.",
  ].join("\n");
}

function buildLoginPrompt(args: {
  loginScriptPath: string;
  loginStatusPath: string;
  profileDir: string;
  sessionName: string;
}): string {
  return [
    "Open the headed LinkedIn browser session and wait for manual authentication.",
    "Run the login helper exactly once. Do not merely describe it.",
    "Do not enter credentials or automate MFA/checkpoint pages; the user handles login in the headed Chrome window.",
    "The helper prints playwright-cli stdout/stderr and writes a JSON status file so startup failures are visible in this stage transcript.",
    "",
    `Command: bun ${args.loginScriptPath}`,
    `Status file: ${args.loginStatusPath}`,
    `Chrome profile dir: ${args.profileDir}`,
    `Playwright session name: ${args.sessionName}`,
    "",
    "After the command exits:",
    "- If it succeeded, report the authenticated URL from the status file.",
    "- If it failed, report the command output and status-file error clearly.",
    "- Do not generate or send follow-ups here; later stages handle unread conversations.",
  ].join("\n");
}

function buildLoginScript(args: {
  loginStatusPath: string;
  profileDir: string;
  sessionName: string;
}): string {
  return `process.env.TMPDIR = "/tmp";

const sessionName = ${JSON.stringify(args.sessionName)};
const profileDir = ${JSON.stringify(args.profileDir)};
const statusPath = ${JSON.stringify(args.loginStatusPath)};
const loginUrl = "https://www.linkedin.com/login";
const unauthPatterns = [
  /linkedin\\.com\\/login/i,
  /linkedin\\.com\\/uas\\/login/i,
  /linkedin\\.com\\/checkpoint\\//i,
  /linkedin\\.com\\/authwall/i,
  /linkedin\\.com\\/signup/i,
];
const authPathPatterns = [
  /linkedin\\.com\\/feed/i,
  /linkedin\\.com\\/in\\//i,
  /linkedin\\.com\\/mynetwork/i,
  /linkedin\\.com\\/messaging/i,
];

function isAuthenticatedUrl(url) {
  if (unauthPatterns.some((rx) => rx.test(url))) return false;
  return authPathPatterns.some((rx) => rx.test(url));
}

function parseEvalUrl(stdout) {
  const match = stdout.match(/### Result\\s*\\n\\s*"([^"\\n]+)"/);
  return match ? match[1] : null;
}

function printableArg(arg) {
  return /\\s/.test(arg) ? JSON.stringify(arg) : arg;
}

async function writeStatus(status) {
  await Bun.write(statusPath, JSON.stringify({ ...status, ts: new Date().toISOString() }, null, 2));
}

async function runCommand(argv) {
  try {
    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: process.env });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { argv, stdout, stderr, exitCode };
  } catch (error) {
    return { argv, stdout: "", stderr: error instanceof Error ? error.message : String(error), exitCode: 127 };
  }
}

async function runPlaywright(args) {
  const primary = await runCommand(["playwright-cli", ...args]);
  if (primary.exitCode !== 127) return primary;
  console.error("playwright-cli was not available; retrying with bunx playwright-cli");
  return runCommand(["bunx", "playwright-cli", ...args]);
}

function printResult(label, result) {
  console.log("### " + label);
  console.log("$ " + result.argv.map(printableArg).join(" "));
  console.log("exitCode=" + result.exitCode);
  if (result.stdout.trim().length > 0) console.log("stdout:\\n" + result.stdout);
  if (result.stderr.trim().length > 0) console.error("stderr:\\n" + result.stderr);
}

const timeoutMs = Number(process.env.LINKEDIN_LOGIN_TIMEOUT_MS ?? 10 * 60 * 1000);
const pollIntervalMs = Number(process.env.LINKEDIN_LOGIN_POLL_MS ?? 3000);
const deadline = Date.now() + timeoutMs;
let lastUrl = null;
let lastProbe = null;

const opened = await runPlaywright([
  "-s=" + sessionName,
  "open",
  "--headed",
  "--persistent",
  "--profile=" + profileDir,
  loginUrl,
]);
printResult("open LinkedIn login", opened);
if (opened.exitCode !== 0) {
  await writeStatus({ status: "failed", error: "playwright-cli open failed", exitCode: opened.exitCode, stdout: opened.stdout, stderr: opened.stderr });
  process.exit(opened.exitCode || 1);
}

console.log("Waiting up to " + Math.round(timeoutMs / 1000) + "s for manual LinkedIn login...");
while (Date.now() < deadline) {
  lastProbe = await runPlaywright(["-s=" + sessionName, "eval", "() => location.href"]);
  if (lastProbe.exitCode === 0) {
    lastUrl = parseEvalUrl(lastProbe.stdout);
    console.log("currentUrl=" + (lastUrl ?? "<unknown>"));
    if (lastUrl && isAuthenticatedUrl(lastUrl)) {
      await writeStatus({ status: "ok", url: lastUrl });
      console.log("LinkedIn login verified: " + lastUrl);
      process.exit(0);
    }
  } else {
    printResult("probe current URL", lastProbe);
  }
  await Bun.sleep(pollIntervalMs);
}

await writeStatus({
  status: "failed",
  error: "Timed out waiting for LinkedIn login",
  url: lastUrl,
  timeoutMs,
  lastProbe: lastProbe
    ? { exitCode: lastProbe.exitCode, stdout: lastProbe.stdout, stderr: lastProbe.stderr }
    : null,
});
console.error("Timed out after " + Math.round(timeoutMs / 1000) + "s waiting for LinkedIn login. Last observed URL: " + (lastUrl ?? "<unknown>"));
process.exit(1);
`;
}

function writeLoginScript(args: {
  loginScriptPath: string;
  loginStatusPath: string;
  profileDir: string;
  sessionName: string;
}): void {
  writeFileSync(args.loginScriptPath, buildLoginScript(args), { mode: 0o700 });
}

function assertLoginStatus(loginStatusPath: string): void {
  let raw: string;
  try {
    raw = readFileSync(loginStatusPath, "utf8");
  } catch {
    throw new Error(`LinkedIn login stage did not write status file: ${loginStatusPath}`);
  }

  let status: LoginStatus;
  try {
    status = JSON.parse(raw) as LoginStatus;
  } catch {
    throw new Error(`LinkedIn login stage wrote invalid JSON status file: ${loginStatusPath}`);
  }

  if (status.status !== "ok") {
    throw new Error(status.error ?? `LinkedIn login stage failed; inspect ${loginStatusPath}`);
  }
}

function setupRun(inputs: LinkedinFollowUpInputs): RunSetup {
  const template = inputs.template ?? "";
  const scratch = mkdtempSync(join(tmpdir(), "linkedin-follow-up-"));
  const templatePath = join(scratch, "template.txt");
  const artifactsDir = join(scratch, "artifacts");
  const resultsPath = join(artifactsDir, "generated-results.jsonl");
  const sendResultsPath = join(artifactsDir, "send-results.jsonl");
  const approvalPath = join(artifactsDir, "approved-follow-ups.json");
  const approvedMessagesDir = join(artifactsDir, "approved-messages");
  mkdirSync(approvedMessagesDir, { recursive: true });
  writeFileSync(templatePath, template);
  writeFileSync(resultsPath, "");
  writeFileSync(sendResultsPath, "");
  const profileDir = mkdtempSync(join(tmpdir(), "linkedin-follow-up-profile-"));
  const sessionName = `linkedin-follow-up-${basename(profileDir).slice(-12)}`;
  const loginScriptPath = join(scratch, "login.mjs");
  const loginStatusPath = join(scratch, "login-status.json");
  writeLoginScript({ loginScriptPath, loginStatusPath, profileDir, sessionName });
  return {
    templatePath,
    resultsPath,
    sendResultsPath,
    approvalPath,
    approvedMessagesDir,
    artifactsDir,
    profileDir,
    sessionName,
    loginScriptPath,
    loginStatusPath,
    template,
  };
}

function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function createPacer(): (itemIndex: number, totalItems: number, done?: boolean) => number {
  let itemsUntilBreak = randomBetween(5, 9);
  return function pacingDelayMs(itemIndex, totalItems, done = false) {
    if (done || itemIndex >= totalItems) return 0;
    const base = randomBetween(60_000, 180_000);
    itemsUntilBreak -= 1;
    if (itemsUntilBreak <= 0) {
      itemsUntilBreak = randomBetween(5, 9);
      return base + randomBetween(5 * 60_000, 15 * 60_000);
    }
    return base;
  };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQuiet(command: string, args: readonly string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function teardownRun(args: CleanupArgs): Promise<void> {
  const closed = await runQuiet("playwright-cli", [`-s=${args.sessionName}`, "close"]);
  if (!closed) await runQuiet("bunx", ["playwright-cli", `-s=${args.sessionName}`, "close"]);
  // Belt-and-suspenders: if `close` couldn't reach the daemon, kill any
  // lingering daemon process for this session by name. cliDaemon.js lists the
  // session name as its first argv, so a name-anchored pkill is safe. Also kill
  // any orphaned browser process tied to this run's unique temp profile dir.
  await runQuiet("pkill", ["-f", `cliDaemon.js ${args.sessionName}`]);
  await runQuiet("pkill", ["-f", args.profileDir]);
  await rm(args.profileDir, { recursive: true, force: true });
}

function parseLastResultLine(line: string): LastResult | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed) || typeof parsed["status"] !== "string") return null;
    const index = readNumber(parsed["index"]);
    return {
      index: index ?? undefined,
      status: parsed["status"],
      reason: typeof parsed["reason"] === "string" ? parsed["reason"] : undefined,
      profileUrl: readString(parsed["profileUrl"]),
      conversationUrl: readString(parsed["conversationUrl"]),
    };
  } catch {
    return null;
  }
}

function parseGeneratedResultLine(line: string): GeneratedFollowUp | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed)) return null;
    const index = readNumber(parsed["index"]);
    const status = readString(parsed["status"]);
    if (index === null || status !== "generated") return null;
    return {
      index,
      status,
      reason: readString(parsed["reason"]),
      senderName: readString(parsed["senderName"]),
      profileUrl: readString(parsed["profileUrl"]),
      conversationUrl: readString(parsed["conversationUrl"]),
      headline: readString(parsed["headline"]),
      company: readString(parsed["company"]),
      unreadMessageSummary: readString(parsed["unreadMessageSummary"]),
      profileSignals: readStringArray(parsed["profileSignals"]),
      draft: readString(parsed["draft"]),
      personalizationNotes: readStringArray(parsed["personalizationNotes"]),
      screenshots: readStringArray(parsed["screenshots"]),
    };
  } catch {
    return null;
  }
}

function readResultLines(resultsPath: string): readonly string[] {
  let text = "";
  try {
    text = readFileSync(resultsPath, "utf8");
  } catch {
    return [];
  }

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readLastResult(resultsPath: string): LastResult | null {
  const lines = readResultLines(resultsPath);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const result = parseLastResultLine(lines[i]!);
    if (result) return result;
  }
  return null;
}

function readCurrentStageResult(args: {
  readonly resultsPath: string;
  readonly previousLineCount: number;
  readonly expectedIndex: number;
  readonly allowedStatuses: ReadonlySet<string>;
}): LastResult | null {
  const newLines = readResultLines(args.resultsPath).slice(args.previousLineCount);
  const validResults = newLines
    .map((line) => parseLastResultLine(line))
    .filter(
      (result): result is LastResult =>
        result !== null &&
        result.index === args.expectedIndex &&
        args.allowedStatuses.has(result.status),
    );

  return validResults.length === 1 ? validResults[0]! : null;
}

function readGeneratedFollowUps(resultsPath: string): readonly GeneratedFollowUp[] {
  return readResultLines(resultsPath)
    .map((line) => parseGeneratedResultLine(line))
    .filter((row): row is GeneratedFollowUp => row !== null);
}

function createProcessedTargets(): ProcessedLinkedInTargets & {
  readonly profileSet: Set<string>;
  readonly conversationSet: Set<string>;
} {
  const profileSet = new Set<string>();
  const conversationSet = new Set<string>();
  return {
    get profileUrls() {
      return [...profileSet];
    },
    get conversationUrls() {
      return [...conversationSet];
    },
    profileSet,
    conversationSet,
  };
}

function hasProcessedTarget(args: {
  readonly processedTargets: Pick<ReturnType<typeof createProcessedTargets>, "profileSet" | "conversationSet">;
  readonly profileUrl?: string;
  readonly conversationUrl?: string;
}): boolean {
  const profileUrl = normalizeLinkedInTargetUrl(args.profileUrl ?? "");
  const conversationUrl = normalizeLinkedInTargetUrl(args.conversationUrl ?? "");
  return (
    (profileUrl !== "" && args.processedTargets.profileSet.has(profileUrl)) ||
    (conversationUrl !== "" && args.processedTargets.conversationSet.has(conversationUrl))
  );
}

function addProcessedTarget(args: {
  readonly processedTargets: Pick<ReturnType<typeof createProcessedTargets>, "profileSet" | "conversationSet">;
  readonly profileUrl?: string;
  readonly conversationUrl?: string;
}): void {
  const profileUrl = normalizeLinkedInTargetUrl(args.profileUrl ?? "");
  const conversationUrl = normalizeLinkedInTargetUrl(args.conversationUrl ?? "");
  if (profileUrl !== "") args.processedTargets.profileSet.add(profileUrl);
  if (conversationUrl !== "") args.processedTargets.conversationSet.add(conversationUrl);
}

function appendWorkflowFailureResult(args: {
  readonly resultsPath: string;
  readonly index: number;
  readonly reason: string;
}): LastResult {
  const row = {
    index: args.index,
    status: "fail",
    reason: args.reason,
    senderName: "",
    profileUrl: "",
    conversationUrl: "",
    headline: "",
    company: "",
    unreadMessageSummary: "",
    profileSignals: [],
    draft: "",
    personalizationNotes: ["workflow appended this row because the browser stage did not append exactly one valid JSONL result for this index"],
    screenshots: [],
  };
  appendFileSync(args.resultsPath, `${JSON.stringify(row)}\n`);
  return { index: row.index, status: row.status, reason: row.reason };
}

function appendWorkflowDuplicateResult(args: {
  readonly resultsPath: string;
  readonly source: LastResult;
}): LastResult {
  const row = {
    index: args.source.index,
    status: "skip",
    reason: "duplicate_target",
    senderName: "",
    profileUrl: args.source.profileUrl ?? "",
    conversationUrl: args.source.conversationUrl ?? "",
    headline: "",
    company: "",
    unreadMessageSummary: "",
    profileSignals: [],
    draft: "",
    personalizationNotes: [
      "workflow appended this row because the browser stage generated a duplicate LinkedIn target; the duplicate draft is excluded from approval",
    ],
    screenshots: [],
  };
  appendFileSync(args.resultsPath, `${JSON.stringify(row)}\n`);
  return {
    index: row.index,
    status: row.status,
    reason: row.reason,
    profileUrl: row.profileUrl,
    conversationUrl: row.conversationUrl,
  };
}

function appendWorkflowSendFailureResult(args: {
  readonly sendResultsPath: string;
  readonly approved: ApprovedFollowUpWithMessagePath;
  readonly reason: string;
}): LastResult {
  const row = {
    index: args.approved.index,
    status: "fail",
    reason: args.reason,
    senderName: args.approved.senderName,
    profileUrl: args.approved.profileUrl,
    conversationUrl: args.approved.conversationUrl,
    messagePath: args.approved.messagePath,
    screenshots: [],
  };
  appendFileSync(args.sendResultsPath, `${JSON.stringify(row)}\n`);
  return { index: row.index, status: row.status, reason: row.reason };
}

async function reviewAndApproveFollowUps(
  ctx: WorkflowRunContext,
  generated: readonly GeneratedFollowUp[],
): Promise<readonly ApprovedFollowUp[]> {
  if (generated.length === 0) return [];

  let document = buildReviewDocument(generated);
  for (;;) {
    const edited = await ctx.ui.editor(document);
    const parsed = parseApprovedFollowUps(edited);
    if (!parsed.ok) {
      document = [
        "# LinkedIn Follow-up Approval — Fix Required",
        "",
        `The approval document could not be parsed: ${parsed.error}`,
        "Please fix the JSON block below, then submit again.",
        "",
        edited,
      ].join("\n");
      continue;
    }

    const confirmed = await ctx.ui.confirm(
      `Approve and send ${parsed.messages.length} LinkedIn follow-up message(s)? Only entries with approved: true will be sent.`,
    );
    if (confirmed) return parsed.messages;
    document = edited;
  }
}

function persistApprovedMessages(args: {
  approved: readonly ApprovedFollowUp[];
  approvalPath: string;
  approvedMessagesDir: string;
}): readonly ApprovedFollowUpWithMessagePath[] {
  mkdirSync(args.approvedMessagesDir, { recursive: true });
  writeFileSync(args.approvalPath, `${JSON.stringify(args.approved, null, 2)}\n`);
  return args.approved.map((row) => {
    const messagePath = join(args.approvedMessagesDir, `message-${row.index}.txt`);
    writeFileSync(messagePath, row.message);
    return { ...row, messagePath };
  });
}

export default defineWorkflow("linkedin-follow-up")
  .description(
    "Generate replies to unread LinkedIn messages, gate them through editable human approval, then send approved messages only.",
  )
  .input("template", {
    type: "text",
    required: true,
    description:
      "Reply template. Use [bracketed] placeholders for flexible per-sender details — e.g. [name], [company], [what they asked], [specific profile detail]. The workflow rewrites naturally from message/profile context and leaves no unresolved placeholders.",
  })
  .input("max_messages", {
    type: "number",
    default: DEFAULT_MAX_MESSAGES,
    description:
      "Safety cap for unread conversations to process in one run. The workflow stops earlier when no unread inbox conversations remain.",
  })
  .run(async (ctx) => {
    const inputs = readInputs(ctx);
    const {
      templatePath,
      resultsPath,
      sendResultsPath,
      approvalPath,
      approvedMessagesDir,
      artifactsDir,
      profileDir,
      sessionName,
      loginScriptPath,
      loginStatusPath,
      template,
    } = setupRun(inputs);
    const maxMessages = normalizeMaxMessages(inputs.max_messages);
    const generationPacingDelayMs = createPacer();
    const processedTargets = createProcessedTargets();
    let done = false;
    let reachedCap = false;
    let loginCompleted = false;

    try {
      await ctx
        .stage("login", { tools: BROWSER_STAGE_TOOLS })
        .prompt(buildLoginPrompt({ loginScriptPath, loginStatusPath, profileDir, sessionName }));
      assertLoginStatus(loginStatusPath);
      loginCompleted = true;

      await ctx
        .stage("prepare", { tools: BROWSER_STAGE_TOOLS })
        .prompt(buildPrepareReport({ template, maxMessages, profileDir, resultsPath }));

      for (let i = 1; i <= maxMessages; i += 1) {
        const resultCountBeforeStage = readResultLines(resultsPath).length;
        await ctx
          .stage(`generate-unread-${i}`, { tools: BROWSER_STAGE_TOOLS })
          .prompt(
            buildProcessUnreadPrompt({
              conversationIndex: i,
              maxMessages,
              templatePath,
              resultsPath,
              artifactsDir,
              profileDir,
              sessionName,
              alreadyProcessedTargets: processedTargets,
            }),
          );

        const resultCountAfterStage = readResultLines(resultsPath).length;
        const validStageResult =
          resultCountAfterStage > resultCountBeforeStage
            ? readCurrentStageResult({
                resultsPath,
                previousLineCount: resultCountBeforeStage,
                expectedIndex: i,
                allowedStatuses: new Set(["generated", "skip", "fail", "done"]),
              })
            : null;
        const lastResult =
          validStageResult ??
          appendWorkflowFailureResult({
            resultsPath,
            index: i,
            reason: "missing_stage_result",
          });
        const duplicateTarget = hasProcessedTarget({
          processedTargets,
          profileUrl: lastResult.profileUrl,
          conversationUrl: lastResult.conversationUrl,
        });
        if (duplicateTarget && lastResult.status === "generated") {
          appendWorkflowDuplicateResult({ resultsPath, source: lastResult });
        }
        if (!duplicateTarget) {
          addProcessedTarget({
            processedTargets,
            profileUrl: lastResult.profileUrl,
            conversationUrl: lastResult.conversationUrl,
          });
        }
        done = lastResult.status === "done";
        if (done) break;
        await sleep(generationPacingDelayMs(i, maxMessages, done));
      }

      reachedCap = !done;
      const generated = readGeneratedFollowUps(resultsPath);
      const approved = await reviewAndApproveFollowUps(ctx, generated);
      const approvedWithPaths = persistApprovedMessages({
        approved,
        approvalPath,
        approvedMessagesDir,
      });

      const sendPacingDelayMs = createPacer();
      for (let i = 0; i < approvedWithPaths.length; i += 1) {
        const approvedMessage = approvedWithPaths[i]!;
        const sendResultCountBeforeStage = readResultLines(sendResultsPath).length;
        await ctx
          .stage(`send-approved-${approvedMessage.index}`, { tools: BROWSER_STAGE_TOOLS })
          .prompt(
            buildSendApprovedPrompt({
              approved: approvedMessage,
              sendResultsPath,
              artifactsDir,
              profileDir,
              sessionName,
            }),
          );

        const sendResultCountAfterStage = readResultLines(sendResultsPath).length;
        const validSendResult =
          sendResultCountAfterStage > sendResultCountBeforeStage
            ? readCurrentStageResult({
                resultsPath: sendResultsPath,
                previousLineCount: sendResultCountBeforeStage,
                expectedIndex: approvedMessage.index,
                allowedStatuses: new Set(["sent", "skip", "fail"]),
              })
            : null;
        if (!validSendResult) {
          appendWorkflowSendFailureResult({
            sendResultsPath,
            approved: approvedMessage,
            reason: "missing_stage_result",
          });
        }

        await sleep(sendPacingDelayMs(i + 1, approvedWithPaths.length));
      }

      await ctx.stage("summarize", { tools: BROWSER_STAGE_TOOLS }).prompt(
        buildSummarizePrompt({
          resultsPath,
          sendResultsPath,
          approvalPath,
          artifactsDir,
          maxMessages,
          reachedCap,
          approvedCount: approvedWithPaths.length,
        }),
      );

      return {
        artifactsDir,
        resultsPath,
        sendResultsPath,
        approvalPath,
        maxMessages,
        generatedCount: generated.length,
        approvedCount: approvedWithPaths.length,
        reachedCap,
        browserLeftOpen: true,
        sessionName,
        profileDir,
      };
    } catch (err) {
      if (!loginCompleted) {
        await teardownRun({ sessionName, profileDir });
      }
      throw err;
    }
  })
  .compile();
