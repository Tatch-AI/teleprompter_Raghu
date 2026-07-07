"use client";

import { FieldDefinition, FieldState, GarageBusinessType } from "@/lib/types";
import { formatBusinessType } from "@/lib/formatters";
import FieldGroup from "./FieldGroup";

// vehicles_driving is one data-model section, but the rep thinks of vehicle
// inventory/plates and driving behavior as two different concerns — split it
// for display only, no change to the underlying field catalog.
const VEHICLE_FIELD_IDS = new Set([
  "dealer_plate_count",
  "plates_loaned_or_rented",
  "loaner_or_rental_vehicles",
]);

interface ColumnGroup {
  label: string;
  defs: FieldDefinition[];
}

// New fields dropped into any of these sections in garageFieldDefinitions.ts
// show up here automatically — only the vehicles/driving split needs the
// explicit id list above; everything else groups by def.section.
function buildColumns(applicableDefs: FieldDefinition[]): ColumnGroup[] {
  const bySection: Record<string, FieldDefinition[]> = {
    business_identity: [],
    coverage_intent: [],
    vehicles: [],
    driving: [],
    operations: [],
    premises: [],
    history: [],
    online_verification: [],
  };

  for (const def of applicableDefs) {
    if (def.section === "vehicles_driving") {
      bySection[VEHICLE_FIELD_IDS.has(def.id) ? "vehicles" : "driving"].push(def);
    } else if (bySection[def.section]) {
      bySection[def.section].push(def);
    }
  }

  return [
    { label: "Business identity", defs: bySection.business_identity },
    { label: "Coverage intent", defs: bySection.coverage_intent },
    { label: "Vehicles", defs: bySection.vehicles },
    { label: "Driving", defs: bySection.driving },
    { label: "Operations", defs: bySection.operations },
    { label: "Premises", defs: bySection.premises },
    { label: "History", defs: bySection.history },
    { label: "Online verification", defs: bySection.online_verification },
  ].filter((g) => g.defs.length > 0);
}

export default function CallGuidePanel({
  applicableDefs,
  fields,
  businessType,
  completeness,
  onConfirm,
  onResolveConflict,
  onEdit,
}: {
  applicableDefs: FieldDefinition[];
  fields: Record<string, FieldState>;
  businessType: GarageBusinessType | null;
  completeness: { filled: number; total: number };
  onConfirm: (fieldId: string) => void;
  onResolveConflict: (fieldId: string, choice: "new" | "old" | "manual", manualValue?: string) => void;
  onEdit: (fieldId: string, value: string) => void;
}) {
  const columns = buildColumns(applicableDefs);
  const pct = completeness.total ? Math.round((completeness.filled / completeness.total) * 100) : 0;

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60">
      <header className="border-b border-slate-700/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Call guide</h2>
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

      <div className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {columns.map((col) => (
          <FieldGroup
            key={col.label}
            section={col.label}
            defs={col.defs}
            fields={fields}
            onConfirm={onConfirm}
            onResolveConflict={onResolveConflict}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}
