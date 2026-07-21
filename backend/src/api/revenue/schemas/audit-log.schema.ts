import { Prop,Schema,SchemaFactory } from "@nestjs/mongoose";import { HydratedDocument } from "mongoose";
@Schema({timestamps:true,bufferCommands:false}) export class AuditLog{@Prop({required:true}) action:string;@Prop({required:true}) incidentId:string;@Prop() actor:string;@Prop({type:Object}) before:Record<string,unknown>;@Prop({type:Object}) after:Record<string,unknown>;@Prop() projectedImpact:number}
export type AuditLogDocument=HydratedDocument<AuditLog>;export const AuditLogSchema=SchemaFactory.createForClass(AuditLog);
