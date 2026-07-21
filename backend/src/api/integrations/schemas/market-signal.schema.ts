import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class MarketSignal {
  @Prop({ required: true, unique: true, index: true }) externalId!: string;
  @Prop({ required: true, enum: ["event", "weather"], index: true }) kind!: "event" | "weather";
  @Prop({ required: true }) title!: string;
  @Prop() description?: string;
  @Prop() location?: string;
  @Prop() latitude?: number;
  @Prop() longitude?: number;
  @Prop() startsAt?: Date;
  @Prop() endsAt?: Date;
  @Prop({ enum: ["up", "down", "mixed", "monitor"] }) demandDirection!: string;
  @Prop({ min: 0, max: 100 }) confidence!: number;
  @Prop({ default: 0 }) affectedListings!: number;
  @Prop({ type: [String], default: [] }) listingIds!: string[];
  @Prop({ required: true }) source!: string;
  @Prop() sourceUrl?: string;
  @Prop({ type: Object }) evidence!: Record<string, unknown>;
  @Prop({ required: true, expires: 0 }) expiresAt!: Date;
}

export const MarketSignalSchema = SchemaFactory.createForClass(MarketSignal);
MarketSignalSchema.index({ kind: 1, startsAt: 1 });
