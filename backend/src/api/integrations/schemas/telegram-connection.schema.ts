import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class TelegramConnection {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) chatId!: string;
  @Prop({ required: true, index: true }) telegramUserId!: string;
  @Prop() username?: string;
  @Prop() firstName?: string;
  @Prop() chatType?: string;
  @Prop({ default: true }) enabled!: boolean;
  @Prop() linkedAt!: Date;
  @Prop() lastDeliveredAt?: Date;
}
export const TelegramConnectionSchema = SchemaFactory.createForClass(TelegramConnection);
