import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class TelegramConnection {
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, index: true }) chatId!: string;
  @Prop({ required: true, index: true }) telegramUserId!: string;
  @Prop() username?: string;
  @Prop() firstName?: string;
  @Prop() chatType?: string;
  @Prop({ default: true }) enabled!: boolean;
  @Prop() linkedAt!: Date;
  @Prop() lastDeliveredAt?: Date;
}
export const TelegramConnectionSchema = SchemaFactory.createForClass(TelegramConnection);
TelegramConnectionSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
TelegramConnectionSchema.index({ organizationId: 1, chatId: 1 }, { unique: true });
