import {
  GprocClient,
  GprocHttpError,
  gprocConfigFromEnv,
  gprocEnabled,
  type GprocConfig,
} from "../gprocClient";

type Call = { url: string; method: string };

function harness(handler: (url: URL, method: string, n: number) => { status?: number; body?: unknown; text?: string }) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const cfg: GprocConfig = {
    baseUrl: "https://gp.test",
    userAgent: "test-agent",
    delayMs: 500,
    timeoutMs: 1000,
    maxRetries: 3,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchFn: (async (input: unknown, init?: { method?: string }) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      calls.push({ url: url.toString(), method });
      const r = handler(url, method, calls.length);
      const status = r.status ?? 200;
      return new Response(r.text ?? JSON.stringify(r.body ?? {}), { status });
    }) as unknown as typeof fetch,
  };
  return { client: new GprocClient(cfg), calls, sleeps };
}

const DETAIL = { data: { projectId: "69099318020", projectStatus: "A", announceType: "W0", methodId: "16", stepId: "W03", extra: 1 } };
const GREEN = {
  data: {
    greenBookAnnouncementTypeLinkDto: [
      { announceType: "D0", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: "A" },
      { announceType: "BOQ", announceDate: "2026-09-22T17:00:00.000Z", announceFlag: null },
      { announceType: "W0", announceDate: "2026-10-05T17:00:00.000Z", announceFlag: "A" },
      { announceDate: "2026-10-05T17:00:00.000Z" }, // no type: dropped
    ],
  },
};

describe("gprocEnabled / gprocConfigFromEnv", () => {
  it("is on by default and off for false/0/off/no", () => {
    expect(gprocEnabled({})).toBe(true);
    for (const v of ["false", "0", "off", "NO", " False "]) expect(gprocEnabled({ GPROC_ENABLED: v })).toBe(false);
    expect(gprocEnabled({ GPROC_ENABLED: "true" })).toBe(true);
  });
  it("has polite defaults and trims a trailing slash", () => {
    const c = gprocConfigFromEnv({ GPROC_BASE_URL: "https://x.test/" });
    expect(c).toMatchObject({ baseUrl: "https://x.test", delayMs: 500, timeoutMs: 30000, maxRetries: 3 });
    expect(c.userAgent).toContain("BkkTorAggregator");
  });
});

describe("GprocClient.projectDetail", () => {
  it("returns the fields we use", async () => {
    const { client, calls } = harness(() => ({ body: DETAIL }));
    await expect(client.projectDetail("69099318020")).resolves.toEqual({
      projectId: "69099318020",
      projectStatus: "A",
      announceType: "W0",
      methodId: "16",
      stepId: "W03",
    });
    expect(calls[0]!.url).toBe(
      "https://gp.test/egp-oann10-service/pb/a-egp-allt-project/announcement/getProjectDetail?projectId=69099318020"
    );
    expect(calls[0]!.method).toBe("GET");
  });
  it("throws when the detail lacks announceType or methodId (shape change)", async () => {
    const { client } = harness(() => ({ body: { data: { projectId: "1", projectStatus: "A" } } }));
    await expect(client.projectDetail("1")).rejects.toThrow(/announceType/);
  });
  it("returns null when e-GP has no such project", async () => {
    const { client } = harness(() => ({ body: { data: null } }));
    await expect(client.projectDetail("69000000000")).resolves.toBeNull();
  });
  it("pauses delayMs after a successful call", async () => {
    const { client, sleeps } = harness(() => ({ body: DETAIL }));
    await client.projectDetail("69099318020");
    expect(sleeps).toEqual([500]);
  });
});

describe("GprocClient.announcements", () => {
  const detail = { projectId: "69099318020", projectStatus: "A", announceType: "W0", methodId: "16", stepId: "W03" };
  it("lists the announcements with the project's own announceType and methodId", async () => {
    const { client, calls } = harness(() => ({ body: GREEN }));
    const rows = await client.announcements("69099318020", detail);
    expect(rows.map((r) => r.announceType)).toEqual(["D0", "BOQ", "W0"]);
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/egp-oann10-service/pb/a-egp-allt-project/announcement/greenBook");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      mode: "LINK",
      methodId: "16",
      tempProjectId: "69099318020",
      pageAnnounceType: "W0",
    });
  });
  it("throws without a request when the detail has no announceType or methodId", async () => {
    const { client, calls } = harness(() => ({ body: GREEN }));
    await expect(client.announcements("1", { ...detail, announceType: null })).rejects.toThrow(/announceType/);
    await expect(client.announcements("1", { ...detail, methodId: null })).rejects.toThrow(/announceType/);
    expect(calls).toHaveLength(0);
  });
  it("throws when the announcement list key is missing or null (shape change)", async () => {
    const nul = harness(() => ({ body: { data: { greenBookAnnouncementTypeLinkDto: null } } }));
    await expect(nul.client.announcements("1", detail)).rejects.toThrow(/announcement list missing/);
    const gone = harness(() => ({ body: { data: {} } }));
    await expect(gone.client.announcements("1", detail)).rejects.toThrow(/announcement list missing/);
  });
  it("accepts an empty list", async () => {
    const { client } = harness(() => ({ body: { data: { greenBookAnnouncementTypeLinkDto: [] } } }));
    expect(await client.announcements("1", detail)).toEqual([]);
  });
});

describe("GprocClient.invitationPdf", () => {
  const pdfB64 = Buffer.from("%PDF-1.7 fake").toString("base64");
  it("looks up the template id, then POSTs view-pdf and decodes the base64 PDF", async () => {
    const { client, calls } = harness((url, method) =>
      url.pathname.endsWith("/infoProcureDocAnnounZip")
        ? { body: { response: { responseCode: "0" }, data: { buildName2: "tpl-1", buildName1: "x.zip" } } }
        : method === "POST"
          ? { body: { response: { responseCode: "0" }, data: pdfB64 } }
          : { status: 405 }
    );
    const buf = await client.invitationPdf("69109010419");
    expect(buf?.toString("latin1")).toBe("%PDF-1.7 fake");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls[1]!.url).toBe("https://gp.test/egp-template-service/dant/view-pdf?templateId=tpl-1");
  });
  it("returns null when the project has no bundle", async () => {
    const { client, calls } = harness(() => ({ body: { response: { responseCode: "1" }, data: null } }));
    expect(await client.invitationPdf("69109010419")).toBeNull();
    expect(calls).toHaveLength(1);
  });
  it("returns null when view-pdf gives no data or something that is not a PDF", async () => {
    const mk = (data: string | null) =>
      harness((url) => (url.pathname.endsWith("/infoProcureDocAnnounZip") ? { body: { data: { buildName2: "t" } } } : { body: { data } }));
    expect(await mk(null).client.invitationPdf("1")).toBeNull();
    expect(await mk(Buffer.from("<html>").toString("base64")).client.invitationPdf("1")).toBeNull();
  });
});

describe("GprocClient retries", () => {
  it("retries a 503 with backoff and then succeeds", async () => {
    const { client, calls, sleeps } = harness((_u, _m, n) => (n < 3 ? { status: 503 } : { body: DETAIL }));
    await expect(client.projectDetail("69099318020")).resolves.not.toBeNull();
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000, 500]);
  });
  it("does not retry a 403 (Cloudflare) and throws a GprocHttpError", async () => {
    const { client, calls } = harness(() => ({ status: 403, text: "blocked" }));
    await expect(client.projectDetail("69099318020")).rejects.toBeInstanceOf(GprocHttpError);
    expect(calls).toHaveLength(1);
  });
  it("retries a non-JSON 200 body, then throws", async () => {
    const { client, calls } = harness(() => ({ text: "<html>challenge</html>" }));
    await expect(client.projectDetail("69099318020")).rejects.toThrow();
    expect(calls).toHaveLength(3);
  });
});
