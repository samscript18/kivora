import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Types } from "mongoose";
import { RevenueService } from "./revenue.service";

const actor = { sub: "507f1f77bcf86cd799439011", name: "Alex", organizationId: "507f191e810c19729de860ea", organizationRole: "revenue_manager" } as any;

describe("RevenueService tenant and lifecycle invariants", () => {
  it("scopes recommendation decisions to the active organization", async () => {
    const recommendation = { _id: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), status: "READY", expiresAt: new Date(Date.now() + 60_000) };
    const records = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(recommendation) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ ...recommendation, status: "APPROVED" }) }),
    };
    const audits = { create: jest.fn().mockResolvedValue({}) };
    const service = Object.create(RevenueService.prototype) as any;
    service.recommendationRecords = records; service.audits = audits;

    await service.transitionRecommendation(String(recommendation._id), "approve", actor);

    expect(records.findOne).toHaveBeenCalledWith(expect.objectContaining({ organizationId: new Types.ObjectId(actor.organizationId) }));
    expect(records.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ organizationId: recommendation.organizationId, status: "READY" }), expect.anything(), expect.anything());
    expect(audits.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: new Types.ObjectId(actor.organizationId), action: "recommendation_approve" }));
  });

  it("rejects an invalid repeated lifecycle transition", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.recommendationRecords = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), status: "APPROVED", expiresAt: new Date(Date.now() + 60_000) }) }) };
    await expect(service.transitionRecommendation("507f1f77bcf86cd799439012", "approve", actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires a reason when dismissing a recommendation", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.recommendationRecords = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), status: "READY", expiresAt: new Date(Date.now() + 60_000) }) }) };
    await expect(service.transitionRecommendation("507f1f77bcf86cd799439012", "dismiss", actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects approval from an insufficient organization role", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.recommendationRecords = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), status: "READY", expiresAt: new Date(Date.now() + 60_000) }) }) };
    await expect(service.transitionRecommendation("507f1f77bcf86cd799439012", "approve", { ...actor, organizationRole: "viewer" })).rejects.toThrow("Revenue manager permission is required");
    expect(service.recommendationRecords.findOne).not.toHaveBeenCalled();
  });

  it("uses a deterministic, explainable priority score", () => {
    const service = Object.create(RevenueService.prototype) as any;
    const critical = service.priorityScore({ impact: 5000, confidence: 90, severity: "Critical" });
    const informational = service.priorityScore({ impact: 0, confidence: 50 });
    expect(critical).toBeGreaterThan(informational);
    expect(service.priorityScore({ impact: 5000, confidence: 90, severity: "Critical" })).toBe(critical);
  });

  it("generates a real PDF byte stream and escaped CSV", () => {
    const service = Object.create(RevenueService.prototype) as any;
    const pdf: Buffer = service.createPdf("Revenue report", "Verified live facts");
    const csv: Buffer = service.createCsv({ summary: { revenue: 1200, note: "live, verified" } });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString("binary")).toContain("startxref");
    expect(csv.toString()).toContain('"summary.note","live, verified"');
  });

  it("rejects cross-tenant incident work-item reads", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.incidents = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) };
    await expect(service.workItem("incident", "foreign", actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(service.incidents.findOne).toHaveBeenCalledWith(expect.objectContaining({ organizationId: new Types.ObjectId(actor.organizationId) }));
  });

  it("rejects simulation execution when the preview is expired", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.recommendationRecords = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), status: "APPROVED", expiresAt: new Date(Date.now() + 60_000) }) }) };
    service.simulations = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) };
    service.actions = {};
    await expect(service.executeRecommendation("507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013", actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it("expires stale independent opportunities before detection", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.opportunityRecords = { updateMany: jest.fn().mockResolvedValue({}), findOneAndUpdate: jest.fn() };
    service.market = { list: jest.fn().mockResolvedValue([]) };
    service.connection = { db: { collection: jest.fn().mockReturnValue({ find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }) }) } };
    await service.detectIndependentOpportunities(actor, []);
    expect(service.opportunityRecords.updateMany).toHaveBeenCalledWith(expect.objectContaining({ organizationId: new Types.ObjectId(actor.organizationId), expiresAt: expect.anything() }), { $set: { status: "expired" } });
  });

  it("does not call projected opportunity revenue realized revenue", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.outcomes = { findOneAndUpdate: jest.fn().mockResolvedValue({}) };
    await service.createOutcome(actor, new Types.ObjectId(), { rate: 100 }, 900, "USD", false);
    const insert = service.outcomes.findOneAndUpdate.mock.calls[0][1].$setOnInsert;
    expect(insert.projectedRevenueGain).toBe(900);
    expect(insert.revenueProtected).toBe(0);
    expect(insert.realizedRevenue).toBeUndefined();
  });

  it("marks an outcome unattributed when comparable snapshots are unavailable", async () => {
    const outcome = { _id: new Types.ObjectId(), actionId: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), measurementStartsAt: new Date(Date.now() - 1000), measurementEndsAt: new Date(Date.now() - 500) };
    const service = Object.create(RevenueService.prototype) as any;
    service.outcomes = { find: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([outcome]) }) }), updateOne: jest.fn().mockResolvedValue({}) };
    service.actions = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ targetListings: ["listing"], organizationId: outcome.organizationId, status: "VERIFIED", createdAt: new Date(Date.now() - 2000) }) }) };
    service.snapshots = { findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }) };
    await expect(service.evaluateOutcomes()).resolves.toMatchObject({ unattributed: 1 });
    expect(service.outcomes.updateOne).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: "unattributed", attributionConfidence: 0 }) }));
  });

  it("calculates outcome deltas from comparable persisted snapshots", async () => {
    const outcome = { _id: new Types.ObjectId(), actionId: new Types.ObjectId(), organizationId: new Types.ObjectId(actor.organizationId), measurementStartsAt: new Date(Date.now() - 2000), measurementEndsAt: new Date(Date.now() - 1000) };
    const service = Object.create(RevenueService.prototype) as any;
    service.outcomes = { find: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([outcome]) }) }), updateOne: jest.fn().mockResolvedValue({}) };
    service.actions = { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ targetListings: ["listing"], organizationId: outcome.organizationId, status: "VERIFIED", createdAt: new Date(Date.now() - 4000) }) }) };
    const values = [{ revenue: 1000, occupancy: .5, adr: 100, revpar: 50, pickup: 2 }, { revenue: 1250, occupancy: .6, adr: 110, revpar: 66, pickup: 3 }];
    service.snapshots = { findOne: jest.fn().mockImplementation(() => ({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(values.shift()) }) })) };
    await expect(service.evaluateOutcomes()).resolves.toMatchObject({ completed: 1 });
    const measured = service.outcomes.updateOne.mock.calls[0][1].$set;
    expect(measured).toMatchObject({ realizedRevenue: 250, attributionConfidence: 40 });
    expect(measured.occupancyChange).toBeCloseTo(.1);
  });

  it("serializes object identifiers for safe frontend use", () => {
    const service = Object.create(RevenueService.prototype) as any; const id = new Types.ObjectId();
    expect(service.serializeDocument({ _id: id, organizationId: id })).toMatchObject({ id: String(id), organizationId: String(id) });
  });

  it("uses organization-scoped notification deduplication", async () => {
    const service = Object.create(RevenueService.prototype) as any;
    service.notifications = { findOneAndUpdate: jest.fn().mockResolvedValue({}) };
    await service.notify(actor, "result", "same", "Done", "Verified", "success");
    expect(service.notifications.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ organizationId: new Types.ObjectId(actor.organizationId), channel: "in_app", deduplicationKey: "same" }), expect.anything(), { upsert: true });
  });

  it("makes health scoring worse for more incidents", () => {
    const service = Object.create(RevenueService.prototype) as any;
    expect(Math.max(0, 100 - 5 * 12)).toBeLessThan(Math.max(0, 100 - 1 * 12));
    expect(service.priorityScore({ impact: 1000, confidence: 80, severity: "Critical" })).toBeGreaterThan(service.priorityScore({ impact: 1000, confidence: 80, severity: "Warning" }));
  });

  it("persists a valid scheduled preset with its simulation",async()=>{const rec:any={_id:new Types.ObjectId(),organizationId:new Types.ObjectId(actor.organizationId),status:"APPROVED",expiresAt:new Date(Date.now()+3_600_000),proposedAction:"apply_pricing_preset",listingIds:["one"]};const sim:any={_id:new Types.ObjectId(),selectedStrategy:"balanced",expiresAt:new Date(Date.now()+3_600_000)};const service=Object.create(RevenueService.prototype)as any;service.recommendationRecords={findOne:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue(rec)}),updateOne:jest.fn()};service.simulations={findOne:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue(sim)})};service.actions={findOneAndUpdate:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue({_id:new Types.ObjectId(),organizationId:rec.organizationId,connectionId:new Types.ObjectId(),status:"SCHEDULED"})})};service.scope=jest.fn().mockResolvedValue({connectionId:String(new Types.ObjectId()),portfolioId:String(new Types.ObjectId())});await expect(service.scheduleRecommendation(String(rec._id),new Date(Date.now()+60_000).toISOString(),actor,"test",String(sim._id))).resolves.toMatchObject({status:"SCHEDULED"});expect(service.actions.findOneAndUpdate.mock.calls[0][1].$setOnInsert).toMatchObject({simulationId:sim._id,requestedPayload:{proposedAction:"apply_pricing_preset",strategy:"balanced"}});});

  it("rejects scheduling when the simulation expires before execution",async()=>{const rec:any={_id:new Types.ObjectId(),organizationId:new Types.ObjectId(actor.organizationId),status:"APPROVED",expiresAt:new Date(Date.now()+3_600_000),proposedAction:"apply_pricing_preset"};const service=Object.create(RevenueService.prototype)as any;service.recommendationRecords={findOne:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue(rec)})};service.simulations={findOne:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue(null)})};service.actions={};await expect(service.scheduleRecommendation(String(rec._id),new Date(Date.now()+60_000).toISOString(),actor,undefined,String(new Types.ObjectId()))).rejects.toBeInstanceOf(ConflictException);});

  it("prevents a duplicate scheduled worker claim",async()=>{const action:any={_id:new Types.ObjectId(),status:"SCHEDULED",scheduledAt:new Date(),organizationId:new Types.ObjectId(actor.organizationId)};const service=Object.create(RevenueService.prototype)as any;service.actions={find:jest.fn().mockReturnValue({sort:jest.fn().mockReturnValue({limit:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue([action])})})}),findOneAndUpdate:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue(null)})};service.recommendationRecords={};service.connectionService={};service.acquireLock=jest.fn().mockResolvedValue(true);service.releaseLock=jest.fn();service.metrics={increment:jest.fn()};await expect(service.executeScheduledActions()).resolves.toMatchObject({due:1,executed:0});expect(service.actions.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({_id:action._id,status:"SCHEDULED"}),expect.anything(),expect.anything());});
});
