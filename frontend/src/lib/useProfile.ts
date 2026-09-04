"use client";

import { useCallback, useEffect, useState } from "react";
import { daysUntil, type Category, type TOR } from "@/lib/mockData";
import { apiFetch } from "@/lib/api";

export interface BusinessProfile {
  businessName: string;
  businessType: string;
  interestedCategories: Category[];
  registeredCapital: number;
  experienceYears: number;
  teamSize: number;
  budgetMin: number;
  budgetMax: number;
  serviceArea: string;
  certifications: string;
}

export const emptyProfile: BusinessProfile = {
  businessName: "",
  businessType: "",
  interestedCategories: [],
  registeredCapital: 0,
  experienceYears: 0,
  teamSize: 0,
  budgetMin: 0,
  budgetMax: 0,
  serviceArea: "",
  certifications: "",
};

interface BackendVendorProfile {
  companyName?: string;
  businessType?: string;
  registeredCapital?: number;
  yearsExperience?: number;
  teamSize?: number;
  certifications?: string[];
  interestedCategories?: string[];
  budgetRange?: { min?: number; max?: number };
  serviceArea?: string;
}

// The vendor profile is otherwise empty on first load (no companyName etc.)
// once the account exists, so treat that as "no profile filled in yet".
function isEmpty(p: BackendVendorProfile): boolean {
  return (
    !p.companyName &&
    !p.businessType &&
    !p.registeredCapital &&
    !p.yearsExperience &&
    !p.teamSize &&
    !(p.certifications && p.certifications.length) &&
    !(p.interestedCategories && p.interestedCategories.length) &&
    !p.budgetRange?.min &&
    !p.budgetRange?.max &&
    !p.serviceArea
  );
}

function fromBackend(p: BackendVendorProfile): BusinessProfile {
  return {
    businessName: p.companyName ?? "",
    businessType: p.businessType ?? "",
    interestedCategories: (p.interestedCategories ?? []) as Category[],
    registeredCapital: p.registeredCapital ?? 0,
    experienceYears: p.yearsExperience ?? 0,
    teamSize: p.teamSize ?? 0,
    budgetMin: p.budgetRange?.min ?? 0,
    budgetMax: p.budgetRange?.max ?? 0,
    serviceArea: p.serviceArea ?? "",
    certifications: (p.certifications ?? []).join(", "),
  };
}

function toBackend(p: BusinessProfile): Record<string, unknown> {
  return {
    companyName: p.businessName,
    businessType: p.businessType,
    registeredCapital: p.registeredCapital,
    yearsExperience: p.experienceYears,
    teamSize: p.teamSize,
    certifications: p.certifications
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    interestedCategories: p.interestedCategories,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    serviceArea: p.serviceArea,
  };
}

export function useProfile() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: BackendVendorProfile }>("/vendor/profile")
      .then(({ profile: p }) => setProfile(isEmpty(p) ? null : fromBackend(p)))
      .catch(() => setProfile(null))
      .finally(() => setReady(true));
  }, []);

  const saveProfile = useCallback(async (next: BusinessProfile) => {
    const { profile: p } = await apiFetch<{ profile: BackendVendorProfile }>("/vendor/profile", {
      method: "PUT",
      body: JSON.stringify(toBackend(next)),
    });
    setProfile(fromBackend(p));
  }, []);

  return { profile, ready, saveProfile, hasProfile: !!profile };
}

// Placeholder heuristic only — matches user-facing copy that says the real
// scoring will come once the data team defines what the AI model needs.
export function computeMatchScore(tor: TOR, profile: BusinessProfile): number {
  let score = 40;

  if (profile.interestedCategories.includes(tor.category)) score += 35;

  if (profile.budgetMin || profile.budgetMax) {
    const min = profile.budgetMin || 0;
    const max = profile.budgetMax || Infinity;
    if (tor.budget >= min && tor.budget <= max) {
      score += 20;
    } else {
      const mid = (min + (Number.isFinite(max) ? max : min * 2 || tor.budget)) / 2;
      const diffRatio = mid ? Math.abs(tor.budget - mid) / mid : 1;
      score += Math.max(0, 20 - diffRatio * 20);
    }
  }

  if (profile.experienceYears >= 3) score += 5;

  return Math.max(5, Math.min(97, Math.round(score)));
}

// Used before a profile is filled in, so the recommendation UI still has a
// number to show — based only on signals from the TOR itself (urgency,
// interest, AI-summary confidence), not personalized to any business.
export function computeFallbackScore(tor: TOR): number {
  const confidenceBonus =
    tor.summary.confidence === "สูง" ? 15 : tor.summary.confidence === "ปานกลาง" ? 8 : 0;
  const viewsBonus = Math.min(25, Math.round(tor.views / 50));
  const remaining = daysUntil(tor.deadline);
  const urgencyBonus = remaining >= 0 && remaining <= 7 ? 10 : 0;

  return Math.max(35, Math.min(92, 45 + confidenceBonus + viewsBonus + urgencyBonus));
}
