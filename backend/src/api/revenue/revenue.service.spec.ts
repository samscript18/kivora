import { ServiceUnavailableException } from "@nestjs/common";
import { RevenueService } from "./revenue.service";

describe("RevenueService audit rules", () => {
  const wheelhouse = {
    preferences: jest.fn(), recommendations: jest.fn(), kpis: jest.fn(),
    recentChanges: jest.fn(), flags: jest.fn(),
  };
  const snapshots = { create: jest.fn().mockResolvedValue({}) };
  const service = new RevenueService(
    wheelhouse as never,
    {} as never,
    {} as never,
    { configured: false } as never,
    { get: jest.fn() } as never,
    { readyState: 1 } as never,
    {} as never,
    {} as never,
    snapshots as never,
    {} as never,
    {} as never,
  );
  const listing = { id: "listing-1", channel: "direct", nickname: "Ocean View", location: { address: "Miami" } };

  beforeEach(() => {
    jest.clearAllMocks();
    wheelhouse.preferences.mockResolvedValue({ base_price: 100, automatic_rate_posting_enabled: true });
    wheelhouse.recommendations.mockResolvedValue({ base_price_recommended: 200, data: Array.from({ length: 30 }, (_, day) => ({ stay_date: `2026-08-${day + 1}`, price: 200 })) });
    wheelhouse.kpis.mockResolvedValue({ occupancy: { "0_30": 0.6 }, revenue: { "0_30": 10_000 }, adr: { "0_30": 180 }, occupancy_neighborhood: { "0_30": 0.7 } });
    wheelhouse.recentChanges.mockResolvedValue({ rates: "2026-07-21T10:00:00Z" });
    wheelhouse.flags.mockResolvedValue([]);
  });

  it("turns a material live underpricing gap into an approval-ready incident", async () => {
    const incident = await (service as any).analyzeListing(listing);
    expect(incident).toMatchObject({ cause: "Listing underpriced versus Wheelhouse", canPreview: true, canAutoResolve: true, currentRate: 100, recommendedRate: 200 });
    expect(incident.revenueAtRisk).toBeGreaterThan(0);
    expect(snapshots.create).toHaveBeenCalled();
  });

  it("does not invent an incident when live pricing and market pace are aligned", async () => {
    wheelhouse.preferences.mockResolvedValue({ base_price: 190, automatic_rate_posting_enabled: true });
    wheelhouse.kpis.mockResolvedValue({ occupancy: { "0_30": 0.65 }, occupancy_neighborhood: { "0_30": 0.7 } });
    await expect((service as any).analyzeListing(listing)).resolves.toBeNull();
  });

  it("blocks pricing previews for operational incidents", async () => {
    (service as any).incidentsCache = [{ id: "calendar", canPreview: false }];
    await expect(service.preview("calendar")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
