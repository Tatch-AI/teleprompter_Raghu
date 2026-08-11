# Business Context — teleprompter_Raghu (Garage Intake Copilot)

> Part of the Harper estate documentation pass (2026-08). Written for the platform rewrite:
> what this repo means to the brokerage, not just how it works. Technical detail lives in
> [ARCHITECTURE.md](./ARCHITECTURE.md); the live map renders with `npx chorograph render .`.

## Where this sits in the brokerage

Harper earns **commission on placed premium**. Before quoting and placement can begin, a
licensed producer or intake agent must collect a **submission** — the structured facts about
the insured's business, operations, drivers, and coverage intent. For garage / auto-dealer
lines, that means the **GARAGE_001** garage liability application (a 998-field AcroForm PDF)
plus supplemental questionnaires triggered by business type and risk signals.

This repo is a **candidate superday assessment** for that workflow: a live **intake
teleprompter** that sits beside an agent on a call, listens to the conversation, autofills
the application in real time, surfaces knockout/appetite risk flags, and tells the agent what to
ask next. It sits in the **Intake** funnel stage — the human-on-a-call moment where raw
conversation becomes structured submission data that downstream quoting (hercules, carrier
integrations, agora) can consume.

The product is **not** a transcription app. The transcript is only an input feed. The core
value is a **deterministic rules engine** (`lib/rules.ts`) that owns field status, conflict
detection, risk flags, supplemental-form applicability, validation constraints, and Ask-Next
selection. The LLM performs a single inference pass per utterance — returning candidate facts
with evidence quotes — and never makes workflow decisions.

## Who and what depends on it

**Nothing in production depends on this repo.** It is an interview artifact (candidate: Raghu)
with a local Next.js dev server (`npm run dev` → `http://localhost:3000`). No deployed
service, no Harper API integrations, no Relay events, no shared database writes.

**Upstream (inputs the copilot consumes):**

- **Live call audio** via browser microphone, uploaded recording replay, or synthesized demo
  audio — all transcribed through **Deepgram** streaming ASR.
- **Manual text chunks** and two scripted demo transcripts (`lib/mockTranscript.ts`) for
  offline evaluation.
- **GARAGE_001 source PDF** under `garage_auto/forms/` (git-ignored; contains real form
  templates) — served by `GET /api/export-pdf` for client-side fill.

**Downstream (artifacts the copilot produces):**

- **Filled GARAGE_001 PDF** — client-side via `pdf-lib`, mapping ~22 curated fields through
  `garage001PdfFieldMap.ts`.
- **Structured JSON submission record** (`SubmissionRecord` in `lib/exportPdf.ts`) — machine-
  readable intake snapshot with schema version, field statuses, risk flags, supplements, and
  validation issues. This is the shape a production intake system would hand to quoting.
- **Append-only calibration logs** in `data/` (git-ignored, may contain PII): extraction
  events, rep corrections, transcript ASR fixes.

**Humans served:** licensed intake agents / producers on garage liability calls. The UI
presents Ask-Next prompts, live field autofill, conflict resolution, risk acknowledgment,
driver panel, supplemental-form suggestions, and validation issues (e.g. vehicle-mix percents
must sum to 100%).

## Domain concepts

| Concept | Meaning in insurance terms |
| --- | --- |
| **Intake / submission** | The structured application data collected before quoting — who the insured is, what they do, drivers, premises, loss history, coverage intent |
| **GARAGE_001** | Harper's standard garage liability application PDF (AcroForm); 998 fields, most non-semantic schedule rows |
| **Garage business type** | Vertical classification: dealer, dealer+repair, repair, body, heavy, tow, parking, car wash, mixed — drives which fields and supplements apply |
| **Talk track** | Scripted questions the agent should ask, in priority order (`garageTalkTrack.ts`) |
| **Ask Next** | The single highest-priority prompt shown to the agent: business type → conflict → knockout flag → missing required field → low-confidence confirm → recap |
| **Knockout / appetite flag** | A risk rule that may decline or require underwriter review (e.g. no complete driver record, plate-to-driver ratio exceeded) |
| **Supplemental form** | Additional questionnaires (GARAGE_SUP_*) triggered by business type or field values — e.g. heavy vehicle, towing, wholesale dealer |
| **Coverage line** | Garage liability, garage keepers, dealers physical damage — recommended reactively from accumulated state |
| **Conflict** | Two contradictory extractions for the same field; rep must choose new, old, or manual value |
| **Field status** | `missing` → `low_confidence` / `needs_review` → `filled` (monotonic; `filled` never downgrades without explicit rep action) |

## Operational status (2026-07 estate forensics)

**Superday (candidate interview work).** Substantial, runnable prototype (~80 source files,
offline test suite, eval harness) but not deployed and not wired to Harper production systems.
Safe to archive or mine for patterns (LLM-as-extractor + deterministic rules engine,
`TranscriptSource` abstraction for future Genesys telephony). Not load-bearing infrastructure.

The default branch (`cursor/garage-intake-copilot-mvp`) is active candidate work, not a stale
fork. Package name is `garage-intake-copilot`.

## Rewrite notes — what must survive if productized

1. **LLM extracts, rules decide** — extraction returns `{fieldId, value, confidence,
   evidenceQuote}` only; all status transitions, conflict handling, risk evaluation, and
   Ask-Next priority stay deterministic TypeScript. Never move workflow logic into prompts.
2. **TranscriptSource seam** — mic, file replay, manual text, and future Genesys dual-channel
   telephony must all funnel through one interface into `processIntakeText`.
3. **Uniform field-state shape** — top-level fields and nested driver fields share
   `{value, status, confidence, evidence, conflict?}` so conflict detection and confidence
   gating apply uniformly.
4. **Reactive supplement/coverage applicability** — derived from accumulated state on every
   recompute, not upfront classification.
5. **Closed-loop invariants** — `filled` never downgrades; conflicts resolved by rep only;
   business type is sticky; monotonic `generation` / request-sequence guard drops stale
   responses.
6. **Degrade without keys** — mock extractor must keep working with no `OPENAI_API_KEY`; live
   ASR gated when `DEEPGRAM_API_KEY` unset.
7. **Calibration telemetry** — extraction events, rep corrections, and transcript fixes
   append to JSONL for future threshold tuning (`AUTO_FILL_THRESHOLD` 0.8,
   `NEEDS_REVIEW_THRESHOLD` 0.55 are guesses today).

**Known debt / gaps** (see `futurescope.md`): one driver only; 4 of 27 supplemental forms
wired; LLM path has no quantitative eval (mock-only harness scores 20/20 on two scripts);
PDF field mapping has no read-back eval; Genesys telephony not implemented; confidence
thresholds are flat per-field constants.

**Overlap with sibling repos:** Harper's production intake stack includes Dumbly
(api/ui/web), harley-copilot, and voice agents in the Intake domain. This repo explores the
same problem space (live call → structured garage submission) as a standalone superday prototype
with no shared code.
