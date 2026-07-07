"use client";

import { useState } from "react";
import { FieldDefinition, FieldState } from "@/lib/types";
import {
  STATUS_CLASSES,
  STATUS_LABEL,
  formatConfidence,
  formatFieldValue,
} from "@/lib/formatters";

export default function FieldRow({
  def,
  state,
  onConfirm,
  onResolveConflict,
  onEdit,
}: {
  def: FieldDefinition;
  state: FieldState;
  onConfirm: (fieldId: string) => void;
  onResolveConflict: (fieldId: string, choice: "new" | "old" | "manual", manualValue?: string) => void;
  onEdit: (fieldId: string, value: string) => void;
}) {
  const [manual, setManual] = useState("");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const conflict = state.conflict;
  const lastEvidence = state.evidence[state.evidence.length - 1];
  const canConfirm = state.status === "needs_review" || state.status === "low_confidence";

  const startEdit = () => {
    setEditValue(state.value == null ? "" : String(state.value));
    setEditing(true);
  };
  const saveEdit = () => {
    onEdit(def.id, editValue);
    setEditing(false);
  };

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        state.status === "conflict"
          ? "border-red-500/50 bg-red-500/5"
          : "border-slate-700/50 bg-slate-900/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">{def.label}</span>
            {def.required && (
              <span className="text-[10px] font-semibold uppercase text-slate-500">req</span>
            )}
            {state.confirmed && (
              <span className="text-[10px] font-semibold uppercase text-emerald-400/70">rep</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm text-white">
            {formatFieldValue(state.value, def.type)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASSES[state.status]}`}
          >
            {STATUS_LABEL[state.status]}
          </span>
          {state.everSeen && state.status !== "missing" && (
            <span className="text-[11px] text-slate-500">{formatConfidence(state.confidence)}</span>
          )}
          {!editing && state.status !== "conflict" && (
            <button
              onClick={startEdit}
              className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {def.options ? (
            <select
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="rounded-lg border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
            >
              <option value="">—</option>
              {def.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder={def.type === "boolean" ? "yes / no" : "New value"}
              className="w-40 rounded-lg border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          )}
          <button
            onClick={saveEdit}
            className="rounded-lg border border-indigo-500/50 bg-indigo-500/20 px-2.5 py-1 text-xs text-indigo-100 hover:bg-indigo-500/30"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg border border-slate-600/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700/70"
          >
            Cancel
          </button>
        </div>
      )}

      {!editing && lastEvidence && state.status !== "conflict" && (
        <p className="mt-1.5 border-l-2 border-slate-700 pl-2 text-xs italic text-slate-400">
          &ldquo;{lastEvidence.quote}&rdquo;
        </p>
      )}

      {state.needsReviewReason && canConfirm && (
        <p className="mt-1 text-[11px] text-yellow-200/70">{state.needsReviewReason}</p>
      )}

      {canConfirm && !editing && (
        <button
          onClick={() => onConfirm(def.id)}
          className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Confirm value
        </button>
      )}

      {state.status === "conflict" && conflict && (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/5 p-2">
          <p className="text-xs text-red-200">{conflict.reason}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onResolveConflict(def.id, "old")}
              className="rounded-lg border border-slate-600/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700/70"
            >
              Keep &ldquo;{formatFieldValue(conflict.existingValue, def.type)}&rdquo;
            </button>
            <button
              onClick={() => onResolveConflict(def.id, "new")}
              className="rounded-lg border border-indigo-500/50 bg-indigo-500/20 px-2.5 py-1 text-xs text-indigo-100 hover:bg-indigo-500/30"
            >
              Use &ldquo;{formatFieldValue(conflict.newValue, def.type)}&rdquo;
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Manual value"
              className="w-32 rounded-lg border border-slate-700/60 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500/60"
            />
            <button
              onClick={() => manual.trim() && onResolveConflict(def.id, "manual", manual.trim())}
              disabled={!manual.trim()}
              className="rounded-lg border border-slate-600/60 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700/70 disabled:opacity-40"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
