import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { RevenueController } from "./revenue.controller";
import { RevenueService } from "./revenue.service";
import { ScannerService } from "./scanner.service";
import { AuditLog, AuditLogSchema } from "./schemas/audit-log.schema";
import { Incident, IncidentSchema } from "./schemas/incident.schema";
import { OwnerBrief, OwnerBriefSchema } from "./schemas/owner-brief.schema";
import { Report, ReportSchema } from "./schemas/report.schema";
import { AssistantMessage, AssistantMessageSchema } from "./schemas/assistant-message.schema";
import { Snapshot, SnapshotSchema } from "./schemas/snapshot.schema";
import { Organization, OrganizationSchema } from "../auth/schemas/organization.schema";
import { ConnectionService } from "./connection.service";
import { OperationsController, PortfolioOperationsController } from "./operations.controller";
import { CollaborationEntry, CollaborationEntrySchema, DistributedLock, DistributedLockSchema, ListingMapping, ListingMappingSchema, NotificationDelivery, NotificationDeliverySchema, Outcome, OutcomeSchema, Portfolio, PortfolioHealthScore, PortfolioHealthScoreSchema, PortfolioSchema, Recommendation, RecommendationSchema, RevenueAction, RevenueActionSchema, RevenueOpportunity, RevenueOpportunitySchema, RevenueSignal, RevenueSignalSchema, ScanCheckpoint, ScanCheckpointSchema, Simulation, SimulationSchema, WheelhouseConnection, WheelhouseConnectionSchema } from "./schemas/operations.schema";

@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }, { name: Incident.name, schema: IncidentSchema }, { name: OwnerBrief.name, schema: OwnerBriefSchema }, { name: Report.name, schema: ReportSchema }, { name: AssistantMessage.name, schema: AssistantMessageSchema }, { name: Snapshot.name, schema: SnapshotSchema }, { name: Organization.name, schema: OrganizationSchema }, { name: WheelhouseConnection.name, schema: WheelhouseConnectionSchema }, { name: Portfolio.name, schema: PortfolioSchema }, { name: ListingMapping.name, schema: ListingMappingSchema }, { name: ScanCheckpoint.name, schema: ScanCheckpointSchema }, { name: DistributedLock.name, schema: DistributedLockSchema }, { name: RevenueOpportunity.name, schema: RevenueOpportunitySchema }, { name: Recommendation.name, schema: RecommendationSchema }, { name: Simulation.name, schema: SimulationSchema }, { name: RevenueAction.name, schema: RevenueActionSchema }, { name: Outcome.name, schema: OutcomeSchema }, { name: NotificationDelivery.name, schema: NotificationDeliverySchema }, { name: RevenueSignal.name, schema: RevenueSignalSchema }, { name: CollaborationEntry.name, schema: CollaborationEntrySchema }, { name: PortfolioHealthScore.name, schema: PortfolioHealthScoreSchema }])],
  controllers: [RevenueController, OperationsController, PortfolioOperationsController],
  providers: [RevenueService, ScannerService, ConnectionService],
})
export class RevenueModule {}
