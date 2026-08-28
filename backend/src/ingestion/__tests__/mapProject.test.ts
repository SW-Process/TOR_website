import type { EgpAnnouncement, EgpProjectDetail, EgpSearchProject } from "../../scraper/egpClient.types";
import { canonicalDetailHash, mapProject } from "../mapProject";

const OPTS = { fileBase: "https://egp.test/api/file", listingBase: "https://egp.test/project-detail" };

const project: EgpSearchProject = { projectId: "p-1", projectNumber: "69000000001" };

const detail: EgpProjectDetail = {
  projectName: "  จ้างพัฒนาระบบสารสนเทศ  ",
  masterOrgGroupName: "สำนักการแพทย์",
  masterOrgDepartmentName: "โรงพยาบาลกลาง",
  projectBudget: 3_920_550,
  projectAverageBudget: 3_900_000,
  masterMethodIdName: "ประกวดราคา",
  masterTypeIdName: "จ้าง",
  masterGoodsIdName: "งานจ้างพัฒนาระบบ",
  masterContractAvailableName: "ระหว่างดำเนินการ",
};

const torAnn: EgpAnnouncement = {
  id: "ann-tor",
  masterAnnounceTypeName: "ร่างขอบเขตของงาน (TOR)",
  projectAnnouncementPublishDate: "2026-08-23T17:00:00Z",
  projectAnnouncementPath: "TOR ปี69.pdf",
};

const priceAnn: EgpAnnouncement = {
  id: "ann-price",
  masterAnnounceTypeName: "ประกาศราคากลาง",
  projectAnnouncementPublishDate: "2026-08-24T17:00:00Z",
  projectAnnouncementPath: "price.pdf",
};

describe("mapProject", () => {
  it("maps detail fields, trims the title, and builds the listing URL", () => {
    const m = mapProject(project, detail, [priceAnn, torAnn], OPTS);
    expect(m.projectCode).toBe("69000000001");
    expect(m.set.title).toBe("จ้างพัฒนาระบบสารสนเทศ");
    expect(m.set.agency).toBe("สำนักการแพทย์");
    expect(m.set.department).toBe("โรงพยาบาลกลาง");
    expect(m.set.budget).toBe(3_920_550);
    expect(m.set.referencePrice).toBe(3_900_000);
    expect(m.set.procurementMethod).toBe("ประกวดราคา");
    expect(m.set.procurementType).toBe("จ้าง");
    expect(m.set.goodsCategory).toBe("งานจ้างพัฒนาระบบ");
    expect(m.set.sourceListingUrl).toBe("https://egp.test/project-detail/p-1");
    expect(m.ingestErrors).toEqual([]);
  });

  it("selects the TOR announcement, encodes its URL, and sets announcementDate from it", () => {
    const m = mapProject(project, detail, [priceAnn, torAnn], OPTS);
    expect(m.torAnnouncement).toEqual({
      announcementId: "ann-tor",
      filename: "TOR ปี69.pdf",
      egpUrl: "https://egp.test/api/file/ann-tor/TOR%20%E0%B8%9B%E0%B8%B569.pdf",
      publishedAt: new Date("2026-08-23T17:00:00Z"),
    });
    expect(m.set.announcementDate).toEqual(new Date("2026-08-23T17:00:00Z"));
  });

  it("records an ingest error and null torAnnouncement when no TOR announcement exists", () => {
    const m = mapProject(project, detail, [priceAnn], OPTS);
    expect(m.torAnnouncement).toBeNull();
    expect(m.ingestErrors).toEqual(["no TOR announcement on project 69000000001"]);
    expect(m.set.announcementDate).toBeUndefined();
  });

  it("records an ingest error when the TOR announcement has no file path", () => {
    const m = mapProject(project, detail, [{ ...torAnn, projectAnnouncementPath: null }], OPTS);
    expect(m.torAnnouncement).toBeNull();
    expect(m.ingestErrors).toEqual(["TOR announcement ann-tor has no attached file"]);
  });

  it("omits budget/referencePrice when the API returns null", () => {
    const m = mapProject(project, { ...detail, projectBudget: null, projectAverageBudget: null }, [torAnn], OPTS);
    expect(m.set.budget).toBeUndefined();
    expect(m.set.referencePrice).toBeUndefined();
  });
});

describe("canonicalDetailHash", () => {
  it("is stable regardless of key order and changes when a field changes", () => {
    const a = canonicalDetailHash(detail);
    const reordered: EgpProjectDetail = JSON.parse(
      JSON.stringify({
        masterContractAvailableName: detail.masterContractAvailableName,
        projectName: detail.projectName,
        projectBudget: detail.projectBudget,
        projectAverageBudget: detail.projectAverageBudget,
        masterOrgGroupName: detail.masterOrgGroupName,
        masterOrgDepartmentName: detail.masterOrgDepartmentName,
        masterMethodIdName: detail.masterMethodIdName,
        masterTypeIdName: detail.masterTypeIdName,
        masterGoodsIdName: detail.masterGoodsIdName,
      })
    );
    expect(canonicalDetailHash(reordered)).toBe(a);
    expect(canonicalDetailHash({ ...detail, projectBudget: 1 })).not.toBe(a);
  });
});
