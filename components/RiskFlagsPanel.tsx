"use client";

import { RiskFlag } from "@/lib/types";
import { SEVERITY_CLASSES } from "@/lib/formatters";

const SEVERITY_LABEL: Record<RiskFlag["severity"], string> = {
  info: "Info",
  appetite: "Appetite",
  knockout: "Knockout",
  specialty_market: "Specialty market",
};

export default function RiskFlagsPanel({
  flags,
  onAcknowledge,
}: {
  flags: RiskFlag[];
  onAcknowledge: (ruleId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Risk flags</h2>
        <span className="text-xs text-slate-500">{flags.length}</span>
      </header>
      <div className="scroll-thin max-h-72 space-y-2 overflow-y-auto p-3">
        {flags.length === 0 && (
          <p className="px-1 text-sm text-slate-500">No knockout or appetite flags detected.</p>
        )}
        {flags.map((flag) => (
          <div
            key={flag.id}
            className={`rounded-xl border p-3 ${flag.resolved ? "opacity-50" : ""} ${SEVERITY_CLASSES[flag.severity]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide">
                {SEVERITY_LABEL[flag.severity]}
              </span>
              {flag.resolved ? (
                <span className="text-[11px] font-medium">acknowledged</span>
              ) : (
                <button
                  onClick={() => onAcknowledge(flag.ruleId)}
                  className="rounded-md bg-black/20 px-2 py-0.5 text-[11px] font-medium hover:bg-black/30"
                >
                  Acknowledge
                </button>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-white">{flag.label}</p>
            <p className="mt-1 text-xs opacity-90">{flag.recommendedAction}</p>
            {flag.evidence && (
              <p className="mt-1.5 border-l-2 border-white/20 pl-2 text-xs italic opacity-80">
                &ldquo;{flag.evidence.quote}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
