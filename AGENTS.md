# AGENTS.md — Garage Intake Copilot

Rules for AI agents working in this repo. This is a **preemptive intake teleprompter
+ application autofill copilot**, not a transcription app. The transcript is only an
input feed; the product is the deterministic workflow on top of it.

## Non-negotiable architecture

1. **The LLM only understands language.** It returns candidate facts + evidence and
   nothing else. ALL workflow logic — normalization, field status, conflicts, risk
   flags, missing-field computation, talk-track satisfaction, and Ask-Next selection —
   stays deterministic in `lib/rules.ts`. Never move workflow decisions into a prompt.
2. **Extraction must degrade without keys.** `lib/llmExtraction.ts` falls back to the
   deterministic mock. Anything you add must keep working with no `OPENAI_API_KEY`.
3. **All audio/text input goes through `TranscriptSource`** (`lib/transcriptSource.ts`).
   Manual, mic (`DeepgramLiveSource`), file replay, and future Genesys all implement the
   same interface. The engine and UI must not know which source is active.

## Closed-loop invariants (do not break)

- `filled` never downgrades. `needs_review → filled` only via an explicit rep **Confirm**.
- **Conflicts** are resolved by the rep (Use new / Keep old / Manual), never auto-discarded.
- **Risk flags** fire only on high-confidence `filled` values and clear when the
  triggering value changes; they can be acknowledged to advance.
- `missing` ≠ `low_confidence` — answered questions must never be re-asked.
- Business type is **sticky**; only flip on materially stronger evidence.
- Keep the monotonic `generation` / request-sequence guard that drops stale responses.

## Ask-Next priority order (keep in sync with README)

business type → unresolved conflict → knockout/appetite flag → missing required field →
low-confidence/needs-review confirm → recap. Every recommendation must show *why it matters*.

## Secrets & data

- The browser must NEVER see `DEEPGRAM_API_KEY`. Mint short-lived tokens server-side in
  `app/api/deepgram-token/route.ts`.
- Feedback/state may contain PII. `data/` is git-ignored; do not commit it. Document new
  env vars in `.env.example`.

## Conventions

- Prefer editing existing files; keep the codebase tight and readable.
- Avoid coupling to churny SDKs — we talk to Deepgram over the native `WebSocket`.
- Do not add narration comments; comment only non-obvious intent/constraints.
- After changes run `npx tsc --noEmit`, `npm run build`, and `npm test` (offline engine test).
- Never commit unless explicitly asked; never push to `main` directly.
