import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class OwnerBrief {
  @Prop({ required: true, index: true }) listingId: string;
  @Prop() owner: string;
  @Prop() subject: string;
  @Prop() body: string;
  @Prop({ default: "draft" }) status: string;
  @Prop() sentAt?: Date;
}
export const OwnerBriefSchema = SchemaFactory.createForClass(OwnerBrief);
