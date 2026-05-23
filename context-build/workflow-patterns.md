# Workflow Patterns

## Atomic workflow definitions

### Pattern 1: `defineWorkflow(...).description().input().run().compile()`
**Found in**: `.atomic/workflows/linkedin-connect.ts:526-529`, `.atomic/workflows/linkedin-profile-message.ts:489-491`, `.atomic/workflows/linkedin-follow-up.ts:508-510`

```ts
export default defineWorkflow("linkedin-connect")
  .description(
    "Send LinkedIn connection requests with agent-driven browser inspection against a persistent Chrome profile.",
  )
  .input("template", { ... })
  .run(async (ctx) => { ... })
  .compile();
```

### Pattern 2: stage orchestration with `ctx.stage(...).prompt(...)`
**Found in**: `.atomic/workflows/linkedin-connect.ts:575-576`, `.atomic/workflows/linkedin-profile-message.ts:532-534`, `.atomic/workflows/linkedin-follow-up.ts:548-555`

```ts
await ctx
  .stage("prepare", { tools: BROWSER_STAGE_TOOLS })
  .prompt(buildPrepareReport({ template, profileLines, profileDir, resultsPath }));
```

## HIL batch approval / editor loops

### Pattern 3: editable JSON approval loop with `editor()` + `confirm()`
**Found in**: `.atomic/workflows/linkedin-profile-message.ts:451-467`, `.atomic/workflows/linkedin-follow-up.ts:470-486`

```ts
let document = buildProfileMessageReviewDocument(generated);
for (;;) {
  const edited = await ctx.ui.editor(document);
  const parsed = parseApprovedProfileMessages(edited);
  if (!parsed.ok) {
    document = [
      "# LinkedIn Profile Message Approval — Fix Required",
      `The approval document could not be parsed: ${parsed.error}`,
      edited,
    ].join("\n");
    continue;
  }

  const confirmed = await ctx.ui.confirm(
    `Approve and send ${parsed.messages.length} LinkedIn profile message(s)? Only entries with approved: true will be sent.`,
  );
  if (confirmed) return parsed.messages;
  document = edited;
}
```

### Pattern 4: approval document embedded as JSON block
**Found in**: `.atomic/workflows/lib/linkedin-profile-message-helpers.ts:156-171`, `.atomic/workflows/lib/linkedin-follow-up-helpers.ts:156-181`

```ts
return [
  "# LinkedIn Profile Message Approval",
  "",
  "Review every generated LinkedIn profile message before anything is sent on LinkedIn.",
  "",
  APPROVAL_JSON_START,
  JSON.stringify(editable, null, 2),
  APPROVAL_JSON_END,
].join("\n");
```

## Playwright / browser automation in workflow stages

### Pattern 5: named playwright session + visible browser state
**Found in**: `.atomic/workflows/linkedin-connect.ts:138-147`, `.atomic/workflows/linkedin-profile-message.ts:137-147`, `.atomic/workflows/linkedin-follow-up.ts:137-147`

```ts
"1. Use `playwright-cli` for browser work. If the command is unavailable, use `bunx playwright-cli` for the same command.",
`2. Always use the named session: \`playwright-cli -s=${args.sessionName} ...\` so browser state stays consistent.`,
"3. Prefer refs from `playwright-cli snapshot` for clicks and fills. Re-snapshot after every navigation, menu open, modal open, and modal fill.",
"4. Screenshots are primary evidence.",
```

### Pattern 6: stage prompts forbid DOM scraping and require screenshots
**Found in**: `.atomic/workflows/lib/linkedin-profile-message-helpers.ts:83-85`, `.atomic/workflows/lib/linkedin-follow-up-helpers.ts:72-74`, `.atomic/workflows/linkedin-connect.ts:103-104`

```ts
"Do not run the old Stagehand runner. Do not write a DOM-scraping script. Do not parse LinkedIn HTML.",
"You are the decision-maker: use snapshots, screenshots, and visible browser state to review the profile...",
"Do NOT fill any LinkedIn message composer. Do NOT leave a LinkedIn draft. Do NOT click Send.",
```

## LinkedIn messaging / follow-up automation

### Pattern 7: profile-message workflow with draft → approval → send
**Found in**: `.atomic/workflows/linkedin-profile-message.ts:489-491`, `.atomic/workflows/linkedin-profile-message.ts:525-573`, `.atomic/workflows/linkedin-profile-message.ts:581-603`

```ts
export default defineWorkflow("linkedin-profile-message")
  .description(
    "Draft personalized LinkedIn messages from profile URLs, gate them through editable human approval, then send approved messages via LinkedIn Messaging.",
  )
```

### Pattern 8: unread-follow-up workflow with safety cap and done state
**Found in**: `.atomic/workflows/linkedin-follow-up.ts:508-510`, `.atomic/workflows/linkedin-follow-up.ts:551-623`

```ts
for (let i = 1; i <= maxMessages; i += 1) {
  const resultCountBeforeStage = readResultLines(resultsPath).length;
  await ctx.stage(`generate-unread-${i}`, { tools: BROWSER_STAGE_TOOLS }).prompt(...);
  const lastResult = validStageResult ?? appendWorkflowFailureResult(...);
  done = lastResult.status === "done";
  if (done) break;
}
```

### Pattern 9: send step reads approved message file and targets LinkedIn Messaging
**Found in**: `.atomic/workflows/lib/linkedin-follow-up-helpers.ts:302-307`, `.atomic/workflows/lib/linkedin-follow-up-helpers.ts:334-337`

```ts
"- Read the approved message from the approved message file before interacting with LinkedIn.",
"- Fill exactly that approved message. Do not rewrite, shorten, personalize further, or regenerate it.",
"- Send only this one approved message to this one target.",
```
