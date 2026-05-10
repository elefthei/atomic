---
source_url: multiple (github.com/browserbase/stagehand, docs.stagehand.dev, browserbase.com, web search)
fetched_at: 2026-05-07
fetch_method: web search + html-parse
topic: Stagehand act() failures on LinkedIn connect/invite dialog "Add a note" button
---

# Stagehand + LinkedIn "Add a Note" Dialog — Research Findings

## LinkedIn DOM Structure for Connect Modal

- LinkedIn's connect dialog is rendered via `artdeco-modal-outlet` (a custom element), which is a standard DOM portal appended to `document.body` — NOT a shadow DOM root, NOT an iframe.
- The "Add a note" button is found by `aria-label="Add a note"` or text content matching "Add a note".
- The modal wrapper uses classes like `.artdeco-modal__actionbar`.
- Confirmed working selector (as of 2025): `artdeco-modal-outlet button[aria-label="Add a note"]`
- There is NO shadow DOM isolation on the LinkedIn connect modal. Automation scripts using `document.querySelectorAll("button")` successfully reach it.

## Stagehand Known Issues Relevant to This Flow

### Issue #848 (June 28, 2025)
- Cannot automate elements within Shadow DOM host AND iframe combined
- Error: `"method": "not-supported"`, `"description": "an iframe"`
- Not directly applicable (LinkedIn modal is not in an iframe)

### Issue #943 (2025)
- Stagehand's `act()` **incorrectly flags regular DOM elements as Shadow DOM**
- Error: `"method": "not-supported"`, `"selector": "not-supported"`
- LLM correctly identifies the element in the a11y tree but Stagehand's selector resolution fails
- Workaround: fall back to `page.locator()` directly

### Issue #769 (2025)
- Page/context closes unexpectedly after modal dismissal
- Timing issue specific to context lifecycle

### Issue #693 (2025)  
- `act()` succeeds on elements not visible (needs scroll) — i.e., it doesn't check actual viewport visibility

### Issue #1347 / #1263 (2025)
- `act()` fails when passing a model override option

## Stagehand act() a11y Tree Behavior with Modals

- Stagehand uses `Accessibility.getFullAXTree` via CDP to build its element map
- When a modal opens with proper ARIA, background elements get `aria-hidden="true"` — they become invisible to the a11y tree
- This means Stagehand should be focused on modal content — but the issue is the OPPOSITE: it may see TOO MANY elements from the background page that were not properly hidden

## LinkedIn Anti-Automation Measures (General, not modal-specific)

- navigator.webdriver detection
- TLS/JA3 fingerprinting (pre-page-load)
- Extension scanning (6,000+ extensions as of Feb 2026)
- Behavioral fingerprinting (timing, mouse movement, scroll patterns)
- These affect account/session status, not DOM visibility of specific buttons

## Recommended Fix for "Add a note" Button

1. Use direct Playwright selector AFTER verifying dialog is open:
   ```js
   await page.waitForSelector('artdeco-modal-outlet button[aria-label="Add a note"]');
   await page.locator('artdeco-modal-outlet button[aria-label="Add a note"]').click();
   ```
2. Or by role: `page.getByRole('button', { name: /add a note/i })`
3. Avoid Stagehand's `act()` for this specific button due to false Shadow DOM detection bug (#943)
