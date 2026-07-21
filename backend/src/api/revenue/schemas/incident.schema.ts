import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class Incident {
  @Prop({ required: true, unique: true, index: true }) externalId: string;
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
}
export type IncidentDocument = HydratedDocument<Incident>;
export const IncidentSchema = SchemaFactory.createForClass(Incident);
