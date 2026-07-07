"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import NextQuestionCard from "@/components/NextQuestionCard";
import TranscriptPanel from "@/components/TranscriptPanel";
import ApplicationPanel from "@/components/ApplicationPanel";
import ConflictBanner from "@/components/ConflictBanner";
import RiskFlagsPanel from "@/components/RiskFlagsPanel";
import PendingStepsPanel from "@/components/PendingStepsPanel";
import DebugJsonPanel from "@/components/DebugJsonPanel";
import { createInitialIntakeState } from "@/lib/initialState";
import {
  acknowledgeRisk as ackRisk,
  confirmField as confirmFieldRule,
  getApplicableFieldDefinitions,
  getApplicableSteps,
  resolveConflict as resolveConflictRule,
} from "@/lib/rules";
import { IntakeState, NextBestQuestion, ProcessChunkResponse } from "@/lib/types";
import { MOCK_TRANSCRIPT_CHUNKS } from "@/lib/mockTranscript";

export default function HomePage() {
  const [intakeState, setIntakeState] = useState<IntakeState>(() => createInitialIntakeState());
  const [nextQuestion, setNextQuestion] = useState<NextBestQuestion | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [extractorMode, setExtractorMode] = useState<"llm" | "mock" | null>(null);
  const [mockIndex, setMockIndex] = useState(0);
  const [nextSpeaker, setNextSpeaker] = useState<"agent" | "customer">("customer");
  const [banner, setBanner] = useState<string | null>(null);

  // Sequence guard: only the most recent in-flight request may apply its result.
  const requestSeq = useRef(0);

  const businessType = intakeState.businessType;
  const applicableDefs = useMemo(
    () => getApplicableFieldDefinitions(businessType),
    [businessType],
  );
  const applicableSteps = useMemo(() => getApplicableSteps(businessType), [businessType]);

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
    if (mockIndex >= MOCK_TRANSCRIPT_CHUNKS.length) return;
    const chunk = MOCK_TRANSCRIPT_CHUNKS[mockIndex];
    setMockIndex((i) => i + 1);
    void processChunk(chunk.text, chunk.speaker);
  }, [mockIndex, processChunk]);

  const handleReset = useCallback(() => {
    requestSeq.current++;
    setIntakeState(createInitialIntakeState());
    setNextQuestion(null);
    setReasons([]);
    setDraft("");
    setIsProcessing(false);
    setExtractorMode(null);
    setMockIndex(0);
    setNextSpeaker("customer");
    setBanner(null);
  }, []);

  const handleConfirm = useCallback(
    (fieldId: string) => applyLocal(confirmFieldRule(intakeState, fieldId)),
    [applyLocal, intakeState],
  );

  const handleResolveConflict = useCallback(
    (fieldId: string, choice: "new" | "old" | "manual", manualValue?: string) =>
      applyLocal(resolveConflictRule(intakeState, fieldId, choice, manualValue)),
    [applyLocal, intakeState],
  );

  const handleAcknowledgeRisk = useCallback(
    (ruleId: string) => applyLocal(ackRisk(intakeState, ruleId)),
    [applyLocal, intakeState],
  );

  const hasMoreMock = mockIndex < MOCK_TRANSCRIPT_CHUNKS.length;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Garage Intake Copilot</h1>
          <p className="mt-1 text-sm text-slate-400">
            Preemptive teleprompter + application autofill for GARAGE_001. The transcript is only
            the input feed — deterministic rules drive Ask&nbsp;Next.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {banner && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {banner}
        </div>
      )}

      <div className="mb-4">
        <NextQuestionCard question={nextQuestion} extractorMode={extractorMode} />
      </div>

      <ConflictBanner conflicts={intakeState.conflicts} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(320px,0.85fr)_minmax(360px,1.15fr)]">
        <div className="flex flex-col gap-4">
          <div className="h-[440px]">
            <TranscriptPanel
              chunks={intakeState.transcriptChunks}
              draft={draft}
              onDraftChange={setDraft}
              onProcess={handleProcess}
              onSimulate={handleSimulate}
              isProcessing={isProcessing}
              hasMoreMock={hasMoreMock}
              nextSpeaker={nextSpeaker}
              onSpeakerChange={setNextSpeaker}
            />
          </div>
          <PendingStepsPanel
            steps={applicableSteps}
            state={intakeState}
            activeStepId={nextQuestion?.stepId}
          />
          <RiskFlagsPanel flags={intakeState.riskFlags} onAcknowledge={handleAcknowledgeRisk} />
        </div>

        <div className="h-[900px] lg:h-auto">
          <ApplicationPanel
            applicableDefs={applicableDefs}
            fields={intakeState.fields}
            businessType={businessType}
            completeness={completeness}
            onConfirm={handleConfirm}
            onResolveConflict={handleResolveConflict}
          />
        </div>
      </div>

      <div className="mt-4">
        <DebugJsonPanel state={intakeState} reasons={reasons} visible={showDebug} />
      </div>
    </main>
  );
}
