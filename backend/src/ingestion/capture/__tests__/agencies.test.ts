import { agencyMatches, captureAgencies } from "../agencies";

describe("captureAgencies", () => {
  it("is empty by default and splits a comma list", () => {
    expect(captureAgencies({})).toEqual([]);
    expect(captureAgencies({ CAPTURE_AGENCIES: " กรุงเทพมหานคร , สำนักงานพัฒนา ,," })).toEqual(["กรุงเทพมหานคร", "สำนักงานพัฒนา"]);
  });
});
describe("agencyMatches", () => {
  it("allows everything when the list is empty", () => expect(agencyMatches([], "ใครก็ได้")).toBe(true));
  it("matches when an entry is contained in any name", () => {
    expect(agencyMatches(["กรุงเทพมหานคร"], "กรมชลประทาน", "กรุงเทพมหานคร")).toBe(true);
    expect(agencyMatches(["สำนักดิจิทัล"], "สำนักงานพัฒนาระบบสารสนเทศดิจิทัล")).toBe(false);
    expect(agencyMatches(["x"], null, undefined)).toBe(false);
  });
});
