import { EgpClient, egpConfigFromEnv, listingUrl } from "../egpClient";
import { TOR_TYPE_ID } from "../egpClient.types";

const CONFIG = {
  apiBase: "https://egp.test/appapi/api",
  fileBase: "https://egp.test/api/file",
  userAgent: "Test/1.0",
  delayMs: 0,
  maxRetries: 3,
  timeoutMs: 1000,
  maxFileBytes: 52_428_800,
  sleep: () => Promise.resolve(),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("EgpClient.searchProjects", () => {
  it("builds the filter query and returns the parsed page", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ totalCount: 1, hasNextPage: false, data: [{ projectId: "p1", projectNumber: "69000000001" }] }));

    const client = new EgpClient(CONFIG);
    const page = await client.searchProjects({ page: 2, pageSize: 25, announceTypeId: TOR_TYPE_ID, searchText: "ซอฟต์แวร์" });

    expect(page.data[0]?.projectNumber).toBe("69000000001");
    const url = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/appapi/api/Projects/GetProjectFromFilter");
    expect(url.searchParams.get("pageNo")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(url.searchParams.get("masterAnnounceTypeId")).toBe(TOR_TYPE_ID);
    expect(url.searchParams.get("projectSearchText")).toBe("ซอฟต์แวร์");
    expect(url.searchParams.get("sortBy")).toBe("publishDateDesc");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Test/1.0");
  });

  it("retries on a 500 then succeeds", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({ totalCount: 0, hasNextPage: false, data: [] }));

    const client = new EgpClient(CONFIG);
    const page = await client.searchProjects({ page: 1 });

    expect(page.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ message: "boom" }, 503));
    const client = new EgpClient(CONFIG);
    await expect(client.searchProjects({ page: 1 })).rejects.toThrow(/503/);
  });

  it("does not retry a 404", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ message: "nope" }, 404));
    const client = new EgpClient(CONFIG);
    await expect(client.searchProjects({ page: 1 })).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("EgpClient.downloadFile", () => {
  it("encodes the filename and returns a Buffer", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(Buffer.from("%PDF-1.4 bytes"), { status: 200 }));

    const client = new EgpClient(CONFIG);
    const buf = await client.downloadFile("ann-1", "ร่าง TOR.pdf");

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toContain("%PDF");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://egp.test/api/file/ann-1/%E0%B8%A3%E0%B9%88%E0%B8%B2%E0%B8%87%20TOR.pdf");
  });

  it("rejects a download whose Content-Length exceeds the cap", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(Buffer.from("x"), { status: 200, headers: { "content-length": "99999999999" } })
    );
    const client = new EgpClient({ ...CONFIG, maxFileBytes: 1024 });
    await expect(client.downloadFile("ann-1", "big.pdf")).rejects.toThrow(/too large/);
  });
});

describe("egpConfigFromEnv / listingUrl", () => {
  it("reads bases and politeness knobs from env with defaults", () => {
    const cfg = egpConfigFromEnv({
      EGP_API_BASE: "https://x/api",
      EGP_USER_AGENT: "UA/9",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBase).toBe("https://x/api");
    expect(cfg.userAgent).toBe("UA/9");
    expect(cfg.delayMs).toBe(400);
    expect(cfg.maxRetries).toBe(4);
  });

  it("builds a project listing URL", () => {
    expect(listingUrl("p1", { EGP_LISTING_BASE: "https://egp.test/project-detail" } as NodeJS.ProcessEnv)).toBe(
      "https://egp.test/project-detail/p1"
    );
  });
});
