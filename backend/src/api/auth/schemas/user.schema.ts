import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Types } from "mongoose";
@Schema({timestamps:true,bufferCommands:false})
export class User {
  @Prop({required:true,unique:true,index:true}) privyUserId:string;
  @Prop({lowercase:true}) email?:string;
  @Prop({default:"Revenue manager"}) name:string;
  @Prop({default:"manager",enum:["viewer","manager","admin"]}) role:string;
  @Prop() timezone?: string;
  @Prop() briefingTime?: string;
  @Prop({ type: Types.ObjectId, index: true }) defaultOrganizationId?: Types.ObjectId;
}
export const UserSchema=SchemaFactory.createForClass(User);
// Only real email addresses must be unique. A standard unique sparse index
// treats repeated null/missing values as duplicates and blocks Privy users who
// have not yet supplied an email identity.
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
