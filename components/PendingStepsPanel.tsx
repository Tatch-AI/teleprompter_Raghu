"use client";

import { IntakeState, TalkTrackStep } from "@/lib/types";

export default function PendingStepsPanel({
  steps,
  state,
  activeStepId,
}: {
  steps: TalkTrackStep[];
  state: IntakeState;
  activeStepId?: string;
}) {
  const completed = new Set(state.completedStepIds);

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Teleprompter steps</h2>
        <span className="text-xs text-slate-500">
          {completed.size}/{steps.filter((s) => s.id !== "recap" && s.mapsToFields.length).length} done
        </span>
      </header>
      <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto p-3">
        {steps.map((step) => {
          const done = completed.has(step.id);
          const active = step.id === activeStepId;
          return (
            <div
              key={step.id}
              className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                active ? "bg-indigo-500/15 ring-1 ring-indigo-500/40" : ""
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                  done
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                    : active
                      ? "border-indigo-400/60 text-indigo-200"
                      : "border-slate-600 text-transparent"
                }`}
              >
                {done ? "✓" : ""}
              </span>
              <div className="min-w-0">
                <span
                  className={`${done ? "text-slate-500 line-through" : active ? "text-indigo-100" : "text-slate-300"}`}
                >
                  {step.section}
                </span>
                {active && <span className="ml-2 text-[10px] uppercase text-indigo-300">next</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
