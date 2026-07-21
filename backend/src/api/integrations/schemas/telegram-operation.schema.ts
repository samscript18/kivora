import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class TelegramActionIntent {
  @Prop({ required: true, unique: true, index: true }) nonce!: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) entityId!: string;
  @Prop() recommendationId?: string;
  @Prop() simulationId?: string;
  @Prop() revenueActionId?: string;
  @Prop({ required: true, expires: 0 }) expiresAt!: Date;
  @Prop() consumedAt?: Date;
}
export const TelegramActionIntentSchema = SchemaFactory.createForClass(TelegramActionIntent);

@Schema({ timestamps: true, bufferCommands: false })
export class TelegramDelivery {
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) userId?: Types.ObjectId;
  @Prop({ required: true }) chatId!: string;
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) deduplicationKey!: string;
  @Prop({ enum: ["pending", "delivered", "failed"], default: "pending" }) status!: string;
  @Prop() deliveredAt?: Date;
  @Prop() error?: string;
  @Prop({default:0})attemptCount!:number;
  @Prop()nextRetryAt?:Date;
  @Prop()text?:string;
  @Prop({type:Object})replyMarkup?:Record<string,unknown>;
}
export const TelegramDeliverySchema = SchemaFactory.createForClass(TelegramDelivery);
TelegramDeliverySchema.index({ organizationId: 1, chatId: 1, deduplicationKey: 1 }, { unique: true });

@Schema({ timestamps: true, bufferCommands: false })
export class TelegramInteraction {
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, index: true }) userId?: Types.ObjectId;
  @Prop({ required: true }) chatId!: string;
  @Prop({ required: true, index: true }) type!: string;
  @Prop() action?: string;
  @Prop() recommendationId?: string;
  @Prop() simulationId?: string;
  @Prop() revenueActionId?: string;
  @Prop({ required: true }) status!: string;
  @Prop() error?: string;
  @Prop({ type: Object }) metadata?: Record<string, unknown>;
}
export const TelegramInteractionSchema=SchemaFactory.createForClass(TelegramInteraction);
TelegramInteractionSchema.index({organizationId:1,userId:1,createdAt:-1});
