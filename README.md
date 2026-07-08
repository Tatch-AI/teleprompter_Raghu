# Garage Intake Copilot

A live teleprompter for insurance agents taking a garage / auto liability
intake call. While the customer's talking, it fills out the application,
catches problems, and tells the agent what to ask next before they'd have to
think of it themselves.

The transcript is just the input. The actual product is a deterministic rules
engine sitting behind it — the LLM's role is a single inference pass per
chunk, returning candidate facts with evidence. It performs no decisioning.

## How a call moves through it

```
Call audio / text
      │
      ▼
Deepgram ASR             live mic, an uploaded/replayed recording,
                          or typed/simulated text
      │  transcript chunk
      ▼
Extraction                OpenAI, or a deterministic mock when no key is set
      │  candidate facts + evidence — nothing else
      ▼
Rules engine (lib/rules.ts)
  · field status: filled / missing / low_confidence / needs_review / conflict
  · knockout & appetite risk flags
  · which supplemental forms and coverage lines apply
  · what to ask next, and why
      │
      ├──> "Ask Next" — the prompt the agent sees
      ├──> the application, filling itself out live
      └──> PDF export / JSON submission record
```

Mic, file replay, and the scripted demos all funnel through the same code
path (`lib/processIntakeText.ts` → `/api/process-chunk`). There's one
extraction pipeline and one rules engine — the input source never leaks into
either.

## Design choices

**Extraction is a single inference pass, not a decision point.** Each
transcript chunk is passed through one LLM call (or the deterministic mock,
when no key is configured), returning a fixed-schema list of candidate facts
— `{fieldId, value, confidence, evidenceQuote}` — with no side effects and no
access to business logic. Field status, conflict detection, risk evaluation,
and next-question selection are pure functions in `lib/rules.ts`, applied
deterministically after the inference pass returns. The LLM has no mechanism
to mutate application state directly.

**The field catalog is a curated subset, not a schema mirror.** GARAGE_001 is
a 998-field AcroForm PDF; most fields are non-semantic (repeating schedule
rows, boilerplate, auto-generated IDs like `Text47`) and carry no extractable
meaning. `lib/garageFieldDefinitions.ts` models ~30 fields selected for
conversational relevance and underwriting materiality. Supplemental forms are
curated the same way — no field-for-field mapping is attempted.

**Form and coverage applicability is computed reactively, not classified
upfront.** Which supplemental questionnaires and coverage lines (garage
liability / garage keepers / dealers physical damage) apply is derived from
accumulated state — business type, specific field values — via declarative
rule sets (`garageSupplementRules.ts`, `garageCoverageRules.ts`) evaluated on
every recompute, rather than resolved by an initial classification step.

**One field-state shape, applied uniformly regardless of nesting depth.**

```
{ value, status, confidence, evidence, conflict? }

state.fields.legal_name             → this shape
state.fields.sales_revenue          → this shape
state.drivers[0].fields.driver_dob  → this shape
```

Every extractable datum — a top-level field or a field nested inside a driver
record — uses this same structure. This is what makes conflict detection,
confidence gating, and evidence attribution apply identically to a driver's
date of birth and to `legal_name`. Modeling driver records as flat objects
was rejected: it would exclude nested fields from conflict resolution and
confidence thresholds entirely.

**Validation issues are a distinct constraint class, not a variant of risk
flags or conflicts.** A risk flag is a single-field predicate over a filled
value. A conflict is a pairwise contradiction between sequential extractions
for the same field. Neither expresses an invariant across multiple
independently-valid fields — e.g., three percentages that each parse
correctly but sum to 85, not 100. This is implemented as a generic constraint
class (`GARAGE_PERCENT_GROUPS` in `lib/garageValidationRules.ts`), not a
one-off check for vehicle mix.

**Input modality is abstracted behind one interface.** Manual text entry,
live microphone capture, and file replay all implement `TranscriptSource`. A
production telephony integration is an additional implementation of the same
interface, not a structural change to the extraction or rules pipeline.

**Confidence thresholds are fixed constants pending calibration.**
`AUTO_FILL_THRESHOLD` (0.8) and `NEEDS_REVIEW_THRESHOLD` (0.55) in
`lib/rules.ts` were set, not fit to data. Every field-level correction
(Confirm / Edit / conflict resolution) and every raw extraction candidate is
persisted to an append-only log specifically to support future recalibration
against outcome data.

## Worth knowing before you trust it

- Speaker labels (agent vs. customer) are best-effort. Diarization just
  clusters distinct voices in one audio stream; it has no idea who's who.
  Extraction doesn't care which label is attached, but the "who said it"
  quote shown to the rep can be wrong.
- `filled` never downgrades, conflicts always go to the rep instead of being
  auto-resolved, and business type is sticky once set. Full list of these in
  `AGENTS.md`.

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # offline engine tests, no keys required
```

It works fully offline on the mock extractor. For the real thing, set
`OPENAI_API_KEY` and `DEEPGRAM_API_KEY` in `.env.local` — see `.env.example`
and `AGENTS.md` for the setup gotchas (the Deepgram one especially, it'll
cost you twenty minutes if you hit it blind).

## What's not built yet

[`futurescope.md`](./futurescope.md) — the driver section only handles one
driver right now, most of the 27 supplemental forms aren't wired up, the
`llm` extraction path has never been eval'd against a real call, and a few
other things.
