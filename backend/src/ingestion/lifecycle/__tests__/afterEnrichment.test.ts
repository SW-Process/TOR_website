import type { BidDeadlineExtractor } from "../../enrichment/torExtractor";

const refreshLifecycleMock = jest.fn();
jest.mock("../refreshLifecycle", () => ({
  refreshLifecycle: (...args: unknown[]) => refreshLifecycleMock(...args),
}));

import { chainLifecycleAfterEnrichment } from "../afterEnrichment";

afterEach(() => jest.clearAllMocks());

describe("chainLifecycleAfterEnrichment", () => {
  it.each([[undefined], [null], [{}], [{ enrichedTorIds: [] }]])(
    "does nothing for %p",
    async (out) => {
      await expect(
        chainLifecycleAfterEnrichment(out as never, { trigger: "scheduled" })
      ).resolves.toBeUndefined();
      expect(refreshLifecycleMock).not.toHaveBeenCalled();
    }
  );

  it("refreshes exactly the enriched TORs with the given trigger, user and extractor", async () => {
    refreshLifecycleMock.mockResolvedValue({});
    const deadlineExtractor = { extractBidDeadline: jest.fn() } as unknown as BidDeadlineExtractor;
    await chainLifecycleAfterEnrichment(
      { enrichedTorIds: ["a", "b"] },
      { trigger: "manual", triggeredBy: "admin-1", deadlineExtractor }
    );
    expect(refreshLifecycleMock).toHaveBeenCalledTimes(1);
    expect(refreshLifecycleMock).toHaveBeenCalledWith({
      torIds: ["a", "b"],
      trigger: "manual",
      triggeredBy: "admin-1",
      deadlineExtractor,
    });
  });

  it("never throws when the refresh rejects; it logs instead", async () => {
    const err = new Error("boom");
    refreshLifecycleMock.mockRejectedValue(err);
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(
        chainLifecycleAfterEnrichment({ enrichedTorIds: ["a"] }, { trigger: "scheduled" })
      ).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith("lifecycle after enrichment failed:", err);
    } finally {
      spy.mockRestore();
    }
  });
});
