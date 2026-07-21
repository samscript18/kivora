import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class Report {
  @Prop({ required: true, enum: ["executive", "portfolio", "owner", "revenue"] }) type!: string;
  @Prop({ required: true }) title!: string;
  @Prop({ required: true }) body!: string;
  @Prop({ required: true }) generatedBy!: string;
  @Prop({ type: Object, required: true }) metrics!: Record<string, unknown>;
  @Prop({ default: "draft" }) status!: string;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
