## Analysis: `.atomic/workflows/linkedin-connect.ts` LinkedIn Profile Review and Template Filling

### Overview
The workflow is an agent-driven LinkedIn connection-request batch runner defined as `linkedin-connect` (`.atomic/workflows/linkedin-connect.ts:526-617`). It prepares a temporary template file, persistent Chrome profile, artifacts directory, and named Playwright session, then runs stages for manual login, validation/preparation, one browser-driven execution stage per profile, and final summarization (`.atomic/workflows/linkedin-connect.ts:549-604`). Profile review and message filling are not implemented as DOM parsing code; they are delegated to the stage agent via prompts that require visual inspection, Playwright snapshots, screenshots, and visible LinkedIn controls (`.atomic/workflows/linkedin-connect.ts:103-105`, `.atomic/workflows/linkedin-connect.ts:137-144`).

### Entry Points
- `.atomic/workflows/linkedin-connect.ts:526` - exports `defineWorkflow("linkedin-connect")`.
- `.atomic/workflows/linkedin-connect.ts:530-548` - declares workflow inputs: optional `template`, required newline-separated `profiles`, and `dry_run` select.
- `.atomic/workflows/linkedin-connect.ts:549-617` - main `.run()` body that sets up state, invokes stages, loops over profiles, summarizes, and tears down.
- `.atomic/workflows/linkedin-connect.ts:88-163` - `buildExecutePrompt()` creates the personalized-note execution prompt for each profile, or delegates to no-note mode.
- `.atomic/workflows/linkedin-connect.ts:165-222` - `buildNoNoteExecutePrompt()` creates the execution prompt when the template is empty/whitespace-only.

### Core Implementation

#### 1. Inputs and Temporary Run Setup (`.atomic/workflows/linkedin-connect.ts:430-457`)
- `readInputs()` casts `ctx.inputs` to `LinkedinConnectInputs` (`.atomic/workflows/linkedin-connect.ts:47-49`).
- `setupRun()` defaults missing `profiles` and `template` to empty strings (`.atomic/workflows/linkedin-connect.ts:431-432`).
- It creates a scratch directory under `tmpdir()` with prefix `linkedin-connect-`, writes the template to `template.txt`, and creates an `artifacts` directory (`.atomic/workflows/linkedin-connect.ts:433-437`).
- It creates a separate persistent Chrome profile directory with prefix `linkedin-connect-profile-` and derives a named Playwright session from the profile directory basename (`.atomic/workflows/linkedin-connect.ts:438-439`).
- It writes a generated login helper script to `login.mjs` and records a login status path at `login-status.json` (`.atomic/workflows/linkedin-connect.ts:440-442`).
- It transforms the profile input from raw multiline text into `profileLines` by splitting on newlines, trimming each line, and dropping blank lines (`.atomic/workflows/linkedin-connect.ts:443-446`).
- It sets `noNote` to `true` exactly when `template.trim() === ""` (`.atomic/workflows/linkedin-connect.ts:455-456`).

#### 2. Workflow Stage Order (`.atomic/workflows/linkedin-connect.ts:568-604`)
- The workflow runs a `login` stage first with tools `bash` and `read` from `BROWSER_STAGE_TOOLS` (`.atomic/workflows/linkedin-connect.ts:45`, `.atomic/workflows/linkedin-connect.ts:569-571`).
- After the `login` stage, the runner calls `assertLoginStatus(loginStatusPath)` before proceeding (`.atomic/workflows/linkedin-connect.ts:572`).
- It runs a `prepare` stage with a validation/report prompt (`.atomic/workflows/linkedin-connect.ts:574-576`).
- It iterates over each parsed profile line and launches exactly one stage named `execute-<profileIndex>` per profile (`.atomic/workflows/linkedin-connect.ts:578-595`).
- After each execute stage it sleeps for a randomized pacing delay returned by `pacingDelayMs(profileIndex, totalProfiles)` (`.atomic/workflows/linkedin-connect.ts:597`).
- After the loop, it computes `resultsPath` as `${artifactsDir}/results.log` and runs a `summarize` stage (`.atomic/workflows/linkedin-connect.ts:600-603`).
- The return value includes `artifactsDir`, `resultsPath`, `profileCount`, and `dryRun` (`.atomic/workflows/linkedin-connect.ts:605-610`).

#### 3. Login HIL Gate and Browser Session Creation (`.atomic/workflows/linkedin-connect.ts:248-269`, `.atomic/workflows/linkedin-connect.ts:272-398`)
- `buildLoginPrompt()` tells the stage agent to run `bun <loginScriptPath>` exactly once and explicitly says the user handles login in the headed Chrome window (`.atomic/workflows/linkedin-connect.ts:254-268`).
- The generated login script opens LinkedIn login using `playwright-cli -s=<sessionName> open --headed --persistent --profile=<profileDir> https://www.linkedin.com/login` (`.atomic/workflows/linkedin-connect.ts:350-357`).
- The script uses `playwright-cli` first and falls back to `bunx playwright-cli` only when the primary command exits with `127` (`.atomic/workflows/linkedin-connect.ts:329-333`).
- It polls the browser URL using `eval "() => location.href"` until an authenticated URL is observed or the timeout expires (`.atomic/workflows/linkedin-connect.ts:344-370`).
- Authentication is determined by rejecting login/checkpoint/authwall/signup URLs and accepting feed/profile/network URLs (`.atomic/workflows/linkedin-connect.ts:284-299`).
- Once authenticated, it navigates to `https://www.linkedin.com/feed/`, writes `{ status: "ok", url: lastUrl }` to the status file, and exits successfully (`.atomic/workflows/linkedin-connect.ts:371-379`).
- If opening, feed normalization, or timeout fails, it writes a `status: "failed"` JSON object with error details (`.atomic/workflows/linkedin-connect.ts:359-361`, `.atomic/workflows/linkedin-connect.ts:373-375`, `.atomic/workflows/linkedin-connect.ts:387-397`).
- `assertLoginStatus()` is the code-level gate after the stage: it reads the status file, parses JSON, and throws unless `status.status === "ok"` (`.atomic/workflows/linkedin-connect.ts:410-427`).

#### 4. Prepare Stage Validation Prompt (`.atomic/workflows/linkedin-connect.ts:51-85`)
- The prepare prompt includes the full template, total profile count, first three profile lines, `dry_run`, Chrome profile directory, and mode (`no_note` or `personalized_note`) (`.atomic/workflows/linkedin-connect.ts:58-72`).
- In no-note mode, it tells the agent that execute stages must send plain connection requests without Add a note or message writing (`.atomic/workflows/linkedin-connect.ts:75-76`).
- In personalized-note mode, it tells the agent to find every `[...]` placeholder token case-insensitively, list each verbatim, and treat templates with zero placeholders as literal text (`.atomic/workflows/linkedin-connect.ts:77`).
- It asks the agent to list malformed profile lines against the shape `https://www.linkedin.com/in/<handle>`, print total profile count, confirm the logged-in headed Chrome window is already open, mention pacing, and include a one-line LinkedIn TOS warning (`.atomic/workflows/linkedin-connect.ts:78-82`).
- The stage is validation-only: the prompt says not to run commands and to keep the report under 14 short lines (`.atomic/workflows/linkedin-connect.ts:84`).

#### 5. Personalized Profile Review and Message Filling (`.atomic/workflows/linkedin-connect.ts:88-163`)
- `buildExecutePrompt()` routes to `buildNoNoteExecutePrompt()` when `args.noNote` is true; otherwise it constructs the personalized-note prompt (`.atomic/workflows/linkedin-connect.ts:88-102`).
- The personalized prompt frames the stage as processing exactly one LinkedIn profile with `playwright-cli` and visual browser inspection (`.atomic/workflows/linkedin-connect.ts:103`).
- It forbids the old Stagehand runner, custom DOM scraping scripts, and LinkedIn HTML parsing (`.atomic/workflows/linkedin-connect.ts:104`).
- It makes the agent the decision-maker for extracting profile details, filling the template, and clicking visible LinkedIn controls using snapshots, screenshots, and browser state (`.atomic/workflows/linkedin-connect.ts:105`).
- It passes the profile URL, index, total count, template file path, Chrome profile directory, Playwright session name, artifact directory, and dry-run value into the prompt (`.atomic/workflows/linkedin-connect.ts:107-113`).
- The message-quality block says to use the template as shape and voice, and treat bracketed slots as hints rather than strict contracts (`.atomic/workflows/linkedin-connect.ts:115-117`).
- Slots must be filled from visible profile content: Experience, About, Featured, and Activity (`.atomic/workflows/linkedin-connect.ts:118-120`).
- `[name]` and `[Name]` both mean capitalized first name (`.atomic/workflows/linkedin-connect.ts:119`).
- If a slot lacks a clean visible answer, the prompt instructs the agent to rewrite the surrounding phrase naturally while grounding it in visible content and preserving tone/rough length (`.atomic/workflows/linkedin-connect.ts:120`).
- If the profile is too sparse to ground a substitute, the agent should skip with reason `low_confidence` (`.atomic/workflows/linkedin-connect.ts:121`).
- The final note must be no more than 300 characters, must not invent biographical facts, and any wording change must be recorded in the result line's `substitutions` field (`.atomic/workflows/linkedin-connect.ts:122-124`).
- The prompt gives examples for direct `[name]`/`[company]` filling, a `[company]` substitution to `post-Cisco/Microsoft`, and a sparse-profile skip (`.atomic/workflows/linkedin-connect.ts:126-134`).
- Before sending, the agent must re-read the note and fix or skip if a literal bracket placeholder remains or the note does not sound human (`.atomic/workflows/linkedin-connect.ts:150`).

#### 6. Personalized Browser Automation Steps (`.atomic/workflows/linkedin-connect.ts:137-159`)
- Browser work must use `playwright-cli`, with `bunx playwright-cli` as fallback if unavailable (`.atomic/workflows/linkedin-connect.ts:137-139`).
- All browser commands must attach to the existing named session using `-s=<sessionName>`; the execute stage must not run `playwright-cli open` because login already opened the headed session (`.atomic/workflows/linkedin-connect.ts:139`, `.atomic/workflows/linkedin-connect.ts:144`).
- The agent should prefer accessibility snapshot refs for clicks and fills, and re-snapshot after navigation, menu open, modal open, and modal fill (`.atomic/workflows/linkedin-connect.ts:140`).
- Screenshots are primary evidence; the prompt requires at least one profile screenshot and one final modal screenshot (`.atomic/workflows/linkedin-connect.ts:141`).
- The prompt directs the agent to avoid brittle selectors, CSS classes, LinkedIn internals, and DOM inspection scripts, using only visible text, accessibility refs, screenshots, and normal browser actions (`.atomic/workflows/linkedin-connect.ts:142`).
- The concrete profile flow is: `goto <profileUrl>`, save top and details screenshots, scroll and inspect content, produce the note, find Connect directly or through More, open the invitation modal, click Add a note, fill the note textarea, save modal screenshot, and either cancel for dry-run or send for non-dry-run (`.atomic/workflows/linkedin-connect.ts:146-154`).
- The send action in non-dry-run mode is gated by verifying the filled modal screenshot has the intended note and no placeholders (`.atomic/workflows/linkedin-connect.ts:154`).

#### 7. No-Note Mode (`.atomic/workflows/linkedin-connect.ts:165-222`)
- No-note mode is selected when the template is empty or whitespace-only via `noNote` (`.atomic/workflows/linkedin-connect.ts:99`, `.atomic/workflows/linkedin-connect.ts:455-456`).
- The prompt tells the agent to send a connection request without adding a note (`.atomic/workflows/linkedin-connect.ts:178-181`).
- It explicitly forbids clicking Add a note, filling a textarea, or drafting a message (`.atomic/workflows/linkedin-connect.ts:191-193`).
- After opening the invitation modal/dialog, the agent should click the visible send-without-note action; acceptable button text may be `Send without a note`, `Send`, or `Send invitation` (`.atomic/workflows/linkedin-connect.ts:194-195`).
- The no-note browser flow is: navigate to the profile, save a profile screenshot, find Connect directly or through More, snapshot and save the modal screenshot, cancel if dry-run or click send without note if not dry-run (`.atomic/workflows/linkedin-connect.ts:207-213`).
- Result lines in no-note mode force `name=-`, `company=-`, and `substitutions=-` (`.atomic/workflows/linkedin-connect.ts:215-218`).

#### 8. Result Line Contract and Summarization (`.atomic/workflows/linkedin-connect.ts:156-159`, `.atomic/workflows/linkedin-connect.ts:224-245`)
- Personalized execute stages must build exactly one space-separated result line: `profile=<n> url=<url> name=<name> company=<company> status=<status> reason=<reason> screenshot=<path> substitutions=<deviations>` (`.atomic/workflows/linkedin-connect.ts:156-157`).
- Empty fields use `-`; multiple substitutions are separated with `;`; fields must not contain literal newlines (`.atomic/workflows/linkedin-connect.ts:157`).
- Personalized statuses are `sent`, `dry_run`, `skip`, or `fail`; skip reasons include `low_confidence`, `unfilled_placeholder`, `message_too_long`, `no_connect_button`, `already_connected`, `pending`, `modal_interaction_failed`, and `user_login_required` (`.atomic/workflows/linkedin-connect.ts:158`).
- The agent must print the result line and append the exact same line to `${artifactsDir}/results.log`; the prompt states the append is mandatory because summarization reads this file (`.atomic/workflows/linkedin-connect.ts:159`).
- The summarize prompt reads `results.log`, expects one row per profile, and reports missing/fewer rows if applicable (`.atomic/workflows/linkedin-connect.ts:229-237`).
- Summary output is constrained to a markdown table, a totals line, and an artifacts section listing the artifact directory and screenshot paths (`.atomic/workflows/linkedin-connect.ts:239-244`).

#### 9. Pacing and Cleanup (`.atomic/workflows/linkedin-connect.ts:460-523`, `.atomic/workflows/linkedin-connect.ts:611-615`)
- `createPacer()` initializes a random counter for a coffee break after 5 to 8 processed profiles because `randomBetween(5, 9)` returns values from 5 through 8 (`.atomic/workflows/linkedin-connect.ts:464-465`).
- Between profiles, the base delay is random 60,000-180,000 ms; when the break counter reaches zero, it adds another random 5-15 minutes and resets the counter (`.atomic/workflows/linkedin-connect.ts:466-475`).
- No sleep occurs after the final profile because `pacingDelayMs()` returns `0` when `profileIndex >= totalProfiles` (`.atomic/workflows/linkedin-connect.ts:467`).
- `teardownRun()` closes the Playwright session, falls back to `bunx playwright-cli close`, kills lingering daemon/browser processes matching the session/profile, and removes the temporary profile directory (`.atomic/workflows/linkedin-connect.ts:491-500`).
- Cleanup handlers are installed for SIGINT, SIGTERM, and uncaught exceptions, and the `.run()` `finally` block tears down the run after summary or failure (`.atomic/workflows/linkedin-connect.ts:503-523`, `.atomic/workflows/linkedin-connect.ts:611-615`).

### Data Flow
1. Workflow inputs enter through `ctx.inputs` and are cast by `readInputs()` (`.atomic/workflows/linkedin-connect.ts:47-49`, `.atomic/workflows/linkedin-connect.ts:550`).
2. `setupRun()` writes the template to a temp file, creates artifact/profile directories, creates the login script, parses profile URLs, and computes `noNote` (`.atomic/workflows/linkedin-connect.ts:430-457`).
3. `login` stage receives paths/session metadata and runs the generated helper script (`.atomic/workflows/linkedin-connect.ts:569-571`, `.atomic/workflows/linkedin-connect.ts:254-268`).
4. The helper opens headed persistent Chrome and writes login status JSON after manual authentication (`.atomic/workflows/linkedin-connect.ts:350-379`).
5. `assertLoginStatus()` reads the status JSON and stops the workflow unless login succeeded (`.atomic/workflows/linkedin-connect.ts:410-427`, `.atomic/workflows/linkedin-connect.ts:572`).
6. `prepare` stage receives the raw template, parsed profile list, dry-run value, profile dir, and mode for validation/reporting (`.atomic/workflows/linkedin-connect.ts:574-576`, `.atomic/workflows/linkedin-connect.ts:58-85`).
7. Each `execute-N` stage receives one URL plus template/artifact/session metadata and either a personalized-note prompt or no-note prompt (`.atomic/workflows/linkedin-connect.ts:578-595`, `.atomic/workflows/linkedin-connect.ts:88-99`).
8. Execute stages use visible browser state to inspect profiles, optionally fill a note, save screenshots, and append a result line to `results.log` (`.atomic/workflows/linkedin-connect.ts:137-159`, `.atomic/workflows/linkedin-connect.ts:198-218`).
9. `summarize` stage reads `results.log` and formats the final table/totals/artifacts listing (`.atomic/workflows/linkedin-connect.ts:600-603`, `.atomic/workflows/linkedin-connect.ts:224-245`).
10. The workflow returns artifact metadata and tears down the browser session/profile (`.atomic/workflows/linkedin-connect.ts:605-615`).

### Placeholders and Template Semantics
- The workflow input description defines bracketed placeholders such as `[name]`, `[Name]`, `[company]`, `[their recent work]`, and `[specific reference to their work/thinking]` (`.atomic/workflows/linkedin-connect.ts:530-535`).
- Placeholder casing is described as ignored in the input description and prepare prompt (`.atomic/workflows/linkedin-connect.ts:533-534`, `.atomic/workflows/linkedin-connect.ts:77`).
- The prepare stage asks the agent to detect every `[...]` token case-insensitively and list each verbatim; templates with zero placeholders are sent literally (`.atomic/workflows/linkedin-connect.ts:75-77`).
- The execute prompt treats bracketed slots as hints, not strict contracts, allowing grounded rewrites when no clean answer exists (`.atomic/workflows/linkedin-connect.ts:115-120`).
- `[name]` and `[Name]` specifically map to the capitalized first name (`.atomic/workflows/linkedin-connect.ts:119`).
- If literal brackets remain before sending, the agent must fix the note or skip (`.atomic/workflows/linkedin-connect.ts:150`).
- Wording changes from the template are recorded in `substitutions`; multiple substitutions use `;` in the result line (`.atomic/workflows/linkedin-connect.ts:124`, `.atomic/workflows/linkedin-connect.ts:157`).

### HIL Gates
- Manual LinkedIn authentication is the explicit human-in-the-loop gate: the login prompt says not to enter credentials or automate MFA/checkpoint pages because the user handles login in the headed Chrome window (`.atomic/workflows/linkedin-connect.ts:255-258`).
- The workflow enforces completion of that gate by reading the login status file and throwing unless it contains `status: "ok"` (`.atomic/workflows/linkedin-connect.ts:410-427`, `.atomic/workflows/linkedin-connect.ts:572`).
- Dry-run is a send-prevention gate controlled by the `dry_run` input: execute prompts prepare the modal but cancel/close instead of sending when `dry_run` is true (`.atomic/workflows/linkedin-connect.ts:542-547`, `.atomic/workflows/linkedin-connect.ts:153`, `.atomic/workflows/linkedin-connect.ts:212`).
- For non-dry-run personalized sends, the prompt requires screenshot verification of the intended note and absence of placeholders before clicking Send/Send invitation (`.atomic/workflows/linkedin-connect.ts:154`).

### Browser Automation Pattern
- The workflow pins `TMPDIR` to `/tmp` so Playwright CLI daemon socket paths stay short on macOS; that environment flows into daemon, subprocesses, and temp paths (`.atomic/workflows/linkedin-connect.ts:9-14`).
- All stages are given only `bash` and `read` tools via `BROWSER_STAGE_TOOLS` (`.atomic/workflows/linkedin-connect.ts:45`, `.atomic/workflows/linkedin-connect.ts:569-603`).
- Login automation creates a persistent headed browser profile with `--persistent --profile=<profileDir>` and a stable `-s=<sessionName>` session (`.atomic/workflows/linkedin-connect.ts:350-357`).
- Execute automation attaches to the already-open session with `playwright-cli -s=<sessionName>` and is instructed not to call `open` again (`.atomic/workflows/linkedin-connect.ts:139-144`, `.atomic/workflows/linkedin-connect.ts:200-205`).
- The implementation uses prompts to constrain the automation style: snapshots and screenshot evidence, visible text/accessibility refs, no DOM scraping, no brittle selectors, and no HTML parsing (`.atomic/workflows/linkedin-connect.ts:137-142`, `.atomic/workflows/linkedin-connect.ts:198-203`).
