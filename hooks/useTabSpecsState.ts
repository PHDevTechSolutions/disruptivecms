"use client";

/**
 * hooks/useTabSpecsState.ts
 * ─────────────────────────────────────────────────────
 * Manages per-brand and unified spec state for the product form.
 * Preserves all existing spec logic — only reorganizes state management.
 */

import { useState, useCallback, useMemo } from "react";
import type { ItemCodes, ItemCodeBrand } from "@/types/product";
import { ALL_BRANDS, getFilledItemCodes } from "@/types/product";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpecValues = Record<string, string>; // key: `${specGroupId}-${label}`, value: string

export interface TabSpecsState {
  /** true = single shared spec array; false = per-brand tabs */
  unified: boolean;
  /** Active tab (brand) when in per-brand mode */
  activeTab: ItemCodeBrand | null;
  /** Shared spec values (used when unified = true) */
  sharedSpecValues: SpecValues;
  /** Per-brand spec values (used when unified = false) */
  brandSpecValues: Partial<Record<ItemCodeBrand, SpecValues>>;
  /** Derived: current visible spec values for the active tab or shared */
  currentSpecValues: SpecValues;
}

export interface TabSpecsActions {
  setUnified: (v: boolean) => void;
  setActiveTab: (brand: ItemCodeBrand) => void;
  setSpecValue: (key: string, value: string) => void;
  getSpecValuesForBrand: (brand: ItemCodeBrand) => SpecValues;
  /** Returns all spec values merged (for save — unified uses shared, per-brand merges all) */
  getAllSpecValuesForSave: (
    unified: boolean,
  ) => { brand: ItemCodeBrand | null; values: SpecValues }[];
  /** Reset all spec state */
  resetSpecValues: () => void;
  /** Hydrate from saved data */
  hydrateFromSaved: (
    specValues: SpecValues,
    unified: boolean,
    brand?: ItemCodeBrand | null,
  ) => void;
}

export function useTabSpecsState(
  itemCodes: ItemCodes,
): TabSpecsState & TabSpecsActions {
  const [unified, setUnifiedInternal] = useState(true);
  const [activeTab, setActiveTab] = useState<ItemCodeBrand | null>(null);
  const [sharedSpecValues, setSharedSpecValues] = useState<SpecValues>({});
  const [brandSpecValues, setBrandSpecValues] = useState<
    Partial<Record<ItemCodeBrand, SpecValues>>
  >({});

  // Derived: which brands have item codes filled
  const filledBrands = useMemo(
    () => getFilledItemCodes(itemCodes).map((f) => f.brand),
    [itemCodes],
  );

  // Auto-set active tab when brands change
  const resolvedActiveTab = useMemo(() => {
    if (unified) return null;
    if (activeTab && filledBrands.includes(activeTab)) return activeTab;
    return filledBrands[0] ?? null;
  }, [unified, activeTab, filledBrands]);

  // Current spec values for the form
  const currentSpecValues = useMemo(() => {
    if (unified) return sharedSpecValues;
    const brand = resolvedActiveTab;
    if (!brand) return {};
    return brandSpecValues[brand] ?? {};
  }, [unified, sharedSpecValues, brandSpecValues, resolvedActiveTab]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const setUnified = useCallback((v: boolean) => {
    setUnifiedInternal(v);
    if (v) {
      // Switching TO unified: merge all brand specs into shared
      setBrandSpecValues((prev) => {
        const merged: SpecValues = {};
        ALL_BRANDS.forEach((brand) => {
          const vals = prev[brand] ?? {};
          Object.entries(vals).forEach(([k, val]) => {
            if (val && !merged[k]) merged[k] = val;
          });
        });
        setSharedSpecValues((shared) => ({ ...merged, ...shared }));
        return prev;
      });
    }
  }, []);

  const handleSetActiveTab = useCallback((brand: ItemCodeBrand) => {
    setActiveTab(brand);
  }, []);

  const setSpecValue = useCallback(
    (key: string, value: string) => {
      if (unified) {
        setSharedSpecValues((prev) => ({ ...prev, [key]: value }));
      } else {
        const brand = resolvedActiveTab;
        if (!brand) return;
        setBrandSpecValues((prev) => ({
          ...prev,
          [brand]: { ...(prev[brand] ?? {}), [key]: value },
        }));
      }
    },
    [unified, resolvedActiveTab],
  );

  const getSpecValuesForBrand = useCallback(
    (brand: ItemCodeBrand): SpecValues => {
      if (unified) return sharedSpecValues;
      return brandSpecValues[brand] ?? {};
    },
    [unified, sharedSpecValues, brandSpecValues],
  );

  const getAllSpecValuesForSave = useCallback(
    (
      isUnified: boolean,
    ): { brand: ItemCodeBrand | null; values: SpecValues }[] => {
      if (isUnified) {
        return [{ brand: null, values: sharedSpecValues }];
      }
      return filledBrands.map((brand) => ({
        brand,
        values: brandSpecValues[brand] ?? {},
      }));
    },
    [sharedSpecValues, brandSpecValues, filledBrands],
  );

  const resetSpecValues = useCallback(() => {
    setSharedSpecValues({});
    setBrandSpecValues({});
    setActiveTab(null);
    setUnifiedInternal(true);
  }, []);

  const hydrateFromSaved = useCallback(
    (
      specValues: SpecValues,
      isUnified: boolean,
      brand?: ItemCodeBrand | null,
    ) => {
      setUnifiedInternal(isUnified);
      if (isUnified) {
        setSharedSpecValues(specValues);
      } else if (brand) {
        setBrandSpecValues((prev) => ({ ...prev, [brand]: specValues }));
        setActiveTab(brand);
      } else {
        setSharedSpecValues(specValues);
      }
    },
    [],
  );

  return {
    unified,
    activeTab: resolvedActiveTab,
    sharedSpecValues,
    brandSpecValues,
    currentSpecValues,
    setUnified,
    setActiveTab: handleSetActiveTab,
    setSpecValue,
    getSpecValuesForBrand,
    getAllSpecValuesForSave,
    resetSpecValues,
    hydrateFromSaved,
  };
}
