#!/usr/bin/env bun
import { defineWorkflow, hostLocalWorkflows } from "@bastani/atomic-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const PROFILE_DIR = join(homedir(), ".atomic/workflows/linkedin-connect/chrome-profile");
const PLAYWRIGHT_SESSION = "linkedin-connect";

const workflowMeta = {
  name: "linkedin-connect",
  source: import.meta.path,
  description:
    "Send LinkedIn connection requests with agent-driven browser inspection against a persistent Chrome profile.",
  inputs: [
    {
      name: "template",
      type: "text",
      required: true,
      description:
        "Message template. Use [bracketed] placeholders for any per-person details — e.g. [name], [Name], [company], [their recent work], [specific reference to their work/thinking]. Placeholders are filled from each person's LinkedIn profile by the LLM. Casing is ignored. Templates with no placeholders are sent verbatim.",
    },
    {
      name: "profiles",
      type: "text",
      required: true,
      description:
        "Newline-separated LinkedIn profile URLs (https://www.linkedin.com/in/<handle>). One per line.",
    },
    {
      name: "dry_run",
      type: "enum",
      values: ["true", "false"],
      default: "false",
      required: false,
      description:
        "If 'true', navigate and prepare the message but cancel before clicking Send.",
    },
  ],
} as const;

function buildPrepareReport(args: {
  template: string;
  profileLines: string[];
  dryRun: string;
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
    `<chrome_profile_dir>${PROFILE_DIR}</chrome_profile_dir>`,
    "",
    "Validate and report:",
    "1. Placeholders: find every '[...]' token in the template (case-insensitive). List each verbatim. Templates with zero placeholders are sent literally; templates with placeholders are filled from visible profile content, with the wording adapted when the profile doesn't cleanly match a slot.",
    "2. Each profile line should match https://www.linkedin.com/in/<handle>. List any malformed lines.",
    "3. Print the total profile count.",
    "4. Remind the user: if the Chrome profile directory above is empty/uninitialized, the execute stage will open LinkedIn in a persistent Playwright browser so they can log in once.",
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
}): string {
  const n = args.profileIndex;
  return [
    `Process ONE LinkedIn profile (#${n} of ${args.totalProfiles}) with playwright-cli and visual browser inspection.`,
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "You are the decision-maker: use snapshots, screenshots, and visible browser state to extract profile details, fill the template, and click the visible LinkedIn controls.",
    "",
    `Profile URL: ${args.profileUrl}`,
    `Profile index: ${n} (of ${args.totalProfiles})`,
    `Template file: ${args.templatePath}`,
    `Chrome profile dir: ${PROFILE_DIR}`,
    `Playwright session name: ${PLAYWRIGHT_SESSION}`,
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
    `2. Always use the named session: \`playwright-cli -s=${PLAYWRIGHT_SESSION} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${PLAYWRIGHT_SESSION} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for clicks and fills. Re-snapshot after every navigation, menu open, modal open, and modal fill.",
    "4. Screenshots are primary evidence. Save at least one profile screenshot and one final modal screenshot.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "Step 1 — verify login state.",
    `  Run: playwright-cli -s=${PLAYWRIGHT_SESSION} open https://www.linkedin.com/feed/ --profile="${PROFILE_DIR}"`,
    `  Then run: playwright-cli -s=${PLAYWRIGHT_SESSION} snapshot`,
    "  If LinkedIn shows a login page, stop and tell the user to log in in the opened browser window. Wait for user confirmation, then reload the feed and continue.",
    "  If you can already see the logged-in feed, proceed immediately to Step 2.",
    "",
    "Step 2 — process this one profile.",
    `  a. Navigate with \`playwright-cli -s=${PLAYWRIGHT_SESSION} goto ${args.profileUrl}\`.`,
    `  b. Save screenshots to ${args.artifactsDir}/profile-${n}-top.png and, after scrolling, ${args.artifactsDir}/profile-${n}-details.png.`,
    "  c. Scroll through the profile, snapshotting and screenshotting as needed to read Experience, About, Featured, and Activity content.",
    "  d. Produce the note per <message_quality>. Before sending, re-read it: if a literal [bracket] survived, fix or skip. If it doesn't sound human, fix or skip.",
    "  e. Find the visible Connect action from the snapshot. If direct Connect is absent, open the visible More menu and inspect that menu snapshot for Connect. Skip if the page indicates already connected, pending, unavailable, or no connection path.",
    `  f. After the invitation modal opens, snapshot it, click the visible Add a note action by ref, snapshot again, fill the visible note textarea by ref, and save a final screenshot to ${args.artifactsDir}/profile-${n}-modal.png.`,
    "  g. If dry_run is true, do not send. Close/cancel the modal after capturing the filled modal screenshot and mark status `dry_run`.",
    "  h. If dry_run is false, click the visible Send/Send invitation button only after verifying the filled modal screenshot has the intended note and no placeholders.",
    "",
    "Step 3 — print the result line AND persist it.",
    `Build exactly one space-separated line: profile=${n} url=${args.profileUrl} name=<name> company=<company> status=<status> reason=<reason> screenshot=<path> substitutions=<deviations>. Use \`-\` for empty fields. Use \`;\` to separate multiple substitutions. Never include a literal newline inside any field.`,
    "Use statuses: sent | dry_run | skip | fail. Use skip reasons: low_confidence | unfilled_placeholder | message_too_long | no_connect_button | already_connected | pending | modal_interaction_failed | user_login_required.",
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

function setupRun(inputs: { profiles?: string; template?: string }) {
  const profiles = inputs.profiles ?? "";
  const template = inputs.template ?? "";
  const scratch = mkdtempSync(join(tmpdir(), "linkedin-connect-"));
  const templatePath = join(scratch, "template.txt");
  const artifactsDir = join(scratch, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(templatePath, template);
  const profileLines = profiles
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { templatePath, artifactsDir, profileLines, template };
}

function randomBetween(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

let profilesUntilBreak = randomBetween(5, 9);

function pacingDelayMs(profileIndex: number, totalProfiles: number): number {
  if (profileIndex >= totalProfiles) return 0;
  const base = randomBetween(60_000, 180_000);
  profilesUntilBreak -= 1;
  if (profilesUntilBreak <= 0) {
    profilesUntilBreak = randomBetween(5, 9);
    return base + randomBetween(5 * 60_000, 15 * 60_000);
  }
  return base;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const linkedinConnectClaude = defineWorkflow(workflowMeta)
  .for("claude")
  .run(async (ctx) => {
    const { templatePath, artifactsDir, profileLines, template } =
      setupRun(ctx.inputs);
    const dryRun = ctx.inputs.dry_run ?? "false";
    const totalProfiles = profileLines.length;

    await ctx.stage(
      { name: "prepare", description: "Validate inputs and confirm logged-in profile" },
      {},
      {},
      async (s) => {
        await s.session.query(
          buildPrepareReport({ template, profileLines, dryRun }),
        );
        s.save(s.sessionId);
      },
    );

    for (let i = 0; i < totalProfiles; i++) {
      const profileUrl = profileLines[i]!;
      const profileIndex = i + 1;
      await ctx.stage(
        {
          name: `execute-${profileIndex}`,
          description: `Claude processes profile ${profileIndex}/${totalProfiles}: ${profileUrl}`,
        },
        { chatFlags: ["--dangerously-skip-permissions"] },
        {},
        async (s) => {
          await s.session.query(
            buildExecutePrompt({
              profileUrl,
              profileIndex,
              totalProfiles,
              templatePath,
              artifactsDir,
              dryRun,
            }),
          );
          s.save(s.sessionId);
        },
      );

      await sleep(pacingDelayMs(profileIndex, totalProfiles));
    }

    const resultsPath = join(artifactsDir, "results.log");
    await ctx.stage(
      { name: "summarize", description: "Render the batch summary table and totals" },
      {},
      {},
      async (s) => {
        await s.session.query(
          buildSummarizePrompt({ resultsPath, artifactsDir, totalProfiles }),
        );
        s.save(s.sessionId);
      },
    );
  })
  .compile();

const linkedinConnectOpencode = defineWorkflow(workflowMeta)
  .for("opencode")
  .run(async (ctx) => {
    const { templatePath, artifactsDir, profileLines, template } =
      setupRun(ctx.inputs);
    const dryRun = ctx.inputs.dry_run ?? "false";
    const totalProfiles = profileLines.length;
    const allowAll = [{ permission: "*", pattern: "*", action: "allow" as const }];

    await ctx.stage(
      { name: "prepare", description: "Validate inputs and confirm logged-in profile" },
      {},
      { title: "prepare", permission: allowAll },
      async (s) => {
        await s.client.session.prompt({
          sessionID: s.session.id,
          parts: [
            {
              type: "text",
              text: buildPrepareReport({ template, profileLines, dryRun }),
            },
          ],
        });
        s.save(s.sessionId);
      },
    );

    for (let i = 0; i < totalProfiles; i++) {
      const profileUrl = profileLines[i]!;
      const profileIndex = i + 1;
      await ctx.stage(
        {
          name: `execute-${profileIndex}`,
          description: `OpenCode processes profile ${profileIndex}/${totalProfiles}: ${profileUrl}`,
        },
        {},
        { title: `execute-${profileIndex}`, permission: allowAll },
        async (s) => {
          await s.client.session.prompt({
            sessionID: s.session.id,
            parts: [
              {
                type: "text",
                text: buildExecutePrompt({
                  profileUrl,
                  profileIndex,
                  totalProfiles,
                  templatePath,
                  artifactsDir,
                  dryRun,
                }),
              },
            ],
          });
          s.save(s.sessionId);
        },
      );

      await sleep(pacingDelayMs(profileIndex, totalProfiles));
    }

    const resultsPath = join(artifactsDir, "results.log");
    await ctx.stage(
      { name: "summarize", description: "Render the batch summary table and totals" },
      {},
      { title: "summarize", permission: allowAll },
      async (s) => {
        await s.client.session.prompt({
          sessionID: s.session.id,
          parts: [
            {
              type: "text",
              text: buildSummarizePrompt({ resultsPath, artifactsDir, totalProfiles }),
            },
          ],
        });
        s.save(s.sessionId);
      },
    );
  })
  .compile();

await hostLocalWorkflows([linkedinConnectClaude, linkedinConnectOpencode]);
