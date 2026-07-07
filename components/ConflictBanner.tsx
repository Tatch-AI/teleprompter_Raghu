"use client";

import { ConflictRecord } from "@/lib/types";
import { FIELD_BY_ID } from "@/lib/garageFieldDefinitions";
import { formatFieldValue } from "@/lib/formatters";

export default function ConflictBanner({ conflicts }: { conflicts: ConflictRecord[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
        {conflicts.length} unresolved conflict{conflicts.length > 1 ? "s" : ""}
      </div>
      <ul className="mt-1.5 space-y-1 text-xs text-red-200/90">
        {conflicts.map((c) => {
          const def = FIELD_BY_ID[c.fieldId];
          return (
            <li key={c.id}>
              <span className="font-medium">{def?.label ?? c.fieldId}:</span>{" "}
              &ldquo;{formatFieldValue(c.existingValue, def?.type)}&rdquo; vs &ldquo;
              {formatFieldValue(c.newValue, def?.type)}&rdquo; — resolve in the application panel.
            </li>
          );
        })}
      </ul>
    </div>
  );
}
