import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class TelegramLink {
  @Prop({ required: true, unique: true, index: true }) intentId!: string;
  @Prop({ required: true }) chatId!: string;
  @Prop({ required: true }) telegramUserId!: string;
  @Prop() username?: string;
  @Prop() firstName?: string;
  @Prop() chatType?: string;
  @Prop({ required: true, expires: 0 }) expiresAt!: Date;
}
export const TelegramLinkSchema = SchemaFactory.createForClass(TelegramLink);
