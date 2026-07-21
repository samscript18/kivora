import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const ORGANIZATION_ROLES = ["owner", "administrator", "revenue_manager", "analyst", "viewer"] as const;
export type OrganizationRole = typeof ORGANIZATION_ROLES[number];

@Schema({ timestamps: true, bufferCommands: false })
export class Membership {
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ORGANIZATION_ROLES }) role!: OrganizationRole;
  @Prop({ default: "active", enum: ["active", "inactive"], index: true }) status!: string;
}

export type MembershipDocument = HydratedDocument<Membership>;
export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
