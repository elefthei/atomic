#!/usr/bin/env bun
import { defineWorkflow, hostLocalWorkflows } from "@bastani/atomic-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const RUNNER = new URL("./linkedin-runner.ts", import.meta.url).pathname;
const PROFILE_DIR = join(homedir(), ".atomic/workflows/linkedin-connect/chrome-profile");

const linkedinConnect = defineWorkflow({
  name: "linkedin-connect",
  source: import.meta.path,
  description:
    "Send LinkedIn connection requests with a personalized template via local Stagehand against a persistent Chrome profile.",
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
            "4. Remind the user: if the Chrome profile directory above is empty/uninitialized, they must run the runner once with --login first to log in to LinkedIn. The execute stage will tell them how.",
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
      { name: "execute", description: "Run the Stagehand batch and stream results" },
      {},
      { chatFlags: ["--dangerously-skip-permissions"] },
      async (s) => {
        await s.session.query(
          [
            "Run the LinkedIn connection-request batch using the local Stagehand runner.",
            "",
            `Runner script: ${RUNNER}`,
            `Profiles file: ${profilesPath}`,
            `Template file: ${templatePath}`,
            `Chrome profile dir: ${PROFILE_DIR}`,
            `Dry run: ${ctx.inputs.dry_run}`,
            "",
            "Step 1 — verify login state.",
            `  Run: ls -A "${PROFILE_DIR}" 2>/dev/null | head -5`,
            "  If the directory is missing or empty, the user has not logged in yet. Tell them to run:",
            `    bun ${RUNNER} --login`,
            "  …and to log in to LinkedIn in the launched Chrome window, then press Enter in the terminal to close. Stop and wait for them to confirm before continuing.",
            "",
            "Step 2 — run the batch (only after login is confirmed):",
            `    CHROME_PROFILE_DIR="${PROFILE_DIR}" DRY_RUN=${ctx.inputs.dry_run} bun ${RUNNER} --profiles "${profilesPath}" --template "${templatePath}"`,
            "",
            "  The runner emits one JSON line per event: { url, status, ... }. Possible statuses:",
            "    sent | dry_run | skip | fail | wait | coffee_break | done | fatal",
            "  Skip reasons you may see: low_confidence | unfilled_placeholder | message_too_long | no_connect_button | dialog_did_not_open | modal_interaction_failed | add_note_unavailable",
            "  Tail the output and surface each profile result to the user as it arrives. Do NOT batch them.",
            "  When a skip carries a 'screenshot' field, include the path inline so the user can inspect what LinkedIn actually rendered.",
            "",
            "Step 3 — when the runner exits, print a markdown summary table (url, name, company, status, reason) plus totals: sent, dry_run, skipped, failed.",
            "  If any rows have status=skip with reason=modal_interaction_failed or dialog_did_not_open, list the screenshot paths in a separate 'Debug captures' section.",
            "",
            "If the runner exits with status:fatal (e.g. not_logged_in), stop immediately and tell the user to re-run --login.",
          ].join("\n"),
        );
        s.save(s.sessionId);
      },
    );
  })
  .compile();

await hostLocalWorkflows([linkedinConnect]);
