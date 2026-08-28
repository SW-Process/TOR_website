/** masterAnnounceTypeId for ร่างขอบเขตของงาน (TOR). */
export const TOR_TYPE_ID = "24995aa2-d875-4d3d-9dec-d5e22d222aa4";

export interface EgpSearchProject {
  projectId: string;
  projectNumber: string;
}

export interface EgpSearchResponse {
  totalCount: number;
  hasNextPage: boolean;
  data: EgpSearchProject[];
}

export interface EgpProjectDetail {
  projectName: string;
  masterOrgGroupName: string | null;
  masterOrgDepartmentName: string | null;
  projectBudget: number | null;
  projectAverageBudget: number | null;
  masterMethodIdName: string | null;
  masterTypeIdName: string | null;
  masterGoodsIdName: string | null;
  masterContractAvailableName: string | null;
}

export interface EgpAnnouncement {
  id: string;
  masterAnnounceTypeName: string | null;
  projectAnnouncementPublishDate: string | null;
  projectAnnouncementPath: string | null;
}

export interface EgpSearchParams {
  page: number;
  pageSize?: number;
  announceTypeId?: string | null;
  searchText?: string;
  fromDate?: string;
  toDate?: string;
}

export interface EgpClientLike {
  searchProjects(params: EgpSearchParams): Promise<EgpSearchResponse>;
  projectDetail(projectId: string): Promise<EgpProjectDetail>;
  announcements(projectId: string): Promise<EgpAnnouncement[]>;
  downloadFile(announcementId: string, filename: string): Promise<Buffer>;
}
