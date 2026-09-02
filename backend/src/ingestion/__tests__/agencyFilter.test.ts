import { parseAgencyAllowlist, isAgencyAllowed } from "../agencyFilter";

describe("parseAgencyAllowlist", () => {
  it("returns an empty set when unset", () => {
    expect(parseAgencyAllowlist({}).size).toBe(0);
  });

  it("splits on commas and trims", () => {
    const set = parseAgencyAllowlist({ INGEST_AGENCIES: "สำนักการแพทย์, สำนักอนามัย ,สำนักดิจิทัลกรุงเทพมหานคร" });
    expect(set.has("สำนักการแพทย์")).toBe(true);
    expect(set.has("สำนักอนามัย")).toBe(true);
    expect(set.has("สำนักดิจิทัลกรุงเทพมหานคร")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("drops empty entries", () => {
    expect(parseAgencyAllowlist({ INGEST_AGENCIES: "สำนักการแพทย์,, ," }).size).toBe(1);
  });
});

describe("isAgencyAllowed", () => {
  const allow = new Set(["สำนักการแพทย์"]);
  it("allows everything when the set is empty", () => {
    expect(isAgencyAllowed("อะไรก็ได้", new Set())).toBe(true);
    expect(isAgencyAllowed(null, new Set())).toBe(true);
  });
  it("matches on the trimmed name", () => {
    expect(isAgencyAllowed(" สำนักการแพทย์ ", allow)).toBe(true);
  });
  it("rejects a name not in the set", () => {
    expect(isAgencyAllowed("สำนักการคลัง", allow)).toBe(false);
    expect(isAgencyAllowed(null, allow)).toBe(false);
  });
});
