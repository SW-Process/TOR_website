import type { GprocAnnouncement, GprocBundle, GprocCaptureClientLike, GprocClientLike, GprocProjectDetail } from "./gprocClient.types";

export type { GprocAnnouncement, GprocBundle, GprocCaptureClientLike, GprocClientLike, GprocProjectDetail } from "./gprocClient.types";

export interface GprocConfig {
  baseUrl: string;
  userAgent: string;
  delayMs: number;
  timeoutMs: number;
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
  fetchFn?: typeof fetch;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `GPROC_ENABLED` turns the process5 source off with false/0/off/no (default on). */
export function gprocEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.GPROC_ENABLED ?? "true").trim().toLowerCase();
  return !["false", "0", "off", "no"].includes(v);
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function gprocConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GprocConfig {
  return {
    baseUrl: (env.GPROC_BASE_URL ?? "https://process5.gprocurement.go.th").replace(/\/$/, ""),
    userAgent: env.EGP_USER_AGENT ?? "BkkTorAggregator/0.1 (Kasetsart University project)",
    delayMs: num(env.GPROC_DELAY_MS, 500),
    timeoutMs: num(env.GPROC_TIMEOUT_MS, 30_000),
    maxRetries: Math.max(1, num(env.GPROC_MAX_RETRIES, 3)),
  };
}

export class GprocHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GprocHttpError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Thrown for failures a retry cannot fix (oversized or malformed download). */
class NonRetryable extends Error {}

const ANNOUNCEMENT = "/egp-oann10-service/pb/a-egp-allt-project/announcement";

interface Envelope<T> {
  data?: T | null;
}

/**
 * Polite read-only client over the national e-GP (process5) per-project endpoints. None of these
 * is behind the Cloudflare check (the project SEARCH is, and is deliberately not used here).
 */
export class GprocClient implements GprocCaptureClientLike {
  constructor(private readonly cfg: GprocConfig) {}

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    query: Record<string, string>,
    parse: (res: Response) => Promise<T> = (res) => res.json() as Promise<T>
  ): Promise<T> {
    const url = new URL(`${this.cfg.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const fetchFn = this.cfg.fetchFn ?? fetch;
    const sleep = this.cfg.sleep ?? wait;
    let lastError: unknown;
    for (let attempt = 0; attempt < this.cfg.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const res = await fetchFn(url.toString(), {
          method,
          signal: controller.signal,
          headers: {
            "User-Agent": this.cfg.userAgent,
            Accept: "application/json",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          },
        });
        if (!res.ok) throw new GprocHttpError(res.status, `gprocurement ${res.status} for ${method} ${path}`);
        const body = await parse(res);
        await sleep(this.cfg.delayMs); // politeness: pause after every successful call
        return body;
      } catch (err) {
        lastError = err;
        if (err instanceof NonRetryable) throw err;
        if (err instanceof GprocHttpError && !err.retryable) throw err;
        if (attempt === this.cfg.maxRetries - 1) break;
        await sleep(2 ** attempt * 1000);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async projectDetail(projectId: string): Promise<GprocProjectDetail | null> {
    const body = await this.call<Envelope<Partial<GprocProjectDetail>>>("GET", `${ANNOUNCEMENT}/getProjectDetail`, {
      projectId,
    });
    const d = body.data;
    if (!d || !d.projectId) return null;
    // A project that answers without these has changed shape: fail loudly so the caller falls back.
    if (!d.announceType || !d.methodId) {
      throw new Error(`gprocurement project ${projectId}: detail lacks announceType/methodId (response shape changed?)`);
    }
    return {
      projectId: String(d.projectId),
      projectStatus: d.projectStatus ?? null,
      announceType: d.announceType ?? null,
      methodId: d.methodId ?? null,
      stepId: d.stepId ?? null,
      projectName: d.projectName ?? null,
      deptName: d.deptName ?? null,
      deptSubName: d.deptSubName ?? null,
      budgetYear: d.budgetYear ?? null,
    };
  }

  async announcements(projectId: string, detail: GprocProjectDetail): Promise<GprocAnnouncement[]> {
    if (!detail.announceType || !detail.methodId) {
      throw new Error(`gprocurement project ${projectId}: detail lacks announceType/methodId`);
    }
    const body = await this.call<Envelope<{ greenBookAnnouncementTypeLinkDto?: Partial<GprocAnnouncement>[] | null }>>(
      "GET",
      `${ANNOUNCEMENT}/greenBook`,
      { mode: "LINK", methodId: detail.methodId, tempProjectId: projectId, pageAnnounceType: detail.announceType }
    );
    const list = body.data?.greenBookAnnouncementTypeLinkDto;
    if (!Array.isArray(list)) {
      throw new Error(`gprocurement project ${projectId}: announcement list missing (response shape changed?)`);
    }
    return list
      .filter((r): r is Partial<GprocAnnouncement> & { announceType: string } => typeof r?.announceType === "string")
      .map((r) => ({
        announceType: r.announceType,
        announceDate: r.announceDate ?? null,
        announceFlag: r.announceFlag ?? null,
        priceBuild: typeof r.priceBuild === "number" ? r.priceBuild : null,
      }));
  }

  async invitationPdf(projectId: string): Promise<Buffer | null> {
    const info = await this.call<Envelope<{ buildName2?: string | null }>>(
      "GET",
      "/egp-approval-service/apv-common/infoProcureDocAnnounZip",
      { projectId }
    );
    const templateId = info.data?.buildName2;
    if (!templateId) return null;
    // view-pdf only answers POST; the template id travels in the query string, the body is empty.
    const pdf = await this.call<Envelope<string>>("POST", "/egp-template-service/dant/view-pdf", { templateId });
    if (!pdf.data) return null;
    const buf = Buffer.from(pdf.data, "base64");
    return buf.length > 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-" ? buf : null;
  }

  async documentBundle(projectId: string, opts: { draft: boolean }): Promise<GprocBundle | null> {
    const path = `/egp-approval-service/apv-common/${opts.draft ? "infoProcureDocAnnounZipTemp" : "infoProcureDocAnnounZip"}`;
    const info = await this.call<Envelope<{ zipId?: string | null; buildName1?: string | null }>>("GET", path, { projectId });
    const zipId = info.data?.zipId;
    return zipId ? { zipId, name: info.data?.buildName1 ?? null } : null;
  }

  async downloadBundle(zipId: string, maxBytes: number): Promise<Buffer> {
    return this.call<Buffer>("GET", "/egp-upload-service/v1/downloadFileTest", { fileId: zipId }, async (res) => {
      // The response may carry no content-length, so count the bytes as they arrive.
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) throw new NonRetryable(`bundle is larger than ${maxBytes} bytes`);
      const chunks: Buffer[] = [];
      let total = 0;
      const reader = res.body?.getReader();
      if (!reader) throw new NonRetryable("bundle has no body");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new NonRetryable(`bundle is larger than ${maxBytes} bytes`);
        }
        chunks.push(Buffer.from(value));
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new NonRetryable("bundle is not a zip");
      return buf;
    });
  }
}
