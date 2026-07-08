# What's not built yet

`README.md` covers what exists; `AGENTS.md` covers the rules for building any
of this. Ordered roughly by how much it would hurt in production.

## Recently closed

- **Vehicle-mix must total 100%** for sales-only dealers. `garageValidationRules.ts`
  builds it as a generic "fields must sum to N" mechanism, not a one-off.
  The next percent-group is just a config entry. Live in `ValidationPanel`
  and the JSON export.
- **A real eval harness.** `scripts/evalAccuracy.ts` scores the mock
  extractor against hand-written answer keys (`npm run eval-accuracy`):
  20/20 on both scripted calls. Surfaced while comparing this repo to
  another candidate's submission (`Tatch-AI/david-lingan-superday-intake`);
  independent implementation, own answer keys. Mock-only, scripted-only.
  Real `llm` accuracy is still open.
- **A minimal driver record.** `lib/garageDriverFields.ts` +
  `mergeDriverCandidates`. `IntakeState.drivers` is an array, deliberately
  not a flat object: each driver's name/DOB/license gets the same
  status/confidence/evidence/conflict tracking as any field (see README's
  design choices). Knockout (`no_complete_driver`) fires once business type
  is known and nobody has all three. Read-only panel. Caught by smoke-testing
  the real `llm` path (not the mock extractor, which is all the test suite
  exercises): `buildUserPrompt` only ever serialized the top-level field
  catalog, so the real model had no idea driver fields existed and the
  knockout fired on every live call regardless of what the customer said.
  Fixed by adding driver fields to the prompt and the response shape;
  `mergeExtractionResults` had the same gap for multi-window chunks. No
  regression test yet, since the test suite only runs the mock path.
- **Download PDF now fills the real GARAGE_001 form**, not a synthesized
  summary. `garage001PdfFieldMap.ts` hand-maps field IDs to the form's raw
  field names, built off `scripts/discoverPdfFields.ts` and spot-checked by
  hand. Runs client-side, leaves the form editable, and raises real
  conflicts instead of silently overwriting. Verified end to end on a live
  call.
- **Six rules from a real Harper sales-only intake document** (Colony Garage
  Application, GAR-APP121-0525): minimum 15 vehicles/year, minimum 3 years
  owner experience, titles not transferred promptly, dealer's license
  required (a pending license counts as yes, not a decline), plate-to-driver
  ratio (max 3 plates per named driver), and a retail/broker/wholesale sales
  mix using the same percent-group mechanism as vehicle mix. Also added a
  second trigger for the Wholesale Dealer Questionnaire based on the
  wholesale/broker percentage directly, not just the existing `sales_model`
  field. Checking each rule against the actual PDF text (not just my own
  summary of it) caught two real bugs: a pending dealer's license was being
  read as a decline instead of a yes, and `titles_transfer_promptly`
  extraction failed on any phrasing where "titles" and "transfer" weren't
  immediately next to each other (e.g. "titles don't transfer promptly").
  Both fixed, both covered by tests. 20 new checks in
  `scripts/tests/harperRules.test.ts`.

## The PDF export has no eval

The JSON export and Ask-Next both read `state.fields` directly, so they
inherit whatever accuracy the extraction eval covers. `fillRealApplicationPdf`
doesn't. It's a second translation layer that can be wrong in ways the
field-level eval can't see:

- **Wrong-box mappings.** 22 fields are hand-mapped to specific boxes on a
  998-field form. A wrong mapping doesn't throw; the value just lands in
  the wrong place. Only checked by eyeballing one demo run so far.
- **No value formatting.** Text fields use raw `String(value)`, not
  `formatFieldValue()`: `2400000` instead of `$2,400,000`.
- **Real coverage is ~73%, not 100%.** 8 fields (`business_type`,
  `business_story`, `why_shopping`, `sales_model`, `dealer_plate_count`,
  `test_drives_allowed`, `lot_security`, `keys_handling`) don't map to
  anything on the real form's shape and are left unmapped on purpose.

Fix is a read-back eval: reopen the filled PDF, assert each of the 22
mapped fields against the same answer keys `evalAccuracy.ts` already has.
Mostly wiring, though it won't mean much until the formatting gap is fixed.

## Driver record: what's thin, and the right fix order

One driver only: everything lands in `drivers[0]`. A second driver needs
real disambiguation (whose utterance is this?), not just another array slot.
No editing either: `FieldRow` has confirm/edit for top-level fields, the
driver shape doesn't. The eval harness doesn't check drivers. Two training
rules never got built: no personal auto policy should auto-set "business
and personal use"; an out-of-state license should raise a flag.

For a live demo, editability comes before multi-driver. `DriversPanel` is
the one surface where "everything's correctable live" doesn't actually
hold, which is a credibility risk more than a feature gap. Multi-driver
comes next; the real training material this is modeled on has two drivers
(owner and employee). The two unbuilt rules stay lowest priority:
refinements to a working flow, not gaps in it.

## Most of the supplemental-form catalog is unwired

4 of 27 `GARAGE_SUP_*` forms trigger automatically (heavy vehicle, towing,
wholesale dealer, lessors risk). The rest don't, because nothing in the
base conversation produces a signal for them: no corresponding talk-track
question. Same process every time: read the PDF, add fields for what
matters, wire the trigger. Curation bottleneck, not an engineering one.

## Fields the base application doesn't ask about

All from the training material:

- Policy effective date
- Business address/phone (the `location` section exists in the type
  system, unused)
- Deductible
- Floor-plan financing and lender-as-loss-payee (training calls this
  non-negotiable)
- Loss detail beyond yes/no: date, amount, description, prior premium
- Optional coverages: wind/hail/flood, theft and vandalism, false pretense
- Vehicle-mix cross-check against the repair revenue split, blocked on
  `dealer_plus_repair` support
- Driver license state must match the dealer's licensed state(s) — needs a
  new "states licensed in" field plus a per-driver cross-check
- Liability limit must be at least the largest Dealers Physical Damage lot
  limit — needs a lot-limit field we don't have

## Chunking and interruptions haven't been stress-tested

Extraction only fires on a complete utterance: a speaker change, or 1
second of silence. Interim transcripts are discarded on purpose, since
extracting mid-sentence risks committing to a wrong fact. None of this has
been tested against real cross-talk: two people talking over each other,
or a rapid back-and-forth that could fragment into tiny chunks instead of
clean boundaries.

The long-text chunking path (`splitWithOverlap`/`mergeExtractionResults`),
built for pasted text or future document ingestion, has never been
exercised by a live call either, since real utterances flush short.

Corrections aren't safe against either of these. `handleCorrectChunk`
shares the `requestSeq` guard with live chunks but skips the serial
`liveQueue`, so correcting mid-stream can lose a race and get silently
dropped.

## Real telephony

`TranscriptSource` is the seam. A Genesys dual-channel implementation would
slot in the same way and fix speaker attribution for good: each party gets
its own channel instead of one guessed-at mixed stream. Needs a small
Node.js bridge speaking WebSocket to Genesys on one side, `TranscriptSource`
on the other.

## Confidence thresholds are guesses, and probably the wrong shape

`AUTO_FILL_THRESHOLD` (0.8) and `NEEDS_REVIEW_THRESHOLD` (0.55) are flat,
applied to every field alike. That's likely wrong before the values even
matter. A proper noun and a yes/no answer don't carry the same mishearing
risk; `garageKeyterms.ts` already tracks which terms are rare enough to
need boosting, roughly the signal that should set the threshold instead.
Per-field or per-keyterm thresholds are the more likely right shape.
`npm run analyze-accuracy` exists to supply real data once there's enough.
There isn't yet.

## The LLM extraction path has no quantitative eval

The only real-call check so far used the mock extractor and found real
problems, mostly misattributed agent lines going to the customer, which is
expected of a keyword heuristic. A separate smoke test against the real
`llm` path (scripted text, not real audio) caught and fixed one real bug —
see "Recently closed" — but that was a manual spot-check, not a number.
`evalAccuracy.ts` has never run against the `llm` path or real audio, only
the mock extractor against two scripts. The fix: build answer keys for a
few real `garage_auto/audio/` calls, run the harness in `llm` mode, get an
actual number. Largest untested assumption in the repo until that exists.
