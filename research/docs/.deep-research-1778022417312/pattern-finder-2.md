# Atomic Deterministic Workflows: Pattern Analysis

## Overview

Atomic's deterministic workflows architecture is built on three core principles:
1. **Separation of concerns** between LLM calls and pure computation
2. **Explicit state management** through saved transcripts and handle-based lookups
3. **Validation at boundaries** to catch silent failures before they propagate downstream

This document catalogs the concrete patterns that implement determinism across the Atomic SDK.

---

## Pattern 1: Deterministic Computation Isolation

**Where:** `.agents/skills/workflow-creator/SKILL.md:460-461`

**What:** Pure TypeScript (parsing, validation, transforms) must live either at the workflow `.run()` level (outside stages) or bundled within the same stage callback as its corresponding LLM call. Never create a dedicated stage with only deterministic code.

```typescript
// ✓ CORRECT — deterministic work paired with LLM call in same callback
const plan = await ctx.stage({ name: "plan" }, {}, {}, async (s) => {
  const messages = await s.session.query("Produce a step-by-step plan.");
  const text = extractAssistantText(messages, 0);  // deterministic parse
  const parsed = parsePlan(text);                  // deterministic validation
  s.save(s.sessionId);
  return parsed;
});

// ✓ CORRECT — deterministic work at orchestration level (no stage needed)
const plannedFiles = plan.result.files.filter(f => f.endsWith(".ts"));
const startedAt = Date.now();

// ✗ WRONG — standalone stage with no LLM call spawns empty idle pane
await ctx.stage({ name: "write-report" }, {}, {}, async (s) => {
  await fs.writeFile("report.md", buildReport(plan.result)); // no LLM!
});
```

**Variations / call-sites:**
- **Computation-and-validation.md:5-30** shows inline computation with parsed validation
- **SKILL.md:460-461** defines the concept-to-code mapping
- **failure-modes.md:F22** documents the empty-pane anti-pattern (1037-1095)

---

## Pattern 2: Handle-Based State Passing with Completion Rules

**Where:** `.agents/skills/workflow-creator/SKILL.md:439` and `state-and-data-flow.md:5-51`

**What:** Data flows between sessions exclusively through `s.save()` (write) and `s.transcript(handle) / s.getMessages(handle)` (read). The critical invariant: you can only read from a `SessionHandle` **after** its callback has returned and saves have flushed.

```typescript
// Step 1: Store a session handle (save automatically at end of callback)
const researchHandle = await ctx.stage(
  { name: "research" },
  {},
  {},
  async (s) => {
    await s.session.query("Research the topic.");
    s.save(s.sessionId);  // Session ID is the save token
  }
);

// Step 2: After Step 1 completes, read its transcript via handle
await ctx.stage(
  { name: "synthesize" },
  {},
  {},
  async (s) => {
    const research = await s.transcript(researchHandle);
    // research = { path: string, content: string }
    
    // Use rendered text in a prompt
    await s.session.query(`Synthesize this research:\n${research.content}`);
    
    // Or reference the file path for Claude file triggers
    await s.session.query(`Read ${research.path} and summarize findings.`);
    
    s.save(s.sessionId);
  }
);
```

**Violations that break determinism:**
- Reading a handle before its stage completes → throws (loud)
- Reading from sibling stages in a `Promise.all()` group → throws (loud)
- Forgetting `await` on a `ctx.stage()` call → stage runs in background, next code reads undefined (silent, R13)

**Variations / call-sites:**
- **state-and-data-flow.md:7-51** shows transcript vs raw message retrieval
- **state-and-data-flow.md:83-97** shows return values via `handle.result`
- **control-flow.md:21-50** shows inter-session branching with return values

---

## Pattern 3: Response Text Extraction with SDK-Specific Helpers

**Where:** `.agents/skills/workflow-creator/references/computation-and-validation.md:33-71`

**What:** Each SDK returns responses in a different format. Extract text deterministically using SDK-specific helpers before parsing or validation.

```typescript
// CLAUDE
import { extractAssistantText } from "@bastani/atomic/workflows";
const result = await s.session.query("...");
const text = extractAssistantText(result, 0);  // SessionMessage[] → string

// COPILOT (Failure Mode F1 / F2: must concatenate ALL assistant messages, skip empty ones)
function getAssistantText(messages: SessionEvent[]): string {
  return messages
    .filter(
      (m): m is Extract<SessionEvent, { type: "assistant.message" }> =>
        m.type === "assistant.message" && !m.data.parentToolCallId  // F2: no subagent messages
    )
    .map((m) => m.data.content)
    .filter((c) => c.length > 0)  // F1: skip empty terminator events
    .join("\n\n");
}
const messages = await s.session.getMessages();
const text = getAssistantText(messages);

// OPENCODE (Failure Mode F3: filter for text parts only)
function extractResponseText(
  parts: Array<{ type: string; [key: string]: unknown }>
): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: string; text: string }).text)
    .join("\n");
}
const text = extractResponseText(result.data!.parts);
```

**Why this matters for determinism:**
- Wrong extraction → downstream stages receive garbage text → silent propagation
- Direct parse without extraction (e.g., `JSON.parse(result.output)`) → TypeError (loud, but preventable)
- Empty extraction on non-empty response → silent failure, successor thinks there was no output

**Variations / call-sites:**
- **failure-modes.md:F1 (60-117)** – Copilot's empty terminator trap
- **failure-modes.md:F2 (120-150)** – Copilot subagent message filtering
- **failure-modes.md:F3 (153-184)** – OpenCode non-text parts
- **failure-modes.md:F4 (187-229)** – Claude SessionMessage[] type

---

## Pattern 4: Layered JSON Parsing with Fallback

**Where:** `.agents/skills/workflow-creator/references/computation-and-validation.md:74-104`

**What:** LLM responses containing JSON may have prose before/after the actual JSON block. Use a three-layer fallback strategy: direct parse → last fenced block → last balanced object.

```typescript
import { z } from "zod";

// Layer 1: Direct JSON parse (handles cases where model outputs pure JSON)
function parseJsonResponse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try fenced block fallback
  }

  // Layer 2: Extract LAST fenced block (prose may quote examples before)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/g);
  if (fenceMatch?.length) {
    const lastBlock = fenceMatch[fenceMatch.length - 1];
    const jsonMatch = lastBlock.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Try balanced-object fallback
      }
    }
  }

  // Layer 3: Extract last balanced object from text
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (start === -1) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.substring(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          start = -1;
        }
      }
    }
  }

  return null;
}

// Usage with Zod validation
const TaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "error"]),
  blockedBy: z.array(z.string()).optional(),
});

const parsed = parseJsonResponse(responseText);
const result = TaskSchema.array().safeParse(parsed?.tasks);
if (!result.success) {
  console.error("Validation failed:", result.error.issues);
  // Optionally: ask agent to fix and retry
}
```

**Why this is deterministic:**
- Single parse point avoids partial or duplicated parsing
- Layered fallback handles model variation without throwing
- Zod provides predictable validation output
- Silent failures (bad JSON) are caught before downstream use

**Variations / call-sites:**
- **failure-modes.md:F8 (415-470)** – fenced-block parser anti-patterns
- **state-and-data-flow.md:212-228** – shared response parser helpers in `helpers/parsers.ts`

---

## Pattern 5: Validation Gates Before Branching

**Where:** `.agents/skills/workflow-creator/references/control-flow.md:12-79`

**What:** Use deterministic validation to branch orchestration logic. Parse and validate LLM output in the same stage, then use the validated result to drive conditional `.run()`-level branching.

```typescript
import { extractAssistantText } from "@bastani/atomic/workflows";

.run(async (ctx) => {
  // Step 1: Classify and validate in one session
  const triage = await ctx.stage(
    { name: "triage" },
    {},
    {},
    async (s) => {
      const result = await s.session.query(
        `Classify this as "bug", "feature", or "question": ${(s.inputs.prompt ?? "")}`
      );
      s.save(s.sessionId);
      
      // Deterministic: extract, parse, validate
      const text = extractAssistantText(result, 0).toLowerCase();
      return text.trim();  // Return validated classification
    }
  );

  const classification = triage.result;  // Now type-safe and validated

  // Step 2: Branch at orchestration level (each path is visible in graph)
  if (classification.includes("bug")) {
    await ctx.stage({ name: "fix-bug" }, {}, {}, async (s) => {
      await s.session.query("Diagnose and fix the bug described above.");
      s.save(s.sessionId);
    });
  } else if (classification.includes("feature")) {
    await ctx.stage({ name: "implement-feature" }, {}, {}, async (s) => {
      await s.session.query("Design and implement the feature described above.");
      s.save(s.sessionId);
    });
  } else {
    await ctx.stage({ name: "answer-question" }, {}, {}, async (s) => {
      await s.session.query("Research and answer the question above.");
      s.save(s.sessionId);
    });
  }
})
```

**Determinism properties:**
- Validation happens once, not replayed across branches
- Return value is immutable (string, not LLM output)
- Branching logic is pure TS at orchestration level (no hidden sessions)
- Graph accurately reflects which paths ran

**Variations / call-sites:**
- **control-flow.md:53-79** shows intra-session branching (single continued session)
- **computation-and-validation.md:12-30** shows validate-and-fix pattern within a single stage

---

## Pattern 6: Quality Gates with LLM-as-Judge

**Where:** `.agents/skills/workflow-creator/references/computation-and-validation.md:167-201`

**What:** After an LLM produces output, spawn a deterministic quality-check session that reads the transcript and scores it. Use parsed scores to decide whether to retry or accept.

```typescript
.run(async (ctx) => {
  const impl = await ctx.stage(
    { name: "implement" },
    {},
    {},
    async (s) => {
      await s.session.query((s.inputs.prompt ?? ""));
      s.save(s.sessionId);
    }
  );

  // Quality gate: read prior transcript and judge it
  await ctx.stage(
    { name: "quality-gate" },
    {},
    {},
    async (s) => {
      const implTranscript = await s.transcript(impl);
      
      const result = await s.session.query(
        `You are a code quality judge. Score this implementation 1-5 for:
- **Correctness**: Does it solve the stated problem?
- **Completeness**: Are edge cases handled?
- **Style**: Does it follow project conventions?

## Implementation to judge
${implTranscript.content}

Respond with JSON: { "correctness": N, "completeness": N, "style": N, "pass": boolean, "issues": [...] }`
      );

      // Deterministic: extract, parse, and validate
      const scores = parseJsonResponse(extractAssistantText(result, 0));
      
      // Deterministic decision
      if (!scores.pass) {
        await s.session.query(
          `Fix these quality issues:\n${scores.issues.join("\n")}`
        );
      }

      s.save(s.sessionId);
    }
  );
})
```

**Why deterministic:**
- Quality criteria are explicit (not implicit in a follow-up prompt)
- Parsing is deterministic (JSON structure predefined)
- Retry decision uses parsed output, not string pattern-matching
- Result is reproducible across runs (same input → same parsed scores → same decision)

**Variations / call-sites:**
- **SKILL.md:206** references `evaluation` and `advanced-evaluation` skills
- Pattern matches the "Review loops or quality checkpoints" design advisory

---

## Pattern 7: State Accumulation with Bounded Loops

**Where:** `.agents/skills/workflow-creator/references/failure-modes.md:F7 (356-411)`

**What:** When running multiple iterations of a query (review/fix loops), prevent context degradation by explicitly compacting or resetting between iterations. Save state deterministically across loop cycles.

```typescript
.run(async (ctx) => {
  const MAX_ITERATIONS = 5;

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const iteration = await ctx.stage(
      { name: `refine-${i}` },
      {},
      {},
      async (s) => {
        const result = await s.session.query(`Iteration ${i}: Improve the implementation.`);
        s.save(s.sessionId);
        return extractAssistantText(result, 0);
      }
    );

    // Deterministic: check parsed output
    if (iteration.result.includes("LGTM") || iteration.result.includes("no issues")) {
      // Exit loop deterministically based on LLM signal
      break;
    }
  }
})
```

**Alternative: within-session with compaction (prevents lost-in-middle):**

```typescript
await ctx.stage({ name: "review-loop" }, {}, {}, async (s) => {
  const MAX_TURNS_BEFORE_COMPACT = 10;
  let turnsSinceCompact = 0;

  for (let i = 0; i < 20; i++) {
    if (turnsSinceCompact >= MAX_TURNS_BEFORE_COMPACT) {
      await s.session.query("/compact");  // Deterministic: summarize history
      turnsSinceCompact = 0;
    }
    await s.session.query(buildReviewPrompt());
    turnsSinceCompact += 1;
  }
});
```

**Determinism properties:**
- Loop bound is explicit (`MAX_ITERATIONS`), not inferred from model output
- Exit condition is deterministic (parsed string check or explicit counter)
- State is preserved either via transcript or compaction
- Context window growth is bounded

**Variations / call-sites:**
- **control-flow.md:82-106** shows bounded inter-session loops
- **failure-modes.md:F7 (356-411)** explains lost-in-middle in detail

---

## Pattern 8: Data Handoff Between Fresh Sessions (Copilot/OpenCode)

**Where:** `.agents/skills/workflow-creator/references/failure-modes.md:F5 (232-298)`

**What:** Copilot and OpenCode spawn fresh sessions with no prior context. Explicit handoff is required: extract output from session A, pass it in the prompt to session B.

```typescript
// ✗ WRONG — orchestrator is a fresh session with no knowledge of planner
await ctx.stage({ name: "planner" }, {}, {}, async (s) => {
  await s.session.send({ prompt: buildPlannerPrompt((s.inputs.prompt ?? "")) });
  s.save(await s.session.getMessages());
});

await ctx.stage({ name: "orchestrator" }, {}, {}, async (s) => {
  // Fresh session, no context. Will say "I don't see a task list"
  await s.session.send({ prompt: buildOrchestratorPrompt() });
  s.save(await s.session.getMessages());
});

// ✓ CORRECT — explicit handoff via return value
const plannerHandle = await ctx.stage(
  { name: "planner" },
  {},
  { agent: "planner" },
  async (s) => {
    await s.session.send({ prompt: buildPlannerPrompt((s.inputs.prompt ?? "")) });
    const messages = await s.session.getMessages();
    s.save(messages);
    return getAssistantText(messages);  // Extract and return
  }
);

await ctx.stage(
  { name: "orchestrator" },
  {},
  { agent: "orchestrator" },
  async (s) => {
    // Fresh session, but planner output is in the prompt
    await s.session.send({
      prompt: buildOrchestratorPrompt((s.inputs.prompt ?? ""), {
        plannerNotes: plannerHandle.result,  // Use return value
      }),
    });
    s.save(await s.session.getMessages());
  }
);
```

**Determinism properties:**
- Handoff is explicit (in the prompt), not implicit (in session memory)
- Return value is extracted deterministically (using F1/F2/F3 helpers)
- Orchestrator always receives the exact same input for the same planner output
- Reproducible across runs (unlike session-based implicit context)

**Variations / call-sites:**
- **failure-modes.md:F5 (232-298)** explains fresh-session trap in detail
- **agent-sessions.md** (referenced at F5 §"Full write-up") covers session lifecycle

---

## Summary: Determinism Enforcement

Atomic's deterministic workflows are deterministic because:

1. **LLM calls and pure computation are separated** (Pattern 1) — makes validation testable
2. **State flows through explicit handles and transcripts** (Pattern 2) — no implicit context
3. **Response text extraction is SDK-specific and deterministic** (Pattern 3) — standardizes text access
4. **Parsing uses layered fallbacks** (Pattern 4) — handles model variation without throwing
5. **Validation gates drive branching** (Pattern 5) — decisions are based on parsed data, not string matching
6. **Quality checks are explicit** (Pattern 6) — deterministic evaluation before accepting output
7. **Loops have bounds and compaction** (Pattern 7) — no context drift across iterations
8. **Session handoffs are explicit** (Pattern 8) — no dependency on implicit session memory (Copilot/OpenCode)

The key architectural principle: **every decision that affects downstream behavior is computed deterministically from parsed, validated LLM output — never from raw text patterns or implicit session state.**

