import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class Incident {
  @Prop({ type: Types.ObjectId, index: true }) organizationId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true, index: true }) externalId: string;
  @Prop({ required: true, index: true }) listingId: string;
  @Prop({ required: true }) channel: string;
  @Prop() listing: string;
  @Prop() title: string;
  @Prop() cause: string;
  @Prop() severity: string;
  @Prop() revenueAtRisk: number;
  @Prop() confidence: number;
  @Prop({ default: "open", index: true }) status: string;
  @Prop({ type: Object }) evidence: Record<string, unknown>;
  @Prop() rootCause?: string;
  @Prop({ type: [String], default: [] }) affectedDates?: string[];
  @Prop({ type: Types.ObjectId }) assignedTo?: Types.ObjectId;
  @Prop() verificationState?: string;
  @Prop() resolvedAt?: Date;
}
export type IncidentDocument = HydratedDocument<Incident>;
export const IncidentSchema = SchemaFactory.createForClass(Incident);
IncidentSchema.index({ organizationId: 1, externalId: 1 }, { unique: true });
IncidentSchema.index({ organizationId: 1, status: 1, severity: 1 });
