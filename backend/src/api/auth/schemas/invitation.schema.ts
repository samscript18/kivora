import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { ORGANIZATION_ROLES, OrganizationRole } from "./membership.schema";

@Schema({ timestamps: true, bufferCommands: false })
export class Invitation {
  @Prop({ type: Types.ObjectId, required: true, index: true }) organizationId!: Types.ObjectId;
  @Prop({ required: true, lowercase: true, trim: true, index: true }) email!: string;
  @Prop({ required: true, enum: ORGANIZATION_ROLES }) role!: OrganizationRole;
  @Prop({ required: true, unique: true, index: true, select: false }) tokenHash!: string;
  @Prop({ type: Types.ObjectId, required: true }) createdBy!: Types.ObjectId;
  @Prop({ required: true, index: true }) expiresAt!: Date;
  @Prop({ enum: ["pending", "accepted", "revoked", "expired"], default: "pending", index: true }) status!: string;
  @Prop() acceptedAt?: Date;
  @Prop({ type: Types.ObjectId }) acceptedBy?: Types.ObjectId;
  @Prop() revokedAt?: Date;
}

export type InvitationDocument = HydratedDocument<Invitation>;
export const InvitationSchema = SchemaFactory.createForClass(Invitation);
InvitationSchema.index({ organizationId: 1, email: 1, status: 1 });
