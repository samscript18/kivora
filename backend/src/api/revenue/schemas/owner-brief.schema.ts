import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class OwnerBrief {
  @Prop({ type: Types.ObjectId, index: true }) organizationId!: Types.ObjectId;
  @Prop({ required: true, index: true }) listingId: string;
  @Prop() owner: string;
  @Prop() subject: string;
  @Prop() body: string;
  @Prop({ default: "draft" }) status: string;
  @Prop() sentAt?: Date;
}
export const OwnerBriefSchema = SchemaFactory.createForClass(OwnerBrief);
OwnerBriefSchema.index({ organizationId: 1, createdAt: -1 });
