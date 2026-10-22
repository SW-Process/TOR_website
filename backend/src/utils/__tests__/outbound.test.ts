import { OutboundBlockedError, assertAllowedUrl, safeFetch } from "../outbound";

const allowed = ["egp.test", "files.egp.test"];
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

describe("outbound allowlist (ASVS 1.3.6, 13.2.4)", () => {
  it("allows https to listed hosts only", () => {
    expect(assertAllowedUrl("https://egp.test/api", allowed).host).toBe("egp.test");
    expect(() => assertAllowedUrl("https://evil.test/", allowed)).toThrow(OutboundBlockedError);
    expect(() => assertAllowedUrl("http://egp.test/", allowed)).toThrow(/not https/);
    expect(() => assertAllowedUrl("https://user:pw@egp.test/", allowed)).toThrow(/credentials/);
    expect(() => assertAllowedUrl("https://169.254.169.254/latest/meta-data", allowed)).toThrow(OutboundBlockedError);
  });

  it("allows plain http to localhost outside production only", () => {
    expect(assertAllowedUrl("http://localhost:9000/x", ["localhost:9000"]).port).toBe("9000");
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertAllowedUrl("http://localhost:9000/x", ["localhost:9000"])).toThrow(/not https/);
    } finally {
      process.env.NODE_ENV = env;
    }
  });
});

describe("safeFetch redirects (ASVS 15.3.2)", () => {
  it("follows a redirect to another allowed host", async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(redirect("https://files.egp.test/f.pdf")).mockResolvedValueOnce(new Response("ok"));
    const res = await safeFetch("https://egp.test/file", { method: "GET" }, { allowedHosts: allowed, fetchFn });
    expect(await res.text()).toBe("ok");
    expect(fetchFn.mock.calls[1][0]).toBe("https://files.egp.test/f.pdf");
    expect(fetchFn.mock.calls[0][1].redirect).toBe("manual");
  });

  it("refuses a redirect off the allowlist, e.g. to the metadata server", async () => {
    const fetchFn = jest.fn().mockResolvedValue(redirect("http://169.254.169.254/computeMetadata/v1/"));
    await expect(safeFetch("https://egp.test/x", {}, { allowedHosts: allowed, fetchFn })).rejects.toThrow(OutboundBlockedError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("gives up after 3 redirects", async () => {
    const fetchFn = jest.fn().mockImplementation(() => Promise.resolve(redirect("https://egp.test/loop")));
    await expect(safeFetch("https://egp.test/x", {}, { allowedHosts: allowed, fetchFn })).rejects.toThrow(/too many redirects/);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("turns a POST into a GET on 303 but keeps it on 307", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(redirect("https://egp.test/a", 303))
      .mockResolvedValueOnce(new Response("ok"))
      .mockResolvedValueOnce(redirect("https://egp.test/b", 307))
      .mockResolvedValueOnce(new Response("ok"));
    await safeFetch("https://egp.test/x", { method: "POST", body: "{}" }, { allowedHosts: allowed, fetchFn });
    expect(fetchFn.mock.calls[1][1].method).toBe("GET");
    await safeFetch("https://egp.test/x", { method: "POST", body: "{}" }, { allowedHosts: allowed, fetchFn });
    expect(fetchFn.mock.calls[3][1].method).toBe("POST");
  });

  it("never calls a host that isn't allowed", async () => {
    const fetchFn = jest.fn();
    await expect(safeFetch("https://evil.test/", {}, { allowedHosts: allowed, fetchFn })).rejects.toThrow(OutboundBlockedError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
