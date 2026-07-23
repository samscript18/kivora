import { HttpException } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { WheelhouseService } from "./wheelhouse.service";

const config = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
});

describe("WheelhouseService write access", () => {
  it("allows an approved live attempt without requiring an environment flag", () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    expect(service.capabilities()).toMatchObject({
      writeActions: true,
      writeAccess: "unverified",
    });
    expect(() => service.assertWriteAccess()).not.toThrow();
  });

  it("learns when a configured key is rejected as read-only", async () => {
    const http = {
      request: jest.fn(() =>
        throwError(() => ({
          response: { status: 403, data: { error: "This API key is read-only" } },
        })),
      ),
    };
    const service = new WheelhouseService(
      http as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    await expect(
      service.updateSetting("listing", "airbnb", "base_price_adjustment", { type: "REC" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.capabilities()).toMatchObject({
      writeActions: false,
      writeAccess: "read_only",
      lastError: 403,
    });
  });

  it("marks write access verified only after a real write succeeds", async () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config({ WHEELHOUSE_API_KEY: "key" }) as never,
    );

    await service.updateSetting("listing", "airbnb", "base_price_adjustment", { type: "REC" });

    expect(service.capabilities()).toMatchObject({
      writeActions: true,
      writeAccess: "verified",
    });
  });

  it("rejects writes when no connection is configured", () => {
    const service = new WheelhouseService(
      { request: jest.fn(() => of({ data: {} })) } as never,
      config() as never,
    );

    expect(service.capabilities()).toMatchObject({ writeActions: false });
    expect(() => service.assertWriteAccess()).toThrow(HttpException);
  });
});

describe("WheelhouseService data-depth reads", () => {
  it("scopes listing analytics reads to the listing channel and credential", async () => {
    const http = { request: jest.fn(() => of({ data: { currency: "USD", data: [] } })) };
    const service = new WheelhouseService(http as never, config() as never);

    await service.monthlyKpis("listing / 1", "airbnb", "organization-key");
    await service.neighborhoodOccupancy("listing / 1", "airbnb", "organization-key");
    await service.basePriceHistory("listing / 1", "airbnb", "2026-06-01", "2026-06-30", "organization-key");

    expect(http.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: "GET",
      url: expect.stringContaining("/listings/listing%20%2F%201/kpis/monthly?channel=airbnb"),
      headers: { "X-Integration-Api-Key": "organization-key" },
    }));
    expect(http.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      url: expect.stringContaining("/listings/listing%20%2F%201/neighborhood/occupancy?channel=airbnb"),
    }));
    expect(http.request).toHaveBeenNthCalledWith(3, expect.objectContaining({
      url: expect.stringContaining("start_date=2026-06-01&end_date=2026-06-30"),
    }));
  });

  it("paginates reservations until Wheelhouse returns a partial page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `reservation-${index}`,
      start_date: "2026-08-01",
      end_date: "2026-08-02",
    }));
    const http = {
      request: jest.fn()
        .mockReturnValueOnce(of({ data: firstPage }))
        .mockReturnValueOnce(of({ data: [{ id: "reservation-100", start_date: "2026-08-02", end_date: "2026-08-03" }] })),
    };
    const service = new WheelhouseService(http as never, config({ WHEELHOUSE_API_KEY: "key" }) as never);

    const reservations = await service.reservations("listing", "direct", "2026-08-01", "2027-01-31");

    expect(reservations).toHaveLength(101);
    expect(http.request).toHaveBeenCalledTimes(2);
    expect(http.request.mock.calls[0][0].url).toContain("per_page=100&page=1");
    expect(http.request.mock.calls[1][0].url).toContain("per_page=100&page=2");
  });

  it("reuses cached GET responses for repeated Wheelhouse reads", async () => {
    const http = { request: jest.fn(() => of({ data: { currency: "USD", data: [] } })) };
    const cache = {
      get: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify({ currency: "USD", data: [] })),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
    };
    const service = new WheelhouseService(http as never, config({ WHEELHOUSE_API_KEY: "key", REDIS_URL: "redis://localhost", WHEELHOUSE_CACHE_TTL_SECONDS: "60" }) as never);
    (service as unknown as { cache?: typeof cache }).cache = cache;

    await expect(service.monthlyKpis("listing", "direct")).resolves.toEqual({ currency: "USD", data: [] });
    await expect(service.monthlyKpis("listing", "direct")).resolves.toEqual({ currency: "USD", data: [] });

    expect(http.request).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(expect.stringContaining("wheelhouse:"), JSON.stringify({ currency: "USD", data: [] }), "EX", 60);
    expect(cache.get).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached listing reads after a successful Wheelhouse mutation", async () => {
    const http = {
      request: jest.fn()
        .mockReturnValueOnce(of({ data: { base_price: 500 } }))
        .mockReturnValueOnce(of({ data: {} }))
        .mockReturnValueOnce(of({ data: { base_price: 650 } })),
    };
    const service = new WheelhouseService(http as never, config({ WHEELHOUSE_API_KEY: "key" }) as never);

    await service.preferences("listing", "direct");
    await service.updatePreferences("listing", "direct", { base_price: 650 });
    await expect(service.preferences("listing", "direct")).resolves.toEqual({ base_price: 650 });

    expect(http.request).toHaveBeenCalledTimes(3);
  });

  it("does not mark the account disconnected when an optional listing feed is unavailable", async () => {
    const http = {
      request: jest.fn()
        .mockReturnValueOnce(of({ data: [] }))
        .mockReturnValueOnce(throwError(() => ({ response: { status: 404, data: { error: "No neighborhood data" } } }))),
    };
    const service = new WheelhouseService(http as never, config({ WHEELHOUSE_API_KEY: "key" }) as never);

    await service.listings();
    await expect(service.flags("listing", "direct")).rejects.toMatchObject({ status: 404 });

    expect(service.capabilities()).toMatchObject({ connected: true, lastError: 404 });
  });
});
