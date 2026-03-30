"use client";

/**
 * components/product-forms/specs-tab-container.tsx
 * ─────────────────────────────────────────────────────
 * Tab-based spec input container for add-new-product-form.
 * Replaces the flat spec list with a per-brand tab system.
 * Preserves all existing spec logic unchanged.
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { Loader2, Plus, Zap, FolderPlus, X, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { ItemCodes, ItemCodeBrand } from "@/types/product";
import { getFilledItemCodes, ITEM_CODE_BRAND_CONFIG } from "@/types/product";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpecItem {
  id: string;
  label: string;
  specGroup: string;
  specGroupId: string;
}

export interface PendingNewSpec {
  specGroupId: string;
  specGroup: string;
  label: string;
  tempId: string;
  saved?: boolean;
}

interface Props {
  // Item codes to determine tabs
  itemCodes: ItemCodes;

  // Spec data
  availableSpecs: SpecItem[];
  specsLoading: boolean;

  // Unified toggle
  unified: boolean;
  onToggleUnified: (v: boolean) => void;

  // Active tab (brand)
  activeTab: ItemCodeBrand | null;
  onSetActiveTab: (brand: ItemCodeBrand) => void;

  // Spec values per-brand or unified
  getSpecValues: (brand: ItemCodeBrand | null) => Record<string, string>;
  onSpecValueChange: (
    key: string,
    value: string,
    brand: ItemCodeBrand | null,
  ) => void;

  // Pending new specs
  pendingNewSpecs: PendingNewSpec[];
  onAddNewSpecItem: (
    specGroupId: string,
    specGroup: string,
    brand: ItemCodeBrand | null,
  ) => void;
  newSpecInputs: Record<string, string>;
  onNewSpecInputChange: (specGroupId: string, value: string) => void;
  onRemovePendingSpec: (tempId: string) => void;

  // Group name edits
  groupNameEdits: Record<string, string>;
  onGroupNameChange: (specGroupId: string, name: string) => void;
  onSaveGroupRename: (specGroupId: string) => void;
  editingGroupId: string | null;
  onSetEditingGroupId: (id: string | null) => void;

  // Add spec group dialog trigger
  onOpenAddSpecGroup: () => void;
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function BrandTab({
  brand,
  isActive,
  onClick,
}: {
  brand: ItemCodeBrand;
  isActive: boolean;
  onClick: () => void;
}) {
  const config = ITEM_CODE_BRAND_CONFIG[brand];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
      )}
    >
      <span className={cn("w-2 h-2 rounded-full shrink-0", config.dotClass)} />
      {config.label}
    </button>
  );
}

// ─── Spec group section (shared between unified and per-brand) ─────────────────

export function SpecGroupSection({
  groupName,
  specs,
  specValues,
  onSpecValueChange,
  pendingSpecs,
  newSpecInput,
  onNewSpecInputChange,
  onAddNewSpec,
  onRemovePendingSpec,
  groupNameEdits,
  onGroupNameChange,
  onSaveGroupRename,
  editingGroupId,
  onSetEditingGroupId,
}: {
  groupName: string;
  specs: SpecItem[];
  specValues: Record<string, string>;
  onSpecValueChange: (key: string, value: string) => void;
  pendingSpecs: PendingNewSpec[];
  newSpecInput: string;
  onNewSpecInputChange: (v: string) => void;
  onAddNewSpec: () => void;
  onRemovePendingSpec: (tempId: string) => void;
  groupNameEdits: Record<string, string>;
  onGroupNameChange: (specGroupId: string, name: string) => void;
  onSaveGroupRename: (specGroupId: string) => void;
  editingGroupId: string | null;
  onSetEditingGroupId: (id: string | null) => void;
}) {
  const specGroupId = specs[0]?.specGroupId ?? "";
  const displayGroupName = groupNameEdits[specGroupId] ?? groupName;

  const { Pencil } = React.useMemo(
    () => ({ Pencil: require("lucide-react").Pencil }),
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {editingGroupId === specGroupId ? (
          <div className="flex items-center gap-2 flex-1">
            <Zap className="h-3 w-3 text-primary shrink-0" />
            <Input
              autoFocus
              className="h-7 text-sm font-semibold text-primary uppercase px-2 py-0"
              value={displayGroupName}
              onChange={(e) =>
                onGroupNameChange(specGroupId, e.target.value.toUpperCase())
              }
              onBlur={() => {
                onSetEditingGroupId(null);
                onSaveGroupRename(specGroupId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  onSetEditingGroupId(null);
                  onSaveGroupRename(specGroupId);
                }
              }}
            />
          </div>
        ) : (
          <>
            <h4 className="text-sm font-semibold text-primary flex items-center gap-2 flex-1">
              <Zap className="h-3 w-3" />
              {displayGroupName.toUpperCase()}
            </h4>
            <button
              type="button"
              onClick={() => onSetEditingGroupId(specGroupId)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Rename group"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      <div className="space-y-3 pl-5">
        {specs.map((spec) => {
          const specKey = `${spec.specGroupId}-${spec.label}`;
          return (
            <div
              key={spec.id}
              className="space-y-1.5 p-3 rounded-lg border bg-card"
            >
              <Label className="text-xs font-medium uppercase">
                {spec.label}
              </Label>
              <Input
                placeholder={`Enter ${spec.label}…`}
                className="h-9 text-sm uppercase"
                value={specValues[specKey] || ""}
                onChange={(e) =>
                  onSpecValueChange(specKey, e.target.value.toUpperCase())
                }
              />
            </div>
          );
        })}

        {pendingSpecs.map((spec) => (
          <div
            key={spec.tempId}
            className={cn(
              "space-y-1.5 p-3 rounded-lg border",
              spec.saved
                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
            )}
          >
            <div className="flex items-center justify-between">
              <Label
                className={cn(
                  "text-xs font-medium uppercase flex items-center gap-1.5",
                  spec.saved
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400",
                )}
              >
                {spec.label}
                <span
                  className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-sm",
                    spec.saved
                      ? "bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200"
                      : "bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200",
                  )}
                >
                  {spec.saved ? "SAVED" : "SAVING…"}
                </span>
              </Label>
              <button
                type="button"
                onClick={() => onRemovePendingSpec(spec.tempId)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input
              placeholder={`Enter ${spec.label}…`}
              className="h-9 text-sm uppercase"
              value={specValues[spec.tempId] || ""}
              onChange={(e) =>
                onSpecValueChange(spec.tempId, e.target.value.toUpperCase())
              }
            />
          </div>
        ))}

        {/* Add new spec item inline */}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Add spec item (e.g. COLOR TEMP)…"
            className="h-8 text-xs"
            value={newSpecInput}
            onChange={(e) => onNewSpecInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddNewSpec();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 shrink-0 border-dashed"
            onClick={onAddNewSpec}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SpecsTabContainer({
  itemCodes,
  availableSpecs,
  specsLoading,
  unified,
  onToggleUnified,
  activeTab,
  onSetActiveTab,
  getSpecValues,
  onSpecValueChange,
  pendingNewSpecs,
  onAddNewSpecItem,
  newSpecInputs,
  onNewSpecInputChange,
  onRemovePendingSpec,
  groupNameEdits,
  onGroupNameChange,
  onSaveGroupRename,
  editingGroupId,
  onSetEditingGroupId,
  onOpenAddSpecGroup,
}: Props) {
  const filledBrands = React.useMemo(
    () => getFilledItemCodes(itemCodes).map((f) => f.brand),
    [itemCodes],
  );

  const effectiveTab = unified ? null : (activeTab ?? filledBrands[0] ?? null);

  // Group specs
  const groupedSpecs = React.useMemo(() => {
    return availableSpecs.reduce(
      (acc, spec) => {
        if (!acc[spec.specGroup]) acc[spec.specGroup] = [];
        acc[spec.specGroup].push(spec);
        return acc;
      },
      {} as Record<string, SpecItem[]>,
    );
  }, [availableSpecs]);

  const currentSpecValues = getSpecValues(unified ? null : effectiveTab);

  if (specsLoading) {
    return (
      <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed flex items-center justify-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-xs font-medium text-muted-foreground">
          Loading specifications…
        </p>
      </div>
    );
  }

  if (availableSpecs.length === 0 && pendingNewSpecs.length === 0) {
    return (
      <div className="p-8 text-center bg-muted/30 rounded-lg border-2 border-dashed space-y-3">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Layers className="h-5 w-5 text-primary/60" />
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            No specs attached to this product family
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs font-semibold gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5"
            onClick={onOpenAddSpecGroup}
          >
            <FolderPlus className="h-3.5 w-3.5" /> Add a Spec Group
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: Unify toggle + Add Spec Group button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">
            Technical Specifications
          </Label>
          {(pendingNewSpecs.length > 0 ||
            Object.keys(groupNameEdits).length > 0) && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
              {pendingNewSpecs.filter((s) => !s.saved).length > 0
                ? `${pendingNewSpecs.filter((s) => !s.saved).length} saving…`
                : "Synced"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Unify toggle */}
          {filledBrands.length > 1 && (
            <button
              type="button"
              onClick={() => onToggleUnified(!unified)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all",
                unified
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted border-border text-muted-foreground hover:border-primary/30 hover:text-primary",
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  unified ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              {unified ? "Unified Specs" : "Per-Brand Specs"}
            </button>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs font-semibold gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:border-primary"
            onClick={onOpenAddSpecGroup}
          >
            <FolderPlus className="h-3.5 w-3.5" /> Add Spec Group
          </Button>
        </div>
      </div>

      {/* Tab bar (only shown when per-brand mode AND multiple brands) */}
      {!unified && filledBrands.length > 1 && (
        <div className="border-b flex items-center gap-0 overflow-x-auto">
          {filledBrands.map((brand) => (
            <BrandTab
              key={brand}
              brand={brand}
              isActive={effectiveTab === brand}
              onClick={() => onSetActiveTab(brand)}
            />
          ))}
        </div>
      )}

      {/* Single-brand label (when per-brand but only one brand) */}
      {!unified && filledBrands.length === 1 && effectiveTab && (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              ITEM_CODE_BRAND_CONFIG[effectiveTab].dotClass,
            )}
          />
          <span className="text-xs font-semibold text-muted-foreground uppercase">
            {ITEM_CODE_BRAND_CONFIG[effectiveTab].label} Specs
          </span>
        </div>
      )}

      {/* Spec groups */}
      <div className="space-y-6">
        {Object.entries(groupedSpecs).map(([groupName, specs]) => {
          const seenIds = new Set<string>();
          const uniqueSpecs = specs.filter((spec) => {
            if (seenIds.has(spec.id)) return false;
            seenIds.add(spec.id);
            return true;
          });
          if (uniqueSpecs.length === 0) return null;

          const specGroupId = specs[0].specGroupId;
          const groupPendingSpecs = pendingNewSpecs.filter(
            (s) => s.specGroupId === specGroupId,
          );
          const displayGroupName = groupNameEdits[specGroupId] ?? groupName;

          return (
            <SpecGroupSection
              key={groupName}
              groupName={displayGroupName}
              specs={uniqueSpecs}
              specValues={currentSpecValues}
              onSpecValueChange={(key, value) =>
                onSpecValueChange(key, value, unified ? null : effectiveTab)
              }
              pendingSpecs={groupPendingSpecs}
              newSpecInput={newSpecInputs[specGroupId] ?? ""}
              onNewSpecInputChange={(v) => onNewSpecInputChange(specGroupId, v)}
              onAddNewSpec={() =>
                onAddNewSpecItem(
                  specGroupId,
                  displayGroupName,
                  unified ? null : effectiveTab,
                )
              }
              onRemovePendingSpec={onRemovePendingSpec}
              groupNameEdits={groupNameEdits}
              onGroupNameChange={onGroupNameChange}
              onSaveGroupRename={onSaveGroupRename}
              editingGroupId={editingGroupId}
              onSetEditingGroupId={onSetEditingGroupId}
            />
          );
        })}

        {/* Add another spec group link */}
        <button
          type="button"
          onClick={onOpenAddSpecGroup}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-foreground/10 rounded-lg text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
        >
          <FolderPlus className="h-3.5 w-3.5" /> Add another spec group
        </button>
      </div>
    </div>
  );
}
