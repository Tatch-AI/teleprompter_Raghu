# Garage Intake Copilot

A live teleprompter for insurance agents taking a garage / auto liability
intake call. While the customer's talking, it fills out the application,
catches problems, and tells the agent what to ask next before they'd have to
think of it themselves.

The transcript is just the input. The actual product is a plain deterministic
rules engine sitting behind it — the LLM's only job is to read the transcript
and hand back candidate facts with evidence. It doesn't decide anything.

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

**The LLM doesn't decide anything, it just reads.** Status, conflicts, risk
flags, what to ask next — all of it is deterministic TypeScript in
`lib/rules.ts`. If a decision needs a prompt to change, that's a bug.

**The field catalog isn't the real form.** GARAGE_001 the PDF has 998 form
fields, and most of them are boilerplate or repeating rows with names like
`Text47`. We picked the ~30 that actually drive a conversation and left the
rest alone. New supplements get the same treatment — read the PDF, pick what
matters, don't try to mirror it field-for-field.

**Nobody picks which forms apply up front.** Supplemental questionnaires and
coverage lines (garage liability / garage keepers / dealers physical damage)
get triggered by what comes up in the call — business type, a specific
answer — not chosen at the start of the intake.

**Every fact carries the same shape, wherever it lives:**

```
{ value, status, confidence, evidence, conflict? }

state.fields.legal_name             → this shape
state.fields.sales_revenue          → this shape
state.drivers[0].fields.driver_dob  → this shape
```

That's true for a top-level field and it's true for a driver's date of birth.
It would've been simpler to store a driver as one flat object, but then a
misheard DOB couldn't raise a conflict the same way everything else does —
and that closed-loop behavior is most of what makes this useful. So the
driver schedule reuses the same per-field tracking instead of inventing a
second, weaker data model next to it.

**A wrong-looking answer isn't always a conflict.** A risk flag means one
field's value is a problem by itself. A conflict means two things said about
the same fact disagree. Neither of those covers "each of these three
percentages is individually fine, but they add up to 85 instead of 100" — so
that's a third kind of check, validation issues, done as a generic
"these fields have to add up to X" rule rather than a one-off for vehicle
mix specifically.

**Input sources are swappable.** `TranscriptSource` is one interface; manual
text, mic, and file replay all implement it today. A real telephony
integration is the same shape of work, not a rewrite.

**There's a feedback loop, because the thresholds are guesses right now.**
Every Confirm, Edit, and conflict resolution gets logged, same for every raw
extraction candidate. `AUTO_FILL_THRESHOLD` and `NEEDS_REVIEW_THRESHOLD` in
`lib/rules.ts` were picked, not fit — the logging exists so they can
eventually be checked against real outcomes instead.

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
coverage-line recommendation has no UI yet, and a few other things.
