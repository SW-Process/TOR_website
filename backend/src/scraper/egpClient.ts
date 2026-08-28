import type {
  EgpAnnouncement,
  EgpClientLike,
  EgpProjectDetail,
  EgpSearchParams,
  EgpSearchResponse,
} from "./egpClient.types";

export interface EgpClientConfig {
  apiBase: string;
  fileBase: string;
  userAgent: string;
  delayMs: number;
  maxRetries: number;
  timeoutMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function numFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function egpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EgpClientConfig {
  return {
    apiBase: env.EGP_API_BASE ?? "https://egp2.bangkok.go.th/appapi/api",
    fileBase: env.EGP_FILE_BASE ?? "https://egp2.bangkok.go.th/api/file",
    userAgent: env.EGP_USER_AGENT ?? "BkkTorAggregator/0.1 (Kasetsart University project)",
    delayMs: numFromEnv(env.EGP_REQUEST_DELAY_MS, 400),
    maxRetries: numFromEnv(env.EGP_MAX_RETRIES, 4),
    timeoutMs: numFromEnv(env.EGP_TIMEOUT_MS, 120_000),
  };
}

export function listingUrl(projectId: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = env.EGP_LISTING_BASE ?? "https://egp2.bangkok.go.th/project-detail";
  return `${base}/${projectId}`;
}

/** Polite read-only client over the Bangkok e-GP public API (see munyin.py). */
export class EgpClient implements EgpClientLike {
  private readonly cfg: EgpClientConfig;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: EgpClientConfig) {
    this.cfg = config;
    this.sleep = config.sleep ?? wait;
  }

  private async request(url: string, accept: "json" | "bytes"): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.cfg.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": this.cfg.userAgent,
            Accept: accept === "json" ? "application/json" : "application/pdf,application/octet-stream",
          },
        });
        if (!res.ok) throw new Error(`e-GP ${res.status} for ${url}`);
        await this.sleep(this.cfg.delayMs); // politeness: pause after every successful call
        return res;
      } catch (err) {
        lastError = err;
        clearTimeout(timer);
        if (attempt === this.cfg.maxRetries - 1) break;
        await this.sleep(2 ** attempt * 1000);
        continue;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async getJson<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${this.cfg.apiBase}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await this.request(url.toString(), "json");
    return (await res.json()) as T;
  }

  searchProjects(params: EgpSearchParams): Promise<EgpSearchResponse> {
    return this.getJson<EgpSearchResponse>("/Projects/GetProjectFromFilter", {
      projectSearchText: params.searchText ?? "",
      masterAnnounceTypeId: params.announceTypeId ?? "",
      startDate: params.fromDate ?? "",
      endDate: params.toDate ?? "",
      pageNo: String(params.page),
      pageSize: String(params.pageSize ?? 50),
      sortBy: "publishDateDesc",
    });
  }

  projectDetail(projectId: string): Promise<EgpProjectDetail> {
    return this.getJson<EgpProjectDetail>("/Projects/GetProjectDetail", { projectId });
  }

  async announcements(projectId: string): Promise<EgpAnnouncement[]> {
    const data = await this.getJson<{ data?: EgpAnnouncement[] }>(
      "/ProjectAnnouncements/GetAnnouncementDetailInProject",
      { pageNo: "1", pageSize: "50", projectId }
    );
    return data.data ?? [];
  }

  async downloadFile(announcementId: string, filename: string): Promise<Buffer> {
    const url = `${this.cfg.fileBase}/${announcementId}/${encodeURIComponent(filename)}`;
    const res = await this.request(url, "bytes");
    return Buffer.from(await res.arrayBuffer());
  }
}

export default EgpClient;
