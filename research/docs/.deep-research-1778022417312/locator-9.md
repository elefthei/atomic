# REST API — Partition 9 of 16

## Research Question
How does atomic's deterministic workflows work?

## Scope
`rest-api/` directory (9 files, 1,168 LOC)

## Architectural Orientation
Query: HTTP entrypoints that may invoke workflows externally via `app.$METHOD($PATH, $$$)` pattern.

---

## Implementation

- `rest-api/src/server.ts` — Bun.serve HTTP handler factory with CRUD routes on `/items` and `/items/:id` using GET/POST/PUT/DELETE verbs; no workflow invocation patterns detected
- `rest-api/src/store.ts` — In-memory ItemStore class managing Item CRUD operations (create, list, get, update, remove) without external workflow triggers
- `rest-api/src/errors.ts` — HTTP error classes (HttpError, NotFoundError, BadRequestError) and JSON response helpers for standardized error handling
- `rest-api/src/types.ts` — Item, CreateItemInput, UpdateItemInput type definitions and dual validation approach (result-style + throw-style) for request parsing
- `rest-api/src/index.ts` — Entry point instantiating server and logging listen URL

## Tests

- `rest-api/src/server.test.ts` — Integration tests covering all HTTP endpoints (GET/POST/PUT/DELETE `/items` and `/items/:id`) with 200/201/204/400/404 response validation
- `rest-api/src/store.test.ts` — Unit tests for ItemStore methods including create, list, get, update, remove, and clear with state mutation verification
- `rest-api/src/types.test.ts` — Dual-path validation tests for parseCreateItemInput, parseUpdateItemInput, validateCreateItemInput, validateUpdateItemInput with field constraints
- `rest-api/src/errors.test.ts` — Tests for HttpError hierarchy and response helpers (errorResponse, jsonResponse)

## Types / Interfaces

- `rest-api/src/types.ts` — Item (id: string, name: string, description: string | null, createdAt: string, updatedAt: string), CreateItemInput, UpdateItemInput, ValidationResult<T> (legacy)

## Configuration

- `rest-api/package.json` — Bun workspace with scripts: start (src/index.ts), dev (--hot mode), test (bun test)
- `rest-api/tsconfig.json` — TypeScript configuration

## Documentation

- `rest-api/README.md` — Full API reference with endpoint descriptions, Item shape, example curl requests, error response format

---

## Notable Clusters

- `rest-api/src/` — 9 files (5 implementation, 4 tests) implementing stateless REST CRUD with in-memory storage

---

## Finding: No Deterministic Workflow Invocation Detected

The `rest-api/` partition implements a stateless REST API for item CRUD operations. The HTTP handlers in `server.ts` route requests to store operations without any detectable patterns for external workflow invocation, deterministic job queueing, or replay-safe architecture. The partition appears self-contained with no cross-service dependencies or references to workflow orchestration, determinism frameworks, or agent-style processing pipelines.

The dual validation pattern in `types.ts` (result-style and throw-style) may support resilient request handling, but the architecture does not expose workflow execution mechanisms at the HTTP layer within this scope.
