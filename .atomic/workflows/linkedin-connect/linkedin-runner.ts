#!/usr/bin/env bun
/**
 * LinkedIn connection-request runner.
 *
 * Two modes:
 *   --login                                  Launch persistent Chrome, navigate to LinkedIn login.
 *                                            User logs in, presses Enter, profile is saved.
 *   --profiles <path> --template <path>      Batch mode. Iterates profile URLs, extracts name +
 *                                            primary company, fills the template, sends with
 *                                            human-like pacing.
 *
 * Env:
 *   CHROME_PROFILE_DIR  Persistent user-data-dir (default ~/.atomic/workflows/linkedin-connect/chrome-profile).
 *   DRY_RUN             "true" → fill the message but cancel instead of sending. Default false.
 *   OPENAI_API_KEY      OR ANTHROPIC_API_KEY — Stagehand needs one for act/extract/observe.
 *                       OpenAI is preferred when both are set. Override the model with STAGEHAND_MODEL.
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const debugDir = join(
  process.env.CHROME_PROFILE_DIR ??
    join(homedir(), ".atomic/workflows/linkedin-connect/chrome-profile"),
  "..",
  "debug",
);

const { values } = parseArgs({
  options: {
    login: { type: "boolean", default: false },
    profiles: { type: "string" },
    template: { type: "string" },
  },
});

const profileDir =
  process.env.CHROME_PROFILE_DIR ??
  join(homedir(), ".atomic/workflows/linkedin-connect/chrome-profile");
const dryRun = process.env.DRY_RUN === "true";

mkdirSync(profileDir, { recursive: true });
mkdirSync(debugDir, { recursive: true });

type Status =
  | "sent"
  | "dry_run"
  | "skip"
  | "fail"
  | "wait"
  | "coffee_break"
  | "done"
  | "fatal"
  | "info";

const log = (record: { status: Status } & Record<string, unknown>) =>
  console.log(JSON.stringify(record));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min) + min);

const openaiKey = process.env.OPENAI_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!openaiKey && !anthropicKey) {
  log({
    status: "fatal",
    reason: "missing_api_key",
    message:
      "Set OPENAI_API_KEY or ANTHROPIC_API_KEY — Stagehand needs one for act/extract/observe.",
  });
  process.exit(1);
}

const useOpenAI = Boolean(openaiKey);
// Stagehand v3 requires the slash-prefixed `provider/model-name` form so the
// model name routes through the AI SDK directly. The bare form (e.g. plain
// "gpt-5.5") is gated by Stagehand's internal allowlist which lags new model
// releases and throws UnsupportedModelError. The slash form has no such gate.
// STAGEHAND_MODEL takes the slash form too — e.g. "openai/gpt-5.5" or
// "anthropic/claude-sonnet-4-5".
const modelName =
  process.env.STAGEHAND_MODEL ??
  (useOpenAI ? "openai/gpt-5.5" : "anthropic/claude-sonnet-4-5");
const modelApiKey = useOpenAI ? openaiKey! : anthropicKey!;

const stagehand = new Stagehand({
  env: "LOCAL",
  model: {
    modelName,
    apiKey: modelApiKey,
  },
  localBrowserLaunchOptions: {
    userDataDir: profileDir,
    headless: false,
    viewport: { width: 1280, height: 900 },
  },
  verbose: 0,
});

await stagehand.init();
const page = await stagehand.context.newPage();

if (values.login) {
  log({ status: "info", message: "Chrome launched. Log in to LinkedIn in the window." });
  await page.goto("https://www.linkedin.com/login");
  process.stdout.write("\nWhen you see your LinkedIn feed, press Enter here to close...");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  await stagehand.close();
  log({ status: "done", mode: "login" });
  process.exit(0);
}

if (!values.profiles || !values.template) {
  log({
    status: "fatal",
    reason: "missing_args",
    message: "Usage: --profiles <path> --template <path>  OR  --login",
  });
  await stagehand.close();
  process.exit(1);
}

if (!existsSync(values.profiles) || !existsSync(values.template)) {
  log({ status: "fatal", reason: "input_file_missing" });
  await stagehand.close();
  process.exit(1);
}

const urls = readFileSync(values.profiles, "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const template = readFileSync(values.template, "utf8").trim();

if (!template.includes("[name]") || !template.includes("[company name]")) {
  log({
    status: "fatal",
    reason: "template_missing_placeholders",
    message: "Template must contain literal [name] and [company name].",
  });
  await stagehand.close();
  process.exit(1);
}

await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
await sleep(rand(2000, 4000));
const currentUrl = page.url();
if (currentUrl.includes("/login") || currentUrl.includes("/uas/login")) {
  log({
    status: "fatal",
    reason: "not_logged_in",
    message: "Chrome profile is not logged into LinkedIn. Re-run with --login.",
  });
  await stagehand.close();
  process.exit(1);
}

const ExtractSchema = z.object({
  name: z.string().describe("The person's first name only"),
  company: z
    .string()
    .describe("Their primary employer (full-time role, not board/advisor/investor)"),
  confidence: z.enum(["high", "medium", "low"]),
});

let processed = 0;
let breakAfter = rand(5, 9);

for (const url of urls) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(rand(3000, 8000));
    await page.evaluate(() => window.scrollBy(0, 250 + Math.random() * 250));
    await sleep(rand(1500, 3500));

    const extracted = await stagehand.extract(
      [
        "Extract the person's first name and their PRIMARY current company.",
        "",
        "For 'company': identify the most legitimate full-time employer.",
        "- Inspect the headline (e.g. 'Senior Engineer at Acme').",
        "- Inspect the Experience section's roles marked as 'Present'.",
        "- If multiple current roles, pick the main employer (founder/employee role)",
        "  rather than board-member, advisor, investor, or angel positions at other companies.",
        "",
        "Set confidence:",
        "  'high'   — single clear primary employer",
        "  'medium' — primary employer is reasonably clear",
        "  'low'    — unclear, contradictory, or no real current employer",
      ].join("\n"),
      ExtractSchema,
    );

    if (
      extracted.confidence === "low" ||
      !extracted.name ||
      !extracted.company
    ) {
      log({ url, status: "skip", reason: "low_confidence", extracted });
    } else {
      const message = template
        .replaceAll("[name]", extracted.name)
        .replaceAll("[company name]", extracted.company);

      const connectActions = await stagehand.observe(
        "find the visible 'Connect' button on this profile to send a connection request. Do not pick 'Follow' or 'Message'. If 'Connect' is hidden behind a 'More' button, return the action that opens the More menu instead.",
      );

      if (connectActions.length === 0) {
        log({
          url,
          status: "skip",
          reason: "no_connect_button",
          name: extracted.name,
          company: extracted.company,
        });
      } else {
        await stagehand.act(connectActions[0]);
        await sleep(rand(1500, 2500));

        const inMoreMenu = await stagehand.observe(
          "find the 'Connect' menu item in the currently open dropdown menu",
        );
        if (inMoreMenu.length > 0) {
          await stagehand.act(inMoreMenu[0]);
          await sleep(rand(1500, 2500));
        }

        // Wait for the invitation dialog to actually be in the DOM before
        // acting. Without this, act() can race the modal animation and miss
        // the 'Add a note' button entirely.
        try {
          await page.waitForSelector('div[role="dialog"]', { timeout: 8000 });
        } catch {
          await page.screenshot({
            path: join(debugDir, `${Date.now()}-no-dialog.png`),
          }).catch(() => {});
          log({
            url,
            status: "skip",
            reason: "dialog_did_not_open",
            name: extracted.name,
            company: extracted.company,
          });
          continue;
        }
        await sleep(rand(600, 1200)); // let the dialog animation settle

        try {
          // Drive the modal with Stagehand's CSS locator() rather than act():
          // LinkedIn's connect-modal aria-labels are stable (verified live
          // 2026-05-09) and a deterministic selector avoids paying an LLM
          // round-trip per click. Note the visible "Send" text differs from
          // its aria-label "Send invitation".
          await page.waitForSelector('button[aria-label="Add a note"]', {
            timeout: 5000,
          });
          await page.locator('button[aria-label="Add a note"]').click();
          await sleep(rand(800, 1500));

          await page.waitForSelector("#custom-message", { timeout: 5000 });
          await page.locator("#custom-message").fill(message);
          await sleep(rand(2500, 5000));

          if (dryRun) {
            await page
              .locator('button[aria-label="Cancel adding a note"]')
              .click();
            log({
              url,
              status: "dry_run",
              name: extracted.name,
              company: extracted.company,
              message,
            });
          } else {
            await page
              .locator('button[aria-label="Send invitation"]')
              .click();
            await sleep(rand(1500, 3000));
            log({
              url,
              status: "sent",
              name: extracted.name,
              company: extracted.company,
            });
          }
        } catch (modalErr) {
          const screenshot = join(debugDir, `${Date.now()}-modal-fail.png`);
          await page.screenshot({ path: screenshot }).catch(() => {});
          await page.keyPress("Escape").catch(() => {});
          log({
            url,
            status: "skip",
            reason: "modal_interaction_failed",
            error:
              modalErr instanceof Error ? modalErr.message : String(modalErr),
            screenshot,
            name: extracted.name,
            company: extracted.company,
          });
        }
      }
    }
  } catch (err) {
    log({
      url,
      status: "fail",
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  processed++;
  if (processed < urls.length) {
    const delay = rand(60_000, 180_000);
    log({ status: "wait", seconds: Math.round(delay / 1000) });
    await sleep(delay);

    if (processed % breakAfter === 0) {
      const breakMs = rand(5 * 60_000, 15 * 60_000);
      log({ status: "coffee_break", minutes: Math.round(breakMs / 60_000) });
      await sleep(breakMs);
      breakAfter = rand(5, 9);
    }
  }
}

await stagehand.close();
log({ status: "done", processed });
