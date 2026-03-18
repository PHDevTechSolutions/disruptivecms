"use client";

/**
 * components/notifications/scope-access-selector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable scopeAccess multi-select widget.
 *
 * Behaviour:
 *  - Auto-fills default scopes when role changes
 *  - Superadmin can freely add / remove / type custom scopes
 *  - Non-superadmin sees the scopes but cannot edit them
 *  - Enforces: no duplicates, valid format, non-empty
 *  - If role === "superadmin" → forces & locks ["superadmin"]
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, KeyboardEvent } from "react";
import { X, Plus, Lock, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getScopeAccessForRole, ScopeEntry } from "@/lib/rbac";

// ─── Quick-add presets (shown as clickable chips) ─────────────────────────────

const SCOPE_PRESETS: ScopeEntry[] = [
  "read:products",
  "write:products",
  "verify:products",
  "read:jobs",
  "write:jobs",
  "verify:jobs",
  "read:content",
  "write:content",
  "verify:content",
  "read:inquiries",
  "write:inquiries",
  "verify:inquiries",
  "read:*",
  "write:*",
  "verify:*",
];

// Valid format: "superadmin" OR "read:|write:|verify:<something>"
const VALID_SCOPE_RE = /^(superadmin|(read|write|verify):[a-z*_:]+)$/;

function isValidScope(s: string): boolean {
  return VALID_SCOPE_RE.test(s.trim());
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ScopeAccessSelectorProps {
  role: string;
  value: string[];
  onChange: (scopes: string[]) => void;
  /** Whether the current session user is a superadmin (can edit freely) */
  isSuperAdmin: boolean;
  /** Error message to display */
  error?: string;
}

export function ScopeAccessSelector({
  role,
  value,
  onChange,
  isSuperAdmin,
  error,
}: ScopeAccessSelectorProps) {
  const [inputVal, setInputVal] = useState("");
  const [inputError, setInputError] = useState("");

  // Force-lock superadmin scope
  const locked = role === "superadmin";
  const readOnly = !isSuperAdmin || locked;

  // Auto-fill default scopes when role changes
  useEffect(() => {
    if (!role) return;
    const defaults = getScopeAccessForRole(role);
    onChange(defaults as string[]);
    setInputVal("");
    setInputError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const addScope = (raw: string) => {
    const scope = raw.trim().toLowerCase();
    if (!scope) return;
    if (!isValidScope(scope)) {
      setInputError(
        `Invalid format. Use "read:|write:|verify:<resource>" or "superadmin".`,
      );
      return;
    }
    if (value.includes(scope)) {
      setInputError("Scope already added.");
      return;
    }
    onChange([...value, scope]);
    setInputVal("");
    setInputError("");
  };

  const removeScope = (scope: string) => {
    onChange(value.filter((s) => s !== scope));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addScope(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && value.length > 0) {
      removeScope(value[value.length - 1]);
    }
  };

  const scopeColor = (scope: string): string => {
    if (scope === "superadmin")
      return "bg-rose-50 text-rose-700 border-rose-200";
    if (scope.startsWith("verify"))
      return "bg-violet-50 text-violet-700 border-violet-200";
    if (scope.startsWith("write"))
      return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  // Presets not yet in value
  const availablePresets = SCOPE_PRESETS.filter((p) => !value.includes(p));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] font-bold uppercase opacity-60">
          Scope Access <span className="text-destructive">*</span>
        </label>
        {locked && (
          <span className="flex items-center gap-1 text-[9px] text-rose-600 font-semibold">
            <Lock className="w-2.5 h-2.5" />
            Locked (Superadmin)
          </span>
        )}
        {!locked && !isSuperAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground cursor-default">
                <Lock className="w-2.5 h-2.5" />
                Auto-assigned
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-xs">
              Scope access is automatically set based on the selected role. Only
              Superadmins can override it.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Tags display + input */}
      <div
        className={`min-h-10.5 flex flex-wrap gap-1.5 px-2.5 py-2 border rounded-none text-xs transition-colors
          ${readOnly ? "bg-muted/40 cursor-not-allowed" : "bg-background focus-within:ring-1 focus-within:ring-ring"}
          ${error || inputError ? "border-destructive" : "border-input"}
        `}
      >
        {value.map((scope) => (
          <span
            key={scope}
            className={`inline-flex items-center gap-1 border text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-sm ${scopeColor(scope)}`}
          >
            {scope}
            {!readOnly && (
              <button
                type="button"
                onClick={() => removeScope(scope)}
                className="hover:opacity-70 transition-opacity ml-0.5"
                aria-label={`Remove ${scope}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        ))}

        {!readOnly && !locked && (
          <input
            className="flex-1 min-w-30 bg-transparent outline-none text-[10px] font-mono placeholder:text-muted-foreground/50"
            placeholder={
              value.length === 0 ? "e.g. read:products" : "Add scope…"
            }
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              setInputError("");
            }}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {/* Errors */}
      {(error || inputError) && (
        <p className="text-[10px] text-destructive font-medium">
          {error || inputError}
        </p>
      )}

      {/* Quick-add preset chips (superadmin only, when not locked) */}
      {isSuperAdmin && !locked && availablePresets.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
            Quick-add
          </p>
          <div className="flex flex-wrap gap-1">
            {availablePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => addScope(preset)}
                className={`inline-flex items-center gap-0.5 border text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-sm opacity-60 hover:opacity-100 transition-opacity cursor-pointer ${scopeColor(preset)}`}
              >
                <Plus className="w-2 h-2" />
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
