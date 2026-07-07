"use client";

import { IntakeState } from "@/lib/types";

export default function DebugJsonPanel({
  state,
  reasons,
  visible,
}: {
  state: IntakeState;
  reasons: string[];
  visible: boolean;
}) {
  if (!visible) return null;

  const compact = {
    businessType: state.businessType,
    businessTypeConfidence: state.businessTypeConfidence,
    generation: state.generation,
    missingRequiredFieldIds: state.missingRequiredFieldIds,
    completedStepIds: state.completedStepIds,
    conflicts: state.conflicts,
    riskFlags: state.riskFlags.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      resolved: f.resolved,
    })),
    fields: Object.fromEntries(
      Object.values(state.fields)
        .filter((f) => f.everSeen)
        .map((f) => [
          f.fieldId,
          { value: f.value, status: f.status, confidence: f.confidence, confirmed: f.confirmed },
        ]),
    ),
  };

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-950/80">
      <header className="border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Debug — engine state</h2>
      </header>
      <div className="grid gap-3 p-3 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ask-next reasoning
          </h3>
          <ul className="space-y-1 text-xs text-slate-400">
            {reasons.map((r, i) => (
              <li key={i} className="rounded bg-slate-900/60 px-2 py-1">
                {r}
              </li>
            ))}
          </ul>
        </div>
        <pre className="scroll-thin max-h-80 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-emerald-200/90">
          {JSON.stringify(compact, null, 2)}
        </pre>
      </div>
    </section>
  );
}
