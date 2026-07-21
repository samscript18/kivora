import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class Report {
  @Prop({ type: Types.ObjectId, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) portfolioId?: Types.ObjectId;
  @Prop({ required: true, enum: ["executive", "portfolio", "owner", "revenue"] }) type!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) body!: string;
  @Prop({ required: true }) generatedBy!: string;
  @Prop({ type: Object, required: true }) metrics!: Record<string, unknown>;
  @Prop({ default: "draft" }) status!: string;
  @Prop({ default: 1 }) version!: number;
  @Prop() currency?: string;
  @Prop() timezone?: string;
  @Prop() periodStart?: Date;
  @Prop() periodEnd?: Date;
  @Prop() finalizedAt?: Date;
  @Prop({ type: [Object], default: [] }) versions!: Array<Record<string, unknown>>;
  @Prop({ type: [Object], default: [] }) deliveries!: Array<Record<string, unknown>>;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ organizationId: 1, createdAt: -1 });
