# Future scope

What's not built yet, roughly in priority order, and why. See `README.md` for
what exists today and `AGENTS.md` for the rules governing how any of this
should be built.

## 1. Driver / team section — the biggest gap

Per Harper University training material (a real underwriting walkthrough, not
a guess): **an application cannot be submitted without at least one complete
driver record** (full name, DOB, license number) — training calls this "the
number one reason submissions fail." `lib/types.ts` already defines a
`"drivers_team"` `FieldSection`, but zero fields use it today — there is no
driver data model at all.

Needed:
- Per-driver fields: name, DOB, license number + state, CDL status,
  business/personal vehicle use, personal-auto-policy status, full/part-time,
  3-year violation history. This is naturally an array of structured records,
  not a scalar field — the current `FieldState` model (one value per field)
  doesn't fit an array-of-drivers shape and will need a new pattern.
- A knockout-severity risk flag: zero complete driver records blocks
  submission entirely (matches the training's "automatic decline" framing).
- Two deterministic rules ready to encode once the fields exist: (a) no
  personal auto policy → auto-normalize to "business and personal use"
  coverage; (b) out-of-state driver license → risk flag (training:
  "recommend converting to in-state, or coverage may be denied/expensive").

## 2. Coverage-line recommendation UI

`lib/garageCoverageRules.ts` computes the three-pillars recommendation
(garage liability / garage keepers / dealers physical damage) into
`IntakeState.recommendedCoverageLines` and it's already in the JSON
submission export — but nothing renders it. Needs a panel alongside
`SupplementsPanel`/`RiskFlagsPanel` showing which lines apply and why.

## 3. Remaining supplemental forms

Only 4 of the 27 `GARAGE_SUP_*` questionnaires in `garage_auto/forms/` are
wired up (heavy vehicle, towing, wholesale dealer, lessors risk) — the base
field catalog doesn't yet ask about the exposures (auto auction, valet,
salvage yard, young driver, hired & non-owned auto, RV, boat/watercraft,
etc.) the rest depend on. Adding one: read the real PDF, curate its
underwriting-relevant questions into `lib/garageFieldDefinitions.ts` the same
way GARAGE_001 was distilled (the raw PDFs have generically-named AcroForm
fields with no machine-readable labels — this is a curation task, not a
mechanical field dump), then add a trigger in `garageSupplementRules.ts`,
marked `validated: false` until underwriting confirms the mapping.

## 4. Missing base-application fields

All identified from real training material, none modeled today:

- **Policy effective date** — no field exists.
- **Business address / phone** — `FieldSection.location` is defined, unused.
- **Deductible** — no field exists.
- **Vehicle-type-mix cross-validation** — sales/repair revenue splits by
  vehicle type (e.g. 90% passenger / 10% heavy) must total 100% *and* match
  across sections, or underwriting kicks the application back. Today
  `sales_revenue`/`service_repair_revenue` are plain currency fields with no
  mix breakdown or cross-total check — this needs a new field shape plus a
  cross-field validation rule (similar in spirit to the existing conflict
  mechanism, but a hard validation rather than a contradiction).
- **Floor-plan financing + lender-as-loss-payee** — if dealer inventory is
  bank-financed, the lender must be listed as loss payee, called
  "non-negotiable" in training. No such field exists.
- **Structured loss detail + prior premium** — `prior_losses` is a boolean
  today; real underwriting wants loss date, amount, description, and the
  prior carrier's premium.
- **Optional coverage add-ons** — wind/hail/flood, theft & vandalism, false
  pretense coverage — none exist as fields.

## 5. Pre-call document ingestion

Real Harper calls often arrive with a lead/submission document already in
hand — seen directly in a real call transcript, where a partner rep read off
a customer's name, state, and coverage type before handing off. Today the
engine only builds the record live from the call. A pre-call document should
feed the same extraction pipeline as one large one-shot chunk, populating
fields as `needs_review` (confirmed live, never auto-trusted) rather than
`filled`.

## 6. Real telephony (Genesys)

`lib/transcriptSource.ts`'s `TranscriptSource` interface is the seam.
`ManualTranscriptSource` and `DeepgramLiveSource` (mic/file replay) are local
stand-ins; a `GenesysTranscriptSource` consuming a real call's dual-channel
AudioHook feed would slot in without the engine or UI changing, and would
also fully resolve the speaker-attribution guesswork described in the
README's assumptions — each party would arrive on its own channel instead of
one mixed stream needing diarization.

## 7. Confidence threshold calibration

`AUTO_FILL_THRESHOLD` (0.8) and `NEEDS_REVIEW_THRESHOLD` (0.55) in
`lib/rules.ts` were picked, not fit to data. `npm run analyze-accuracy`
exists to answer this once enough real `llm`-mode feedback accumulates in
`data/feedback.jsonl` — revisit the thresholds once that report has signal.

## 8. Real-call validation of the LLM extraction path

The one real-call accuracy eval done so far ran the **mock** extractor
against real (unscripted) Harper audio and found real gaps (misattributing
agent dialogue as customer answers, low field coverage). That's expected of a
demo heuristic — but it means the `llm` extraction path itself hasn't yet
been validated end-to-end against real, messy call audio at volume. Worth
doing before trusting it in production.
