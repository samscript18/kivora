import {Prop,Schema,SchemaFactory} from "@nestjs/mongoose";
import {Types} from "mongoose";

@Schema({timestamps:true,bufferCommands:false})
export class OrganizationIntegrationConfig{
 @Prop({type:Types.ObjectId,required:true,index:true})organizationId!:Types.ObjectId;
 @Prop({required:true,enum:["ticketmaster","openweather"]})provider!:string;
 @Prop({default:false})enabled!:boolean;
 @Prop({required:true,enum:["platform","organization"],default:"platform"})credentialMode!:string;
 @Prop({select:false})encryptedCredential?:string;
 @Prop({type:Object,default:{}})settings!:Record<string,unknown>;
 @Prop({default:"disabled"})status!:string;
 @Prop()lastSuccessfulCollection?:Date;@Prop()lastFailure?:Date;@Prop()lastError?:string;@Prop()credentialUpdatedAt?:Date;
}
export const OrganizationIntegrationConfigSchema=SchemaFactory.createForClass(OrganizationIntegrationConfig);
OrganizationIntegrationConfigSchema.index({organizationId:1,provider:1},{unique:true});

@Schema({timestamps:true,bufferCommands:false})
export class NotificationPreference{
 @Prop({type:Types.ObjectId,required:true,index:true})organizationId!:Types.ObjectId;
 @Prop({type:Types.ObjectId,index:true})userId?:Types.ObjectId;@Prop({type:Types.ObjectId,index:true})portfolioId?:Types.ObjectId;
 @Prop({required:true,enum:["organization","user","portfolio"]})scope!:string;
 @Prop({type:Object,default:{}})channels!:Record<string,boolean>;
 @Prop({type:Object,default:{}})categories!:Record<string,boolean>;
 @Prop({default:0})minimumFinancialImpact!:number;@Prop({type:[String],default:[]})severities!:string[];
 @Prop()assignedUserOnly?:boolean;@Prop()quietHoursStart?:string;@Prop()quietHoursEnd?:string;@Prop({default:"UTC"})timezone!:string;@Prop({enum:["immediate","daily_digest"],default:"immediate"})deliveryMode!:string;
}
export const NotificationPreferenceSchema=SchemaFactory.createForClass(NotificationPreference);
NotificationPreferenceSchema.index({organizationId:1,scope:1,userId:1,portfolioId:1},{unique:true});
