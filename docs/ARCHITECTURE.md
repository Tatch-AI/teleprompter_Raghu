# Architecture — teleprompter_Raghu (Garage Intake Copilot)

Evidence-based technical map for the platform rewrite. Chorograph annotations live in
`chorograph/architecture.ts`; render with `npx chorograph render . --no-open`.

## Stack and deploy

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript 5.7 |
| Styling | Tailwind CSS 3 |
| PDF | `pdf-lib` (client-side fill), `pdfjs-dist` (field discovery script) |
| Tests | Node `tsx` runner — `scripts/tests/*.test.ts` (offline, no API keys) |
| Deploy | **None** — local `npm run dev` only; superday artifact |

## Entrypoints

### HTTP routes (`app/api/`)

| Method | Path | Handler | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/process-chunk` | `app/api/process-chunk/route.ts` | Main intake pipeline: extract facts from one transcript utterance, run rules engine, return updated state + Ask Next |
| `POST` | `/api/correct-chunk` | `app/api/correct-chunk/route.ts` | Fix ASR mishear (proper nouns); re-extract from corrected text and merge via `processTranscriptCorrection` |
| `GET` | `/api/deepgram-token` | `app/api/deepgram-token/route.ts` | Mint short-lived Deepgram token (300s TTL) so browser never sees `DEEPGRAM_API_KEY` |
| `POST` | `/api/feedback` | `app/api/feedback/route.ts` | Append rep correction/acceptance event to `data/feedback.jsonl` |
| `GET` | `/api/feedback` | `app/api/feedback/route.ts` | Read back feedback events (dashboard/debug) |
| `GET` | `/api/export-pdf` | `app/api/export-pdf/route.ts` | Serve raw GARAGE_001 source PDF bytes from `garage_auto/forms/` for client-side fill |

### UI

| Route | File | Purpose |
| --- | --- | --- |
| `GET /` | `app/page.tsx` | Single-page copilot: transcript panel, Ask Next card, call guide, risk/validation/drivers/supplements panels, PDF/JSON export |

### CLI scripts (`package.json`)

| Script | File | Purpose |
| --- | --- | --- |
| `npm test` | `scripts/tests/*.test.ts` | Offline rules-engine tests (engine, coverage, validation, drivers, harperRules) |
| `npm run eval-accuracy` | `scripts/evalAccuracy.ts` | Score mock extractor against answer keys (`scripts/answerKeys/*.json`) |
| `npm run analyze-accuracy` | `scripts/analyzeAccuracy.ts` | Analyze extraction log for calibration data |
| `npm run synthesize-demo-audio` | `scripts/synthesizeDemoCalls.ts` | Generate TTS demo call audio (OpenAI TTS + ffmpeg) |
| `npm run discover-pdf-fields` | `scripts/discoverPdfFields.ts` | Discover AcroForm field names in GARAGE_001 |

No crons, no background workers, no Relay consumers.

## Core processing pipeline

Every text-producing input (manual chunk, live Deepgram utterance, demo script step) converges
on one path:

```
TranscriptSource (mic | file | manual)
  → POST /api/process-chunk
    → lib/processIntakeText.ts
      → lib/llmExtraction.ts::runExtraction (OpenAI or mock)
      → lib/extractionLog.ts::logExtractionEvents (fire-and-forget)
      → lib/rules.ts::processExtraction → recompute
  → { updatedState, nextBestQuestion, reasons, extractorMode }
```

**Extraction** (`lib/llmExtraction.ts`):

- With `OPENAI_API_KEY`: POST to OpenAI Chat Completions (`gpt-4o-mini` default, overridable via
  `OPENAI_MODEL`), strict JSON schema for `extractedFields`, `driverFields`, `potentialBusinessType`,
  `potentialConflicts`, `riskSignals`.
- Without key: deterministic keyword mock (`mockExtractFromChunk`) — full offline demo.
- Long text: `splitWithOverlap` + `mergeExtractionResults` for pasted documents (unused in live calls).

**Rules engine** (`lib/rules.ts` — ~950 lines):

- Normalization (numbers, booleans, enums) — never trusts LLM `normalizedValue` blindly.
- Field status machine: `missing` / `low_confidence` / `needs_review` / `filled` / `conflict`.
- Thresholds: `AUTO_FILL_THRESHOLD` 0.8, `NEEDS_REVIEW_THRESHOLD` 0.55.
- Conflict detection, risk flags (`garageRiskRules.ts`), validation constraints
  (`garageValidationRules.ts` — percent groups must sum to 100), supplemental forms
  (`garageSupplementRules.ts`), coverage lines (`garageCoverageRules.ts`), driver merge
  (`garageDriverFields.ts`), Ask-Next priority (`selectNextBestQuestion`).

**Live ASR** (`lib/deepgramSource.ts`):

- `DeepgramLiveSource` implements `TranscriptSource`.
- Fetches token from `/api/deepgram-token`, opens `wss://api.deepgram.com/v1/listen`.
- Mic mode: `getUserMedia` + `MediaRecorder` (opus/webm).
- File mode: decode to linear16 PCM, stream paced to real time.
- Utterance boundaries: speaker change or 1s silence; interim transcripts discarded.
- Diarization maps first voice → agent (configurable), second → customer.

## Data

### In-memory (per browser session)

`IntakeState` (`lib/types.ts`) held in React state on `app/page.tsx`:

- `intakeId`, `businessType`, `generation`
- `fields: Record<fieldId, FieldState>` — ~30 curated GARAGE fields
- `drivers: DriverRecord[]` — currently one driver (`drivers[0]`)
- `transcriptChunks[]`, `conflicts[]`, `riskFlags[]`, `validationIssues[]`
- `suggestedSupplements[]`, `recommendedCoverageLines[]`, `talkTrackProgress[]`

No server-side session store; each API call receives `currentState` in the request body.

### Local filesystem (server-side, git-ignored `data/`)

| File | Writer | Contents |
| --- | --- | --- |
| `data/feedback.jsonl` | `POST /api/feedback` | Rep corrections: `{fieldId, action, machineValue, correctedValue, confidence, evidenceQuote, extractorMode}` |
| `data/extraction_events.jsonl` | `lib/extractionLog.ts` | One line per extraction candidate per chunk (calibration telemetry) |
| `data/transcript_corrections.jsonl` | `lib/transcriptCorrectionLog.ts` | ASR fix pairs: original vs corrected transcript text |

### Static assets (git-ignored)

| Path | Purpose |
| --- | --- |
| `garage_auto/forms/GARAGE_001_Garage_Liability_Application.pdf` | Source AcroForm (998 fields) |
| `garage_auto/audio/` | Real sample call recordings (PII) |
| `public/demo-audio/*.mp3` | Synthesized demo calls (generated by `npm run synthesize-demo-audio`) |

### Field catalog

`lib/garageFieldDefinitions.ts` — ~30 fields selected from GARAGE_001 for conversational
relevance (not a schema mirror). Sections: business identity, operations, coverage intent,
underwriting risk, drivers, premises, vehicles, history.

`lib/garage001PdfFieldMap.ts` — hand-mapped subset (22 fields) to AcroForm field names for
PDF export.

## Events

**None.** No Kafka/Relay topics, no legacy eventbus. This is a standalone local prototype.

## External services

| Service | Where used | Why |
| --- | --- | --- |
| **OpenAI** | `lib/llmExtraction.ts`, `scripts/synthesizeDemoCalls.ts` | Structured field extraction from transcript chunks; optional TTS for demo audio |
| **Deepgram** | `lib/deepgramSource.ts`, `app/api/deepgram-token/route.ts` | Live streaming ASR with diarization and garage keyterm boosting (`garageKeyterms.ts`) |

Future (documented, not implemented): **Genesys-Cloud** dual-channel telephony via a
`TranscriptSource` implementation (`futurescope.md`).

## Key flows

### 1. Scripted demo (no API keys)

Agent clicks "Simulate next line" → `processChunk` → mock extractor matches keywords → rules
engine updates fields → Ask Next advances through talk track. Two demos: Valley Auto, Dexter's
Auto (`lib/mockTranscript.ts`).

### 2. Live call with Deepgram + OpenAI

Agent clicks "Go live (mic)" → token minted → WebSocket ASR → utterance flushed →
`processLiveChunk` (serialized queue + requestSeq guard) → LLM extraction → rules recompute →
UI updates in real time.

### 3. Conflict resolution

Two extractions disagree on a field → status `conflict` → `ConflictBanner` → rep chooses
Use new / Keep old / Manual → `resolveConflict` in rules → feedback logged.

### 4. PDF export

Client calls `fillRealApplicationPdf` → fetches source PDF from `/api/export-pdf` → maps
`intakeState.fields` through `GARAGE_001_PDF_FIELD_MAP` → `pdf-lib` fill → browser download.
~73% field coverage; 8 conversational-only fields intentionally unmapped.

### 5. Transcript correction

Rep edits misheard chunk text → `POST /api/correct-chunk` → re-extract →
`processTranscriptCorrection` replaces chunk and re-merges fields → logs correction pair.

## Config / environment

From `.env.example` (copy to `.env.local`):

| Variable | Required for | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Real LLM extraction, TTS demo audio | Mock extractor used when unset |
| `OPENAI_MODEL` | LLM model override | `gpt-4o-mini` |
| `OPENAI_TTS_MODEL` | Demo audio synthesis | `tts-1` |
| `DEEPGRAM_API_KEY` | Live mic / file streaming | Feature disabled when unset; needs Owner/Admin scope for `/v1/auth/grant` |
| `DEEPGRAM_PROJECT_ID` | Fallback key minting if grant endpoint fails | Optional |

## Testing

```bash
npm test              # 5 test files, offline, no keys
npm run eval-accuracy # mock extractor vs answer keys (20/20 on both demos)
npx tsc --noEmit
npm run build
```

Harper-specific underwriting rules tested in `scripts/tests/harperRules.test.ts` (Colony
Garage Application GAR-APP121-0525): min 15 vehicles/year, 3yr owner experience, plate-to-driver
ratio, dealer license, titles transfer promptly, sales mix percent groups.
