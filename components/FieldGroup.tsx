"use client";

import { FieldDefinition, FieldState } from "@/lib/types";
import { SECTION_LABEL } from "@/lib/formatters";
import FieldRow from "./FieldRow";

export default function FieldGroup({
  section,
  defs,
  fields,
  onConfirm,
  onResolveConflict,
  onEdit,
}: {
  section: string;
  defs: FieldDefinition[];
  fields: Record<string, FieldState>;
  onConfirm: (fieldId: string) => void;
  onResolveConflict: (fieldId: string, choice: "new" | "old" | "manual", manualValue?: string) => void;
  onEdit: (fieldId: string, value: string) => void;
}) {
  if (defs.length === 0) return null;
  const filled = defs.filter((d) => {
    const s = fields[d.id]?.status;
    return s && s !== "missing";
  }).length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {SECTION_LABEL[section] ?? section}
        </h3>
        <span className="text-[11px] text-slate-500">
          {filled}/{defs.length}
        </span>
      </div>
      <div className="space-y-2">
        {defs
          .sort((a, b) => a.priority - b.priority)
          .map((def) => (
            <FieldRow
              key={def.id}
              def={def}
              state={fields[def.id]}
              onConfirm={onConfirm}
              onResolveConflict={onResolveConflict}
              onEdit={onEdit}
            />
          ))}
      </div>
    </div>
  );
}
