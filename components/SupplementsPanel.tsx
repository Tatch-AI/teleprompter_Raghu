"use client";

import { SuggestedSupplement } from "@/lib/types";

export default function SupplementsPanel({
  supplements,
  onAcknowledge,
}: {
  supplements: SuggestedSupplement[];
  onAcknowledge: (ruleId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Supplemental forms</h2>
        <span className="text-xs text-slate-500">{supplements.length}</span>
      </header>
      <div className="scroll-thin max-h-72 space-y-2 overflow-y-auto p-3">
        {supplements.length === 0 && (
          <p className="px-1 text-sm text-slate-500">No supplemental forms suggested yet.</p>
        )}
        {supplements.map((s) => (
          <div
            key={s.id}
            className={`rounded-xl border p-3 ${s.acknowledged ? "opacity-50" : ""} ${
              s.validated
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-amber-400/40 bg-amber-400/10 text-amber-100"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide">
                {s.validated ? "Likely needed" : "Needs validation"}
              </span>
              {s.acknowledged ? (
                <span className="text-[11px] font-medium">acknowledged</span>
              ) : (
                <button
                  onClick={() => onAcknowledge(s.ruleId)}
                  className="rounded-md bg-black/20 px-2 py-0.5 text-[11px] font-medium hover:bg-black/30"
                >
                  Acknowledge
                </button>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-white">{s.label}</p>
            <p className="mt-0.5 text-[11px] opacity-70">
              {s.formId} — {s.filename}
            </p>
            <p className="mt-1 text-xs opacity-90">{s.reason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
