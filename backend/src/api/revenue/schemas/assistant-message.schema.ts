import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class AssistantMessage {
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ["user", "assistant"] }) role!: "user" | "assistant";
  @Prop({ required: true, maxlength: 12_000 }) text!: string;
  @Prop({ default: "web", enum: ["web", "telegram"] }) channel!: "web" | "telegram";
  @Prop() generatedBy?: string;
  @Prop({ default: true }) grounded!: boolean;
}

export const AssistantMessageSchema = SchemaFactory.createForClass(AssistantMessage);
AssistantMessageSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
