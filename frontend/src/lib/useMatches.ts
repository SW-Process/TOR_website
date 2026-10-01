"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ApiTor } from "@/lib/torApi";

export interface VendorMatch {
  tor: ApiTor;
  /** Rule-based score 0..100 from backend/src/services/matching.ts. */
  matchScore: number;
  matchedCriteria: ("category" | "technologyStack" | "budgetRange")[];
}

/**
 * GET /api/vendor/matches — open TORs ranked by the backend's match score
 * against the signed-in vendor's profile (FR-24/FR-26). Pass `enabled: false`
 * until the vendor has a profile; the backend scores an empty profile 0.
 */
export function useMatches(enabled: boolean, pageSize = 6) {
  // Results are tagged with the request they answer, so `loading` can be
  // derived instead of set synchronously inside the effect.
  const key = `${pageSize}`;
  const [result, setResult] = useState<{ key: string; data: VendorMatch[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch(`/api/vendor/matches?pageSize=${key}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("failed to load matches");
        const { data } = (await res.json()) as { data: VendorMatch[] };
        return data;
      })
      .catch(() => [] as VendorMatch[])
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  const loading = enabled && result?.key !== key;
  return { matches: enabled && result ? result.data : [], loading };
}
