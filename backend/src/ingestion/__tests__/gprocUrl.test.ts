import { gprocHtmlAnnouncementUrl, gprocProjectUrl } from "../gprocUrl";

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

describe("gprocHtmlAnnouncementUrl", () => {
  it("is the old e-GP page the ดูข้อมูล icon opens for a method-20 project", () => {
    expect(gprocHtmlAnnouncementUrl("69109054191")).toBe(
      "https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?pid=69109054191&servlet=gojsp&proc_id=ShowHTMLFile&processFlows=Procure"
    );
  });
});
