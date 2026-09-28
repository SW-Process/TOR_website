import { computeMatch } from "../matching";
import type { IVendorProfile } from "../../models/VendorProfile";
import type { ITor } from "../../models/Tor";

function profile(over: Partial<IVendorProfile> = {}): IVendorProfile {
  return {
    interestedCategories: [],
    technologyStack: [],
    ...over,
  } as IVendorProfile;
}

function tor(over: Partial<ITor> = {}): ITor {
  return { technologyStack: [], ...over } as ITor;
}

describe("computeMatch", () => {
  it("scores 100 on a perfect match across all three signals", () => {
    const p = profile({
      interestedCategories: ["web-application"],
      technologyStack: ["React", "Node.js"],
      budgetRange: { min: 100_000, max: 1_000_000 },
    });
    const t = tor({ category: "web-application", technologyStack: ["React", "Node.js"], budget: 500_000 });

    const result = computeMatch(p, t);
    expect(result.score).toBe(100);
    expect(result.matchedCriteria.sort()).toEqual(["budgetRange", "category", "technologyStack"]);
  });

  it("scores 0 on a total miss", () => {
    const p = profile({
      interestedCategories: ["cctv-its"],
      technologyStack: ["COBOL"],
      budgetRange: { min: 100_000, max: 200_000 },
    });
    const t = tor({ category: "web-application", technologyStack: ["React"], budget: 5_000_000 });

    const result = computeMatch(p, t);
    expect(result.score).toBeLessThan(30);
    expect(result.matchedCriteria).toEqual([]);
  });

  it("gives partial credit for partial technology stack overlap", () => {
    const p = profile({ technologyStack: ["React"] });
    const t = tor({ technologyStack: ["React", "Node.js", "PostgreSQL"] });

    const result = computeMatch(p, t);
    // 1 of 3 required techs covered — met (overlap > 0) but not full points
    expect(result.matchedCriteria).toEqual(["technologyStack"]);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it("decays budget score with distance once outside the range, never below 0", () => {
    const p = profile({ budgetRange: { min: 100_000, max: 200_000 } });
    const near = computeMatch(p, tor({ budget: 210_000 }));
    const far = computeMatch(p, tor({ budget: 20_000_000 }));

    expect(near.score).toBeGreaterThan(far.score);
    expect(far.score).toBeGreaterThanOrEqual(0);
    expect(near.matchedCriteria).toEqual([]); // outside range is never "met"
  });

  it("is case-insensitive on technology stack names", () => {
    const p = profile({ technologyStack: ["react", "node.js"] });
    const t = tor({ technologyStack: ["React", "Node.js"] });
    expect(computeMatch(p, t).matchedCriteria).toContain("technologyStack");
  });

  it("rescales over only the applicable criteria when the profile is incomplete", () => {
    // only interestedCategories filled in, budget/tech stack empty
    const p = profile({ interestedCategories: ["web-application"] });
    const t = tor({ category: "web-application", technologyStack: ["React"], budget: 500_000 });

    // category is the only applicable signal and it's a full match -> 100,
    // not 40 (its raw weight out of the full 100-point scale).
    expect(computeMatch(p, t).score).toBe(100);
  });

  it("scores 0 for a completely empty profile", () => {
    const p = profile();
    const t = tor({ category: "web-application", technologyStack: ["React"], budget: 500_000 });
    expect(computeMatch(p, t)).toEqual({ score: 0, matchedCriteria: [] });
  });
});
