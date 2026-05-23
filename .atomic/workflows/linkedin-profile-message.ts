import { defineWorkflow } from "@bastani/workflows";
import { basename, join } from "node:path";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { WorkflowRunContext } from "@bastani/workflows";
import {
  buildProfileDraftPrompt,
  buildProfileMessageReviewDocument,
  buildSendApprovedProfileMessagePrompt,
  isRecord,
  parseApprovedProfileMessages,
  readNumber,
  readString,
  readStringArray,
  type ApprovedProfileMessage,
  type ApprovedProfileMessageWithMessagePath,
  type GeneratedProfileMessage,
} from "./lib/linkedin-profile-message-helpers.js";

// Pin TMPDIR so playwright-cli's daemon socket path stays under Darwin's
// ~104-byte sun_path limit. macOS's default $TMPDIR (/var/folders/...) plus
// the session-suffixed sock filename overflows and the daemon refuses to bind.
// Setting it here propagates to the daemon, the agent CLI subprocesses, and
// any tmpdir()-derived paths in this file.
process.env.TMPDIR = "/tmp";

interface LinkedinProfileMessageInputs {
  readonly template?: string;
  readonly profiles?: string;
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
  readonly template: string;
  readonly profileLines: readonly string[];
}

interface CleanupArgs {
  readonly sessionName: string;
  readonly profileDir: string;
}

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface LastResult {
  readonly index?: number;
  readonly status: string;
  readonly reason?: string;
}

type PlaywrightCommand = readonly string[];

const BROWSER_STAGE_TOOLS = ["bash", "read"];

function readInputs(ctx: WorkflowRunContext): LinkedinProfileMessageInputs {
  return ctx.inputs as LinkedinProfileMessageInputs;
}

function parseProfileLines(profiles: string): readonly string[] {
  return profiles
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildPrepareReport(args: {
  template: string;
  profileLines: readonly string[];
  profileDir: string;
  resultsPath: string;
}): string {
  return [
    "You are preparing a LinkedIn profile-message drafting and sending batch.",
    "",
    "<template>",
    args.template,
    "</template>",
    "",
    `<profile_count>${args.profileLines.length}</profile_count>`,
    "<first_three_profiles>",
    args.profileLines.slice(0, 3).join("\n"),
    "</first_three_profiles>",
    `<chrome_profile_dir>${args.profileDir}</chrome_profile_dir>`,
    `<generated_results_jsonl>${args.resultsPath}</generated_results_jsonl>`,
    "",
    "Validate and report:",
    "1. Placeholders: find every '[...]' token in the template (case-insensitive). List each verbatim. Placeholders are flexible guidance, not rigid fields.",
    "2. Each profile line should match https://www.linkedin.com/in/<handle>. List any malformed lines.",
    "3. Confirm the hard safety invariant for generation: draft stages must NEVER click Send, press Enter to send, submit a message, or write text into a LinkedIn composer. They only record generated messages for a later human approval gate.",
    "4. Confirm final-send gating: no LinkedIn message may be sent until the workflow user approves the editable batch in the Atomic workflow UI.",
    "5. Confirm mandatory personalization context: every generated draft must inspect the target profile first, reusing the LinkedIn connect workflow's visible-profile depth — Experience, About, Featured, and Activity when visible.",
    "6. Confirm final send flow: after approval, open LinkedIn Messaging, click New message, input the person's name, write the approved message, and click Send.",
    "7. Mention pacing: random 60-180s between profiles/sends, 5-15min coffee break every 5-8 items.",
    "8. One-line LinkedIn TOS / automation warning.",
    "",
    "Keep the whole report under 14 short lines. Do not run any commands; this stage is validation only.",
  ].join("\n");
}

function buildSummarizePrompt(args: {
  resultsPath: string;
  sendResultsPath: string;
  approvalPath: string;
  artifactsDir: string;
  totalProfiles: number;
  approvedCount: number;
}): string {
  return [
    "Summarize the LinkedIn profile-message batch you just finished.",
    "",
    `Generated results JSONL: ${args.resultsPath}`,
    `Send results JSONL: ${args.sendResultsPath}`,
    `Approval document: ${args.approvalPath}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Expected profile count: ${args.totalProfiles}`,
    `Approved messages count: ${args.approvedCount}`,
    "",
    `Read ${args.resultsPath}. Each line is a JSON object with status generated | skip | fail and fields for profile/draft/screenshots.`,
    `Read ${args.sendResultsPath} if it exists. Each line is a JSON object with status sent | skip | fail for approved send attempts.`,
    "If either file is missing, invalid, or has no rows, say so explicitly and then summarize whatever rows are present.",
    "",
    "Print, in this exact order, with no preamble:",
    "1. A markdown table for generated drafts with these columns in this order: index, recipientName, company, status, reason, profileUrl, draft, screenshots. One row per generated result line, in index order. Keep draft cells concise but faithful.",
    "2. A markdown table for approved send results with these columns in this order: index, recipientName, status, reason, profileUrl, screenshots. If no messages were approved, say `No messages were approved for sending.`",
    "3. A `Totals:` line of the form `Totals: generated=<n> approved=<n> sent=<n> skipped=<n> failed=<n>`.",
    `4. An \`Artifacts:\` section listing ${args.artifactsDir} on its own line, followed by ${args.approvalPath}, then a bullet list of every screenshot path referenced in the rows (dedup, preserve order).`,
    "5. A final safety note: LinkedIn messages were sent only for human-approved entries from the Atomic workflow approval gate.",
    "",
    "Do not run the workflow again. Do not open a browser. This stage is read-and-report only.",
  ].join("\n");
}

function setupRun(inputs: LinkedinProfileMessageInputs): RunSetup {
  const template = inputs.template ?? "";
  const profiles = inputs.profiles ?? "";
  const profileLines = parseProfileLines(profiles);
  if (profileLines.length === 0) {
    throw new Error("linkedin-profile-message requires at least one LinkedIn profile URL in the profiles input.");
  }

  const scratch = mkdtempSync(join(tmpdir(), "linkedin-profile-message-"));
  const templatePath = join(scratch, "template.txt");
  const artifactsDir = join(scratch, "artifacts");
  const resultsPath = join(artifactsDir, "generated-results.jsonl");
  const sendResultsPath = join(artifactsDir, "send-results.jsonl");
  const approvalPath = join(artifactsDir, "approved-profile-messages.json");
  const approvedMessagesDir = join(artifactsDir, "approved-messages");
  mkdirSync(approvedMessagesDir, { recursive: true });
  writeFileSync(templatePath, template);
  writeFileSync(resultsPath, "");
  writeFileSync(sendResultsPath, "");
  const profileDir = mkdtempSync(join(tmpdir(), "linkedin-profile-message-profile-"));
  const sessionName = `linkedin-profile-message-${basename(profileDir).slice(-12)}`;

  return {
    templatePath,
    resultsPath,
    sendResultsPath,
    approvalPath,
    approvedMessagesDir,
    artifactsDir,
    profileDir,
    sessionName,
    template,
    profileLines,
  };
}

function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function createPacer(): (itemIndex: number, totalItems: number) => number {
  let itemsUntilBreak = randomBetween(5, 9);
  return function pacingDelayMs(itemIndex, totalItems) {
    if (itemIndex >= totalItems) return 0;
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

const LINKEDIN_UNAUTH_PATTERNS = [
  /linkedin\.com\/login/i,
  /linkedin\.com\/uas\/login/i,
  /linkedin\.com\/checkpoint\//i,
  /linkedin\.com\/authwall/i,
  /linkedin\.com\/signup/i,
];

const LINKEDIN_AUTH_PATH_PATTERNS = [
  /linkedin\.com\/feed/i,
  /linkedin\.com\/in\//i,
  /linkedin\.com\/mynetwork/i,
  /linkedin\.com\/messaging/i,
];

function parseEvalUrl(stdout: string): string | null {
  const match = stdout.match(/### Result\s*\n\s*"([^"\n]+)"/);
  return match ? match[1]! : null;
}

async function runCommand(command: readonly string[]): Promise<CommandResult> {
  let subprocess: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    subprocess = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
  } catch (err) {
    return { exitCode: 127, stdout: "", stderr: String(err) };
  }

  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function commandExists(command: string): Promise<boolean> {
  return (await runCommand(["which", command])).exitCode === 0;
}

async function resolvePlaywrightCommand(): Promise<PlaywrightCommand> {
  if (await commandExists("playwright-cli")) return ["playwright-cli"];
  if (await commandExists("bunx")) return ["bunx", "playwright-cli"];
  throw new Error("Neither `playwright-cli` nor `bunx` is available for LinkedIn browser automation.");
}

async function runPlaywrightCli(
  playwrightCommand: PlaywrightCommand,
  args: readonly string[],
): Promise<CommandResult> {
  return runCommand([...playwrightCommand, ...args]);
}

async function probeCurrentUrl(
  sessionName: string,
  playwrightCommand: PlaywrightCommand,
): Promise<string | null> {
  const out = await runPlaywrightCli(playwrightCommand, ["-s=" + sessionName, "eval", "() => location.href"]);
  if (out.exitCode !== 0) return null;
  return parseEvalUrl(out.stdout);
}

function isAuthenticatedUrl(url: string): boolean {
  if (LINKEDIN_UNAUTH_PATTERNS.some((rx) => rx.test(url))) return false;
  return LINKEDIN_AUTH_PATH_PATTERNS.some((rx) => rx.test(url));
}

async function openLoginSession(args: CleanupArgs): Promise<void> {
  const playwrightCommand = await resolvePlaywrightCommand();
  const opened = await runPlaywrightCli(playwrightCommand, [
    "-s=" + args.sessionName,
    "open",
    "--headed",
    "--persistent",
    "--profile=" + args.profileDir,
    "https://www.linkedin.com/login",
  ]);
  if (opened.exitCode !== 0) {
    throw new Error(`Failed to open LinkedIn login with playwright-cli: ${opened.stderr || opened.stdout}`);
  }

  const timeoutMs = Number(process.env.LINKEDIN_LOGIN_TIMEOUT_MS ?? 10 * 60 * 1000);
  const pollIntervalMs = Number(process.env.LINKEDIN_LOGIN_POLL_MS ?? 3000);
  const deadline = Date.now() + timeoutMs;
  let lastUrl: string | null = null;

  while (Date.now() < deadline) {
    lastUrl = await probeCurrentUrl(args.sessionName, playwrightCommand);
    if (lastUrl && isAuthenticatedUrl(lastUrl)) {
      const gotoMessaging = await runPlaywrightCli(playwrightCommand, [
        "-s=" + args.sessionName,
        "goto",
        "https://www.linkedin.com/messaging/",
      ]);
      if (gotoMessaging.exitCode !== 0) {
        throw new Error(`Failed to navigate LinkedIn session to messaging: ${gotoMessaging.stderr || gotoMessaging.stdout}`);
      }
      return;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for LinkedIn login. ` +
      `Last observed URL: ${lastUrl ?? "<unknown>"}. ` +
      "Set LINKEDIN_LOGIN_TIMEOUT_MS to extend the wait.",
  );
}

async function teardownRun(args: CleanupArgs): Promise<void> {
  try {
    const playwrightCommand = await resolvePlaywrightCommand();
    await runPlaywrightCli(playwrightCommand, ["-s=" + args.sessionName, "close"]);
  } catch {
    // Continue cleanup even if neither CLI path is available during teardown.
  }
  await runCommand(["pkill", "-f", `cliDaemon.js ${args.sessionName}`]);
  await runCommand(["pkill", "-f", args.profileDir]);
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
    };
  } catch {
    return null;
  }
}

function parseGeneratedResultLine(line: string): GeneratedProfileMessage | null {
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
      profileUrl: readString(parsed["profileUrl"]),
      recipientName: readString(parsed["recipientName"]),
      headline: readString(parsed["headline"]),
      company: readString(parsed["company"]),
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

function readGeneratedProfileMessages(resultsPath: string): readonly GeneratedProfileMessage[] {
  return readResultLines(resultsPath)
    .map((line) => parseGeneratedResultLine(line))
    .filter((row): row is GeneratedProfileMessage => row !== null);
}

function appendWorkflowFailureResult(args: {
  readonly resultsPath: string;
  readonly index: number;
  readonly profileUrl: string;
  readonly reason: string;
}): LastResult {
  const row = {
    index: args.index,
    status: "fail",
    reason: args.reason,
    profileUrl: args.profileUrl,
    recipientName: "",
    headline: "",
    company: "",
    profileSignals: [],
    draft: "",
    personalizationNotes: ["workflow appended this row because the browser stage did not append exactly one valid JSONL result for this index"],
    screenshots: [],
  };
  appendFileSync(args.resultsPath, `${JSON.stringify(row)}\n`);
  return { index: row.index, status: row.status, reason: row.reason };
}

function appendWorkflowSendFailureResult(args: {
  readonly sendResultsPath: string;
  readonly approved: ApprovedProfileMessageWithMessagePath;
  readonly reason: string;
}): LastResult {
  const row = {
    index: args.approved.index,
    status: "fail",
    reason: args.reason,
    recipientName: args.approved.recipientName,
    profileUrl: args.approved.profileUrl,
    messagePath: args.approved.messagePath,
    screenshots: [],
  };
  appendFileSync(args.sendResultsPath, `${JSON.stringify(row)}\n`);
  return { index: row.index, status: row.status, reason: row.reason };
}

async function reviewAndApproveProfileMessages(
  ctx: WorkflowRunContext,
  generated: readonly GeneratedProfileMessage[],
): Promise<readonly ApprovedProfileMessage[]> {
  if (generated.length === 0) return [];

  let document = buildProfileMessageReviewDocument(generated);
  for (;;) {
    const edited = await ctx.ui.editor(document);
    const parsed = parseApprovedProfileMessages(edited);
    if (!parsed.ok) {
      document = [
        "# LinkedIn Profile Message Approval — Fix Required",
        "",
        `The approval document could not be parsed: ${parsed.error}`,
        "Please fix the JSON block below, then submit again.",
        "",
        edited,
      ].join("\n");
      continue;
    }

    const confirmed = await ctx.ui.confirm(
      `Approve and send ${parsed.messages.length} LinkedIn profile message(s)? Only entries with approved: true will be sent.`,
    );
    if (confirmed) return parsed.messages;
    document = edited;
  }
}

function persistApprovedMessages(args: {
  approved: readonly ApprovedProfileMessage[];
  approvalPath: string;
  approvedMessagesDir: string;
}): readonly ApprovedProfileMessageWithMessagePath[] {
  mkdirSync(args.approvedMessagesDir, { recursive: true });
  writeFileSync(args.approvalPath, `${JSON.stringify(args.approved, null, 2)}\n`);
  return args.approved.map((row) => {
    const messagePath = join(args.approvedMessagesDir, `message-${row.index}.txt`);
    writeFileSync(messagePath, row.message);
    return { ...row, messagePath };
  });
}

export default defineWorkflow("linkedin-profile-message")
  .description(
    "Draft personalized LinkedIn messages from profile URLs, gate them through editable human approval, then send approved messages via LinkedIn Messaging.",
  )
  .input("template", {
    type: "text",
    required: true,
    description:
      "Message template. Use [bracketed] placeholders for flexible per-profile details — e.g. [name], [company], [specific profile detail]. The workflow rewrites naturally from profile context and leaves no unresolved placeholders.",
  })
  .input("profiles", {
    type: "text",
    required: true,
    description:
      "Newline-separated LinkedIn profile URLs (https://www.linkedin.com/in/<handle>). One per line.",
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
      template,
      profileLines,
    } = setupRun(inputs);
    const generationPacingDelayMs = createPacer();

    try {
      await openLoginSession({ sessionName, profileDir });

      await ctx
        .stage("prepare", { tools: BROWSER_STAGE_TOOLS })
        .prompt(buildPrepareReport({ template, profileLines, profileDir, resultsPath }));

      for (let i = 0; i < profileLines.length; i += 1) {
        const profileUrl = profileLines[i]!;
        const profileIndex = i + 1;
        const resultCountBeforeStage = readResultLines(resultsPath).length;
        await ctx
          .stage(`draft-profile-${profileIndex}`, { tools: BROWSER_STAGE_TOOLS })
          .prompt(
            buildProfileDraftPrompt({
              profileIndex,
              totalProfiles: profileLines.length,
              profileUrl,
              templatePath,
              resultsPath,
              artifactsDir,
              profileDir,
              sessionName,
            }),
          );

        const resultCountAfterStage = readResultLines(resultsPath).length;
        const validStageResult =
          resultCountAfterStage > resultCountBeforeStage
            ? readCurrentStageResult({
                resultsPath,
                previousLineCount: resultCountBeforeStage,
                expectedIndex: profileIndex,
                allowedStatuses: new Set(["generated", "skip", "fail"]),
              })
            : null;
        if (!validStageResult) {
          appendWorkflowFailureResult({
            resultsPath,
            index: profileIndex,
            profileUrl,
            reason: "missing_stage_result",
          });
        }

        await sleep(generationPacingDelayMs(profileIndex, profileLines.length));
      }

      const generated = readGeneratedProfileMessages(resultsPath);
      const approved = await reviewAndApproveProfileMessages(ctx, generated);
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
            buildSendApprovedProfileMessagePrompt({
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
          totalProfiles: profileLines.length,
          approvedCount: approvedWithPaths.length,
        }),
      );

      return {
        artifactsDir,
        resultsPath,
        sendResultsPath,
        approvalPath,
        profileCount: profileLines.length,
        generatedCount: generated.length,
        approvedCount: approvedWithPaths.length,
      };
    } finally {
      await teardownRun({ sessionName, profileDir });
    }
  })
  .compile();
