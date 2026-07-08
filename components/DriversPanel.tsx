"use client";

import { DriverRecord } from "@/lib/types";
import { DRIVER_FIELD_DEFINITIONS } from "@/lib/garageDriverFields";

const STATUS_DOT: Record<string, string> = {
  filled: "bg-emerald-400",
  needs_review: "bg-amber-400",
  low_confidence: "bg-amber-400",
  conflict: "bg-red-400",
  missing: "bg-slate-600",
};

// Read-only for now — driver fields go through the same extraction/merge
// pipeline as everything else, but Confirm/Edit on individual driver fields
// isn't wired up yet. See futurescope.md item 1.
export default function DriversPanel({ drivers }: { drivers: DriverRecord[] }) {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">Drivers</h2>
        <span className="text-xs text-slate-500">{drivers.length}</span>
      </header>
      <div className="scroll-thin max-h-72 space-y-3 overflow-y-auto p-3">
        {drivers.length === 0 && (
          <p className="px-1 text-sm text-slate-500">
            No driver on file yet — at least one is required to submit.
          </p>
        )}
        {drivers.map((driver, i) => (
          <div key={driver.id} className="rounded-xl border border-slate-700/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Driver {i + 1}
            </p>
            <div className="space-y-1.5">
              {DRIVER_FIELD_DEFINITIONS.map((def) => {
                const fs = driver.fields[def.id];
                const status = fs?.status ?? "missing";
                const value = status !== "missing" ? (fs?.normalizedValue ?? fs?.value) : null;
                return (
                  <div key={def.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                    <span className="w-28 shrink-0 text-slate-400">{def.label}</span>
                    <span className="text-slate-100">{value !== null ? String(value) : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
