"use client";

import { ValidationIssue } from "@/lib/types";

const SEVERITY_CLASSES: Record<ValidationIssue["severity"], string> = {
  error: "border-red-500/40 bg-red-500/10 text-red-100",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
};

const SEVERITY_LABEL: Record<ValidationIssue["severity"], string> = {
  error: "Error",
  warning: "Warning",
};

// Cross-field discrepancies — distinct from Risk flags (single-field underwriting
// signals) and Conflicts (contradictory answers over time). A validation issue
// fires when multiple fields, each individually valid on its own, don't agree
// with each other (e.g. a vehicle-mix percentage group that doesn't sum to 100).
export default function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Validation</h2>
        <span className="text-xs text-slate-500">{issues.length}</span>
      </header>
      <div className="scroll-thin max-h-72 space-y-2 overflow-y-auto p-3">
        {issues.length === 0 && (
          <p className="px-1 text-sm text-slate-500">No cross-field discrepancies detected.</p>
        )}
        {issues.map((issue) => (
          <div key={issue.id} className={`rounded-xl border p-3 ${SEVERITY_CLASSES[issue.severity]}`}>
            <span className="text-[11px] font-bold uppercase tracking-wide">
              {SEVERITY_LABEL[issue.severity]}
            </span>
            <p className="mt-1 text-sm font-semibold text-white">{issue.label}</p>
            <p className="mt-1 text-xs opacity-90">{issue.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
