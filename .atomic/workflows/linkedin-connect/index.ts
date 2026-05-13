#!/usr/bin/env bun
import { defineWorkflow, hostLocalWorkflows } from "@bastani/atomic-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const PROFILE_DIR = join(homedir(), ".atomic/workflows/linkedin-connect/chrome-profile");
const PLAYWRIGHT_SESSION = "linkedin-connect";

const linkedinConnect = defineWorkflow({
  name: "linkedin-connect",
  source: import.meta.path,
  description:
    "Send LinkedIn connection requests with Claude-driven browser inspection against a persistent Chrome profile.",
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
})
  .for("claude")
  .run(async (ctx) => {
    const scratch = mkdtempSync(join(tmpdir(), "linkedin-connect-"));
    const profilesPath = join(scratch, "profiles.txt");
    const templatePath = join(scratch, "template.txt");
    const artifactsDir = join(scratch, "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(profilesPath, ctx.inputs.profiles);
    writeFileSync(templatePath, ctx.inputs.template);

    const profileLines = ctx.inputs.profiles
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    await ctx.stage(
      { name: "prepare", description: "Validate inputs and confirm logged-in profile" },
      {},
      {},
      async (s) => {
        await s.session.query(
          [
            "You are preparing a LinkedIn connection-request batch.",
            "",
            "<template>",
            ctx.inputs.template,
            "</template>",
            "",
            `<profile_count>${profileLines.length}</profile_count>`,
            "<first_three_profiles>",
            profileLines.slice(0, 3).join("\n"),
            "</first_three_profiles>",
            "",
            `<dry_run>${ctx.inputs.dry_run}</dry_run>`,
            `<chrome_profile_dir>${PROFILE_DIR}</chrome_profile_dir>`,
            "",
            "Validate and report:",
            "1. Placeholders: find every '[...]' token in the template (case-insensitive). List each one verbatim. If there are zero placeholders, note that the template will be sent literally to every profile. Do NOT require any specific token to exist — '[name]', '[Name]', '[company]', '[their recent work]', or no placeholders at all are ALL valid.",
            "2. Each profile line should match https://www.linkedin.com/in/<handle>. List any malformed lines.",
            "3. Print the total profile count.",
            "4. Remind the user: if the Chrome profile directory above is empty/uninitialized, the execute stage will open LinkedIn in a persistent Playwright browser so they can log in once.",
            "5. Mention pacing: random 60-180s between profiles, 5-15min coffee break every 5-8 profiles.",
            "6. One-line LinkedIn TOS warning.",
            "",
            "Keep the whole report under 14 short lines. Do not run any commands; this stage is validation only.",
          ].join("\n"),
        );
        s.save(s.sessionId);
      },
    );

    await ctx.stage(
      { name: "execute", description: "Claude drives LinkedIn via browser screenshots" },
      {},
      { chatFlags: ["--dangerously-skip-permissions"] },
      async (s) => {
        await s.session.query(
          [
            "Run the LinkedIn connection-request batch yourself with playwright-cli and visual browser inspection.",
            "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
            "You are the decision-maker: use snapshots, screenshots, and visible browser state to extract profile details, fill the template, and click the visible LinkedIn controls.",
            "",
            `Profiles file: ${profilesPath}`,
            `Template file: ${templatePath}`,
            `Chrome profile dir: ${PROFILE_DIR}`,
            `Playwright session name: ${PLAYWRIGHT_SESSION}`,
            `Artifact directory: ${artifactsDir}`,
            `Dry run: ${ctx.inputs.dry_run}`,
            "",
            "Tooling rules:",
            "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
            `2. Always use the named session: \`playwright-cli -s=${PLAYWRIGHT_SESSION} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${PLAYWRIGHT_SESSION} ...\`.`,
            "3. Prefer refs from `playwright-cli snapshot` for clicks and fills. Re-snapshot after every navigation, menu open, modal open, and modal fill.",
            "4. Screenshots are primary evidence. Save at least one profile screenshot and one final modal screenshot per processed profile.",
            "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
            "",
            "Step 1 — open LinkedIn and verify login state.",
            `  Run: playwright-cli -s=${PLAYWRIGHT_SESSION} open https://www.linkedin.com/feed/ --profile="${PROFILE_DIR}"`,
            `  Then run: playwright-cli -s=${PLAYWRIGHT_SESSION} snapshot`,
            "  If LinkedIn shows a login page, stop and tell the user to log in in the opened browser window. Wait for user confirmation, then reload the feed and continue.",
            "",
            "Step 2 — process each profile URL from the profiles file sequentially.",
            "For profile N:",
            `  a. Navigate with \`playwright-cli -s=${PLAYWRIGHT_SESSION} goto <url>\`.`,
            `  b. Save screenshots to ${artifactsDir}/profile-N-top.png and, after scrolling, ${artifactsDir}/profile-N-details.png.`,
            "  c. Use the screenshot and snapshot content to extract first name, primary current company, and one concrete specific reference from visible profile content. Scroll as needed to About, Featured, Activity, and Experience. Do not invent details.",
            "  d. Fill every [bracketed] placeholder in the template using those visible details. [Name]/[name] means first name. Descriptive placeholders need a concrete visible reference, not generic praise.",
            "  e. Preserve non-placeholder template text exactly, keep the final note at or under 300 characters, and skip rather than send if any placeholder remains or confidence is low.",
            "  f. Find the visible Connect action from the snapshot. If direct Connect is absent, open the visible More menu and inspect that menu snapshot for Connect. Skip if the page indicates already connected, pending, unavailable, or no connection path.",
            "  g. After the invitation modal opens, snapshot it, click the visible Add a note action by ref, snapshot again, fill the visible note textarea by ref, and save a final screenshot to `${artifactsDir}/profile-N-modal.png`.",
            "  h. If dry_run is true, do not send. Close/cancel the modal after capturing the filled modal screenshot and mark status `dry_run`.",
            "  i. If dry_run is false, click the visible Send/Send invitation button only after verifying the filled modal screenshot has the intended note and no placeholders.",
            "",
            "Step 3 — report progress live.",
            "After each profile, immediately print a one-line result with: profile number, url, name, company, status, reason, and screenshot path. Do not wait until the whole batch finishes.",
            "Use statuses: sent | dry_run | skip | fail. Use skip reasons: low_confidence | unfilled_placeholder | message_too_long | no_connect_button | already_connected | pending | modal_interaction_failed | user_login_required.",
            "",
            "Step 4 — pacing.",
            "Between successful/attempted profiles, wait a random 60-180 seconds. Every 5-8 profiles, take a random 5-15 minute coffee break. If there is only one profile, do not wait after it.",
            "",
            "Step 5 — final output.",
            "Print a markdown summary table with columns: url, name, company, status, reason, screenshot. Then print totals: sent, dry_run, skipped, failed.",
            "Include an `Artifacts` section listing the artifact directory and any modal/debug screenshots.",
          ].join("\n"),
        );
        s.save(s.sessionId);
      },
    );
  })
  .compile();

await hostLocalWorkflows([linkedinConnect]);
