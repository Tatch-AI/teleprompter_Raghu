"use client";

import { TranscriptChunk } from "@/lib/types";
import { DemoTranscript } from "@/lib/mockTranscript";

export default function TranscriptPanel({
  chunks,
  draft,
  onDraftChange,
  onProcess,
  onSimulate,
  isProcessing,
  hasMoreMock,
  nextSpeaker,
  onSpeakerChange,
  demos,
  activeDemoId,
  onDemoChange,
  demoProgress,
}: {
  chunks: TranscriptChunk[];
  draft: string;
  onDraftChange: (value: string) => void;
  onProcess: () => void;
  onSimulate: () => void;
  isProcessing: boolean;
  hasMoreMock: boolean;
  nextSpeaker: "agent" | "customer";
  onSpeakerChange: (speaker: "agent" | "customer") => void;
  demos: DemoTranscript[];
  activeDemoId: string;
  onDemoChange: (id: string) => void;
  demoProgress: { played: number; total: number };
}) {
  const activeDemo = demos.find((d) => d.id === activeDemoId) ?? demos[0];
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Live conversation</h2>
        <span className="text-xs text-slate-500">{chunks.length} chunk(s)</span>
      </header>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {chunks.length === 0 && (
          <p className="text-sm text-slate-500">
            No conversation yet. Paste a chunk or simulate the demo call.
          </p>
        )}
        {chunks.map((chunk) => (
          <div
            key={chunk.id}
            className={`rounded-xl px-3 py-2 text-sm ${
              chunk.speaker === "agent"
                ? "ml-6 bg-indigo-500/10 text-indigo-100"
                : "mr-6 bg-slate-800/70 text-slate-100"
            }`}
          >
            <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {chunk.speaker ?? "customer"}
            </div>
            {chunk.text}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-slate-700/60 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Demo call:</span>
          <select
            value={activeDemoId}
            onChange={(e) => onDemoChange(e.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
          >
            {demos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="text-slate-500">
            {demoProgress.played}/{demoProgress.total} played
          </span>
        </div>
        {activeDemo?.description && (
          <p className="text-[11px] leading-snug text-slate-500">{activeDemo.description}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Speaker:</span>
          {(["customer", "agent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onSpeakerChange(s)}
              className={`rounded-full px-2.5 py-0.5 font-medium capitalize ${
                nextSpeaker === s
                  ? "bg-indigo-500/30 text-indigo-100"
                  : "bg-slate-800/70 text-slate-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Type or paste what the customer just said…"
          rows={3}
          className="scroll-thin w-full resize-none rounded-xl border border-slate-700/60 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500/60"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onProcess();
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={onProcess}
            disabled={isProcessing || !draft.trim()}
            className="flex-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isProcessing ? "Processing…" : "Process chunk"}
          </button>
          <button
            onClick={onSimulate}
            disabled={isProcessing || !hasMoreMock}
            className="rounded-xl border border-slate-600/60 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {hasMoreMock ? "Simulate next" : "End of script"}
          </button>
        </div>
      </div>
    </section>
  );
}
