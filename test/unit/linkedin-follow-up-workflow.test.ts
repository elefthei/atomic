import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { dirname } from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import type { StageContext, WorkflowRunContext } from "../../packages/workflows/src/shared/types.ts";
import {
  buildProcessUnreadPrompt,
  buildReviewDocument,
  buildSendApprovedPrompt,
  dedupeGeneratedFollowUpsForApproval,
  normalizeLinkedInTargetUrl,
  parseApprovedFollowUps,
  type GeneratedFollowUp,
} from "../../.atomic/workflows/lib/linkedin-follow-up-helpers.ts";

function generated(overrides: Partial<GeneratedFollowUp> = {}): GeneratedFollowUp {
  return {
    index: 1,
    status: "generated",
    reason: "generated",
    senderName: "Jane Doe",
    profileUrl: "https://www.linkedin.com/in/jane-doe/",
    conversationUrl: "https://www.linkedin.com/messaging/thread/abc/",
    headline: "Founder at Acme",
    company: "Acme",
    unreadMessageSummary: "Asked about AI workflow automation.",
    profileSignals: ["Founder at Acme", "Posts about workflow automation"],
    draft: "Hi Jane — happy to compare notes on AI workflow automation.",
    personalizationNotes: ["Referenced her founder role and automation posts."],
    screenshots: ["/tmp/profile.png"],
    ...overrides,
  };
}

describe("linkedin-follow-up workflow", () => {
  test("runs login as the first visible stage before preparing follow-ups", async () => {
    const mod = await import("../../.atomic/workflows/linkedin-follow-up.ts");
    const stages: string[] = [];
    const cleanupPaths = new Set<string>();
    const stopAfterPrepare = new Error("stop-after-prepare");
    const originalPath = process.env.PATH;

    function fakeStage(name: string): StageContext {
      return {
        name,
        async prompt(prompt: string): Promise<string> {
          stages.push(name);
          if (name === "login") {
            const scriptPath = prompt.match(/Command: bun (.+)/)?.[1]?.trim();
            const statusPath = prompt.match(/Status file: (.+)/)?.[1]?.trim();
            const profileDir = prompt.match(/Chrome profile dir: (.+)/)?.[1]?.trim();
            assert.ok(scriptPath, "login prompt should expose a script path");
            assert.ok(statusPath, "login prompt should expose a status file path");
            const loginScript = readFileSync(scriptPath, "utf8");
            assert.doesNotMatch(loginScript, /https:\/\/www\.linkedin\.com\/messaging\//);
            assert.doesNotMatch(loginScript, /normalize to messaging/i);
            if (profileDir) cleanupPaths.add(profileDir);
            cleanupPaths.add(dirname(statusPath));
            writeFileSync(
              statusPath,
              JSON.stringify({ status: "ok", url: "https://www.linkedin.com/messaging/" }),
            );
            return "login ok";
          }
          if (name === "prepare") throw stopAfterPrepare;
          throw new Error(`unexpected stage: ${name}`);
        },
      } as StageContext;
    }

    const ctx = {
      inputs: { template: "Hi [name]", max_messages: 1 },
      stage: fakeStage,
      task: async (): Promise<never> => {
        throw new Error("unexpected task call");
      },
      chain: async (): Promise<never> => {
        throw new Error("unexpected chain call");
      },
      parallel: async (): Promise<never> => {
        throw new Error("unexpected parallel call");
      },
      ui: {} as WorkflowRunContext["ui"],
    } satisfies WorkflowRunContext<Record<string, unknown>>;

    try {
      process.env.PATH = "";
      await mod.default.run(ctx);
      assert.fail("workflow should stop at the fake prepare stage");
    } catch (err) {
      assert.equal(err, stopAfterPrepare);
    } finally {
      process.env.PATH = originalPath;
      for (const path of cleanupPaths) rmSync(path, { recursive: true, force: true });
    }

    assert.deepEqual(stages, ["login", "prepare"]);
  });
});

describe("linkedin-follow-up approval gate helpers", () => {
  test("review document shows LinkedIn profile context beside editable response", () => {
    const document = buildReviewDocument([generated()]);

    assert.match(document, /LinkedIn Follow-up Approval/);
    assert.match(document, /https:\/\/www\.linkedin\.com\/in\/jane-doe\//);
    assert.match(document, /Founder at Acme/);
    assert.match(document, /Asked about AI workflow automation/);
    assert.match(document, /Hi Jane/);
    assert.match(document, /"approved": true/);
  });

  test("normalizes LinkedIn target URLs for duplicate comparison", () => {
    assert.equal(
      normalizeLinkedInTargetUrl("https://WWW.LINKEDIN.com/in/Jane-Doe/?miniProfileUrn=abc#about"),
      "https://www.linkedin.com/in/Jane-Doe",
    );
    assert.equal(
      normalizeLinkedInTargetUrl("https://linkedin.com/messaging/thread/abc/?trk=foo#main"),
      "https://www.linkedin.com/messaging/thread/abc",
    );
    assert.equal(normalizeLinkedInTargetUrl("https://example.com/in/Jane-Doe/"), "");
  });

  test("dedupes approval candidates by either normalized profile or conversation URL", () => {
    const first = generated({
      index: 1,
      profileUrl: "https://www.linkedin.com/in/jane-doe/?trk=one",
      conversationUrl: "https://www.linkedin.com/messaging/thread/abc/?foo=bar",
    });
    const duplicateConversation = generated({
      index: 2,
      senderName: "Different Visible Name",
      profileUrl: "https://www.linkedin.com/in/other-person/",
      conversationUrl: "https://linkedin.com/messaging/thread/abc/",
      draft: "Duplicate by conversation should not be approved.",
    });
    const duplicateProfile = generated({
      index: 3,
      profileUrl: "https://www.linkedin.com/in/jane-doe/",
      conversationUrl: "https://www.linkedin.com/messaging/thread/other/",
      draft: "Duplicate by profile should not be approved.",
    });
    const unique = generated({
      index: 4,
      profileUrl: "https://www.linkedin.com/in/unique-person/",
      conversationUrl: "https://www.linkedin.com/messaging/thread/unique/",
      draft: "Unique message.",
    });

    const deduped = dedupeGeneratedFollowUpsForApproval([
      first,
      duplicateConversation,
      duplicateProfile,
      unique,
    ]);
    const document = buildReviewDocument([first, duplicateConversation, duplicateProfile, unique]);

    assert.deepEqual(
      deduped.map((row) => row.index),
      [1, 4],
    );
    assert.match(document, /"index": 1/);
    assert.match(document, /"index": 4/);
    assert.doesNotMatch(document, /"index": 2/);
    assert.doesNotMatch(document, /"index": 3/);
    assert.doesNotMatch(document, /Duplicate by conversation/);
    assert.doesNotMatch(document, /Duplicate by profile/);
  });

  test("parseApprovedFollowUps accepts edited messages and filters unapproved entries", () => {
    const edited = JSON.stringify(
      [
        {
          index: 1,
          approved: true,
          senderName: "Jane Doe",
          profileUrl: "https://www.linkedin.com/in/jane-doe/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/abc/",
          headline: "Founder at Acme",
          company: "Acme",
          unreadMessageSummary: "Asked about AI workflow automation.",
          profileSignals: ["Founder at Acme"],
          message: "Edited approved message.",
        },
        {
          index: 2,
          approved: false,
          senderName: "Skip Me",
          profileUrl: "https://www.linkedin.com/in/skip/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/skip/",
          headline: "",
          company: "",
          unreadMessageSummary: "",
          profileSignals: [],
          message: "Do not send.",
        },
      ],
      null,
      2,
    );

    const parsed = parseApprovedFollowUps(edited);

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.messages.length, 1);
      assert.equal(parsed.messages[0]?.message, "Edited approved message.");
      assert.equal(parsed.messages[0]?.conversationUrl, "https://www.linkedin.com/messaging/thread/abc/");
    }
  });

  test("parseApprovedFollowUps rejects invalid or placeholder-filled approved messages", () => {
    const parsed = parseApprovedFollowUps(
      JSON.stringify([
        {
          index: 1,
          approved: true,
          senderName: "Jane Doe",
          profileUrl: "https://www.linkedin.com/in/jane-doe/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/abc/",
          headline: "Founder at Acme",
          company: "Acme",
          unreadMessageSummary: "Asked about AI workflow automation.",
          profileSignals: [],
          message: "Hi [name]",
        },
      ]),
    );

    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.match(parsed.error, /placeholder|bracket/i);
  });

  test("parseApprovedFollowUps rejects duplicate or fractional indexes", () => {
    const duplicate = parseApprovedFollowUps(
      JSON.stringify([
        {
          index: 1,
          approved: true,
          senderName: "Jane Doe",
          profileUrl: "https://www.linkedin.com/in/jane-doe/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/abc/",
          headline: "Founder at Acme",
          company: "Acme",
          unreadMessageSummary: "Asked about AI workflow automation.",
          profileSignals: [],
          message: "First approved message.",
        },
        {
          index: 1,
          approved: true,
          senderName: "John Doe",
          profileUrl: "https://www.linkedin.com/in/john-doe/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/def/",
          headline: "Founder at Beta",
          company: "Beta",
          unreadMessageSummary: "Asked about agent workflows.",
          profileSignals: [],
          message: "Second approved message.",
        },
      ]),
    );
    const fractional = parseApprovedFollowUps(
      JSON.stringify([
        {
          index: 1.5,
          approved: true,
          senderName: "Jane Doe",
          profileUrl: "https://www.linkedin.com/in/jane-doe/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/abc/",
          headline: "Founder at Acme",
          company: "Acme",
          unreadMessageSummary: "Asked about AI workflow automation.",
          profileSignals: [],
          message: "Approved message.",
        },
      ]),
    );

    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.match(duplicate.error, /duplicate/i);
    assert.equal(fractional.ok, false);
    if (!fractional.ok) assert.match(fractional.error, /index/i);
  });

  test("parseApprovedFollowUps rejects invalid targets and any leftover square brackets", () => {
    const invalidUrl = parseApprovedFollowUps(
      JSON.stringify([
        {
          index: 1,
          approved: true,
          senderName: "Jane Doe",
          profileUrl: "https://example.com/not-linkedin",
          conversationUrl: "",
          headline: "Founder at Acme",
          company: "Acme",
          unreadMessageSummary: "Asked about AI workflow automation.",
          profileSignals: [],
          message: "Approved message.",
        },
      ]),
    );
    const unmatchedBracket = parseApprovedFollowUps(
      JSON.stringify([
        {
          index: 2,
          approved: true,
          senderName: "John Doe",
          profileUrl: "https://www.linkedin.com/in/john-doe/",
          conversationUrl: "https://www.linkedin.com/messaging/thread/def/",
          headline: "Founder at Beta",
          company: "Beta",
          unreadMessageSummary: "Asked about agent workflows.",
          profileSignals: [],
          message: "Hi John [",
        },
      ]),
    );

    assert.equal(invalidUrl.ok, false);
    if (!invalidUrl.ok) assert.match(invalidUrl.error, /url|linkedin/i);
    assert.equal(unmatchedBracket.ok, false);
    if (!unmatchedBracket.ok) assert.match(unmatchedBracket.error, /bracket/i);
  });

  test("review document parsing survives messages with markdown fences", () => {
    const document = buildReviewDocument([
      generated({ draft: "Here is a snippet:\n```ts\nconsole.log('hi');\n```\nWould love to discuss." }),
    ]);

    const parsed = parseApprovedFollowUps(document);

    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.match(parsed.messages[0]?.message ?? "", /```ts/);
  });

  test("generation prompt navigates directly to the unread-filtered inbox", () => {
    const prompt = buildProcessUnreadPrompt({
      conversationIndex: 1,
      maxMessages: 3,
      templatePath: "/tmp/template.txt",
      resultsPath: "/tmp/results.jsonl",
      artifactsDir: "/tmp/artifacts",
      profileDir: "/tmp/profile",
      sessionName: "li-test",
    });

    assert.match(prompt, /goto https:\/\/www\.linkedin\.com\/messaging\/\?filter=unread/);
    assert.doesNotMatch(prompt, /goto https:\/\/www\.linkedin\.com\/messaging\/`/);
    assert.match(prompt, /Do NOT load regular LinkedIn Messaging first/i);
    assert.match(prompt, /If LinkedIn opens a conversation automatically from the unread-filtered route/i);
  });

  test("generation prompt requires sender profile inspection before drafting", () => {
    const prompt = buildProcessUnreadPrompt({
      conversationIndex: 1,
      maxMessages: 3,
      templatePath: "/tmp/template.txt",
      resultsPath: "/tmp/results.jsonl",
      artifactsDir: "/tmp/artifacts",
      profileDir: "/tmp/profile",
      sessionName: "li-test",
    });

    assert.match(prompt, /generate/i);
    assert.match(prompt, /do not fill/i);
    assert.match(prompt, /conversationUrl/);
    assert.match(prompt, /must inspect the sender's LinkedIn profile/i);
    assert.match(prompt, /last 3 messages from the sender/i);
    assert.match(prompt, /Do not use em dashes/i);
    assert.match(prompt, /commas, periods, parentheses, or short sentences/i);
    assert.match(prompt, /Do not generate a successful draft without profile context/i);
    assert.doesNotMatch(prompt, /inspect the sender profile when applicable/i);
    assert.doesNotMatch(prompt, /continue from message context only/i);
    assert.doesNotMatch(prompt, /final browser state for a successful conversation is: response text visible in the reply composer/i);
  });

  test("generation prompt includes processed targets and a no-new-unread dedupe stop path", () => {
    const prompt = buildProcessUnreadPrompt({
      conversationIndex: 2,
      maxMessages: 3,
      templatePath: "/tmp/template.txt",
      resultsPath: "/tmp/results.jsonl",
      artifactsDir: "/tmp/artifacts",
      profileDir: "/tmp/profile",
      sessionName: "li-test",
      alreadyProcessedTargets: {
        profileUrls: ["https://WWW.linkedin.com/in/AlexLavaee/?trk=foo#about"],
        conversationUrls: ["https://www.linkedin.com/messaging/thread/abc/?foo=bar#main"],
      },
    });

    assert.match(prompt, /<already_processed_targets>/);
    assert.match(prompt, /https:\/\/www\.linkedin\.com\/in\/AlexLavaee/);
    assert.match(prompt, /https:\/\/www\.linkedin\.com\/messaging\/thread\/abc/);
    assert.doesNotMatch(prompt, /trk=foo|foo=bar|#about|#main/);
    assert.match(prompt, /If the normalized `conversationUrl` OR normalized `profileUrl` appears/);
    assert.match(prompt, /Do NOT append a generated row/);
    assert.match(prompt, /Return to the unread-filtered Messaging inbox\/list/);
    assert.match(prompt, /try the next unread candidate/);
    assert.match(prompt, /reason `no_new_unread`/);
    assert.match(prompt, /Track which visible candidates you inspect during this stage/);
    assert.match(prompt, /NEVER focus, paste into, type into, or otherwise fill the reply composer/);
  });

  test("send prompt sends only the approved exact message for one target", () => {
    const prompt = buildSendApprovedPrompt({
      approved: {
        index: 1,
        approved: true,
        senderName: "Jane Doe",
        profileUrl: "https://www.linkedin.com/in/jane-doe/",
        conversationUrl: "https://www.linkedin.com/messaging/thread/abc/",
        headline: "Founder at Acme",
        company: "Acme",
        unreadMessageSummary: "Asked about AI workflow automation.",
        profileSignals: ["Founder at Acme"],
        message: "Edited approved message.",
        messagePath: "/tmp/message-1.txt",
      },
      sendResultsPath: "/tmp/send-results.jsonl",
      artifactsDir: "/tmp/artifacts",
      profileDir: "/tmp/profile",
      sessionName: "li-test",
    });

    assert.match(prompt, /Process exactly ONE approved LinkedIn follow-up/);
    assert.match(prompt, /\/tmp\/message-1\.txt/);
    assert.match(prompt, /https:\/\/www\.linkedin\.com\/messaging\/thread\/abc\//);
    assert.match(prompt, /click the visible Send/i);
    assert.match(prompt, /approved message/i);
    assert.match(prompt, /match the approved message exactly/i);
    assert.doesNotMatch(prompt, /closely enough/i);
  });
});
