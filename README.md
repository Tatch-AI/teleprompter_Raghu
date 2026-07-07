# Garage Intake Copilot

A preemptive **intake teleprompter** and **application autofill** copilot for the
GARAGE_001 commercial insurance flow. The transcript is only the input feed — the
product is the deterministic workflow layered on top of it.

## Core loop

1. Conversation text arrives (typed, pasted, or simulated).
2. An extractor pulls supported facts from the chunk (LLM, with a deterministic
   mock fallback).
3. Facts are merged into the application state.
4. Each field is marked `filled`, `missing`, `low_confidence`, `needs_review`, or `conflict`.
5. GARAGE_001 talk-track steps are marked satisfied as their fields fill — even
   out of order.
6. Knockout / appetite risk flags are detected.
7. A deterministic **Ask Next** recommendation is produced.
8. Every recommendation shows *why it matters*.

## Design principle

**The LLM only understands language.** It returns candidate facts with evidence and
nothing else. All workflow logic — normalization, status, conflicts, risk flags,
missing-field computation, talk-track satisfaction, and next-question selection —
is deterministic TypeScript in `lib/rules.ts`.

## Ask Next priority order

1. Business type unknown → ask the business-type selector.
2. Unresolved conflict → ask a conflict-resolution question.
3. Unresolved knockout / appetite flag → ask the risk follow-up.
4. Missing required field in the applicable path → ask that talk-track question.
5. Low-confidence / needs-review field → ask for confirmation.
6. All required fields complete → recap / wrap.

## Closed-loop guarantees

- **Conflicts** are resolved by the rep (Use new / Keep old / Manual) — never auto-discarded.
- **needs_review → filled** only via an explicit rep Confirm; `filled` never downgrades.
- **Risk flags** fire only on `filled` (high-confidence) values and clear when the
  triggering value changes; they can be acknowledged to advance.
- `missing` is distinct from `low_confidence`, so answered questions are never re-asked.
- Business type is **sticky** (only flips on materially stronger evidence).
- A monotonic `generation` guard drops stale/out-of-order responses.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Extraction uses the deterministic mock by default. To use a real LLM, set an
`OPENAI_API_KEY` (and optionally `OPENAI_MODEL`) in `.env` — see `.env.example`.
On an LLM failure the API does a silent one-shot retry, then a safe no-op.

Click **Simulate next** to advance the scripted demo call, or type/paste chunks.

## Layout

```
app/
  page.tsx                     Orchestration + client state
  api/process-chunk/route.ts   Extraction + engine, with parse-guard & allowlist
lib/
  types.ts                     Data model
  garageFieldDefinitions.ts    Field catalog (business-type tagged)
  garageTalkTrack.ts           Ordered rep-facing steps
  garageRiskRules.ts           Knockout / appetite rules
  rules.ts                     Deterministic engine (the product)
  llmExtraction.ts             LLM extractor + deterministic mock fallback
  transcriptSource.ts          Generic input interface (Deepgram-ready)
  initialState.ts, formatters.ts, mockTranscript.ts
components/                     Ask Next, Transcript, Application, Fields,
                                Conflict, Risk, Pending steps, Debug JSON
scripts/demoWalkthrough.mjs     Drives the scripted call through the API
```

## Extending to live audio

`lib/transcriptSource.ts` defines a generic `TranscriptSource`. The MVP ships
`ManualTranscriptSource`; a `DeepgramTranscriptSource` can implement the same
interface and feed chunks into the identical engine without UI changes.
