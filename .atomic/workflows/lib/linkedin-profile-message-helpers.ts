export interface GeneratedProfileMessage {
  readonly index: number;
  readonly status: string;
  readonly reason: string;
  readonly profileUrl: string;
  readonly recipientName: string;
  readonly headline: string;
  readonly company: string;
  readonly profileSignals: readonly string[];
  readonly draft: string;
  readonly personalizationNotes: readonly string[];
  readonly screenshots: readonly string[];
}

export interface ApprovedProfileMessage {
  readonly index: number;
  readonly approved: true;
  readonly recipientName: string;
  readonly profileUrl: string;
  readonly headline: string;
  readonly company: string;
  readonly profileSignals: readonly string[];
  readonly message: string;
  readonly messagePath?: string;
}

export interface ApprovedProfileMessageWithMessagePath extends ApprovedProfileMessage {
  readonly messagePath: string;
}

export type ProfileMessageApprovalParseResult =
  | { readonly ok: true; readonly messages: readonly ApprovedProfileMessage[] }
  | { readonly ok: false; readonly error: string };

const LEFTOVER_BRACKET_PATTERN = /[\[\]]/;
const APPROVAL_JSON_START = "--- BEGIN APPROVAL JSON ---";
const APPROVAL_JSON_END = "--- END APPROVAL JSON ---";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isAllowedLinkedInProfileUrl(value: string): boolean {
  if (value.trim() === "") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && hostname !== "www.linkedin.com") return false;
  return url.pathname.startsWith("/in/");
}

export function buildProfileDraftPrompt(args: {
  profileIndex: number;
  totalProfiles: number;
  profileUrl: string;
  templatePath: string;
  resultsPath: string;
  artifactsDir: string;
  profileDir: string;
  sessionName: string;
}): string {
  const n = args.profileIndex;
  return [
    `Draft exactly ONE LinkedIn direct message for profile #${n} of ${args.totalProfiles} with playwright-cli and visual browser inspection.`,
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "You are the decision-maker: use snapshots, screenshots, and visible browser state to review the profile, fill the template, and save an offline draft for the Atomic approval gate.",
    "Do NOT fill any LinkedIn message composer. Do NOT leave a LinkedIn draft. Do NOT click Send. Generated text must be saved only to the JSONL result for the later human approval gate.",
    "",
    `Profile URL: ${args.profileUrl}`,
    `Profile index: ${n} (of ${args.totalProfiles})`,
    `Template file: ${args.templatePath}`,
    `Chrome profile dir: ${args.profileDir}`,
    `Playwright session name: ${args.sessionName}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Generated results JSONL: ${args.resultsPath}`,
    "",
    "<non_negotiable_safety>",
    "- NEVER click any Send / Send message button or paper-airplane send icon during this draft stage.",
    "- NEVER press Enter in a message composer. LinkedIn may treat Enter as send.",
    "- NEVER focus, paste into, type into, or otherwise fill a LinkedIn message composer.",
    "- The final browser state for a successful generation is: profile context captured, generated message recorded in JSONL, and no LinkedIn composer text written by this workflow.",
    "- If you cannot confidently generate without risk of sending or drafting inside LinkedIn, skip with reason `unsafe_to_generate`.",
    "</non_negotiable_safety>",
    "",
    "<message_quality>",
    "Your job: write a LinkedIn DM that sounds like you actually read the profile, using the template as the shape and voice. The [bracketed] slots are hints, not contracts — fill them when the profile has a clean answer, adapt the wording when it doesn't, skip when there's nothing real to say.",
    "",
    "Rules:",
    "- Use the same profile-inspection depth as the linkedin-connect workflow: visible Experience, About, Featured, and Activity content when visible.",
    "- Fill each [slot] from visible profile content. [name] and [Name] both mean first name, capitalized.",
    "- If a slot has no clean answer in visible content, rewrite the surrounding phrase so the message still reads naturally AND stays grounded in something visible. Keep the template's tone and rough length.",
    "- If the profile is too sparse to ground any substitute, skip with reason `low_confidence`.",
    "- Never invent biographical facts, relationship history, or commitments. If a claim is not visible in the profile, do not include it.",
    "- Keep the message concise, warm, and natural for a LinkedIn DM. No unresolved placeholders or literal brackets may remain.",
    "- Record key substitutions/personalization choices in the JSONL result.",
    "- Do not generate a successful draft without profile context.",
    "</message_quality>",
    "",
    "Tooling rules:",
    "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
    `2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${args.sessionName} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for navigation. Re-snapshot after every navigation and scroll.",
    "4. Screenshots are primary evidence. Save top and details screenshots using the paths below.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "The browser session is already open in headed mode and logged into LinkedIn — the workflow runner handled login before launching this stage. Do NOT run `playwright-cli open`. Just attach to the existing session via `-s=`.",
    "",
    "Step 1 — inspect this profile.",
    `  a. Navigate with \`playwright-cli -s=${args.sessionName} goto ${args.profileUrl}\` and snapshot the page.`,
    `  b. Save screenshots to ${args.artifactsDir}/profile-${n}-top.png and, after scrolling, ${args.artifactsDir}/profile-${n}-details.png.`,
    "  c. Read visible name, headline, company/title, Experience, About, Featured, and Activity when visible. Do not scrape hidden DOM or use brittle selectors.",
    "  d. If the page indicates the user is not logged in, append status `fail` with reason `user_login_required` and stop.",
    "",
    "Step 2 — generate the message offline for approval.",
    "  a. Only after the profile has been inspected, read the template file, generate a natural response per <message_quality>, and verify no literal [bracketed] placeholders remain.",
    "  b. Do not focus, paste, fill, or type into any LinkedIn message composer. The message is only a generated candidate until the human approval gate.",
    "  c. If the generated message has placeholders, unsafe claims, no recipient name, or low confidence, log status `fail` or `skip` with the relevant reason instead of generating a candidate.",
    "",
    "Step 3 — append exactly one JSONL result row.",
    "Use one of these statuses: generated | skip | fail.",
    "Use common reasons: generated | low_confidence | unsafe_to_generate | profile_unavailable | unfilled_placeholder | no_recipient_name | user_login_required | navigation_failed | modal_or_ui_failed.",
    "The JSON object must include these keys: index, status, reason, profileUrl, recipientName, headline, company, profileSignals, draft, personalizationNotes, screenshots.",
    "- `recipientName` must be the visible full name from the profile when available; otherwise use an empty string and do not use status `generated`.",
    "- `draft` must be the exact generated message text when status is `generated`; otherwise use an empty string.",
    "- `screenshots` must be an array of artifact paths saved during this profile review.",
    `Append the JSON object as a single line to ${args.resultsPath}. Use a quoted here-doc so shell quoting does not corrupt the JSON, for example:`,
    `cat >> ${args.resultsPath} <<'JSONL'`,
    `{"index":${n},"status":"generated","reason":"generated","profileUrl":${JSON.stringify(args.profileUrl)},"recipientName":"Jane Doe","headline":"...","company":"...","profileSignals":["..."],"draft":"...","personalizationNotes":["..."],"screenshots":["${args.artifactsDir}/profile-${n}-top.png"]}`,
    "JSONL",
    "",
    "Print the same JSON object to stdout after appending it. Do not loop, do not process any other profile, do not wait/sleep — pacing is handled outside this session. Stop after the result row is both appended and printed.",
  ].join("\n");
}

export function buildProfileMessageReviewDocument(generated: readonly GeneratedProfileMessage[]): string {
  const editable = generated.map((row) => ({
    index: row.index,
    approved: true,
    recipientName: row.recipientName,
    profileUrl: row.profileUrl,
    headline: row.headline,
    company: row.company,
    profileSignals: row.profileSignals,
    message: row.draft,
  }));

  return [
    "# LinkedIn Profile Message Approval",
    "",
    "Review every generated LinkedIn profile message before anything is sent on LinkedIn.",
    "",
    "- Profile context is included next to each editable `message`.",
    "- Edit message text directly in the JSON block.",
    "- Keep `approved: true` for messages to send. Change it to `false` to skip a message.",
    "- Do not edit `index` or `profileUrl` unless you are intentionally correcting a target.",
    "- `recipientName` is used in LinkedIn Messaging's New message recipient box; correct it if LinkedIn displays a more accurate name.",
    "- Submit this editor, then confirm the approval prompt to send approved messages only.",
    "",
    APPROVAL_JSON_START,
    JSON.stringify(editable, null, 2),
    APPROVAL_JSON_END,
  ].join("\n");
}

function extractEditableJson(content: string): string {
  const markerStart = content.indexOf(APPROVAL_JSON_START);
  const markerEnd = content.lastIndexOf(APPROVAL_JSON_END);
  if (markerStart >= 0 && markerEnd > markerStart) {
    return content.slice(markerStart + APPROVAL_JSON_START.length, markerEnd).trim();
  }

  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1]!.trim();

  return content.trim();
}

export function parseApprovedProfileMessages(content: string): ProfileMessageApprovalParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractEditableJson(content));
  } catch (err) {
    return { ok: false, error: `Approval document is not valid JSON: ${String(err)}` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Approval document must be a JSON array." };
  }

  const approved: ApprovedProfileMessage[] = [];
  const seenIndexes = new Set<number>();
  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i];
    if (!isRecord(row)) return { ok: false, error: `Entry ${i + 1} must be an object.` };
    if (row["approved"] !== true) continue;

    const index = readNumber(row["index"]);
    if (index === null || !Number.isSafeInteger(index) || index < 1) {
      return { ok: false, error: `Entry ${i + 1} has an invalid index.` };
    }
    if (seenIndexes.has(index)) {
      return { ok: false, error: `Entry ${index} has a duplicate approved index.` };
    }
    seenIndexes.add(index);

    const recipientName = readString(row["recipientName"]).trim();
    const profileUrl = readString(row["profileUrl"]);
    const message = readString(row["message"]).trim();

    if (recipientName === "") return { ok: false, error: `Entry ${index} has an empty recipientName.` };
    if (!isAllowedLinkedInProfileUrl(profileUrl)) {
      return { ok: false, error: `Entry ${index} has an invalid LinkedIn profileUrl.` };
    }
    if (message === "") return { ok: false, error: `Entry ${index} has an empty message.` };
    if (LEFTOVER_BRACKET_PATTERN.test(message)) {
      return { ok: false, error: `Entry ${index} still contains leftover bracket/placeholder text.` };
    }

    approved.push({
      index,
      approved: true,
      recipientName,
      profileUrl,
      headline: readString(row["headline"]),
      company: readString(row["company"]),
      profileSignals: readStringArray(row["profileSignals"]),
      message,
    });
  }

  return { ok: true, messages: approved };
}

export function buildSendApprovedProfileMessagePrompt(args: {
  approved: ApprovedProfileMessageWithMessagePath;
  sendResultsPath: string;
  artifactsDir: string;
  profileDir: string;
  sessionName: string;
}): string {
  const row = args.approved;
  return [
    `Process exactly ONE approved LinkedIn profile message (#${row.index}) with playwright-cli and visual browser inspection.`,
    "This is the final send step. Send only this human-approved message, exactly as stored in the approved message file.",
    "Follow the required LinkedIn Messaging flow: open Messages, click New message, input the person's name, select the correct recipient, write the message, and click Send.",
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "",
    `Recipient name: ${row.recipientName}`,
    `Profile URL for verification: ${row.profileUrl}`,
    `Approved message file: ${row.messagePath}`,
    `Chrome profile dir: ${args.profileDir}`,
    `Playwright session name: ${args.sessionName}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Send results JSONL: ${args.sendResultsPath}`,
    "",
    "<approved_message_contract>",
    "- Read the approved message from the approved message file before interacting with LinkedIn.",
    "- Fill exactly that approved message. Do not rewrite, shorten, personalize further, or regenerate it.",
    "- If the approved file has bracketed placeholders or is empty, do not send; log status `fail` with reason `invalid_approved_message`.",
    "- Send only this one approved message to this one approved recipient.",
    "</approved_message_contract>",
    "",
    "Tooling rules:",
    "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
    `2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${args.sessionName} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for clicks and fills. Re-snapshot after navigation, New message click, recipient selection, composer fill, and send click.",
    "4. Screenshots are primary evidence. Save before-fill, filled, and sent/confirmation screenshots using the paths below.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "Step 1 — open LinkedIn Messages and address a new message.",
    `  a. Navigate with \`playwright-cli -s=${args.sessionName} goto https://www.linkedin.com/messaging/\` and snapshot the page.`,
    "  b. Click the visible New message / Compose message action and re-snapshot.",
    `  c. Input the recipient name exactly as: ${row.recipientName}`,
    "  d. Select the visible recipient whose name matches the approved recipient and whose profile context does not conflict with the verification profile. If multiple ambiguous matches appear, do not send; log status `fail` with reason `ambiguous_recipient`.",
    `  e. Save a before-fill screenshot to ${args.artifactsDir}/send-${row.index}-before.png.`,
    "",
    "Step 2 — fill and send the approved message.",
    "  a. Read the approved message file. Verify it is non-empty and has no bracketed placeholders.",
    "  b. Inspect the visible message composer before filling it. If it already contains text that is not the approved message, do not overwrite it; log status `skip` with reason `existing_composer_text`.",
    "  c. Focus the visible message composer and fill/paste the exact approved message. Avoid pressing Enter before the final send action.",
    `  d. Save a filled composer screenshot to ${args.artifactsDir}/send-${row.index}-filled.png.`,
    "  e. Re-read the visible composer text. If it does not match the approved message exactly, except for platform-invisible whitespace normalization, do not send; log status `fail` with reason `message_mismatch`.",
    "  f. Click the visible Send / Send message button only after the exact approved message is visible for the correct recipient.",
    `  g. Save a sent/confirmation screenshot to ${args.artifactsDir}/send-${row.index}-sent.png.`,
    "",
    "Step 3 — append exactly one JSONL send result row.",
    "Use one of these statuses: sent | skip | fail.",
    "Use common reasons: sent | ambiguous_recipient | target_mismatch | no_new_message_path | no_message_box | existing_composer_text | invalid_approved_message | message_mismatch | send_button_unavailable | user_login_required | navigation_failed | modal_or_ui_failed.",
    "The JSON object must include these keys: index, status, reason, recipientName, profileUrl, messagePath, screenshots.",
    `Append the JSON object as a single line to ${args.sendResultsPath}. Use a quoted here-doc so shell quoting does not corrupt the JSON, for example:`,
    `cat >> ${args.sendResultsPath} <<'JSONL'`,
    `{"index":${row.index},"status":"sent","reason":"sent","recipientName":${JSON.stringify(row.recipientName)},"profileUrl":${JSON.stringify(row.profileUrl)},"messagePath":${JSON.stringify(row.messagePath)},"screenshots":["${args.artifactsDir}/send-${row.index}-sent.png"]}`,
    "JSONL",
    "",
    "Print the same JSON object to stdout after appending it. Do not loop, do not process any other profile, do not wait/sleep — pacing is handled outside this session. Stop after the result row is both appended and printed.",
  ].join("\n");
}
