"use client";

import { FeedbackEvent } from "@/lib/types";
import { formatFieldValue } from "@/lib/formatters";

const ACTION_LABEL: Record<FeedbackEvent["action"], string> = {
  accept: "Accepted",
  edit: "Edited",
  resolve_conflict: "Resolved",
};

export default function FeedbackPanel({ events }: { events: FeedbackEvent[] }) {
  const corrections = events.filter((e) => e.changed).length;

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Rep feedback</h2>
        <span className="text-xs text-slate-500">
          {events.length} event(s) · {corrections} correction(s)
        </span>
      </header>
      <div className="scroll-thin max-h-64 space-y-2 overflow-y-auto p-3">
        {events.length === 0 && (
          <p className="px-1 text-sm text-slate-500">
            Confirm, edit, or resolve a field to capture training feedback.
          </p>
        )}
        {[...events].reverse().map((e) => (
          <div
            key={e.id}
            className={`rounded-xl border px-3 py-2 text-xs ${
              e.changed
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{e.fieldLabel}</span>
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] uppercase">
                {ACTION_LABEL[e.action]}
              </span>
            </div>
            {e.changed ? (
              <p className="mt-1">
                <span className="line-through opacity-70">
                  {formatFieldValue(e.machineValue)}
                </span>{" "}
                → <span className="font-semibold">{formatFieldValue(e.correctedValue)}</span>
                <span className="ml-1 opacity-60">
                  (machine {Math.round(e.machineConfidence * 100)}%)
                </span>
              </p>
            ) : (
              <p className="mt-1 opacity-80">
                Kept &ldquo;{formatFieldValue(e.correctedValue)}&rdquo; (machine{" "}
                {Math.round(e.machineConfidence * 100)}%)
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
