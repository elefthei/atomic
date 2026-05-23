import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  buildProcessUnreadPrompt,
  buildReviewDocument,
  buildSendApprovedPrompt,
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
    assert.match(prompt, /Do not generate a successful draft without profile context/i);
    assert.doesNotMatch(prompt, /inspect the sender profile when applicable/i);
    assert.doesNotMatch(prompt, /continue from message context only/i);
    assert.doesNotMatch(prompt, /final browser state for a successful conversation is: response text visible in the reply composer/i);
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
