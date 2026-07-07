"use client";

import { NextBestQuestion } from "@/lib/types";

const CATEGORY_LABEL: Record<NextBestQuestion["category"], string> = {
  business_type: "Business type",
  conflict_resolution: "Resolve conflict",
  risk_followup: "Risk follow-up",
  talk_track_missing_field: "Talk track",
  low_confidence: "Confirm",
  recap: "Recap / wrap",
};

const CATEGORY_CLASS: Record<NextBestQuestion["category"], string> = {
  business_type: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  conflict_resolution: "bg-red-500/20 text-red-300 border-red-500/50",
  risk_followup: "bg-amber-500/20 text-amber-200 border-amber-500/50",
  talk_track_missing_field: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
  low_confidence: "bg-yellow-400/15 text-yellow-200 border-yellow-400/40",
  recap: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

const PRIORITY_CLASS: Record<NextBestQuestion["priority"], string> = {
  high: "bg-red-500/20 text-red-300",
  medium: "bg-yellow-400/15 text-yellow-200",
  low: "bg-emerald-500/15 text-emerald-300",
};

export default function NextQuestionCard({
  question,
  extractorMode,
}: {
  question: NextBestQuestion | null;
  extractorMode: "llm" | "mock" | null;
}) {
  return (
    <section className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/70 to-slate-900/80 p-5 shadow-lg shadow-indigo-950/40">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300/80">
          Ask Next
        </span>
        {question && (
          <>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_CLASS[question.category]}`}
            >
              {CATEGORY_LABEL[question.category]}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${PRIORITY_CLASS[question.priority]}`}
            >
              {question.priority}
            </span>
          </>
        )}
        {extractorMode && (
          <span className="ml-auto rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
            extractor: {extractorMode === "llm" ? "LLM" : "mock"}
          </span>
        )}
      </div>

      {question ? (
        <>
          <p className="text-lg font-semibold leading-snug text-white sm:text-xl">
            &ldquo;{question.question}&rdquo;
          </p>
          {question.whyWeAsk && (
            <p className="mt-2 text-sm text-indigo-200/80">
              <span className="font-semibold text-indigo-200">Why we ask: </span>
              {question.whyWeAsk}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">{question.reason}</p>
        </>
      ) : (
        <p className="text-slate-400">Add a transcript chunk to begin.</p>
      )}
    </section>
  );
}
