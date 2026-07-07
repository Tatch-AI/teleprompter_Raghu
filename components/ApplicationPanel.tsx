"use client";

import { FieldDefinition, FieldSection, FieldState, GarageBusinessType } from "@/lib/types";
import { formatBusinessType } from "@/lib/formatters";
import FieldGroup from "./FieldGroup";

const SECTION_ORDER: FieldSection[] = [
  "business_identity",
  "operations",
  "coverage_intent",
  "vehicles_driving",
  "premises",
  "history",
  "online_verification",
  "underwriting_risk",
  "drivers_team",
  "location",
];

export default function ApplicationPanel({
  applicableDefs,
  fields,
  businessType,
  completeness,
  onConfirm,
  onResolveConflict,
}: {
  applicableDefs: FieldDefinition[];
  fields: Record<string, FieldState>;
  businessType: GarageBusinessType | null;
  completeness: { filled: number; total: number };
  onConfirm: (fieldId: string) => void;
  onResolveConflict: (fieldId: string, choice: "new" | "old" | "manual", manualValue?: string) => void;
}) {
  const bySection = SECTION_ORDER.map((section) => ({
    section,
    defs: applicableDefs.filter((d) => d.section === section),
  })).filter((g) => g.defs.length > 0);

  const pct = completeness.total ? Math.round((completeness.filled / completeness.total) * 100) : 0;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="border-b border-slate-700/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">GARAGE_001 application</h2>
          <span className="rounded-full border border-slate-600/60 bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-300">
            {formatBusinessType(businessType)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-400">
            {completeness.filled}/{completeness.total} required
          </span>
        </div>
      </header>

      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {bySection.map((g) => (
          <FieldGroup
            key={g.section}
            section={g.section}
            defs={g.defs}
            fields={fields}
            onConfirm={onConfirm}
            onResolveConflict={onResolveConflict}
          />
        ))}
      </div>
    </section>
  );
}
