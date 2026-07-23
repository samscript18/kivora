import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class Snapshot {
  @Prop({ type: Types.ObjectId, index: true }) organizationId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true, index: true }) listingId: string;
  @Prop() channel: string;
  @Prop() health: number;
  @Prop() occupancy: number;
  @Prop() forwardOccupancy?: number;
  @Prop() adr: number;
  @Prop() revenue: number;
  @Prop() revpar: number;
  @Prop() pickup: number;
  @Prop() marketOccupancy: number;
  @Prop() compSetOccupancy: number;
  @Prop() revenueScore: number;
  @Prop() dynamicPricingEnabled: boolean;
  @Prop() basePrice: number;
  @Prop() recommendedBasePrice: number;
  @Prop({ type: Object }) raw: Record<string, unknown>;
}
export const SnapshotSchema = SchemaFactory.createForClass(Snapshot);
SnapshotSchema.index({ organizationId: 1, listingId: 1, createdAt: -1 });
