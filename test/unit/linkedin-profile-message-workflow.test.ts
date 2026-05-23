import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import {
  buildProfileDraftPrompt,
  buildProfileMessageReviewDocument,
  buildSendApprovedProfileMessagePrompt,
  parseApprovedProfileMessages,
  type GeneratedProfileMessage,
} from "../../.atomic/workflows/lib/linkedin-profile-message-helpers.ts";

function generated(overrides: Partial<GeneratedProfileMessage> = {}): GeneratedProfileMessage {
  return {
    index: 1,
    status: "generated",
    reason: "generated",
    profileUrl: "https://www.linkedin.com/in/jane-doe/",
    recipientName: "Jane Doe",
    headline: "Founder at Acme",
    company: "Acme",
    profileSignals: ["Founder at Acme", "Posts about workflow automation"],
    draft: "Hi Jane — your workflow automation posts caught my eye. Would love to compare notes.",
    personalizationNotes: ["Referenced her automation posts."],
    screenshots: ["/tmp/profile.png"],
    ...overrides,
  };
}

describe("linkedin-profile-message workflow", () => {
  test("workflow module compiles with expected metadata", async () => {
    const mod = await import("../../.atomic/workflows/linkedin-profile-message.ts");

    assert.equal(mod.default.name, "linkedin-profile-message");
    assert.match(mod.default.description, /Draft personalized LinkedIn messages/i);
    assert.deepEqual(Object.keys(mod.default.inputs), ["template", "profiles"]);
  });

  test("review document shows profile context beside editable messages", () => {
    const document = buildProfileMessageReviewDocument([generated()]);

    assert.match(document, /LinkedIn Profile Message Approval/);
    assert.match(document, /https:\/\/www\.linkedin\.com\/in\/jane-doe\//);
    assert.match(document, /Founder at Acme/);
    assert.match(document, /workflow automation posts/i);
    assert.match(document, /"approved": true/);
  });

  test("parseApprovedProfileMessages accepts edited messages and filters unapproved entries", () => {
    const edited = JSON.stringify(
      [
        {
          index: 1,
          approved: true,
          recipientName: "Jane Doe",
          profileUrl: "https://www.linkedin.com/in/jane-doe/",
          headline: "Founder at Acme",
          company: "Acme",
          profileSignals: ["Founder at Acme"],
          message: "Edited approved message.",
        },
        {
          index: 2,
          approved: false,
          recipientName: "Skip Me",
          profileUrl: "https://www.linkedin.com/in/skip/",
          headline: "",
          company: "",
          profileSignals: [],
          message: "Do not send.",
        },
      ],
      null,
      2,
    );

    const parsed = parseApprovedProfileMessages(edited);

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.messages.length, 1);
      assert.equal(parsed.messages[0]?.message, "Edited approved message.");
      assert.equal(parsed.messages[0]?.profileUrl, "https://www.linkedin.com/in/jane-doe/");
    }
  });

  test("parseApprovedProfileMessages rejects invalid targets, duplicates, and placeholders", () => {
    const invalidTarget = parseApprovedProfileMessages(
      JSON.stringify([
        {
          index: 1,
          approved: true,
          recipientName: "Jane Doe",
          profileUrl: "https://example.com/not-linkedin",
          headline: "Founder at Acme",
          company: "Acme",
          profileSignals: [],
          message: "Approved message.",
        },
      ]),
    );
    const duplicate = parseApprovedProfileMessages(
      JSON.stringify([
        {
          index: 1,
          approved: true,
          recipientName: "Jane Doe",
          profileUrl: "https://www.linkedin.com/in/jane-doe/",
          headline: "Founder at Acme",
          company: "Acme",
          profileSignals: [],
          message: "First approved message.",
        },
        {
          index: 1,
          approved: true,
          recipientName: "John Doe",
          profileUrl: "https://www.linkedin.com/in/john-doe/",
          headline: "Founder at Beta",
          company: "Beta",
          profileSignals: [],
          message: "Second approved message.",
        },
      ]),
    );
    const placeholder = parseApprovedProfileMessages(
      JSON.stringify([
        {
          index: 2,
          approved: true,
          recipientName: "John Doe",
          profileUrl: "https://www.linkedin.com/in/john-doe/",
          headline: "Founder at Beta",
          company: "Beta",
          profileSignals: [],
          message: "Hi [name]",
        },
      ]),
    );

    assert.equal(invalidTarget.ok, false);
    if (!invalidTarget.ok) assert.match(invalidTarget.error, /linkedin|profileUrl/i);
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) assert.match(duplicate.error, /duplicate/i);
    assert.equal(placeholder.ok, false);
    if (!placeholder.ok) assert.match(placeholder.error, /placeholder|bracket/i);
  });

  test("draft prompt reuses linkedin-connect style visible profile review before generating", () => {
    const prompt = buildProfileDraftPrompt({
      profileIndex: 1,
      totalProfiles: 3,
      profileUrl: "https://www.linkedin.com/in/jane-doe/",
      templatePath: "/tmp/template.txt",
      resultsPath: "/tmp/results.jsonl",
      artifactsDir: "/tmp/artifacts",
      profileDir: "/tmp/profile",
      sessionName: "li-test",
    });

    assert.match(prompt, /same profile-inspection depth as the linkedin-connect workflow/i);
    assert.match(prompt, /Experience, About, Featured, and Activity/i);
    assert.match(prompt, /Fill each \[slot\] from visible profile content/i);
    assert.match(prompt, /Do NOT fill.*LinkedIn.*composer/i);
    assert.match(prompt, /Do not generate a successful draft without profile context/i);
    assert.match(prompt, /Generated results JSONL/);
    assert.doesNotMatch(prompt, /inspect the profile when applicable/i);
  });

  test("send prompt sends only the approved exact message from the profile message composer", () => {
    const prompt = buildSendApprovedProfileMessagePrompt({
      approved: {
        index: 1,
        approved: true,
        recipientName: "Jane Doe",
        profileUrl: "https://www.linkedin.com/in/jane-doe/",
        headline: "Founder at Acme",
        company: "Acme",
        profileSignals: ["Founder at Acme"],
        message: "Edited approved message.",
        messagePath: "/tmp/message-1.txt",
      },
      sendResultsPath: "/tmp/send-results.jsonl",
      artifactsDir: "/tmp/artifacts",
      profileDir: "/tmp/profile",
      sessionName: "li-test",
    });

    assert.match(prompt, /Process exactly ONE approved LinkedIn profile message/);
    assert.match(prompt, /\/tmp\/message-1\.txt/);
    assert.match(prompt, /https:\/\/www\.linkedin\.com\/in\/jane-doe\//);
    assert.match(prompt, /open Messages, click New message, input the person's name/i);
    assert.match(prompt, /Input the recipient name exactly as: Jane Doe/i);
    assert.match(prompt, /click the visible Send/i);
    assert.match(prompt, /match the approved message exactly/i);
    assert.doesNotMatch(prompt, /closely enough/i);
  });
});
