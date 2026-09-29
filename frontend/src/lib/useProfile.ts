"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/mockData";
import { apiFetch } from "@/lib/api";
import { categoryToSlug, slugToCategory } from "@/lib/torApi";

export interface BusinessProfile {
  businessName: string;
  businessType: string;
  interestedCategories: Category[];
  /** Comma-separated in the form; sent as an array (matched against Tor.technologyStack). */
  technologyStack: string;
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
  technologyStack: "",
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
  technologyStack?: string[];
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
    !(p.technologyStack && p.technologyStack.length) &&
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
    interestedCategories: (p.interestedCategories ?? [])
      .map(slugToCategory)
      .filter((c): c is Category => c !== null),
    technologyStack: (p.technologyStack ?? []).join(", "),
    registeredCapital: p.registeredCapital ?? 0,
    experienceYears: p.yearsExperience ?? 0,
    teamSize: p.teamSize ?? 0,
    budgetMin: p.budgetRange?.min ?? 0,
    budgetMax: p.budgetRange?.max ?? 0,
    serviceArea: p.serviceArea ?? "",
    certifications: (p.certifications ?? []).join(", "),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toBackend(p: BusinessProfile): Record<string, unknown> {
  return {
    companyName: p.businessName,
    businessType: p.businessType,
    registeredCapital: p.registeredCapital,
    yearsExperience: p.experienceYears,
    teamSize: p.teamSize,
    certifications: splitList(p.certifications),
    technologyStack: splitList(p.technologyStack),
    // Sent as taxonomy slugs so the backend matcher can compare them to Tor.category.
    interestedCategories: p.interestedCategories.map(categoryToSlug),
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    serviceArea: p.serviceArea,
  };
}

export function useProfile() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiFetch("/api/vendor/profile")
      .then(async (res) => {
        if (!res.ok) throw new Error("failed to load profile");
        const { profile: p } = (await res.json()) as { profile: BackendVendorProfile };
        setProfile(isEmpty(p) ? null : fromBackend(p));
      })
      .catch(() => setProfile(null))
      .finally(() => setReady(true));
  }, []);

  const saveProfile = useCallback(async (next: BusinessProfile) => {
    const res = await apiFetch("/api/vendor/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toBackend(next)),
    });
    if (!res.ok) throw new Error("failed to save profile");
    const { profile: p } = (await res.json()) as { profile: BackendVendorProfile };
    setProfile(fromBackend(p));
  }, []);

  return { profile, ready, saveProfile, hasProfile: !!profile };
}
