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

if (!template) {
  log({
    status: "fatal",
    reason: "template_empty",
    message: "Template file is empty.",
  });
  await stagehand.close();
  process.exit(1);
}

const placeholderRegex = /\[[^\]\n]+\]/g;
const placeholders = Array.from(new Set(template.match(placeholderRegex) ?? []));
const LINKEDIN_NOTE_LIMIT = 300;
log({
  status: "info",
  message:
    placeholders.length === 0
      ? "Template has no placeholders — it will be sent verbatim to every profile."
      : `Detected ${placeholders.length} placeholder(s): ${placeholders.join(", ")}`,
});

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

// When the template has placeholders we ask the model to do the whole fill
// in one shot: read the profile, render the message, and return it alongside
// name + company for logging. This handles arbitrary bracketed tokens —
// '[Name]', '[their recent work]', '[specific reference to their thinking]'
// — without us having to enumerate token kinds.
const FillSchema = z.object({
  name: z
    .string()
    .describe("The person's first name only (for logging — not necessarily used in the message)"),
  company: z
    .string()
    .describe(
      "Their primary current employer — full-time role, not board/advisor/investor (for logging)",
    ),
  filled_message: z
    .string()
    .describe(
      `The template with every [bracketed] placeholder replaced with content tailored to this person from their visible profile (headline, About, Experience, Featured, recent Activity). Casing is ignored — [Name], [name], and [NAME] all mean their first name. For descriptive placeholders, reference something concrete and specific from the profile (a project, post, paper, role focus); avoid generic praise. Preserve every non-bracketed character of the template exactly, including punctuation and emojis. Keep the final message at or under ${LINKEDIN_NOTE_LIMIT} characters (LinkedIn's connection-note limit). If you cannot find specific content for a descriptive placeholder, lower confidence rather than inventing details.`,
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "'high' — clear primary employer AND specific reference content found; 'medium' — both present but partially inferred; 'low' — missing primary employer OR no concrete content for descriptive placeholders OR fabricated to fit.",
    ),
});

// Schema used when the template has zero placeholders — we only need
// name + company for the log row.
const NameCompanySchema = z.object({
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

    // Progressive scroll to the bottom so lazy-loaded sections (Experience,
    // Education) render before extraction — without these, "advisor at X" can
    // be mistaken for the primary employer. Chunked with jittered pauses to
    // trigger LinkedIn's intersection observers and look human.
    //
    // We deliberately do NOT scroll back to the top. Once the page is
    // scrolled past the cover photo, LinkedIn activates a sticky header with
    // a duplicate "Connect" button — clicking that one does not open the
    // standard invite modal. The Connect click below uses a `.pv-top-card`-
    // scoped locator and Playwright auto-scrolls the target into view, so
    // there is no need to manually scroll up.
    let lastHeight = 0;
    for (let i = 0; i < 12; i++) {
      const height = await page.evaluate(() => {
        window.scrollBy(0, 600 + Math.random() * 400);
        return document.body.scrollHeight;
      });
      await sleep(rand(400, 900));
      if (height === lastHeight) break;
      lastHeight = height;
    }
    await sleep(rand(1000, 2000));

    const extracted = placeholders.length === 0
      ? await stagehand.extract(
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
          NameCompanySchema,
        )
      : await stagehand.extract(
          [
            "You are helping personalize a LinkedIn connection request for the person whose profile is on screen.",
            "",
            "<template>",
            template,
            "</template>",
            "",
            "<detected_placeholders>",
            placeholders.join("\n"),
            "</detected_placeholders>",
            "",
            "Render `filled_message` by replacing every [bracketed] token in the template above.",
            "Rules:",
            "- Placeholder matching is case-insensitive: [Name], [name], [NAME] all refer to the person's first name.",
            "- Common placeholder kinds you may encounter and how to fill them:",
            "    * name / first name           → their first name only",
            "    * company / company name      → their primary current employer (see company rules below)",
            "    * role / title / position     → their current title at the primary employer",
            "    * school / university         → their most recent / most prominent school",
            "    * their work / recent work    → one concrete project, post, paper, or current role focus",
            "    * specific reference …        → one concrete, specific thing visible on the profile —",
            "                                     a recent post, a featured project, a publication, a",
            "                                     standout accomplishment, or the focus of their current",
            "                                     role. Never generic ('your impressive work'); always",
            "                                     something a stranger could only know by reading the page.",
            "- Preserve every non-bracketed character of the template exactly, including punctuation, spacing, and emojis.",
            "- Keep `filled_message` at or under " + LINKEDIN_NOTE_LIMIT + " characters total (LinkedIn's connection-note limit). If a faithful fill would exceed it, tighten the descriptive placeholder rather than truncating template wording.",
            "- Do NOT leave any [bracketed] token in the output. If you cannot fill one with something specific from the profile, lower confidence to 'low' instead of fabricating.",
            "",
            "For `company`: identify the most legitimate full-time employer (headline + Experience roles marked 'Present'; prefer founder/employee over advisor/board/investor positions).",
            "",
            "Set confidence:",
            "  'high'   — clear primary employer AND specific reference content was available for descriptive placeholders",
            "  'medium' — both present but partially inferred",
            "  'low'    — missing primary employer, no concrete content for a descriptive placeholder, or any placeholder ended up generic / fabricated",
          ].join("\n"),
          FillSchema,
        );

    if (
      extracted.confidence === "low" ||
      !extracted.name ||
      !extracted.company
    ) {
      log({ url, status: "skip", reason: "low_confidence", extracted });
    } else {
      const filled = (extracted as { filled_message?: string }).filled_message;
      const candidateMessage =
        typeof filled === "string" && filled.length > 0 ? filled.trim() : template;

      // Safety net: never click Send on a message that still contains an
      // unfilled [bracketed] token. The schema description forbids this, but
      // the LLM occasionally misses one — better to skip the profile than
      // send a literal "[Name]" to a stranger.
      const leftover = candidateMessage.match(placeholderRegex);
      if (leftover && leftover.length > 0) {
        log({
          url,
          status: "skip",
          reason: "unfilled_placeholder",
          unfilled: leftover,
          name: extracted.name,
          company: extracted.company,
          candidate: candidateMessage,
        });
        continue;
      }

      if (candidateMessage.length > LINKEDIN_NOTE_LIMIT) {
        log({
          url,
          status: "skip",
          reason: "message_too_long",
          length: candidateMessage.length,
          limit: LINKEDIN_NOTE_LIMIT,
          name: extracted.name,
          company: extracted.company,
          candidate: candidateMessage,
        });
        continue;
      }

      const message = candidateMessage;

      // Click the profile-card Connect button via a scoped Playwright
      // locator instead of stagehand.observe(). Two reasons:
      //   1. After the deep scroll above, LinkedIn renders a sticky header
      //      with a duplicate Connect button. observe()'s a11y snapshot
      //      sees both, the LLM picks one nondeterministically, and the
      //      sticky-header click does NOT open div[role="dialog"].
      //   2. The button is structurally stable enough that an LLM round-
      //      trip per profile is wasted cost.
      // Scoping by `.pv-top-card` excludes the sticky-header dup. The role
      // + accessible-name regex covers both LinkedIn variants:
      // text "Connect" (older) and aria-label "Invite <name> to connect"
      // (current).
      const profileCard = page.locator(".pv-top-card");
      const connectBtn = profileCard.getByRole("button", {
        name: /^(Connect|Invite\s.+\sto\s+connect)$/i,
      });
      const moreBtn = profileCard.getByRole("button", {
        name: /^More(\s+actions)?(\s+for\s+.+)?$/i,
      });

      let connectClicked = false;
      try {
        await connectBtn.first().click({ timeout: 3000 });
        connectClicked = true;
      } catch {
        try {
          await moreBtn.first().click({ timeout: 3000 });
          await sleep(rand(800, 1500));
          await page
            .getByRole("menuitem", {
              name: /^(Connect|Invite\s.+\sto\s+connect)$/i,
            })
            .first()
            .click({ timeout: 3000 });
          connectClicked = true;
        } catch {
          // Neither direct nor More-menu path matched — fall through to skip.
        }
      }

      if (!connectClicked) {
        log({
          url,
          status: "skip",
          reason: "no_connect_button",
          name: extracted.name,
          company: extracted.company,
        });
      } else {
        await sleep(rand(1500, 2500));

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
