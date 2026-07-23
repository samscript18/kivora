import { ServiceUnavailableException } from "@nestjs/common";
import { Types } from "mongoose";
import { ConnectionService } from "./connection.service";
import { RevenueService } from "./revenue.service";

describe("RevenueService audit rules", () => {
  const wheelhouse = {
    preferences: jest.fn(), recommendations: jest.fn(), kpis: jest.fn(),
    recentChanges: jest.fn(), flags: jest.fn(), listing: jest.fn(), pricingTier: jest.fn(),
    monthlyKpis: jest.fn(), neighborhoodOccupancy: jest.fn(), reservations: jest.fn(),
    basePriceHistory: jest.fn(), checkinCheckout: jest.fn(), minMaxPrices: jest.fn(),
    monthlySeasonality: jest.fn(),
  };
  const snapshots = { create: jest.fn().mockResolvedValue({}), findOne: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })) })) };
  const groq = { answer: jest.fn() };
  const service = new RevenueService(
    wheelhouse as never,
    groq as never,
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
    groq.answer.mockReset();
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

  it("stores trailing KPIs for historical dashboard labels and keeps forward occupancy separate", async () => {
    wheelhouse.preferences.mockResolvedValue({ base_price: 190, automatic_rate_posting_enabled: true });
    wheelhouse.kpis.mockResolvedValue({
      occupancy: { "0_30": 0.1, "30_0": 0.63 },
      revenue: { "0_30": 0, "30_0": 2439 },
      adr: { "0_30": 0, "30_0": 128.37 },
      revpar: { "0_30": 0, "30_0": 81.28 },
      occupancy_neighborhood: { "0_30": 0.12 },
    });

    await (service as any).analyzeListing(listing);

    expect(snapshots.create).toHaveBeenCalledWith(expect.objectContaining({
      occupancy: 0.63,
      forwardOccupancy: 0.1,
      revenue: 2439,
      adr: 128.37,
      revpar: 81.28,
    }));
  });

  it("blocks pricing previews for operational incidents", async () => {
    (service as any).incidentsCache = [{ id: "calendar", canPreview: false }];
    await expect(service.preview("calendar")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("uses the connected property name instead of exposing a listing id", () => {
    const opportunity = (service as any).serializeOpportunity({
      _id: "507f1f77bcf86cd799439011",
      listingId: "64417863",
      listingIds: ["64417863"],
      suggested: { action: "Apply balanced pricing preset" },
      projectedRevenueGain: 293,
      confidence: 72,
      riskLevel: "low",
    }, new Map([["64417863", "Wheelhouse Sample · US"]]));

    expect(opportunity.property).toBe("Wheelhouse Sample · US");
    expect(opportunity.property).not.toBe("64417863");
  });

  it("gives the assistant an explicit ranked revenue-risk context", async () => {
    (service as any).incidentsCache = [{
      id: "risk-1",
      title: "Base price is below guidance",
      listing: "Ocean View",
      cause: "Underpriced",
      revenueAtRisk: 4200,
      currentRate: 100,
      recommendedRate: 160,
      confidence: 93,
    }];
    const dashboard = jest.spyOn(service, "dashboard").mockResolvedValue({
      summary: { health: 72, revenue: 18000, atRisk: 4200, opportunities: 1, occupancy: 61, criticalIncidents: 1, marketSignals: 2 },
      opportunities: [],
      signals: [{ kind: "event", title: "Festival", location: "Nashville", confidence: 90, affectedListings: 2 }],
    } as never);
    groq.answer.mockResolvedValue({ body: "Ocean View has $4,200 at risk." });

    await service.ask("What is my biggest revenue risk today?");

    expect(groq.answer).toHaveBeenCalledWith(
      "What is my biggest revenue risk today?",
      expect.objectContaining({
        revenueRisk: expect.objectContaining({
          activeIncidentCount: 1,
          totalRevenueAtRisk: 4200,
          largestIncident: expect.objectContaining({ property: "Ocean View", measuredRevenueAtRisk: 4200 }),
        }),
        demandSignals: [expect.objectContaining({ measuredRevenueImpact: null })],
      }),
    );
    dashboard.mockRestore();
  });

  it("keeps the listing workspace usable when an optional Wheelhouse feed is unavailable", async () => {
    const actor = { sub: "507f1f77bcf86cd799439011", organizationId: "507f191e810c19729de860ea", organizationRole: "analyst" };
    jest.spyOn(service, "listingWorkspace").mockResolvedValue({
      listing: { id: "listing-1", name: "Ocean View", channel: "direct", connection: { id: "connection-1" } },
      performance: { current: null, history: [] },
      pricing: { preferences: {}, recommendations: { data: [] }, neighborhood: null, recentChanges: {} },
      intelligence: {},
      operations: {},
      capabilities: {},
    } as never);
    (service as any).connectionService = { credential: jest.fn().mockResolvedValue({ credential: "organization-key" }) };
    wheelhouse.listing.mockResolvedValue({ id: "listing-1", channel: "direct", nickname: "Ocean View" });
    wheelhouse.pricingTier.mockResolvedValue({ name: "Pro", horizon: 540 });
    wheelhouse.kpis.mockResolvedValue({ occupancy: { "0_30": 0.7 } });
    wheelhouse.monthlyKpis.mockRejectedValue(new Error("not available"));
    wheelhouse.neighborhoodOccupancy.mockResolvedValue({ data: [] });
    wheelhouse.reservations.mockResolvedValue([]);
    wheelhouse.flags.mockResolvedValue([]);
    wheelhouse.basePriceHistory.mockResolvedValue([]);
    wheelhouse.checkinCheckout.mockResolvedValue({ data: [] });
    wheelhouse.minMaxPrices.mockResolvedValue({ data: [] });
    wheelhouse.monthlySeasonality.mockResolvedValue({ CON: {}, REC: {}, AGG: {} });

    const workspace = await service.listingWorkspaceDepth("listing-1", actor as never);

    expect(workspace.performance.rolling).toEqual({ occupancy: { "0_30": 0.7 } });
    expect(workspace.performance.monthly).toBeNull();
    expect(workspace.liveData.unavailable).toEqual(expect.arrayContaining(["monthly_kpis", "neighborhood_pricing"]));
    expect(workspace.liveData.available).toEqual(expect.arrayContaining(["rolling_kpis", "reservations"]));
  });
});

describe("ConnectionService capability verification", () => {
  it("persists verified write capability after a successful live connection test", async () => {
    const organizationId = new Types.ObjectId(); const connectionId = new Types.ObjectId();
    const connection = { _id: connectionId, organizationId, encryptedCredential: "encrypted" };
    const connections = { findOne: jest.fn(() => ({ select: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(connection) })) })) })), updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) };
    const wheelhouse = { listings: jest.fn().mockResolvedValue([]), capabilities: jest.fn().mockReturnValue({ writeAccess: "verified" }) };
    const service = new ConnectionService({ get: jest.fn() } as never, wheelhouse as never, connections as never, {} as never, { bulkWrite: jest.fn() } as never, {} as never, {} as never);
    jest.spyOn(service as any, "decrypt").mockReturnValue("live-key");

    await service.test({ sub: String(new Types.ObjectId()), organizationId: String(organizationId), organizationRole: "administrator" } as never, String(connectionId));

    expect(connections.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: connectionId, organizationId }), expect.objectContaining({ $set: expect.objectContaining({ status: "connected", readCapability: true, writeCapability: true, supportedMutationTypes: expect.arrayContaining(["pricing_preset", "automatic_rate_posting"]) }) }));
  });
});
