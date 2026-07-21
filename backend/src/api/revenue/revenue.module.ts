import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { RevenueController } from "./revenue.controller";
import { RevenueService } from "./revenue.service";
import { ScannerService } from "./scanner.service";
import { AuditLog, AuditLogSchema } from "./schemas/audit-log.schema";
import { Incident, IncidentSchema } from "./schemas/incident.schema";
import { OwnerBrief, OwnerBriefSchema } from "./schemas/owner-brief.schema";
import { Snapshot, SnapshotSchema } from "./schemas/snapshot.schema";

@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }, { name: Incident.name, schema: IncidentSchema }, { name: OwnerBrief.name, schema: OwnerBriefSchema }, { name: Snapshot.name, schema: SnapshotSchema }])],
  controllers: [RevenueController],
  providers: [RevenueService, ScannerService],
})
export class RevenueModule {}
