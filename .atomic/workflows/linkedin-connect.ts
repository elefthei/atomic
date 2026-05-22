import { defineWorkflow } from "@bastani/workflows";
import { basename, join } from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
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
  readonly profileLines: readonly string[];
  readonly template: string;
  readonly noNote: boolean;
}

interface CleanupArgs {
  readonly sessionName: string;
  readonly profileDir: string;
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
    "4. Confirm to the user that the headed Chrome window is already open and logged into LinkedIn (the workflow runner handled login before this stage); execute stages will reuse that session.",
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
    "The browser session is already open in headed mode and logged into LinkedIn — the workflow runner handled login before launching this stage. Do NOT run `playwright-cli open`. Just attach to the existing session via `-s=` and start with the goto in Step 1.",
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
    "The browser session is already open in headed mode and logged into LinkedIn — the workflow runner handled login before launching this stage. Do NOT run `playwright-cli open`. Just attach to the existing session via `-s=` and start with the goto in Step 1.",
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
  const profileLines = profiles
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    templatePath,
    artifactsDir,
    profileDir,
    sessionName,
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

// Paths that mean "not yet authenticated". LinkedIn can park the user on the
// raw login form, the OAuth-style /uas/login redirect, MFA/checkpoint pages,
// or the public-marketing authwall during the interactive login.
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
];

function parseEvalUrl(stdout: string): string | null {
  // `playwright-cli eval "() => location.href"` emits:
  //   ### Result
  //   "https://www.linkedin.com/feed/"
  //   ### ...
  // Capture the quoted JSON string under "### Result".
  const match = stdout.match(/### Result\s*\n\s*"([^"\n]+)"/);
  return match ? match[1]! : null;
}

async function probeCurrentUrl(sessionName: string): Promise<string | null> {
  const out = await Bun.$`playwright-cli -s=${sessionName} eval ${"() => location.href"}`
    .nothrow()
    .quiet();
  if (out.exitCode !== 0) return null;
  return parseEvalUrl(out.stdout.toString());
}

function isAuthenticatedUrl(url: string): boolean {
  if (LINKEDIN_UNAUTH_PATTERNS.some((rx) => rx.test(url))) return false;
  return LINKEDIN_AUTH_PATH_PATTERNS.some((rx) => rx.test(url));
}

async function openLoginSession(args: CleanupArgs): Promise<void> {
  // Quiet both `open` and the polling probes so the orchestrator's OpenTUI
  // renderer (which owns this pane's stdin/stdout) isn't corrupted by
  // playwright-cli's stdout markdown trace ("### Browser … opened with pid …",
  // "### Ran Playwright code", etc.).
  await Bun.$`playwright-cli -s=${args.sessionName} open --headed --persistent --profile=${args.profileDir} https://www.linkedin.com/login`
    .nothrow()
    .quiet();

  // Read-only URL polling. `eval "() => location.href"` doesn't navigate, so
  // it won't interrupt the user's in-progress login / MFA / checkpoint flow.
  // The headed Chrome window IS the prompt — no stdin readline needed.
  const timeoutMs = Number(process.env.LINKEDIN_LOGIN_TIMEOUT_MS ?? 10 * 60 * 1000);
  const pollIntervalMs = Number(process.env.LINKEDIN_LOGIN_POLL_MS ?? 3000);
  const deadline = Date.now() + timeoutMs;
  let lastUrl: string | null = null;

  while (Date.now() < deadline) {
    lastUrl = await probeCurrentUrl(args.sessionName);
    if (lastUrl && isAuthenticatedUrl(lastUrl)) {
      // Normalize to /feed so execute stages start from a known location.
      await Bun.$`playwright-cli -s=${args.sessionName} goto https://www.linkedin.com/feed/`
        .nothrow()
        .quiet();
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
  await Bun.$`playwright-cli -s=${args.sessionName} close`.nothrow().quiet();
  // Belt-and-suspenders: if `close` couldn't reach the daemon, kill any
  // lingering daemon process for this session by name. cliDaemon.js lists the
  // session name as its first argv, so a name-anchored pkill is safe.
  await Bun.$`pkill -f ${`cliDaemon.js ${args.sessionName}`}`.nothrow().quiet();
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
      await openLoginSession({ sessionName, profileDir });

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
