import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

@Schema({ timestamps: true, bufferCommands: false })
export class Organization {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true }) slug!: string;
  @Prop({ default: "active", enum: ["active", "suspended"], index: true }) status!: string;
  @Prop({ uppercase: true, trim: true }) defaultCurrency?: string;
  @Prop({ default: "UTC" }) defaultTimezone!: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) createdBy!: Types.ObjectId;
  @Prop({ type: Object, default: {} }) capabilities!: Record<string, boolean>;
  @Prop({ type: Object, default: {} }) notificationDefaults!: Record<string, unknown>;
}

export type OrganizationDocument = HydratedDocument<Organization>;
export const OrganizationSchema = SchemaFactory.createForClass(Organization);
