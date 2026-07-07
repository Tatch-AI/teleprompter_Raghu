# What's not built yet

Roughly in priority order. `README.md` covers what exists; `AGENTS.md` covers
the rules for building any of this.

## Recently closed

**Vehicle-mix has to add up to 100%, for sales-only dealers.**
`lib/garageValidationRules.ts` has a small generic mechanism — any group of
fields that needs to sum to 100% — and one instance of it, the three
vehicle-mix percentage fields. Shows up live in `ValidationPanel` and in the
JSON export. Adding another percent-group later is just adding an entry to
that same file.

**A real eval harness.** `scripts/evalAccuracy.ts` plus hand-written answer
keys in `scripts/answerKeys/` score the mock extractor against known-correct
values for both scripted demo calls (`npm run eval-accuracy`) — currently
20/20 on both. This came out of comparing this repo against another
candidate's submission for the same take-home
(`Tatch-AI/david-lingan-superday-intake`), which had something similar. Ours
is a separate implementation with our own answer keys, not theirs. It only
covers the mock extractor and the two scripted calls right now — real-call,
`llm`-mode accuracy is still an open question, and it doesn't check driver
fields yet either.

**A minimal driver record.** `lib/garageDriverFields.ts` and
`mergeDriverCandidates` in `lib/rules.ts`. `IntakeState.drivers` is an array,
and each driver's name/DOB/license gets the same status/confidence/evidence/
conflict tracking as any other field — deliberately not a flat object, see
the README's design-choices section for why. A knockout flag
(`no_complete_driver`) fires if nobody on file has all three of name, DOB,
and license number, once business type is known. There's a read-only panel
for it now (`DriversPanel`).

## Driver record — what's still missing

- **Only handles one driver.** Everything merges into `drivers[0]`. Getting a
  second driver working means figuring out which utterance belongs to which
  person — probably by matching a name already on file, and starting a new
  record otherwise.
- **No editing.** You can see what got extracted but there's no way to
  confirm or correct a driver field yet — `FieldRow` has that for top-level
  fields, the nested driver shape doesn't have an equivalent.
- **Eval harness doesn't check drivers.** It only reads `state.fields`.
- Two rules from the training material aren't built: no personal auto policy
  should auto-set coverage to "business and personal use," and an
  out-of-state license should raise a flag recommending the driver switch to
  in-state.

## Coverage-line recommendation has no UI

`lib/garageCoverageRules.ts` already figures out which of the three coverage
lines apply (garage liability / garage keepers / dealers physical damage) and
it's in the JSON export, but nothing on screen shows it. Needs a panel next
to the risk flags and supplements ones.

## Most supplemental forms aren't wired up

4 of the 27 `GARAGE_SUP_*` forms trigger automatically right now — heavy
vehicle, towing, wholesale dealer, lessors risk. The rest (auto auction,
valet, salvage yard, young driver, hired & non-owned auto, and so on) need
fields added to the base catalog first, since there's nothing in the
conversation yet that would signal them. Same process as always: read the
real PDF, pick out what actually matters, add a trigger.

## Fields the base application is missing

All came out of the training material:

- Policy effective date — no field for it.
- Business address and phone — the `location` section exists in the type
  system, nothing uses it.
- Deductible.
- The vehicle-mix percentages should also cross-check against the
  service/repair revenue split, not just sum to 100 on their own — needs
  `dealer_plus_repair` support, which isn't scoped yet.
- Floor-plan financing. If the inventory's bank-financed, the lender has to
  be listed as loss payee — training calls this non-negotiable, and there's
  no field for it at all.
- Loss detail. Right now `prior_losses` is just a yes/no. Real underwriting
  wants the date, the amount, a description, and the prior carrier's
  premium.
- Optional coverages — wind/hail/flood, theft & vandalism, false pretense —
  none of these exist yet.

## No way to start a call from an existing document

Real Harper calls sometimes show up with a lead sheet already filled out —
one of the real call transcripts has a partner rep reading off the
customer's name, state, and coverage type before handing the call over.
Right now the engine only ever builds the record from the live conversation.
A document could feed the same extraction pipeline as one big chunk up
front, with everything landing as `needs_review` instead of `filled` — still
has to get confirmed live, just starts from something instead of nothing.

## Real telephony

`TranscriptSource` is the seam for this — `ManualTranscriptSource` and
`DeepgramLiveSource` both implement it today as local stand-ins. A version
that reads a real call's dual-channel Genesys feed would slot in the same
way, and it'd also fix the speaker-attribution problem for good, since each
party would just arrive on its own channel instead of getting guessed at
from one mixed stream.

## The confidence thresholds are guesses

`AUTO_FILL_THRESHOLD` (0.8) and `NEEDS_REVIEW_THRESHOLD` (0.55) were picked,
not measured. `npm run analyze-accuracy` exists to check them once there's
enough real feedback data — right now there isn't.

## The LLM extraction path hasn't been tested against real calls

The one real-call accuracy check that's happened so far used the mock
extractor against unscripted Harper audio, and it showed real problems —
misattributing the agent's own lines to the customer, mostly. That's about
what you'd expect from a demo heuristic. But it means nobody's actually
checked how the real `llm` extraction path does against messy real audio at
any volume, which is worth doing before trusting it.
