# AI Mystery Room: Product & Technical Specification

**Version:** 1.0  |  **Status:** Single source of truth for implementation  |  **Audience:** Codex (AI coding agent) and human reviewers

## 0. How Codex Must Use This Document

1. This spec is authoritative. If code and spec disagree, the spec wins; if the spec is ambiguous or silent, make the simplest choice consistent with the spec and record it in `/docs/DECISIONS.md`.
2. Build in the milestone order of Section 16. Do not start a milestone until the previous milestone's acceptance criteria pass.
3. Never invent features outside this spec. Items in Section 17 (Non-Goals) must not be built.
4. The **case bible** (the hidden ground truth) must never be sent to the browser before a case is resolved. This is the most important security rule in the project.
5. All Gemini model names, keys and limits come from environment variables (Section 14). Never hardcode them.
6. Every API response and every Gemini output must be validated against the schemas in this document before use.

## 1. Product Overview

**AI Mystery Room** is a web app where a player types a short scenario or story seed (for example: "A jewelry store was robbed during an office party"). The backend uses Gemini to invent a complete fictional investigation: a hidden truth (who did it, why, how), a cast of suspects, and a set of generated evidence (WhatsApp-style chats, images, CCTV footage, and more). The player reviews the evidence, deduces who is guilty, and submits an accusation. The app then reveals the truth, scores the player, and explains the solution.

**Core promise:** every case is unique, internally consistent, and **solvable from the evidence alone**.

**Everything is fictional.** All people, places, messages and images are AI-generated fiction. The app must never use real people's names or likenesses (see Section 13).

## 2. Goals and Success Criteria

| Goal | Measure |
|---|---|
| Cases feel real and fair | Solvability validator (Section 7.4) passes before a case is shown |
| Fast first impression | Case brief and suspects visible within ~20 s of submitting a scenario; heavy assets (images) load progressively |
| Replayable | Player can start unlimited new cases; history is kept per user |
| Simple to run | One `docker compose up` or `npm run dev` starts everything locally |

## 3. Users and Core Flow

**Persona:** casual puzzle/detective-game fan, desktop or mobile browser.

**Primary flow:**
1. Land on home page, enter scenario (10 to 500 characters), pick difficulty and optional tone.
2. Click **Open Case**. A loading screen shows live generation progress.
3. Case file page opens: brief, suspects, evidence board.
4. Player inspects evidence, adds notes, optionally uses hints.
5. Player clicks **Accuse**, picks one suspect, writes a short justification (optional but scored), confirms.
6. Reveal page: correct or wrong, full solution, timeline, score.
7. Player can replay, share a result card, or start a new case.

## 4. Functional Requirements

### 4.1 Scenario Input
- Fields: `scenario` (text, 10 to 500 chars, required), `difficulty` (`easy` | `medium` | `hard`, default `medium`), `tone` (`noir` | `cozy` | `thriller` | `comedic`, default `noir`), `language` (default `en`).
- Client and server both validate. Server rejects content failing moderation (Section 13) with a friendly message.

### 4.2 Case Generation
- Runs as an async job (Section 7). The API returns a `caseId` immediately; the client polls for progress.
- Difficulty controls: number of suspects (easy 3, medium 4, hard 5 to 6), number of red herrings (1, 2, 3 to 4), evidence count (8, 12, 16), and how directly the evidence points to the culprit.

### 4.3 Evidence Types
All evidence is AI-generated. Each item has a shared envelope (Section 6.3) plus a type-specific payload.

| Type | Rendering | Generation |
|---|---|---|
| `chat` | Messenger-style conversation viewer (bubbles, timestamps, sender names, ticks, group or 1:1) | Gemini text, structured JSON |
| `image` | Photo viewer with caption, zoom, EXIF-style metadata panel (time, place) | Gemini image model |
| `cctv` | Security-camera player: timestamp overlay, camera label, scrubbable frame sequence | Gemini image model creates 4 to 8 keyframes per clip, played as a time-lapse slideshow with a REC overlay. Real video generation is a stretch goal (Section 17) |
| `document` | Receipts, emails, call logs, bank statements, notes rendered as styled cards or tables | Gemini text, structured JSON |
| `statement` | Witness or suspect interview transcript | Gemini text |

Minimum per case: at least 2 `chat`, 2 `image`, 1 `cctv`, 1 `document`, and 1 `statement`.

### 4.4 Investigation Board
- Evidence list with filter by type and by suspect; each item marks viewed or unviewed.
- **Notes:** free-text notes per case, autosaved.
- **Pin:** player can pin evidence to a "key clues" tray.
- **Timeline view:** evidence items sorted by in-world timestamp.

### 4.5 Hints
- Max 3 hints per case, each costing score points. Hint N is produced from pre-generated hint text in the case bible (not generated live), escalating from vague to specific. A hint never names the culprit.

### 4.6 Accusation and Resolution
- Player selects exactly one suspect and may add a justification (max 600 chars).
- Easy: 3 attempts allowed. Medium: 2. Hard: 1. A wrong attempt returns only "incorrect" and remaining attempts, never partial truth. After attempts are exhausted or on a correct answer, the case becomes `resolved` and the full solution is revealed.
- Player may also choose **Give Up** to reveal the solution (score 0).

### 4.7 Scoring
`score = base (1000) - hintPenalty (150 each) - wrongAttemptPenalty (200 each) - timePenalty (1 per 10 s after 10 min, max 300) + justificationBonus (0 to 200)`, floor 0. Justification bonus is awarded by one Gemini call that checks whether the player's reasoning cites genuinely decisive evidence (returns an integer 0 to 200 and a one-line comment). Give Up scores 0.

### 4.8 Accounts and History
- Guest play works with no signup (anonymous session ID stored in an httpOnly cookie).
- Optional email + password signup/login with JWT; guest cases are claimed by the account on login.
- "My Cases" page lists past cases with status, difficulty, score.

### 4.9 Sharing
- After resolution, a public read-only **result card** at `/r/:shareId` shows scenario title, difficulty, score and verdict only. It must not reveal the solution details of unresolved cases.

## 5. Non-Functional Requirements

- **Performance:** text content of a case is ready in under 30 s at p90; images stream in as they finish. UI must stay responsive during generation.
- **Reliability:** any single Gemini failure is retried (Section 7.6); a case that cannot be completed is marked `failed` with a user-facing retry button, never left hanging.
- **Security:** Section 13. **Accessibility:** WCAG AA contrast, keyboard navigable, alt text on every image, captions/transcripts for CCTV frames.
- **Responsive:** works from 360 px wide up.
- **Observability:** structured JSON logs (pino), request IDs, per-stage timing and token usage logged for each generation.

## 6. Data Model (MongoDB / Mongoose)

### 6.1 `User`
`_id`, `email` (unique, optional for guests), `passwordHash`, `displayName`, `createdAt`.

### 6.2 `Case`
```
_id, ownerType ('user'|'guest'), ownerId,
scenario, difficulty, tone, language,
status: 'queued'|'generating'|'ready'|'resolved'|'failed',
progress: { stage, percent, message },
title, briefing (public intro text), setting { place, date, timeRange },
suspects: [Suspect],            // public fields only (see 6.4)
evidenceIds: [ObjectId],
bibleId: ObjectId,              // reference to CaseBible (private)
attempts: [{ suspectId, justification, at, correct }],
hintsUsed, notes, pinnedEvidenceIds,
startedAt, resolvedAt, score, shareId, createdAt, updatedAt
```

### 6.3 `Evidence`
```
_id, caseId, type: 'chat'|'image'|'cctv'|'document'|'statement',
title, summary (neutral, no spoilers), inWorldTimestamp, source (e.g. "Rina's phone"),
relatedSuspectIds: [],
payload: { ... by type },
assetStatus: 'pending'|'ready'|'failed',
assets: [{ url, mimeType, alt, caption, ordinal }],
isCritical (private flag; stripped from API output)
```
Payloads:
- `chat`: `{ app:'messenger', chatName, isGroup, participants:[{id,name}], messages:[{id, senderId, text, timestamp, status}] }`
- `document`: `{ kind:'email'|'receipt'|'callLog'|'bankStatement'|'note', fields: {...}, bodyText }`
- `statement`: `{ speakerSuspectId, interviewer, transcript:[{speaker,text}] }`
- `image` / `cctv`: `{ imagePrompt(s) (private), cameraLabel, frames:[{ordinal, timestamp, caption}] }`

### 6.4 Suspect (embedded in Case, public)
`id`, `name`, `age`, `role`, `relationToVictim`, `publicProfile`, `portraitUrl`. **Never** include `motive`, `alibiTruth` or `isCulprit` here.

### 6.5 `CaseBible` (PRIVATE, separate collection, never serialized to clients before `resolved`)
```
_id, caseId,
victimOrIncident { description, type },
culpritId, motive, method, opportunity,
truthTimeline: [{ time, event, whoKnows }],
suspectTruths: [{ suspectId, motive, alibiClaimed, alibiTruth, secrets }],
redHerrings: [{ suspectId, clue, whyMisleading }],
decisiveClues: [{ evidenceRef, whatItProves }],
solutionExplanation (long-form reveal text),
hints: [h1, h2, h3],
validation: { passed, report }
```

### 6.6 Indexes
`Case(ownerId, createdAt)`, `Case(shareId unique sparse)`, `Evidence(caseId)`, `CaseBible(caseId unique)`.

## 7. AI Generation Pipeline (Gemini)

Use the official Google Gen AI SDK (`@google/genai`) on the **server only**. The API key never reaches the browser. Model IDs come from env vars: `GEMINI_TEXT_MODEL` (a current Gemini Flash-class model) and `GEMINI_IMAGE_MODEL` (a current Gemini image-generation model). Codex must verify current model names against Google's documentation at build time and fill them in `.env.example`.

Text calls use **structured output** (JSON schema / `responseMimeType: application/json`) and every result is validated with Zod before use.

### 7.1 Stage 1: Case Bible
Input: scenario, difficulty, tone, language. Output: the `CaseBible` JSON (6.5) plus public `title`, `briefing`, `setting`, and `suspects` (public fields). Rules in the system prompt:
- Exactly one culprit; the culprit must have motive, means and opportunity.
- Every non-culprit has a plausible motive **and** a verifiable alibi or an evidence-based reason to be cleared.
- Include the required number of red herrings for the difficulty.
- All names must be invented; no real people, no real brands used defamatorily, no real crimes.
- Produce a consistent `truthTimeline` that all later stages must obey.

### 7.2 Stage 2: Evidence Plan
Input: the bible. Output: a list of evidence item specs `{type, title, source, inWorldTimestamp, relatedSuspectIds, purpose ('decisive'|'supporting'|'red_herring'|'context'), contentBrief}`. Constraint: every `decisiveClue` in the bible maps to at least one planned item, and decisive evidence must be a **combination** of items (no single item states the culprit's name outright on medium or hard; on easy it may strongly imply).

### 7.3 Stage 3: Evidence Content
One Gemini call per evidence item (run with concurrency limit `GEN_CONCURRENCY`, default 4), each receiving the bible, the plan item, and the tone. Chat messages must read like real messaging conversation (slang, occasional typos, emojis, time gaps). Timestamps must stay inside the truth timeline. `image` and `cctv` items additionally produce 1 to 8 image prompts; Stage 4 renders them.

### 7.4 Stage 3.5: Solvability Validator
A separate Gemini call receives **only the public case** (briefing, suspects, all evidence payloads) and **not** the bible, and must output `{ deducedCulpritId, confidence, reasoning }`. Pass condition: `deducedCulpritId === bible.culpritId`. If it fails, regenerate the weakest or missing decisive evidence once, then re-validate; after 2 failed rounds mark the case `failed`. Also run automated checks: no evidence leaks `culpritId` field names or the word "culprit"; timestamps are within the setting's time range; all referenced suspect IDs exist.

### 7.5 Stage 4: Asset Generation (async, progressive)
- Render each image prompt with `GEMINI_IMAGE_MODEL`. Prompt template always appends style guidance: realistic photo style, no text unless specified, **no real people or celebrities**, no gore, no nudity. CCTV frames add: grainy, wide-angle, fixed camera, monochrome or desaturated, consistent camera angle across frames.
- Store files via a storage adapter (`StorageAdapter` interface; local disk implementation for dev, S3-compatible for prod). Save metadata in `Evidence.assets`.
- Case moves to `ready` once all **text** is validated; images keep filling in, with each item's `assetStatus` driving skeleton loaders. A failed image gets one retry then a labeled placeholder ("Image unavailable"); the case remains solvable because every image has a text caption describing what it shows.
- Portrait for each suspect is generated here too.

### 7.6 Resilience
- Retry with exponential backoff (3 attempts) on 429/5xx; respect per-user and global rate limits (Section 12).
- Per-stage timeout (text 60 s, image 90 s). Any unrecoverable stage sets `status=failed` with `progress.message` explaining which stage failed.
- Never trust model output: strip markdown fences, validate with Zod, one automatic "repair" re-ask on schema failure.

### 7.7 Prompt Storage
All prompts live in `/server/src/ai/prompts/*.ts` as versioned template functions, never inline in controllers. Each Gemini call logs `{stage, model, promptVersion, latencyMs, tokenUsage}`.

## 8. REST API

Base path `/api/v1`. JSON only. Errors use `{ error: { code, message, details? } }`. Auth via httpOnly cookie (JWT for users, signed session ID for guests).

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup`, `/auth/login`, `/auth/logout` | Account management |
| GET | `/auth/me` | Current user or guest |
| POST | `/cases` | Create case from `{scenario, difficulty, tone, language}`; returns `{caseId}` (202) |
| GET | `/cases` | List my cases (summary) |
| GET | `/cases/:id` | Public case view (briefing, suspects, status, progress, attempts left). Never includes bible |
| GET | `/cases/:id/progress` | Lightweight status/progress for polling (every 2 s) |
| GET | `/cases/:id/evidence` | Evidence list (envelope + payload, `isCritical` stripped) |
| GET | `/cases/:id/evidence/:eid` | Single evidence item |
| PATCH | `/cases/:id/notes` | Save notes and pinned evidence |
| POST | `/cases/:id/evidence/:eid/viewed` | Mark viewed |
| POST | `/cases/:id/hint` | Returns next hint, increments `hintsUsed` (max 3) |
| POST | `/cases/:id/accuse` | Body `{suspectId, justification?}`; returns `{correct, attemptsLeft, resolved}`; on resolve includes score |
| POST | `/cases/:id/giveup` | Resolve with score 0 |
| GET | `/cases/:id/solution` | Only if `status=resolved`; returns full reveal (culprit, motive, method, timeline, decisive clues, explanation) |
| POST | `/cases/:id/retry` | Retry a `failed` generation |
| GET | `/share/:shareId` | Public result card data |
| GET | `/health` | Liveness |

Authorization rule: a case is accessible only to its owner (except `/share`). Return 404, not 403, for other people's cases.

## 9. Frontend (React + Vite + TypeScript)

**Libraries:** React 18, React Router, TanStack Query (server state), Zustand (UI state), Tailwind CSS, Framer Motion (subtle), Zod.

### 9.1 Routes
| Route | Page |
|---|---|
| `/` | Home: hero, scenario form, example scenario chips, recent cases |
| `/cases/:id/loading` (auto) | Generation progress: stage list with animated checkmarks, themed copy ("Dusting for prints...") |
| `/cases/:id` | Case file: briefing, suspects strip, evidence board, notes drawer, Accuse button |
| `/cases/:id/evidence/:eid` | Evidence viewer (modal on desktop, full page on mobile) |
| `/cases/:id/accuse` | Accusation modal/page |
| `/cases/:id/reveal` | Reveal and score |
| `/cases` | My Cases history |
| `/login`, `/signup` | Auth |
| `/r/:shareId` | Public result card |

### 9.2 Key Components
`ScenarioForm`, `GenerationProgress`, `CaseBriefing`, `SuspectCard`, `EvidenceBoard`, `EvidenceCard`, `ChatViewer`, `ImageViewer`, `CctvPlayer`, `DocumentViewer`, `StatementViewer`, `TimelineView`, `NotesDrawer`, `HintButton`, `AccuseDialog`, `RevealScreen`, `ScoreBreakdown`, `ShareCard`.

### 9.3 UX Requirements
- Visual theme: dark detective-office aesthetic (case-file folders, pinned corkboard feel) with the `tone` choice nudging accent color. Must remain legible and meet contrast rules.
- `ChatViewer` must visually mimic a messaging app (green outgoing bubbles, grey incoming, date separators, read ticks) **without using any real app's logos or trademarks**; label it generically as "Messenger" in the UI chrome.
- `CctvPlayer`: play/pause, frame scrubber, timestamp burned into the overlay, camera label, REC dot, grain effect via CSS.
- Accusation requires a confirm step ("This cannot be undone").
- Every loading state uses skeletons; every error state has a retry action.

## 10. Backend Structure (Node + Express + TypeScript)

```
/server
  src/
    app.ts, server.ts
    config/env.ts            // Zod-validated env
    routes/                  // thin routers
    controllers/
    services/
      caseService.ts         // orchestration, state machine
      scoringService.ts
      authService.ts
    ai/
      geminiClient.ts        // SDK wrapper, retries, logging
      pipeline/              // stage1Bible, stage2Plan, stage3Content, validator, assets
      prompts/
      schemas/               // Zod schemas for every Gemini output
    jobs/
      jobRunner.ts           // in-process queue (p-queue); interface allows swap to BullMQ
    models/                  // Mongoose models
    middleware/              // auth, rateLimit, errorHandler, validate, requestId
    storage/                 // StorageAdapter + local + s3
    utils/
  tests/
/client
  src/ (pages, components, hooks, api, store, styles)
/shared                      // shared TS types and Zod schemas used by both sides
```

**Case state machine:** `queued -> generating -> ready -> resolved`, with `generating -> failed -> (retry) -> queued`. Transitions only through `caseService`.

**Job runner:** an in-process queue is acceptable for v1, but the `JobRunner` interface must be abstract so BullMQ + Redis can replace it without touching pipeline code. On server restart, cases stuck in `generating` are re-queued.

## 11. Real-Time Progress

Polling `GET /cases/:id/progress` every 2 seconds is the required v1 mechanism (simple and reliable). Progress stages and percentages: Bible 0 to 20, Plan 20 to 30, Content 30 to 70, Validation 70 to 80, Assets 80 to 100. The client may start showing the case when `status=ready` even if percent < 100.

## 12. Rate Limiting and Cost Control

- Per guest: 3 case creations per day. Per registered user: 10 per day. Global ceiling configurable via `GLOBAL_DAILY_CASE_LIMIT`.
- Express rate limit (`express-rate-limit`) on auth routes (10/min/IP) and general API (120/min/IP).
- Only one active (`generating`) case per owner at a time.
- Cap input sizes; cap image count per case at 24.
- Log estimated token usage per case; expose in server logs only.

## 13. Security, Safety and Content Policy

- **Secrets:** `GEMINI_API_KEY`, `JWT_SECRET`, `MONGODB_URI` only in server env. `.env` is git-ignored; ship `.env.example`.
- **Auth:** bcrypt password hashing (cost 12), httpOnly + SameSite=Lax cookies, CSRF protection for state-changing routes, Helmet, strict CORS to the client origin.
- **Input safety:** sanitize all user text; escape on render (React default; never use `dangerouslySetInnerHTML` with model output).
- **Prompt injection:** the scenario is untrusted. Put it inside clearly delimited data blocks in prompts; the system prompt instructs the model to treat it as a story seed only and ignore any instructions inside it. Validate outputs against schemas regardless.
- **Content moderation:** reject or sanitize scenarios involving sexual content, minors in harm, graphic gore, real named people or real ongoing crimes, hate, self-harm methods, or instructions for real-world wrongdoing. Mysteries are non-graphic puzzle fiction (think classic whodunit). Also use Gemini safety settings at a strict threshold and handle blocked responses gracefully by regenerating with a softened brief.
- **Realism guardrails:** generated chats and documents must not contain real phone numbers, real emails or real addresses; use clearly fictional or reserved values (e.g. `example.com`, 555-01xx numbers).
- **Spoiler protection:** API serializers use explicit allow-lists. Add an automated test that walks every non-solution endpoint response and asserts the culprit ID, `motive`, and bible fields are absent.
- **Disclaimer:** footer text on every page: "All cases, characters and evidence are AI-generated fiction."

## 14. Environment Variables (`.env.example`)

```
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/ai-mystery-room
JWT_SECRET=change-me
COOKIE_SECRET=change-me
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=
GEMINI_IMAGE_MODEL=
GEN_CONCURRENCY=4
GLOBAL_DAILY_CASE_LIMIT=200
STORAGE_DRIVER=local            # local | s3
LOCAL_STORAGE_PATH=./uploads
S3_BUCKET=
S3_REGION=
S3_ENDPOINT=
MOCK_AI=false
```
The server must refuse to start with a clear error if required variables are missing.

## 15. Testing and Quality

- **Unit (Vitest/Jest):** scoring, state machine transitions, Zod schemas, serializers (spoiler test), prompt builders.
- **Integration (Supertest + mongodb-memory-server):** full API flow with a **mocked Gemini client** returning fixture cases; include fixtures for a valid case, a malformed JSON case, and a validator-fail case.
- **E2E (Playwright):** create case (mock AI), view evidence of each type, use hints, wrong then correct accusation, reveal page, share card.
- **Lint/format:** ESLint + Prettier, TypeScript `strict: true`, no `any` without a comment.
- Provide `MOCK_AI=true` env mode that serves a bundled sample case so the UI can be developed with zero API cost.
- CI script `npm run check` runs lint, typecheck and tests.

## 16. Build Milestones (in order)

**M1: Foundation.** Monorepo (`client`, `server`, `shared`), TypeScript, ESLint/Prettier, env validation, Mongo connection, health route, `MOCK_AI` mode, README with run instructions.
*Accept when:* `npm run dev` starts client and server; `/health` returns OK.

**M2: Auth and Sessions.** Guest sessions, signup/login/logout, `/auth/me`, guest-case claim on login.
*Accept when:* both flows work and auth tests pass.

**M3: Case domain and API (mock AI).** All models, state machine, all endpoints in Section 8 backed by the mock generator, spoiler-protection test.
*Accept when:* a full mock case can be created, fetched, accused and resolved via API, and the spoiler test passes.

**M4: Frontend core.** Home, loading page with polling, case file, evidence board, notes, hints, accuse, reveal, history. Viewers for all five evidence types using mock data.
*Accept when:* a full playthrough works in the browser on desktop and 360 px mobile.

**M5: Gemini pipeline.** Real Stages 1 to 3, schemas, repair re-ask, retries, prompt files, logging.
*Accept when:* 5 varied scenarios each produce a schema-valid case with no leaks.

**M6: Validator and assets.** Solvability validator with regeneration loop, image and CCTV frame generation, storage adapter, progressive loading.
*Accept when:* validator pass rate is logged, images appear progressively, failed images degrade to placeholders.

**M7: Hardening.** Moderation, prompt-injection defenses, rate limits, share cards, accessibility pass, Playwright E2E, Docker Compose, final README.
*Accept when:* `npm run check` and E2E pass, and every item in Section 18 is ticked.

## 17. Non-Goals (Do Not Build in v1)

- Real video generation for CCTV (stretch: a Veo-class video model behind a feature flag).
- Multiplayer or leaderboards, payments, admin dashboards, native mobile apps.
- Voice or audio evidence.
- User-uploaded evidence or editing of generated cases.
- Social login.

## 18. Definition of Done Checklist

- [ ] A scenario produces a complete case with suspects and at least 8 evidence items including all five types.
- [ ] Validator confirms each shown case is solvable; failures never reach the player.
- [ ] No endpoint leaks bible data before `resolved` (automated test).
- [ ] Accusation, attempts, hints and scoring behave exactly as Section 4.
- [ ] Gemini key exists only server-side; browser network tab shows no key.
- [ ] Works on mobile (360 px) and desktop, keyboard accessible, alt text present.
- [ ] Failure states (Gemini down, bad JSON, image failure) are handled with retry UI.
- [ ] README explains setup, env vars, `MOCK_AI` mode, and scripts.
- [ ] Footer fiction disclaimer is present on every page.

## 19. Open Decisions (Resolve Before M5)

1. Final visual identity (logo, palette) can be chosen during M4; default to the dark noir theme described in 9.3.
2. Hosting targets (client and server) are not fixed; the Docker Compose setup is the portable baseline.
3. Whether to keep image assets forever or expire them after 30 days (default: keep).
