export interface GeneratedFollowUp {
  readonly index: number;
  readonly status: string;
  readonly reason: string;
  readonly senderName: string;
  readonly profileUrl: string;
  readonly conversationUrl: string;
  readonly headline: string;
  readonly company: string;
  readonly unreadMessageSummary: string;
  readonly profileSignals: readonly string[];
  readonly draft: string;
  readonly personalizationNotes: readonly string[];
  readonly screenshots: readonly string[];
}

export interface ApprovedFollowUp {
  readonly index: number;
  readonly approved: true;
  readonly senderName: string;
  readonly profileUrl: string;
  readonly conversationUrl: string;
  readonly headline: string;
  readonly company: string;
  readonly unreadMessageSummary: string;
  readonly profileSignals: readonly string[];
  readonly message: string;
  readonly messagePath?: string;
}

export interface ApprovedFollowUpWithMessagePath extends ApprovedFollowUp {
  readonly messagePath: string;
}

export type ApprovalParseResult =
  | { readonly ok: true; readonly messages: readonly ApprovedFollowUp[] }
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

export function buildProcessUnreadPrompt(args: {
  conversationIndex: number;
  maxMessages: number;
  templatePath: string;
  resultsPath: string;
  artifactsDir: string;
  profileDir: string;
  sessionName: string;
}): string {
  const n = args.conversationIndex;
  return [
    `Generate at most ONE unread LinkedIn conversation follow-up (#${n} of safety cap ${args.maxMessages}) with playwright-cli and visual browser inspection.`,
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "You are the decision-maker: use snapshots, screenshots, and visible browser state to read the unread message plus the last 3 messages from the sender in the conversation history, then you must inspect the sender's LinkedIn profile before generating a natural follow-up from the template.",
    "Do NOT fill the LinkedIn reply composer. Do NOT leave a LinkedIn draft. Generated text must be saved only to the JSONL result for the later Atomic human approval gate.",
    "",
    `Template file: ${args.templatePath}`,
    `Chrome profile dir: ${args.profileDir}`,
    `Playwright session name: ${args.sessionName}`,
    `Artifact directory: ${args.artifactsDir}`,
    `Generated results JSONL: ${args.resultsPath}`,
    "",
    "<non_negotiable_safety>",
    "- NEVER click any Send / Send message button or paper-airplane send icon during this generation stage.",
    "- NEVER press Enter in the message composer. LinkedIn may treat Enter as send.",
    "- NEVER focus, paste into, type into, or otherwise fill the reply composer.",
    "- NEVER use keyboard shortcuts that could submit the message.",
    "- The final browser state for a successful generation is: message/profile context captured, generated response recorded in JSONL, and no LinkedIn composer text written by this workflow.",
    "- If you cannot confidently generate without risk of sending or drafting inside LinkedIn, skip with reason `unsafe_to_generate`.",
    "</non_negotiable_safety>",
    "",
    "<message_quality>",
    "Your job: write a LinkedIn DM reply that sounds like you read the sender's unread message, the last 3 messages from the sender in the conversation history, and their profile. Use the template as the structure and voice, not as a carbon copy.",
    "",
    "Rules:",
    "- First understand what the sender is asking/saying by reading the unread message(s) plus the last 3 messages from the sender in the visible conversation history, then directly address it.",
    "- Then inspect the sender's LinkedIn profile so the response is grounded in who they are and what context is relevant to them.",
    "- Fill each [slot] from the unread message and visible profile content. [name] and [Name] both mean first name, capitalized.",
    "- Use the same profile-inspection depth as the linkedin-connect workflow: visible Experience, About, Featured, and Activity content when visible.",
    "- If a slot has no clean answer, rewrite the surrounding phrase so the draft still reads naturally and stays grounded in visible facts.",
    "- Never invent biographical facts, relationship history, or commitments. If a claim is not visible in the message/profile, do not include it.",
    "- Keep the reply concise, warm, and natural for LinkedIn DMs. No unresolved placeholders or literal brackets may remain.",
    "- Record key substitutions/personalization choices in the JSONL result.",
    "</message_quality>",
    "",
    "Tooling rules:",
    "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
    `2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${args.sessionName} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for clicks and navigation. Re-snapshot after every navigation, menu open, profile open, conversation open, and browser back.",
    "4. Screenshots are primary evidence. Save inbox/thread/profile screenshots using the paths below.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "The browser session is already open in headed mode and logged into LinkedIn — the workflow runner handled login before launching this stage. Do NOT run `playwright-cli open`. Just attach to the existing session via `-s=`.",
    "",
    "Step 1 — find the first unread conversation in the main Messaging inbox.",
    `  a. Navigate with \`playwright-cli -s=${args.sessionName} goto https://www.linkedin.com/messaging/\` and snapshot the page.`,
    `  b. Save an inbox screenshot to ${args.artifactsDir}/message-${n}-inbox.png.`,
    "  c. Inspect the main conversation list for unread indicators (bold/unread label/badge/dot/count visible in the UI). If no unread conversation is visible, scroll the conversation list as needed and re-snapshot. Do not process read conversations.",
    "  d. If there are no unread conversations in the main inbox after checking the list, append a JSONL row with status `done`, reason `no_unread`, and stop. Do not open a conversation.",
    "",
    "Step 2 — open exactly one unread conversation and understand it.",
    "  a. Open the first unread conversation by visible ref. Opening it may mark it read; that is expected and creates loop progress.",
    "  b. Capture the current browser URL after opening the conversation. Store it as `conversationUrl`; this is the target for the later approved send step.",
    `  c. Save the thread screenshot to ${args.artifactsDir}/message-${n}-thread.png.`,
    "  d. Read the unread message(s) and the last 3 messages from the sender in the conversation history. Scroll upward in the visible thread if needed to find them. If fewer than 3 sender messages are available, read all visible sender messages. Use nearby context only as needed to understand those sender messages. If this is a group conversation or the sender is ambiguous, skip with reason `group_or_ambiguous_sender`.",
    "  e. Inspect the reply composer without typing. If it already contains text, or the UI indicates an existing draft for this conversation, do NOT overwrite or append later; append a JSONL row with status `skip`, reason `existing_draft`, and stop.",
    "",
    "Step 3 — inspect the sender profile before drafting.",
    "  a. Open the sender's visible LinkedIn profile link/name/avatar from the conversation. If no profile path is available, or the profile cannot be opened and inspected confidently, append a JSONL row with status `skip`, reason `profile_unavailable`, and stop. Do not continue from message context alone.",
    `  b. Save screenshots to ${args.artifactsDir}/message-${n}-profile-top.png and, after scrolling, ${args.artifactsDir}/message-${n}-profile-details.png.`,
    "  c. Read visible headline, company/title, Experience, About, Featured, and Activity when visible. Do not scrape hidden DOM or use brittle selectors.",
    "  d. Return to the conversation after profile review using browser back or the visible Messaging surface, then re-snapshot the conversation. Do not touch the composer.",
    "  e. Do not generate a successful draft without profile context; the draft must reflect both the unread message and what you learned from the sender profile.",
    "",
    "Step 4 — generate the reply offline for approval.",
    "  a. Only after the sender profile has been inspected, read the template file, generate a natural response per <message_quality>, and verify no literal [bracketed] placeholders remain.",
    "  b. Do not focus, paste, fill, or type into the visible reply composer. The message is only a generated candidate until the human approval gate.",
    "  c. If the generated message has placeholders, unsafe claims, or low confidence, log status `fail` or `skip` with the relevant reason instead of generating a candidate.",
    "",
    "Step 5 — append exactly one JSONL result row.",
    "Use one of these statuses: generated | skip | fail | done.",
    "Use common reasons: generated | no_unread | existing_draft | group_or_ambiguous_sender | unsafe_to_generate | profile_unavailable | no_reply_box | unfilled_placeholder | user_login_required | navigation_failed | modal_or_ui_failed.",
    "The JSON object must include these keys: index, status, reason, senderName, profileUrl, conversationUrl, headline, company, unreadMessageSummary, profileSignals, draft, personalizationNotes, screenshots.",
    "- `conversationUrl` must be the current messaging conversation URL captured after opening the unread conversation when available; otherwise use an empty string.",
    "- `draft` must be the exact generated reply text when status is `generated`; otherwise use an empty string.",
    "- `screenshots` must be an array of artifact paths saved during this conversation.",
    "- Keep unreadMessageSummary concise; do not dump the entire private thread.",
    `Append the JSON object as a single line to ${args.resultsPath}. Use a quoted here-doc so shell quoting does not corrupt the JSON, for example:`,
    `cat >> ${args.resultsPath} <<'JSONL'`,
    `{"index":${n},"status":"generated","reason":"generated","senderName":"Jane Doe","profileUrl":"https://www.linkedin.com/in/example/","conversationUrl":"https://www.linkedin.com/messaging/thread/example/","headline":"...","company":"...","unreadMessageSummary":"...","profileSignals":["..."],"draft":"...","personalizationNotes":["..."],"screenshots":["${args.artifactsDir}/message-${n}-thread.png"]}`,
    "JSONL",
    "",
    "Print the same JSON object to stdout after appending it. Do not loop, do not process any other unread conversation, do not wait/sleep — pacing is handled outside this session. Stop after the result row is both appended and printed.",
  ].join("\n");
}

export function buildReviewDocument(generated: readonly GeneratedFollowUp[]): string {
  const editable = generated.map((row) => ({
    index: row.index,
    approved: true,
    senderName: row.senderName,
    profileUrl: row.profileUrl,
    conversationUrl: row.conversationUrl,
    headline: row.headline,
    company: row.company,
    unreadMessageSummary: row.unreadMessageSummary,
    profileSignals: row.profileSignals,
    message: row.draft,
  }));

  return [
    "# LinkedIn Follow-up Approval",
    "",
    "Review every generated follow-up before anything is sent on LinkedIn.",
    "",
    "- Profile and conversation context is included next to each editable `message`.",
    "- Edit message text directly in the JSON block.",
    "- Keep `approved: true` for messages to send. Change it to `false` to skip a message.",
    "- Do not edit `index`, `profileUrl`, or `conversationUrl` unless you are intentionally correcting a target.",
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

function isAllowedLinkedInUrl(value: string, kind: "profile" | "conversation"): boolean {
  if (value.trim() === "") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "linkedin.com" && hostname !== "www.linkedin.com") return false;
  if (kind === "profile") return url.pathname.startsWith("/in/");
  return url.pathname.startsWith("/messaging/");
}

export function parseApprovedFollowUps(content: string): ApprovalParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractEditableJson(content));
  } catch (err) {
    return { ok: false, error: `Approval document is not valid JSON: ${String(err)}` };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Approval document must be a JSON array." };
  }

  const approved: ApprovedFollowUp[] = [];
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

    const senderName = readString(row["senderName"]);
    const profileUrl = readString(row["profileUrl"]);
    const conversationUrl = readString(row["conversationUrl"]);
    const message = readString(row["message"]).trim();
    const hasProfileTarget = isAllowedLinkedInUrl(profileUrl, "profile");
    const hasConversationTarget = isAllowedLinkedInUrl(conversationUrl, "conversation");

    if (!hasProfileTarget && !hasConversationTarget) {
      return { ok: false, error: `Entry ${index} needs a valid LinkedIn profileUrl or conversationUrl target.` };
    }
    if (profileUrl.trim() !== "" && !hasProfileTarget) {
      return { ok: false, error: `Entry ${index} has an invalid LinkedIn profileUrl.` };
    }
    if (conversationUrl.trim() !== "" && !hasConversationTarget) {
      return { ok: false, error: `Entry ${index} has an invalid LinkedIn conversationUrl.` };
    }
    if (message === "") return { ok: false, error: `Entry ${index} has an empty message.` };
    if (LEFTOVER_BRACKET_PATTERN.test(message)) {
      return { ok: false, error: `Entry ${index} still contains leftover bracket/placeholder text.` };
    }

    approved.push({
      index,
      approved: true,
      senderName,
      profileUrl,
      conversationUrl,
      headline: readString(row["headline"]),
      company: readString(row["company"]),
      unreadMessageSummary: readString(row["unreadMessageSummary"]),
      profileSignals: readStringArray(row["profileSignals"]),
      message,
    });
  }

  return { ok: true, messages: approved };
}

export function buildSendApprovedPrompt(args: {
  approved: ApprovedFollowUpWithMessagePath;
  sendResultsPath: string;
  artifactsDir: string;
  profileDir: string;
  sessionName: string;
}): string {
  const row = args.approved;
  return [
    `Process exactly ONE approved LinkedIn follow-up (#${row.index}) with playwright-cli and visual browser inspection.`,
    "This is the final send step. Send only this human-approved message, exactly as stored in the approved message file.",
    "Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
    "",
    `Sender: ${row.senderName}`,
    `Profile URL: ${row.profileUrl}`,
    `Conversation URL: ${row.conversationUrl}`,
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
    "- Send only this one approved message to this one target.",
    "</approved_message_contract>",
    "",
    "Tooling rules:",
    "1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
    `2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent. If falling back to bunx, keep the same arguments: \`bunx playwright-cli -s=${args.sessionName} ...\`.`,
    "3. Prefer refs from `playwright-cli snapshot` for clicks and fills. Re-snapshot after navigation, composer focus, composer fill, and send click.",
    "4. Screenshots are primary evidence. Save before-fill and sent/confirmation screenshots using the paths below.",
    "5. Avoid brittle selectors, CSS classes, LinkedIn internals, or custom scripts that inspect the DOM. Only use visible text, accessibility snapshot refs, screenshots, and normal browser actions.",
    "",
    "Step 1 — navigate to the correct target.",
    row.conversationUrl.trim() === ""
      ? `  a. No conversationUrl is available. Navigate to the profile URL: ${row.profileUrl}`
      : `  a. Navigate to the approved conversation URL: ${row.conversationUrl}`,
    "  b. Snapshot the page and verify the visible target matches the sender/profile context above. If it clearly does not match, do not send; log status `fail` with reason `target_mismatch`.",
    "  c. If navigating to a profile fallback, use the visible Message action to open the message composer. If no safe message path exists, log status `fail` with reason `no_message_path`.",
    `  d. Save a before-fill screenshot to ${args.artifactsDir}/send-${row.index}-before.png.`,
    "",
    "Step 2 — fill and send the approved message.",
    "  a. Read the approved message file. Verify it is non-empty and has no bracketed placeholders.",
    "  b. Inspect the visible message/reply composer before filling it. If it already contains text that is not the approved message, do not overwrite it; log status `skip` with reason `existing_composer_text`.",
    "  c. Focus the visible message/reply composer and fill/paste the exact approved message. Avoid pressing Enter before the final send action.",
    `  d. Save a filled composer screenshot to ${args.artifactsDir}/send-${row.index}-filled.png.`,
    "  e. Re-read the visible composer text. If it does not match the approved message exactly, except for platform-invisible whitespace normalization, do not send; log status `fail` with reason `message_mismatch`.",
    "  f. Click the visible Send / Send message button only after the exact approved message is visible for the correct target.",
    `  g. Save a sent/confirmation screenshot to ${args.artifactsDir}/send-${row.index}-sent.png.`,
    "",
    "Step 3 — append exactly one JSONL send result row.",
    "Use one of these statuses: sent | skip | fail.",
    "Use common reasons: sent | target_mismatch | no_message_path | no_reply_box | existing_composer_text | invalid_approved_message | message_mismatch | send_button_unavailable | user_login_required | navigation_failed | modal_or_ui_failed.",
    "The JSON object must include these keys: index, status, reason, senderName, profileUrl, conversationUrl, messagePath, screenshots.",
    `Append the JSON object as a single line to ${args.sendResultsPath}. Use a quoted here-doc so shell quoting does not corrupt the JSON, for example:`,
    `cat >> ${args.sendResultsPath} <<'JSONL'`,
    `{"index":${row.index},"status":"sent","reason":"sent","senderName":${JSON.stringify(row.senderName)},"profileUrl":${JSON.stringify(row.profileUrl)},"conversationUrl":${JSON.stringify(row.conversationUrl)},"messagePath":${JSON.stringify(row.messagePath)},"screenshots":["${args.artifactsDir}/send-${row.index}-sent.png"]}`,
    "JSONL",
    "",
    "Print the same JSON object to stdout after appending it. Do not loop, do not process any other profile/conversation, do not wait/sleep — pacing is handled outside this session. Stop after the result row is both appended and printed.",
  ].join("\n");
}
