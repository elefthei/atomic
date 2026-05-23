import { defineWorkflow } from "@bastani/workflows";
import { basename, join } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { WorkflowRunContext } from "@bastani/workflows";

// Pin TMPDIR so playwright-cli's daemon socket path stays under Darwin's
// ~104-byte sun_path limit. macOS's default $TMPDIR (/var/folders/...) plus
// the session-suffixed sock filename overflows and the daemon refuses to bind.
// Setting it here propagates to the daemon, the agent CLI subprocesses, and
// any tmpdir()-derived paths in this file.
process.env.TMPDIR = "/tmp";

interface LinkedinConnectInputs {
  readonly template?: string;
  readonly profiles?: string;
  readonly dry_run?: string;
}

interface RunSetup {
  readonly templatePath: string;
  readonly artifactsDir: string;
  readonly profileDir: string;
  readonly sessionName: string;
  readonly loginScriptPath: string;
  readonly loginStatusPath: string;
  readonly profileLines: readonly string[];
  readonly template: string;
  readonly noNote: boolean;
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

const BROWSER_STAGE_TOOLS = ["bash", "read"];

function readInputs(ctx: WorkflowRunContext): LinkedinConnectInputs {
  return ctx.inputs as LinkedinConnectInputs;
}

function buildPrepareReport(args: {
  template: string;
  profileLines: readonly string[];
  dryRun: string;
  profileDir: string;
  noNote: boolean;
}): string {
  return [
    "You are preparing a LinkedIn connection-request batch.",
    "",
    "<template>",
    args.template,
    "</template>",
    "",
    `<profile_count>${args.profileLines.length}</profile_count>`,
    "<first_three_profiles>",
    args.profileLines.slice(0, 3).join("\n"),
    "</first_three_profiles>",
    "",
    `<dry_run>${args.dryRun}</dry_run>`,
    `<chrome_profile_dir>${args.profileDir}</chrome_profile_dir>`,
    `<mode>${args.noNote ? "no_note" : "personalized_note"}</mode>`,
    "",
    "Validate and report:",
    args.noNote
      ? "1. Template is empty/whitespace-only, so execute stages must send plain connection requests without clicking Add a note or writing a message."
      : "1. Placeholders: find every '[...]' token in the template (case-insensitive). List each verbatim. Templates with zero placeholders are sent literally; templates with placeholders are filled from each person's LinkedIn profile by the LLM. Casing is ignored. Templates with no placeholders are sent verbatim.",
    "2. Each profile line should match https://www.linkedin.com/in/<handle>. List any malformed lines.",
    "3. Print the total profile count.",
    "4. Confirm to the user that the headed Chrome window is already open and logged into LinkedIn (the login stage handled login before this stage); execute stages will reuse that session.",
    "5. Mention pacing: random 60-180s between profiles, 5-15min coffee break every 5-8 profiles.",
    "6. One-line LinkedIn TOS warning.",
    "",
    "Keep the whole report under 14 short lines. Do not run any commands; this stage is validation only.",
  ].join("\n");
}

function buildExecutePrompt(args: {
  profileUrl: string;
  profileIndex: number;
  totalProfiles: number;
  templatePath: string;
  artifactsDir: string;
  dryRun: string;
  profileDir: string;
  sessionName: string;
  noNote: boolean;
}): string {
  if (args.noNote) return buildNoNoteExecutePrompt(args);

  const n = args.profileIndex;
  return [
    `Process ONE LinkedIn profile (#${n} of ${args.totalProfiles}) with playwright-cli and visual browser inspection.`,
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "You are the decision-maker: use snapshots, screenshots, and visible browser state to extract profile details, fill the template, and click the visible LinkedIn controls.",
    "",
    `Profile URL: ${args.profileUrl}`,
    `Profile index: ${n} (of ${args.totalProfiles})`,
    `Template file: ${args.templatePath}`,
    `Chrome profile dir: ${args.profileDir}`,
    `Playwright session name: ${args.sessionName}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Dry run: ${args.dryRun}`,
    "",
    "<message_quality>",
    "Your job: write a connection note that sounds like you actually read the profile, using the template as the shape and voice. The [bracketed] slots are hints, not contracts — fill them when the profile has a clean answer, adapt the wording when it doesn't, skip when there's nothing real to say.",
    "",
    "Rules:",
    "- Fill each [slot] from visible profile content (Experience, About, Featured, Activity). [name] and [Name] both mean first name, capitalized.",
    "- If a slot has no clean answer in visible content, rewrite the surrounding phrase so the note still reads naturally AND stays grounded in something visible. Keep the template's tone and rough length.",
    "- If the profile is too sparse to ground any substitute, skip with reason `low_confidence`.",
    "- Never invent biographical facts. If you'd be embarrassed to receive this note as the recipient, skip.",
    "- Final note ≤ 300 characters.",
    "- Record any wording change in the result line's `substitutions` field.",
    "",
    "Examples (template: \"Hi [name], you're building at [company] — would love to connect on AI/ML.\"):",
    "  Profile: Jane Doe, PM at Acme.",
    "  → \"Hi Jane, you're building at Acme — would love to connect on AI/ML.\"",
    "",
    "  Profile: Sam, currently on a career break after Cisco + Microsoft.",
    "  → \"Hi Sam, interesting chapter post-Cisco/Microsoft — would love to connect on AI/ML.\" (substitutions: [company] → \"post-Cisco/Microsoft\")",
    "",
    "  Profile: name only, headline \"Entrepreneur\", no other content.",
    "  → skip (low_confidence — nothing to ground a substitution).",
    "</message_quality>",
    "",
    "Tooling rules:",
    "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
    `2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${args.sessionName} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for clicks and fills. Re-snapshot after every navigation, menu open, modal open, and modal fill.",
    "4. Screenshots are primary evidence. Save at least one profile screenshot and one final modal screenshot.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "The browser session is already open in headed mode and logged into LinkedIn — the login stage handled login before launching this stage. Do NOT run `playwright-cli open`. Just attach to the existing session via `-s=` and start with the goto in Step 1.",
    "",
    "Step 1 — process this one profile.",
    `  a. Navigate with \`playwright-cli -s=${args.sessionName} goto ${args.profileUrl}\`.`,
    `  b. Save screenshots to ${args.artifactsDir}/profile-${n}-top.png and, after scrolling, ${args.artifactsDir}/profile-${n}-details.png.`,
    "  c. Scroll through the profile, snapshotting and screenshotting as needed to read Experience, About, Featured, and Activity content.",
    "  d. Produce the note per <message_quality>. Before sending, re-read it: if a literal [bracket] survived, fix or skip. If it doesn't sound human, fix or skip.",
    "  e. Find the visible Connect action from the snapshot. If direct Connect is absent, open the visible More menu and inspect that menu snapshot for Connect. Skip if the page indicates already connected, pending, unavailable, or no connection path.",
    `  f. After the invitation modal opens, snapshot it, click the visible Add a note action by ref, snapshot again, fill the visible note textarea by ref, and save a final screenshot to ${args.artifactsDir}/profile-${n}-modal.png.`,
    "  g. If dry_run is true, do not send. Close/cancel the modal after capturing the filled modal screenshot and mark status `dry_run`.",
    "  h. If dry_run is false, click the visible Send/Send invitation button only after verifying the filled modal screenshot has the intended note and no placeholders.",
    "",
    "Step 2 — print the result line AND persist it.",
    `Build exactly one space-separated line: profile=${n} url=${args.profileUrl} name=<name> company=<company> status=<status> reason=<reason> screenshot=<path> substitutions=<deviations>. Use \`-\` for empty fields. Use \`;\` to separate multiple substitutions. Never include a literal newline inside any field.`,
    "Use statuses: sent | dry_run | skip | fail. Use skip reasons: low_confidence | unfilled_placeholder | message_too_long | no_connect_button | already_connected | pending | modal_interaction_failed | user_login_required.",
    `Print that line to stdout, then append the exact same single line to ${args.artifactsDir}/results.log via shell (e.g. \`printf '%s\\n' '<line>' >> ${args.artifactsDir}/results.log\`). The append is mandatory — the later summarize stage reads this file.`,
    "",
    "Do not loop, do not process any other URLs, do not wait/sleep — pacing is handled outside this session. Stop after the result line is both printed and appended.",
  ].join("\n");
}

function buildNoNoteExecutePrompt(args: {
  profileUrl: string;
  profileIndex: number;
  totalProfiles: number;
  templatePath: string;
  artifactsDir: string;
  dryRun: string;
  profileDir: string;
  sessionName: string;
  noNote: boolean;
}): string {
  const n = args.profileIndex;
  return [
    `Process ONE LinkedIn profile (#${n} of ${args.totalProfiles}) with playwright-cli and visual browser inspection.`,
    "The template file is empty/whitespace-only, so send a connection request WITHOUT adding a note.",
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "Use snapshots, screenshots, and visible browser state to click the visible LinkedIn controls.",
    "",
    `Profile URL: ${args.profileUrl}`,
    `Profile index: ${n} (of ${args.totalProfiles})`,
    `Template file: ${args.templatePath}`,
    `Chrome profile dir: ${args.profileDir}`,
    `Playwright session name: ${args.sessionName}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Dry run: ${args.dryRun}`,
    "",
    "No-note rules:",
    "- Do NOT click Add a note.",
    "- Do NOT fill a textarea or draft any message.",
    "- After opening the invitation modal/dialog, click the visible send-without-note action. The button text may be `Send without a note`, `Send`, or `Send invitation` depending on LinkedIn's UI.",
    "- If the modal only offers Add a note plus a send action, use the send action without adding a note.",
    "- Skip if the page indicates already connected, pending, unavailable, no connection path, or user login required.",
    "",
    "Tooling rules:",
    "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
    `2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${args.sessionName} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for clicks. Re-snapshot after every navigation, menu open, modal open, and send/cancel action.",
    "4. Screenshots are primary evidence. Save at least one profile screenshot and one final modal screenshot.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "The browser session is already open in headed mode and logged into LinkedIn — the login stage handled login before launching this stage. Do NOT run `playwright-cli open`. Just attach to the existing session via `-s=` and start with the goto in Step 1.",
    "",
    "Step 1 — process this one profile.",
    `  a. Navigate with \`playwright-cli -s=${args.sessionName} goto ${args.profileUrl}\`.`,
    `  b. Save a profile screenshot to ${args.artifactsDir}/profile-${n}-top.png.`,
    "  c. Find the visible Connect action from the snapshot. If direct Connect is absent, open the visible More menu and inspect that menu snapshot for Connect. Skip if the page indicates already connected, pending, unavailable, or no connection path.",
    `  d. After the invitation modal/dialog opens, snapshot it and save a final screenshot to ${args.artifactsDir}/profile-${n}-modal.png. Verify no note text is being added.`,
    "  e. If dry_run is true, do not send. Close/cancel the modal after capturing the modal screenshot and mark status `dry_run`.",
    "  f. If dry_run is false, click the visible `Send without a note` / `Send` / `Send invitation` button in the dialog without adding a note, then re-snapshot to confirm the modal closed or request is pending/sent.",
    "",
    "Step 2 — print the result line AND persist it.",
    `Build exactly one space-separated line: profile=${n} url=${args.profileUrl} name=- company=- status=<status> reason=<reason> screenshot=<path> substitutions=-. Use \`-\` for empty fields. Never include a literal newline inside any field.`,
    "Use statuses: sent | dry_run | skip | fail. Use skip reasons: no_connect_button | already_connected | pending | modal_interaction_failed | user_login_required.",
    `Print that line to stdout, then append the exact same single line to ${args.artifactsDir}/results.log via shell (e.g. \`printf '%s\\n' '<line>' >> ${args.artifactsDir}/results.log\`). The append is mandatory — the later summarize stage reads this file.`,
    "",
    "Do not loop, do not process any other URLs, do not wait/sleep — pacing is handled outside this session. Stop after the result line is both printed and appended.",
  ].join("\n");
}

function buildSummarizePrompt(args: {
  resultsPath: string;
  artifactsDir: string;
  totalProfiles: number;
}): string {
  return [
    "Summarize the LinkedIn connection-request batch you just finished.",
    "",
    `Results file: ${args.resultsPath}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Expected profile count: ${args.totalProfiles}`,
    "",
    `Read ${args.resultsPath}. Each line has the shape \`profile=<n> url=<url> name=<name> company=<company> status=<status> reason=<reason> screenshot=<path> substitutions=<deviations>\` with \`-\` for empty fields.`,
    "If the file is missing or has fewer lines than the expected profile count, say so explicitly at the top of your output and then summarize whatever rows are present.",
    "",
    "Print, in this exact order, with no preamble:",
    "1. A markdown table with these columns in this order: url, name, company, status, reason, substitutions, screenshot. One row per result line, in profile-number order. Replace `-` with an empty cell. Decode `+` back to spaces and `_` back to spaces in name/company/substitutions where it improves readability; leave URLs untouched.",
    "2. A `Totals:` line of the form `Totals: sent=<n> dry_run=<n> skipped=<n> failed=<n>` (skip status counts toward `skipped`).",
    `3. An \`Artifacts:\` section listing ${args.artifactsDir} on its own line, followed by a bullet list of every \`screenshot=\` path referenced in the rows (dedup, preserve order).`,
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
    "- Do not run profile processing here; later stages handle profile URLs.",
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
const feedUrl = "https://www.linkedin.com/feed/";
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
      const normalized = await runPlaywright(["-s=" + sessionName, "goto", feedUrl]);
      printResult("normalize to feed", normalized);
      if (normalized.exitCode !== 0) {
        await writeStatus({ status: "failed", error: "authenticated but feed navigation failed", url: lastUrl, exitCode: normalized.exitCode, stdout: normalized.stdout, stderr: normalized.stderr });
        process.exit(normalized.exitCode || 1);
      }
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

function setupRun(inputs: LinkedinConnectInputs): RunSetup {
  const profiles = inputs.profiles ?? "";
  const template = inputs.template ?? "";
  const scratch = mkdtempSync(join(tmpdir(), "linkedin-connect-"));
  const templatePath = join(scratch, "template.txt");
  const artifactsDir = join(scratch, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(templatePath, template);
  const profileDir = mkdtempSync(join(tmpdir(), "linkedin-connect-profile-"));
  const sessionName = `linkedin-connect-${basename(profileDir).slice(-12)}`;
  const loginScriptPath = join(scratch, "login.mjs");
  const loginStatusPath = join(scratch, "login-status.json");
  writeLoginScript({ loginScriptPath, loginStatusPath, profileDir, sessionName });
  const profileLines = profiles
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    templatePath,
    artifactsDir,
    profileDir,
    sessionName,
    loginScriptPath,
    loginStatusPath,
    profileLines,
    template,
    noNote: template.trim() === "",
  };
}

function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

function createPacer(): (profileIndex: number, totalProfiles: number) => number {
  let profilesUntilBreak = randomBetween(5, 9);
  return function pacingDelayMs(profileIndex, totalProfiles) {
    if (profileIndex >= totalProfiles) return 0;
    const base = randomBetween(60_000, 180_000);
    profilesUntilBreak -= 1;
    if (profilesUntilBreak <= 0) {
      profilesUntilBreak = randomBetween(5, 9);
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

function installCleanup(getArgs: () => CleanupArgs | null): void {
  let ran = false;
  const cleanup = async (code: number): Promise<void> => {
    if (ran) return;
    ran = true;
    const args = getArgs();
    if (args) {
      try {
        await teardownRun(args);
      } catch (err) {
        console.error("teardown failed:", err);
      }
    }
    process.exit(code);
  };
  process.on("SIGINT", () => void cleanup(130));
  process.on("SIGTERM", () => void cleanup(143));
  process.on("uncaughtException", (err) => {
    console.error(err);
    void cleanup(1);
  });
}

export default defineWorkflow("linkedin-connect")
  .description(
    "Send LinkedIn connection requests with agent-driven browser inspection against a persistent Chrome profile.",
  )
  .input("template", {
    type: "text",
    required: false,
    description:
      "Optional message template. Leave empty to send connection requests without a note. Use [bracketed] placeholders for any per-person details — e.g. [name], [Name], [company], [their recent work], [specific reference to their work/thinking]. Placeholders are filled from each person's LinkedIn profile by the LLM. Casing is ignored. Templates with no placeholders are sent verbatim.",
  })
  .input("profiles", {
    type: "text",
    required: true,
    description:
      "Newline-separated LinkedIn profile URLs (https://www.linkedin.com/in/<handle>). One per line.",
  })
  .input("dry_run", {
    type: "select",
    choices: ["true", "false"],
    default: "false",
    description:
      "If 'true', navigate and prepare the message but cancel before clicking Send.",
  })
  .run(async (ctx) => {
    const inputs = readInputs(ctx);
    const {
      templatePath,
      artifactsDir,
      profileDir,
      sessionName,
      loginScriptPath,
      loginStatusPath,
      profileLines,
      template,
      noNote,
    } = setupRun(inputs);
    const dryRun = inputs.dry_run ?? "false";
    const totalProfiles = profileLines.length;
    const pacingDelayMs = createPacer();
    let cleanupArgs: CleanupArgs | null = { sessionName, profileDir };
    installCleanup(() => cleanupArgs);

    try {
      await ctx
        .stage("login", { tools: BROWSER_STAGE_TOOLS })
        .prompt(buildLoginPrompt({ loginScriptPath, loginStatusPath, profileDir, sessionName }));
      assertLoginStatus(loginStatusPath);

      await ctx
        .stage("prepare", { tools: BROWSER_STAGE_TOOLS })
        .prompt(buildPrepareReport({ template, profileLines, dryRun, profileDir, noNote }));

      for (let i = 0; i < totalProfiles; i += 1) {
        const profileUrl = profileLines[i]!;
        const profileIndex = i + 1;
        await ctx
          .stage(`execute-${profileIndex}`, { tools: BROWSER_STAGE_TOOLS })
          .prompt(
            buildExecutePrompt({
              profileUrl,
              profileIndex,
              totalProfiles,
              templatePath,
              artifactsDir,
              dryRun,
              profileDir,
              sessionName,
              noNote,
            }),
          );

        await sleep(pacingDelayMs(profileIndex, totalProfiles));
      }

      const resultsPath = join(artifactsDir, "results.log");
      await ctx
        .stage("summarize", { tools: BROWSER_STAGE_TOOLS })
        .prompt(buildSummarizePrompt({ resultsPath, artifactsDir, totalProfiles }));

      return {
        artifactsDir,
        resultsPath,
        profileCount: totalProfiles,
        dryRun,
      };
    } finally {
      const args = cleanupArgs;
      cleanupArgs = null;
      if (args) await teardownRun(args);
    }
  })
  .compile();
