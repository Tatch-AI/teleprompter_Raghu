// CHOROGRAPH-ARCHITECTURE: this repo's own nodes and edges. Next.js TypeScript codebase;
// annotations are free-standing doc comments naming the implementing path. Included in both
// the per-repo render and the estate-wide render (unlike anchor.ts).

/**
 * Candidate superday prototype: a live intake teleprompter for garage / auto-dealer liability
 * calls. While the customer talks, it autofills the GARAGE_001 application, surfaces knockout
 * and appetite risk flags, recommends supplemental forms and coverage lines, and tells the agent
 * what to ask next. The LLM only extracts candidate facts with evidence; a deterministic rules
 * engine owns all workflow decisions. Local Next.js dev server only; not deployed to prod.
 * @service teleprompter-raghu in:Intake tech:"Next.js 15, React 19, TypeScript" tags:superday
 */

/**
 * Single-page copilot UI: transcript panel, Ask Next card, call guide with live field autofill,
 * conflict banner, risk/validation/drivers/supplements panels, PDF and JSON export.
 * app/page.tsx.
 * @endpoint GET /
 */

/**
 * Main intake pipeline: one transcript utterance → LLM/mock extraction → deterministic rules
 * engine → updated IntakeState + Ask Next. app/api/process-chunk/route.ts.
 * @endpoint POST /api/process-chunk
 * @calls process-intake-text shared extraction + rules path for every input modality
 */

/**
 * Fix ASR mishear on a prior chunk (mainly proper nouns); re-extract and merge via
 * processTranscriptCorrection. app/api/correct-chunk/route.ts.
 * @endpoint POST /api/correct-chunk
 * @calls run-extraction re-run LLM/mock on corrected transcript text
 * @writes extraction-log every candidate from the corrected re-extraction pass
 * @writes transcript-correction-log original vs corrected ASR text pair
 */

/**
 * Mint a short-lived Deepgram token so the browser WebSocket never sees DEEPGRAM_API_KEY.
 * app/api/deepgram-token/route.ts.
 * @endpoint GET /api/deepgram-token
 * @calls Deepgram POST /v1/auth/grant ephemeral 300s access token
 */

/**
 * Append a rep correction or acceptance event for future threshold calibration.
 * app/api/feedback/route.ts POST handler.
 * @endpoint POST /api/feedback
 * @writes feedback-store machine vs corrected value pairs with confidence and evidence
 */

/**
 * Read back persisted feedback events for dashboard or verification.
 * app/api/feedback/route.ts GET handler.
 * @endpoint GET /api/feedback
 * @reads feedback-store
 */

/**
 * Serve the raw GARAGE_001 AcroForm PDF bytes for client-side fill via pdf-lib.
 * app/api/export-pdf/route.ts.
 * @endpoint GET /api/export-pdf
 */

/**
 * Shared pipeline for every text-producing input feed: extract facts, log candidates,
 * run rules engine. lib/processIntakeText.ts.
 * @fn process-intake-text of:teleprompter-raghu
 * @calls run-extraction one LLM or mock inference pass per utterance
 * @calls rules-engine merge candidates, detect conflicts, select Ask Next
 * @writes extraction-log fire-and-forget append of every extraction candidate
 */

/**
 * Single inference pass returning candidate facts with evidence quotes — no workflow decisions.
 * Falls back to deterministic mock when OPENAI_API_KEY is unset. lib/llmExtraction.ts.
 * @fn run-extraction of:teleprompter-raghu
 * @calls OpenAI Chat Completions structured JSON extraction from transcript chunk
 */

/**
 * Deterministic workflow engine: normalization, field status, conflicts, risk flags, validation
 * constraints, supplemental forms, coverage lines, driver merge, and Ask-Next priority.
 * lib/rules.ts.
 * @fn rules-engine of:teleprompter-raghu
 */

/**
 * Live speech → Deepgram streaming ASR → utterance chunks. Implements TranscriptSource for
 * mic and file-replay modes. lib/deepgramSource.ts.
 * @fn deepgram-live-source of:teleprompter-raghu
 * @calls Deepgram wss://api.deepgram.com/v1/listen live transcription with diarization
 * @calls GET /api/deepgram-token mint browser-safe ephemeral credential
 */

/**
 * Client-side fill of the real GARAGE_001 PDF from accumulated field state via pdf-lib.
 * lib/exportPdf.ts → fillRealApplicationPdf.
 * @fn fill-real-application-pdf of:teleprompter-raghu
 * @calls GET /api/export-pdf fetch source AcroForm bytes from garage_auto/forms/
 */

/**
 * Append-only rep correction and acceptance events for confidence-threshold calibration.
 * data/feedback.jsonl via app/api/feedback/route.ts. Git-ignored; may contain PII.
 * @cache feedback-store in:Intake tech:"local JSONL file"
 */

/**
 * Append-only log of every extraction candidate per chunk — not just the latest per field.
 * data/extraction_events.jsonl via lib/extractionLog.ts. Git-ignored.
 * @cache extraction-log in:Intake tech:"local JSONL file"
 */

/**
 * Append-only ASR correction pairs (original vs rep-corrected transcript text).
 * data/transcript_corrections.jsonl via lib/transcriptCorrectionLog.ts. Git-ignored.
 * @cache transcript-correction-log in:Intake tech:"local JSONL file"
 */
