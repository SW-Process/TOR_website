"use client";

import { useCallback, useEffect, useState } from "react";
import { daysUntil, type Category, type TOR } from "@/lib/mockData";

const STORAGE_KEY = "tor-insight:profile";

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

function readStorage(): BusinessProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BusinessProfile) : null;
  } catch {
    return null;
  }
}

export function useProfile() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(readStorage());
    setReady(true);
  }, []);

  const saveProfile = useCallback((next: BusinessProfile) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
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
