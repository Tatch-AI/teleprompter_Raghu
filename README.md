# Garage Intake Copilot

Think of it as a **teleprompter for insurance agents** taking a garage / auto
liability intake call. As the customer talks, the copilot listens, fills out
the application in real time, and tells the agent what to ask next — before
they'd have to think of it themselves. The transcript is just the input feed;
the actual product is a deterministic workflow engine sitting behind it.

## Architecture

```
Call audio / text
      │
      ▼
Deepgram ASR              (live mic, or an uploaded/replayed recording;
                            typed/simulated text enters here too)
      │  transcript chunk
      ▼
Extraction                (OpenAI LLM, or a deterministic mock fallback
                            when no API key is set)
      │  candidate facts + evidence, nothing else
      ▼
Deterministic engine       lib/rules.ts
  • field status: filled / missing / low_confidence / needs_review / conflict
  • knockout & appetite risk flags
  • supplemental-form + coverage-line suggestions
  • Ask-Next priority selection
      │
      ├──> Agent: "Ask Next" — the preemptive prompt
      ├──> Live autofilled application
      └──> Export: filled PDF / structured JSON submission record
```

Everything reachable from the UI — mic, file replay, scripted demos — funnels
through this one path (`lib/processIntakeText.ts` → `/api/process-chunk`), so
there is exactly one extraction pipeline and one rules engine, regardless of
where the words came from.

## System design choices

- **The LLM only understands language.** It returns candidate facts with
  evidence and nothing else — status, conflicts, risk, missing-field logic,
  and next-question selection are deterministic TypeScript, never a prompt.
- **The field catalog is curated, not scraped.** The real GARAGE_001 PDF has
  998 generically-named form fields with no machine-readable labels; the
  ~30 fields we model are hand-picked for what actually drives a conversation
  and an underwriting decision.
- **Supplemental forms and coverage lines are triggered, not chosen upfront.**
  There's no "pick your forms" step — a business-type or field signal
  (e.g. business type `tow`) surfaces the relevant `GARAGE_SUP_*`
  questionnaire and the applicable coverage lines (garage liability / garage
  keepers / dealers physical damage) as the call reveals them.
- **Input sources are pluggable.** `TranscriptSource` is a generic interface;
  manual text, live mic, and file replay all implement it today without the
  engine or UI knowing which is active — a real telephony integration slots
  in the same way.
- **A feedback loop exists for calibration.** Every rep Confirm/Edit/conflict
  resolution and every raw extraction candidate is logged, so confidence
  thresholds can eventually be tuned from real data instead of picked by hand.

## Assumptions worth knowing

- **The mock extractor is a demo/dev stand-in, not a production-accuracy
  proxy.** It's a regex heuristic tuned to two scripted demo calls; real
  accuracy claims should come from the `llm` extractor path.
- **Speaker attribution (agent vs. customer) is best-effort, not
  identity-verified.** Diarization only clusters distinct voices in one mixed
  audio stream — it has no concept of role. Extraction never depends on the
  label being right; only the on-screen "who said it" attribution does.
- **`filled` never downgrades**, conflicts are always resolved by the rep
  (never auto-discarded), and business type is sticky — see `AGENTS.md` for
  the full list of closed-loop invariants.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # offline engine tests, no keys required
```

Works fully offline with the deterministic mock extractor. For the real
experience, set `OPENAI_API_KEY` (extraction) and `DEEPGRAM_API_KEY` (live
transcription) in `.env.local` — see `.env.example` and `AGENTS.md` for setup
details and gotchas.

## What's next

See **[futurescope.md](./futurescope.md)** for the roadmap — the driver/team
section (a real underwriting blocker we don't model yet), remaining
supplemental forms, coverage-line UI, pre-call document ingestion, and the
path to real telephony.

## Contributing

See **`AGENTS.md`** for the non-negotiable architecture rules, closed-loop
invariants, and conventions this codebase depends on.
