import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
@Schema({ timestamps: true, bufferCommands: false })
export class Snapshot {
  @Prop({ required: true, index: true }) listingId: string;
  @Prop() channel: string;
  @Prop() health: number;
  @Prop() occupancy: number;
  @Prop() adr: number;
  @Prop() revenue: number;
  @Prop({ type: Object }) raw: Record<string, unknown>;
}
export const SnapshotSchema = SchemaFactory.createForClass(Snapshot);
