import { gprocProjectUrl } from "../gprocUrl";

describe("gprocProjectUrl", () => {
  it("opens the process5 search page for the project number", () => {
    expect(gprocProjectUrl("69099314442")).toBe(
      "https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=69099314442"
    );
  });
  it("honours a base override and trims a trailing slash", () => {
    expect(gprocProjectUrl("69099314442", "https://gp.test/")).toBe("https://gp.test/egp-agpc01-web/announcement?keywordSearch=69099314442");
  });
});
