"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import NextQuestionCard from "@/components/NextQuestionCard";
import TranscriptPanel from "@/components/TranscriptPanel";
import CallGuidePanel from "@/components/CallGuidePanel";
import ConflictBanner from "@/components/ConflictBanner";
import RiskFlagsPanel from "@/components/RiskFlagsPanel";
import ValidationPanel from "@/components/ValidationPanel";
import DriversPanel from "@/components/DriversPanel";
import SupplementsPanel from "@/components/SupplementsPanel";
import DebugJsonPanel from "@/components/DebugJsonPanel";
import FeedbackPanel from "@/components/FeedbackPanel";
import { createInitialIntakeState } from "@/lib/initialState";
import {
  acknowledgeRisk as ackRisk,
  acknowledgeSupplement as ackSupplement,
  confirmField as confirmFieldRule,
  editField as editFieldRule,
  getApplicableFieldDefinitions,
  resolveConflict as resolveConflictRule,
} from "@/lib/rules";
import { buildFeedbackEvent, persistFeedback } from "@/lib/feedback";
import { fillRealApplicationPdf, buildSubmissionRecord, downloadJson, downloadPdf } from "@/lib/exportPdf";
import { DeepgramLiveSource, DeepgramStatus, LiveInput } from "@/lib/deepgramSource";
import {
  CorrectionAction,
  FeedbackEvent,
  IntakeState,
  NextBestQuestion,
  ProcessChunkResponse,
} from "@/lib/types";
import { DEMO_TRANSCRIPTS } from "@/lib/mockTranscript";

// Diarization only tells voices apart, not roles. Real intake calls are
// answered by the rep, so the rep is assumed to speak first rather than
// exposing this as a per-call setting.
const FIRST_SPEAKER = "agent" as const;

export default function HomePage() {
  const [intakeState, setIntakeState] = useState<IntakeState>(() => createInitialIntakeState());
  const [nextQuestion, setNextQuestion] = useState<NextBestQuestion | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [extractorMode, setExtractorMode] = useState<"llm" | "mock" | null>(null);
  const [mockIndex, setMockIndex] = useState(0);
  const [demoId, setDemoId] = useState(DEMO_TRANSCRIPTS[0].id);
  const [nextSpeaker, setNextSpeaker] = useState<"agent" | "customer">("customer");
  const [banner, setBanner] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEvent[]>([]);
  const [liveStatus, setLiveStatus] = useState<DeepgramStatus>("idle");
  const [liveDetail, setLiveDetail] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const activeDemo = useMemo(
    () => DEMO_TRANSCRIPTS.find((d) => d.id === demoId) ?? DEMO_TRANSCRIPTS[0],
    [demoId],
  );
  const activeChunks = activeDemo.chunks;

  // Sequence guard: only the most recent in-flight request may apply its result.
  const requestSeq = useRef(0);
  // Always-fresh state for the live path (subscribe callbacks capture stale closures).
  const stateRef = useRef(intakeState);
  stateRef.current = intakeState;
  // Serialize live chunks so overlapping utterances merge in order (no dropped state).
  const liveQueue = useRef<Promise<void>>(Promise.resolve());
  const liveSource = useRef<DeepgramLiveSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const businessType = intakeState.businessType;
  const applicableDefs = useMemo(
    () => getApplicableFieldDefinitions(businessType),
    [businessType],
  );

  const completeness = useMemo(() => {
    const required = applicableDefs.filter((d) => d.required);
    const filled = required.filter((d) => intakeState.fields[d.id]?.status === "filled").length;
    return { filled, total: required.length };
  }, [applicableDefs, intakeState.fields]);

  const applyLocal = useCallback(
    (result: { state: IntakeState; nextBestQuestion: NextBestQuestion; reasons: string[] }) => {
      setIntakeState(result.state);
      setNextQuestion(result.nextBestQuestion);
      setReasons(result.reasons);
    },
    [],
  );

  const processChunk = useCallback(
    async (text: string, speaker: "agent" | "customer") => {
      if (!text.trim()) return;
      setIsProcessing(true);
      setBanner(null);
      const seq = ++requestSeq.current;
      try {
        const response = await fetch("/api/process-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptChunkText: text,
            speaker,
            currentState: intakeState,
          }),
        });
        const data = (await response.json()) as ProcessChunkResponse & { extractionError?: boolean };
        // Drop stale responses (a newer request already superseded this one).
        if (seq !== requestSeq.current) return;
        if (!response.ok) {
          setBanner("Something went wrong processing that chunk.");
          return;
        }
        setIntakeState(data.updatedState);
        setNextQuestion(data.nextBestQuestion);
        setReasons(data.reasons);
        setExtractorMode(data.extractorMode);
        if (data.extractionError) {
          setBanner("Extraction hiccuped — no fields changed. Try that chunk again.");
        }
      } catch {
        if (seq === requestSeq.current) setBanner("Network error — the chunk was not processed.");
      } finally {
        if (seq === requestSeq.current) setIsProcessing(false);
      }
    },
    [intakeState],
  );

  const handleProcess = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    void processChunk(text, nextSpeaker).then(() => setDraft(""));
  }, [draft, nextSpeaker, processChunk]);

  const handleSimulate = useCallback(() => {
    if (mockIndex >= activeChunks.length) return;
    const chunk = activeChunks[mockIndex];
    setMockIndex((i) => i + 1);
    void processChunk(chunk.text, chunk.speaker);
  }, [mockIndex, activeChunks, processChunk]);

  // Fixes what ASR actually heard (mainly proper nouns — business/owner names) rather
  // than an extracted field's value. Re-runs extraction on the corrected text server-side
  // so any fields the bad transcription broke get fixed too, guarded by the same
  // requestSeq pattern as every other state-mutating request.
  const handleCorrectChunk = useCallback(
    async (chunkId: string, correctedText: string) => {
      setIsProcessing(true);
      setBanner(null);
      const seq = ++requestSeq.current;
      try {
        const response = await fetch("/api/correct-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunkId, correctedText, currentState: intakeState }),
        });
        const data = (await response.json()) as ProcessChunkResponse & { error?: string };
        if (seq !== requestSeq.current) return;
        if (!response.ok) {
          setBanner(data.error ?? "Could not correct that chunk.");
          return;
        }
        setIntakeState(data.updatedState);
        setNextQuestion(data.nextBestQuestion);
        setReasons(data.reasons);
        setExtractorMode(data.extractorMode);
      } catch {
        if (seq === requestSeq.current) setBanner("Network error — the correction was not applied.");
      } finally {
        if (seq === requestSeq.current) setIsProcessing(false);
      }
    },
    [intakeState],
  );

  const handleReset = useCallback(() => {
    // Bump the shared sequence guard first so any in-flight response — manual
    // or live — is dropped instead of resurrecting stale fields after reset.
    requestSeq.current++;
    if (liveSource.current) {
      void liveSource.current.stop();
      liveSource.current = null;
      setLiveStatus("idle");
      setLiveDetail(null);
    }
    const initial = createInitialIntakeState();
    stateRef.current = initial;
    setIntakeState(initial);
    setNextQuestion(null);
    setReasons([]);
    setDraft("");
    setIsProcessing(false);
    setExtractorMode(null);
    setMockIndex(0);
    setNextSpeaker("customer");
    setBanner(null);
    setFeedback([]);
  }, []);

  const handleDemoChange = useCallback(
    (id: string) => {
      if (id === demoId) return;
      setDemoId(id);
      handleReset();
    },
    [demoId, handleReset],
  );

  const recordFeedback = useCallback(
    (before: IntakeState, fieldId: string, action: CorrectionAction, correctedValue: unknown) => {
      const event = buildFeedbackEvent(before, fieldId, action, correctedValue, extractorMode);
      if (!event) return;
      setFeedback((prev) => [...prev, event]);
      void persistFeedback(event);
    },
    [extractorMode],
  );

  const handleConfirm = useCallback(
    (fieldId: string) => {
      const before = intakeState;
      const result = confirmFieldRule(before, fieldId);
      applyLocal(result);
      recordFeedback(before, fieldId, "accept", result.state.fields[fieldId]?.value);
    },
    [applyLocal, intakeState, recordFeedback],
  );

  const handleEdit = useCallback(
    (fieldId: string, value: string) => {
      const before = intakeState;
      const result = editFieldRule(before, fieldId, value);
      applyLocal(result);
      recordFeedback(before, fieldId, "edit", result.state.fields[fieldId]?.value);
    },
    [applyLocal, intakeState, recordFeedback],
  );

  const handleResolveConflict = useCallback(
    (fieldId: string, choice: "new" | "old" | "manual", manualValue?: string) => {
      const before = intakeState;
      const result = resolveConflictRule(before, fieldId, choice, manualValue);
      applyLocal(result);
      recordFeedback(before, fieldId, "resolve_conflict", result.state.fields[fieldId]?.value);
    },
    [applyLocal, intakeState, recordFeedback],
  );

  const handleAcknowledgeRisk = useCallback(
    (ruleId: string) => applyLocal(ackRisk(intakeState, ruleId)),
    [applyLocal, intakeState],
  );

  const handleAcknowledgeSupplement = useCallback(
    (ruleId: string) => applyLocal(ackSupplement(intakeState, ruleId)),
    [applyLocal, intakeState],
  );

  // Live transcript chunks are chained so each POST sees the latest merged
  // state, and each request is stamped with the same requestSeq guard the
  // manual path uses — a Reset or a manual chunk submitted while a live
  // request is in flight bumps requestSeq, so the live response is dropped
  // instead of overwriting freshly-reset (or newer) state.
  const processLiveChunk = useCallback((text: string, speaker: "agent" | "customer" | "unknown") => {
    if (!text.trim()) return;
    liveQueue.current = liveQueue.current.then(async () => {
      const seq = ++requestSeq.current;
      try {
        const response = await fetch("/api/process-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcriptChunkText: text,
            speaker,
            currentState: stateRef.current,
          }),
        });
        const data = (await response.json()) as ProcessChunkResponse;
        if (seq !== requestSeq.current) return; // superseded by reset/newer request
        if (!response.ok) return;
        stateRef.current = data.updatedState;
        setIntakeState(data.updatedState);
        setNextQuestion(data.nextBestQuestion);
        setReasons(data.reasons);
        setExtractorMode(data.extractorMode);
      } catch {
        if (seq === requestSeq.current) {
          setBanner("Live transcription: failed to process a segment.");
        }
      }
    });
  }, []);

  const startLive = useCallback(
    async (input: LiveInput) => {
      if (liveSource.current) {
        await liveSource.current.stop();
        liveSource.current = null;
      }
      const source = new DeepgramLiveSource((status, detail) => {
        setLiveStatus(status);
        setLiveDetail(detail ?? null);
      });
      source.subscribe((chunk) => processLiveChunk(chunk.text, chunk.speaker ?? "unknown"));
      liveSource.current = source;
      try {
        await source.start(input, { firstSpeaker: FIRST_SPEAKER });
      } catch {
        liveSource.current = null;
      }
    },
    [processLiveChunk],
  );

  const handleToggleLive = useCallback(async () => {
    if (liveSource.current) {
      await liveSource.current.stop();
      liveSource.current = null;
      setLiveStatus("idle");
      return;
    }
    await startLive({ kind: "mic" });
  }, [startLive]);

  const handleStreamFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      await startLive({ kind: "file", file });
    },
    [startLive],
  );

  // Streams the pre-generated TTS audio for the selected demo through the
  // same file-replay path as a real uploaded recording — real ASR end to
  // end, no scripted text pushed directly into the engine. Generate the
  // audio once via `npm run synthesize-demo-audio`.
  const handlePlaySynthesizedCall = useCallback(async () => {
    try {
      const res = await fetch(`/demo-audio/${activeDemo.id}.mp3`, { cache: "no-store" });
      if (!res.ok) {
        setBanner(
          `No synthesized audio for "${activeDemo.label}" yet. Run \`npm run synthesize-demo-audio\` (requires OPENAI_API_KEY + ffmpeg) to generate it.`,
        );
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], `${activeDemo.id}.mp3`, { type: "audio/mpeg" });
      await startLive({ kind: "file", file });
    } catch {
      setBanner("Could not load the synthesized call audio.");
    }
  }, [activeDemo, startLive]);

  const handleDownloadPdf = useCallback(async () => {
    setIsExporting(true);
    try {
      const bytes = await fillRealApplicationPdf(applicableDefs, intakeState.fields, businessType);
      downloadPdf(bytes, `garage-application-${intakeState.intakeId ?? "draft"}.pdf`);
    } catch {
      setBanner("Could not generate the application PDF.");
    } finally {
      setIsExporting(false);
    }
  }, [applicableDefs, intakeState, businessType]);

  const handleDownloadJson = useCallback(() => {
    try {
      const record = buildSubmissionRecord(applicableDefs, intakeState);
      downloadJson(record, `garage-submission-${intakeState.intakeId ?? "draft"}.json`);
    } catch {
      setBanner("Could not generate the submission JSON.");
    }
  }, [applicableDefs, intakeState]);

  const liveActive =
    liveStatus === "listening" || liveStatus === "connecting" || liveStatus === "streaming";
  const hasMoreMock = mockIndex < activeChunks.length;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Garage Intake Copilot</h1>
          <p className="mt-1 text-sm text-slate-400">
            Call guide + application autofill for GARAGE_001. The transcript is only the input
            feed — deterministic rules drive Ask&nbsp;Next.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.webm"
            className="hidden"
            onChange={(e) => {
              void handleStreamFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => void handleToggleLive()}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
              liveActive
                ? "border-red-500/50 bg-red-500/15 text-red-200 hover:bg-red-500/25"
                : "border-slate-600/60 bg-slate-800/70 text-slate-200 hover:bg-slate-700/70"
            }`}
            title="Real microphone input — an actual live call, not a replayed recording"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                liveActive ? "animate-pulse bg-red-400" : "bg-slate-500"
              }`}
            />
            {liveActive ? "Stop live" : "Go live (mic)"}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={liveActive}
            className="rounded-xl border border-slate-600/60 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/70 disabled:opacity-50"
            title="Stream a call recording to Deepgram in real time"
          >
            Stream recording
          </button>
          <button
            onClick={() => void handlePlaySynthesizedCall()}
            disabled={liveActive}
            className="rounded-xl border border-purple-500/40 bg-purple-500/15 px-3 py-2 text-sm font-medium text-purple-200 hover:bg-purple-500/25 disabled:opacity-50"
            title={`Stream the TTS-synthesized "${activeDemo.label}" call through real Deepgram ASR (npm run synthesize-demo-audio)`}
          >
            Play live call
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isExporting}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {isExporting ? "Generating…" : "Download PDF"}
          </button>
          <button
            onClick={handleDownloadJson}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25"
            title="Structured submission record — the machine-readable artifact of record, not just the human-readable PDF"
          >
            Download JSON
          </button>
          <button
            onClick={() => setShowDebug((v) => !v)}
            className="rounded-xl border border-slate-600/60 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/70"
          >
            {showDebug ? "Hide debug" : "Debug JSON"}
          </button>
          <button
            onClick={handleReset}
            className="rounded-xl border border-slate-600/60 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700/70"
          >
            Reset demo
          </button>
        </div>
      </header>

      {liveStatus !== "idle" && (
        <div
          className={`mb-4 rounded-xl border px-4 py-2 text-sm ${
            liveStatus === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-sky-500/40 bg-sky-500/10 text-sky-200"
          }`}
        >
          {liveStatus === "connecting" && "Connecting to Deepgram…"}
          {liveStatus === "listening" && "● Live — listening to the call. Speak and fields autofill."}
          {liveStatus === "streaming" && "● Streaming recording to Deepgram — fields autofill in real time."}
          {liveStatus === "stopped" && "Live session ended."}
          {liveStatus === "error" && (liveDetail ?? "Live transcription unavailable.")}
        </div>
      )}

      {banner && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {banner}
        </div>
      )}

      <div className="mb-4">
        <NextQuestionCard question={nextQuestion} />
      </div>

      <ConflictBanner conflicts={intakeState.conflicts} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(280px,1fr)_minmax(280px,1fr)]">
        <div className="h-[440px] lg:col-span-1">
          <TranscriptPanel
            chunks={intakeState.transcriptChunks}
            draft={draft}
            onDraftChange={setDraft}
            onProcess={handleProcess}
            onSimulate={handleSimulate}
            onCorrectChunk={handleCorrectChunk}
            isProcessing={isProcessing}
            hasMoreMock={hasMoreMock}
            nextSpeaker={nextSpeaker}
            onSpeakerChange={setNextSpeaker}
            demos={DEMO_TRANSCRIPTS}
            activeDemoId={demoId}
            onDemoChange={handleDemoChange}
            demoProgress={{ played: mockIndex, total: activeChunks.length }}
          />
        </div>
        <RiskFlagsPanel flags={intakeState.riskFlags} onAcknowledge={handleAcknowledgeRisk} />
        <ValidationPanel issues={intakeState.validationIssues} />
        <DriversPanel drivers={intakeState.drivers} />
        <SupplementsPanel
          supplements={intakeState.suggestedSupplements}
          onAcknowledge={handleAcknowledgeSupplement}
        />
      </div>

      <div className="mt-4">
        <CallGuidePanel
          applicableDefs={applicableDefs}
          fields={intakeState.fields}
          businessType={businessType}
          completeness={completeness}
          onConfirm={handleConfirm}
          onResolveConflict={handleResolveConflict}
          onEdit={handleEdit}
        />
      </div>

      <div className="mt-4">
        <FeedbackPanel events={feedback} />
      </div>

      <div className="mt-4">
        <DebugJsonPanel state={intakeState} reasons={reasons} visible={showDebug} />
      </div>
    </main>
  );
}
