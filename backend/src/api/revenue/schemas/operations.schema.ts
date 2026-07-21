import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

const org = () => ({ type: Types.ObjectId, required: true, index: true });

@Schema({ timestamps: true, bufferCommands: false })
export class WheelhouseConnection {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ required: true, trim: true }) displayName!: string;
  @Prop({ required: true, select: false }) encryptedCredential!: string;
  @Prop() externalAccountId?: string;
  @Prop({ enum: ["connected", "degraded", "revoked", "reauthorization_required"], default: "connected", index: true }) status!: string;
  @Prop() lastSuccessfulSynchronization?: Date;
  @Prop() lastFailedSynchronization?: Date;
  @Prop() lastError?: string;
  @Prop({ type: Object, default: {} }) capabilities!: Record<string, unknown>;
  @Prop({ default: true }) readCapability!: boolean;
  @Prop({ default: false }) writeCapability!: boolean;
  @Prop({ type: [String], default: [] }) supportedMutationTypes!: string[];
  @Prop({ type: Types.ObjectId, required: true }) createdBy!: Types.ObjectId;
  @Prop() revokedAt?: Date;
}
export const WheelhouseConnectionSchema = SchemaFactory.createForClass(WheelhouseConnection);
WheelhouseConnectionSchema.index({ organizationId: 1, displayName: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class Portfolio {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) connectionId!: Types.ObjectId;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop() description?: string;
  @Prop() market?: string;
  @Prop({ required: true, uppercase: true }) defaultCurrency!: string;
  @Prop({ required: true }) timezone!: string;
  @Prop({ type: Types.ObjectId }) managerId?: Types.ObjectId;
  @Prop() ownerName?: string;
  @Prop({ type: Object, default: {} }) notificationSettings!: Record<string, unknown>;
  @Prop({ enum: ["active", "archived"], default: "active", index: true }) status!: string;
  @Prop({ type: Object, default: {} }) strategyPreferences!: Record<string, unknown>;
  @Prop({ type: [String], default: [] }) propertyProfiles!: string[];
  @Prop({ type: Object, default: {} }) reportingPreferences!: Record<string, unknown>;
}
export const PortfolioSchema = SchemaFactory.createForClass(Portfolio);
PortfolioSchema.index({ organizationId: 1, name: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class ListingMapping {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) connectionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) portfolioId!: Types.ObjectId;
  @Prop({ required: true }) externalListingId!: string;
  @Prop({ required: true }) channel!: string;
  @Prop() name?: string;
  @Prop() market?: string;
  @Prop() currency?: string;
  @Prop() timezone?: string;
  @Prop({ type: [String], default: [] }) propertyProfiles!: string[];
  @Prop({ type: [Types.ObjectId], default: [] }) assigneeIds!: Types.ObjectId[];
  @Prop({ default: true }) includedInReporting!: boolean;
  @Prop({ default: true }) active!: boolean;
  @Prop({ type: Object }) source!: Record<string, unknown>;
  @Prop() lastSynchronizedAt?: Date;
}
export const ListingMappingSchema = SchemaFactory.createForClass(ListingMapping);
ListingMappingSchema.index({ organizationId: 1, connectionId: 1, externalListingId: 1, channel: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class ScanCheckpoint {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) connectionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true, unique: true }) key!: string;
  @Prop({ default: 0 }) cursor!: number;
  @Prop({ default: 0 }) listingsScanned!: number;
  @Prop({ default: 0 }) listingsRemaining!: number;
  @Prop() startedAt?: Date;
  @Prop() completedAt?: Date;
  @Prop() lastCompletePortfolioScan?: Date;
  @Prop({ enum: ["idle", "running", "failed"], default: "idle" }) status!: string;
  @Prop({ default: 0 }) retryCount!: number;
  @Prop() lastError?: string;
}
export const ScanCheckpointSchema = SchemaFactory.createForClass(ScanCheckpoint);
ScanCheckpointSchema.index({ organizationId: 1, connectionId: 1, portfolioId: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class DistributedLock {
  @Prop({ required: true, unique: true }) key!: string;
  @Prop({ required: true }) owner!: string;
  @Prop({ required: true, expires: 0 }) expiresAt!: Date;
}
export const DistributedLockSchema = SchemaFactory.createForClass(DistributedLock);

@Schema({ timestamps: true, bufferCommands: false })
export class RevenueOpportunity {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) connectionId?: Types.ObjectId;
  @Prop({ required: true }) deduplicationKey!: string;
  @Prop({ required: true, index: true }) type!: string;
  @Prop() listingId?: string;
  @Prop({ type: [String], default: [] }) listingIds!: string[];
  @Prop({ type: [String], default: [] }) affectedDates!: string[];
  @Prop({ type: Object, required: true }) evidence!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) baseline!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) suggested!: Record<string, unknown>;
  @Prop({ default: 0 }) projectedRevenueGain!: number;
  @Prop({ required: true, uppercase: true }) currency!: string;
  @Prop({ min: 0, max: 100 }) confidence!: number;
  @Prop({ enum: ["low", "medium", "high"] }) riskLevel!: string;
  @Prop({ required: true, index: true }) expiresAt!: Date;
  @Prop({ required: true }) detectionSource!: string;
  @Prop() relatedSignalId?: string;
  @Prop({ enum: ["open", "under_review", "approved", "ignored", "dismissed", "expired", "completed", "superseded"], default: "open", index: true }) status!: string;
  @Prop({ type: Types.ObjectId }) recommendationId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) simulationId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) actionId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) outcomeId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) assignedTo?: Types.ObjectId;
  @Prop({ type: Object, required: true, default: {} }) impactCalculation!: Record<string, unknown>;
  @Prop() refreshedAt?: Date;
  @Prop() resolutionReason?: string;
  @Prop() supersededByDeduplicationKey?: string;
}
export const RevenueOpportunitySchema = SchemaFactory.createForClass(RevenueOpportunity);
RevenueOpportunitySchema.index({ organizationId: 1, deduplicationKey: 1 }, { unique: true });

export const RECOMMENDATION_STATES = ["DRAFT", "READY", "REVIEWED", "APPROVED", "SCHEDULED", "EXECUTING", "APPLIED", "VERIFYING", "VERIFIED", "MEASURING", "COMPLETED", "IGNORED", "DISMISSED", "EXPIRED", "CANCELLED", "FAILED", "PARTIALLY_APPLIED", "REVERTED", "ROLLBACK_FAILED"] as const;
@Schema({ timestamps: true, bufferCommands: false })
export class Recommendation {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop() listingId?: string;
  @Prop({ type: [String], default: [] }) listingIds!: string[];
  @Prop({ type: [String], default: [] }) affectedDates!: string[];
  @Prop({ type: Types.ObjectId, index: true }) incidentId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) opportunityId?: Types.ObjectId;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) explanation!: string;
  @Prop({ required: true }) proposedAction!: string;
  @Prop({ type: Object, required: true }) evidence!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) impactCalculation!: Record<string, unknown>;
  @Prop({ default: 0 }) estimatedImpact!: number;
  @Prop({ required: true, uppercase: true }) currency!: string;
  @Prop({ min: 0, max: 100 }) confidence!: number;
  @Prop() risks?: string;
  @Prop({ required: true, index: true }) expiresAt!: Date;
  @Prop({ enum: RECOMMENDATION_STATES, default: "DRAFT", index: true }) status!: string;
  @Prop({ type: Types.ObjectId }) assignedTo?: Types.ObjectId;
  @Prop() ignoredUntil?: Date;
  @Prop() decisionReason?: string;
  @Prop({ type: [Object], default: [] }) transitions!: Array<Record<string, unknown>>;
}
export const RecommendationSchema = SchemaFactory.createForClass(Recommendation);
RecommendationSchema.index({ organizationId: 1, status: 1, expiresAt: 1 });

@Schema({ timestamps: true, bufferCommands: false })
export class Simulation {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) recommendationId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true }) scope!: string;
  @Prop({ type: Object, required: true }) inputSettings!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) baselineState!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) previewResponse!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) calculatedProjections!: Record<string, unknown>;
  @Prop({ required: true }) selectedStrategy!: string;
  @Prop({ required: true, index: true }) expiresAt!: Date;
}
export const SimulationSchema = SchemaFactory.createForClass(Simulation);

@Schema({ timestamps: true, bufferCommands: false })
export class RevenueAction {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) connectionId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) recommendationId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) simulationId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) requestedBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) approvedBy?: Types.ObjectId;
  @Prop({ required: true }) actionType!: string;
  @Prop({ type: [String], default: [] }) targetListings!: string[];
  @Prop({ type: [String], default: [] }) targetDates!: string[];
  @Prop({ type: Object, required: true }) requestedPayload!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) baselineState!: Record<string, unknown>;
  @Prop({ required: true }) idempotencyKey!: string;
  @Prop({ required: true, index: true }) status!: string;
  @Prop({ default: 0 }) attemptCount!: number;
  @Prop({ type: Object }) upstreamResponse?: Record<string, unknown>;
  @Prop({ type: Object }) verificationResult?: Record<string, unknown>;
  @Prop({ type: Object }) errorDetails?: Record<string, unknown>;
  @Prop() scheduledAt?: Date;
  @Prop() executedAt?: Date;
  @Prop() verifiedAt?: Date;
  @Prop() completedAt?: Date;
  @Prop({ type: Object }) revertInformation?: Record<string, unknown>;
  @Prop({ type: Types.ObjectId }) parentActionId?: Types.ObjectId;
}
export const RevenueActionSchema = SchemaFactory.createForClass(RevenueAction);
RevenueActionSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
RevenueActionSchema.index({ organizationId: 1, status: 1, scheduledAt: 1 });

@Schema({ timestamps: true, bufferCommands: false })
export class Outcome {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, unique: true }) actionId!: Types.ObjectId;
  @Prop({ type: Object, required: true }) baselineSnapshot!: Record<string, unknown>;
  @Prop({ type: Object }) postActionSnapshot?: Record<string, unknown>;
  @Prop({ default: 0 }) projectedRevenueGain!: number;
  @Prop() realizedRevenue?: number;
  @Prop({ required: true, uppercase: true }) currency!: string;
  @Prop() occupancyChange?: number;
  @Prop() adrChange?: number;
  @Prop() revparChange?: number;
  @Prop() bookingPaceChange?: number;
  @Prop() revenueProtected?: number;
  @Prop({ min: 0, max: 100, default: 0 }) attributionConfidence!: number;
  @Prop({ required: true }) measurementStartsAt!: Date;
  @Prop({ required: true }) measurementEndsAt!: Date;
  @Prop({ enum: ["pending", "measuring", "completed", "unattributed"], default: "pending" }) status!: string;
  @Prop() attributionNotes?: string;
}
export const OutcomeSchema = SchemaFactory.createForClass(Outcome);

@Schema({ timestamps: true, bufferCommands: false })
export class NotificationDelivery {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) userId?: Types.ObjectId;
  @Prop({ required: true }) channel!: string;
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) deduplicationKey!: string;
  @Prop({ required: true }) status!: string;
  @Prop() entityType?: string;
  @Prop() entityId?: string;
  @Prop() deliveredAt?: Date;
  @Prop() error?: string;
  @Prop() title?: string;
  @Prop() message?: string;
  @Prop() severity?: string;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;
  @Prop() readAt?: Date;
}
export const NotificationDeliverySchema = SchemaFactory.createForClass(NotificationDelivery);
NotificationDeliverySchema.index({ organizationId: 1, channel: 1, deduplicationKey: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class RevenueSignal {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true }) deduplicationKey!: string;
  @Prop({ required: true, index: true }) source!: string;
  @Prop({ required: true, index: true }) type!: string;
  @Prop() listingId?: string;
  @Prop({ type: [String], default: [] }) listingIds!: string[];
  @Prop({ type: Object }) observedValue?: Record<string, unknown>;
  @Prop({ type: Object }) previousValue?: Record<string, unknown>;
  @Prop({ type: Object, required: true }) evidence!: Record<string, unknown>;
  @Prop({ required: true }) detectedAt!: Date;
  @Prop({ required: true }) validUntil!: Date;
}
export const RevenueSignalSchema = SchemaFactory.createForClass(RevenueSignal);
RevenueSignalSchema.index({ organizationId: 1, deduplicationKey: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class CollaborationEntry {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ required: true }) entityType!: string;
  @Prop({ required: true, index: true }) entityId!: string;
  @Prop({ type: Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true, maxlength: 2000 }) body!: string;
}
export const CollaborationEntrySchema = SchemaFactory.createForClass(CollaborationEntry);
CollaborationEntrySchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: 1 });

@Schema({ timestamps: true, bufferCommands: false })
export class PortfolioHealthScore {
  @Prop(org()) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true, min: 0, max: 100 }) overallScore!: number;
  @Prop({ type: Object, required: true }) componentScores!: Record<string, number>;
  @Prop({ type: Object, required: true }) inputs!: Record<string, unknown>;
  @Prop({ type: Object, required: true }) weights!: Record<string, number>;
  @Prop({ required: true }) explanation!: string;
  @Prop({ required: true }) calculatedAt!: Date;
}
export const PortfolioHealthScoreSchema = SchemaFactory.createForClass(PortfolioHealthScore);
PortfolioHealthScoreSchema.index({ organizationId: 1, portfolioId: 1, calculatedAt: -1 });

export type RevenueActionDocument = HydratedDocument<RevenueAction>;
