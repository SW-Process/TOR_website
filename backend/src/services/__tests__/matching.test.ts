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

  describe("technologyStack signal", () => {
    it("scores exactly the covered fraction of the TOR's required stack", () => {
      const p = profile({ technologyStack: ["React"] });
      // tech stack is the only applicable signal: 1/3 of 35 over 35 → 33
      expect(computeMatch(p, tor({ technologyStack: ["React", "Node.js", "PostgreSQL"] })).score).toBe(33);
      expect(computeMatch(p, tor({ technologyStack: ["React", "Node.js"] })).score).toBe(50);
    });

    it("does not penalise a vendor for offering extra technologies", () => {
      const p = profile({ technologyStack: ["React", "Vue", "Angular", "Svelte"] });
      expect(computeMatch(p, tor({ technologyStack: ["React"] })).score).toBe(100);
    });

    it("ignores surrounding whitespace on both sides", () => {
      const p = profile({ technologyStack: ["  React  "] });
      expect(computeMatch(p, tor({ technologyStack: ["React "] })).score).toBe(100);
    });

    it("de-duplicates the TOR's required stack case-insensitively", () => {
      const p = profile({ technologyStack: ["React"] });
      // ["React", "react"] is one requirement, fully covered
      expect(computeMatch(p, tor({ technologyStack: ["React", "react"] })).score).toBe(100);
    });

    it("requires an exact name match — no substring or alias matching", () => {
      const p = profile({ technologyStack: ["React", "NodeJS"] });
      const result = computeMatch(p, tor({ technologyStack: ["React Native", "Node.js"] }));
      expect(result.score).toBe(0);
      expect(result.matchedCriteria).toEqual([]);
    });

    it("matches non-ASCII technology names", () => {
      const p = profile({ technologyStack: ["ระบบ GIS"] });
      expect(computeMatch(p, tor({ technologyStack: ["ระบบ GIS"] })).score).toBe(100);
    });

    it("is not applicable when the TOR lists no technologies", () => {
      const p = profile({ interestedCategories: ["web-application"], technologyStack: ["React"] });
      // only category counts → full marks, not dragged down by an empty TOR stack
      expect(computeMatch(p, tor({ category: "web-application", technologyStack: [] })).score).toBe(100);
    });

    it("is not applicable when either side holds only blank entries", () => {
      const p = profile({ interestedCategories: ["web-application"], technologyStack: ["  ", ""] });
      const t = tor({ category: "web-application", technologyStack: ["React"] });
      expect(computeMatch(p, t).score).toBe(100);
      expect(computeMatch(profile({ technologyStack: ["React"] }), tor({ technologyStack: [" "] }))).toEqual({
        score: 0,
        matchedCriteria: [],
      });
    });
  });

  describe("category signal", () => {
    it("is not applicable when the TOR has no category", () => {
      const p = profile({ interestedCategories: ["web-application"], technologyStack: ["React"] });
      expect(computeMatch(p, tor({ technologyStack: ["React"] })).score).toBe(100);
    });

    it("matches if the TOR's category is any one of several interests", () => {
      const p = profile({ interestedCategories: ["gis", "cybersecurity", "web-application"] });
      expect(computeMatch(p, tor({ category: "web-application" })).matchedCriteria).toEqual(["category"]);
    });

    it("compares taxonomy slugs, so a Thai display label never matches", () => {
      const p = profile({ interestedCategories: ["พัฒนาเว็บไซต์และแอปพลิเคชัน"] });
      expect(computeMatch(p, tor({ category: "web-application" })).score).toBe(0);
    });
  });

  describe("budgetRange signal", () => {
    it("treats both bounds as inclusive", () => {
      const p = profile({ budgetRange: { min: 100_000, max: 200_000 } });
      expect(computeMatch(p, tor({ budget: 100_000 })).score).toBe(100);
      expect(computeMatch(p, tor({ budget: 200_000 })).score).toBe(100);
    });

    it("treats a missing max as open-ended", () => {
      const p = profile({ budgetRange: { min: 100_000 } });
      expect(computeMatch(p, tor({ budget: 50_000_000 })).score).toBe(100);
    });

    it("treats a missing min as zero", () => {
      const p = profile({ budgetRange: { max: 200_000 } });
      expect(computeMatch(p, tor({ budget: 1 })).score).toBe(100);
    });

    it("decays linearly relative to the nearest bound", () => {
      const p = profile({ budgetRange: { min: 100_000, max: 200_000 } });
      // 100k above a 200k max → 50% off → 12.5/25 → 50
      expect(computeMatch(p, tor({ budget: 300_000 })).score).toBe(50);
      // 50k below a 100k min → 50% off → 50
      expect(computeMatch(p, tor({ budget: 50_000 })).score).toBe(50);
      // twice the max or more away → 0, never negative
      expect(computeMatch(p, tor({ budget: 400_000 })).score).toBe(0);
      expect(computeMatch(p, tor({ budget: 10_000_000 })).score).toBe(0);
    });

    it("prefers referencePrice over budget when both exist", () => {
      const p = profile({ budgetRange: { min: 100_000, max: 200_000 } });
      expect(computeMatch(p, tor({ budget: 9_000_000, referencePrice: 150_000 })).score).toBe(100);
      expect(computeMatch(p, tor({ budget: 150_000, referencePrice: 9_000_000 })).score).toBe(0);
    });

    it("is not applicable when the TOR has neither budget nor referencePrice", () => {
      const p = profile({ interestedCategories: ["gis"], budgetRange: { min: 1, max: 2 } });
      expect(computeMatch(p, tor({ category: "gis" })).score).toBe(100);
    });

    // Documents why the frontend must not send 0 for an unfilled budget:
    // {min: 0, max: 0} is a real (empty) range, so every priced TOR misses it.
    it("treats a 0–0 range as a real range that every priced TOR misses", () => {
      const p = profile({ interestedCategories: ["gis"], budgetRange: { min: 0, max: 0 } });
      const result = computeMatch(p, tor({ category: "gis", budget: 500_000 }));
      expect(result.score).toBe(62); // 40 / 65
      expect(result.matchedCriteria).toEqual(["category"]);
    });
  });

  describe("combined score", () => {
    it("weights category 40, technologyStack 35, budgetRange 25", () => {
      const p = profile({
        interestedCategories: ["web-application"],
        technologyStack: ["React"],
        budgetRange: { min: 100_000, max: 200_000 },
      });
      const t = tor({ category: "web-application", technologyStack: ["React", "Node.js"], budget: 150_000 });
      // 40 + 17.5 + 25 = 82.5 → 83
      expect(computeMatch(p, t).score).toBe(83);
    });

    it("only category missing out of three → 60", () => {
      const p = profile({
        interestedCategories: ["gis"],
        technologyStack: ["React"],
        budgetRange: { min: 100_000, max: 200_000 },
      });
      const t = tor({ category: "web-application", technologyStack: ["React"], budget: 150_000 });
      expect(computeMatch(p, t).score).toBe(60);
    });

    it("always returns an integer between 0 and 100", () => {
      const p = profile({
        interestedCategories: ["gis"],
        technologyStack: ["A", "B", "C"],
        budgetRange: { min: 7, max: 13 },
      });
      for (const budget of [0, 1, 7, 10, 13, 19, 1_000_000]) {
        for (const stack of [[], ["A"], ["A", "X", "Y"], ["a", "b", "c"]]) {
          const { score } = computeMatch(p, tor({ category: "gis", technologyStack: stack, budget }));
          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    });

    it("does not mutate the profile or TOR it is given", () => {
      const p = profile({ technologyStack: [" React "], budgetRange: { min: 1, max: 2 } });
      const t = tor({ technologyStack: ["React"], budget: 1 });
      const pCopy = JSON.stringify(p);
      const tCopy = JSON.stringify(t);
      computeMatch(p, t);
      expect(JSON.stringify(p)).toBe(pCopy);
      expect(JSON.stringify(t)).toBe(tCopy);
    });
  });
});
