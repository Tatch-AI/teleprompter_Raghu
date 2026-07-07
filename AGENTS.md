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
- Never commit unless explicitly asked; never push to the default branch directly — open a PR.

## Pre-push checklist

Run this, in order, before opening or updating a PR against the default branch
(`cursor/garage-intake-copilot-mvp`). If something regresses, fix the regression —
don't lower a threshold or skip a step to get green. This list is the fallback:
whatever else changes about how we work, updates land through here first.

1. `rm -rf .next tsconfig.tsbuildinfo` if you touched routing/build config or see
   stale-module typecheck errors — Next's cache can reference deleted routes.
2. `npx tsc --noEmit` — clean typecheck, zero errors.
3. `npm run build` — production build succeeds (`next build` also type-checks the
   App Router route tree, which `tsc --noEmit` alone can miss).
4. `npm test` — `scripts/tests/engine.test.ts` (28 checks: extracted record,
   conflicts, risk flags, Ask-Next order) still passes.
5. `npm run score-extraction` — extraction accuracy is still ≥ the gate defined in
   `scripts/scoreExtraction.ts` (`MIN_AGGREGATE_ACCURACY`). A drop is a real
   extractor regression to fix, not noise.
6. If `lib/garage001PdfFieldMap.ts` or the source PDF in `garage_auto/forms/`
   changed: re-run `npm run discover-pdf-fields`, and actually download a filled
   PDF from the running app and open it in a real viewer — programmatic
   pdf-lib checks don't catch every rendering issue.
7. If engine/routing/UI logic changed: `npm run dev`, run at least one demo call
   end to end (Simulate or Play synthesized call), and confirm the change shows
   up correctly in the UI. Type checks and unit tests verify code, not the
   feature — this step is not optional for anything touching `app/` or `lib/rules.ts`.
8. Update `IMPROVEMENTS.md` if the change closes or introduces a known limitation.
9. Re-run this checklist after merging/rebasing on top of another PR from this
   set — a clean typecheck on your branch alone doesn't guarantee a clean merge.
