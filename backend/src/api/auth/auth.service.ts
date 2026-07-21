import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "./schemas/user.schema";

@Injectable()
export class AuthService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async sync(privyUserId: string, profile?: { email?: string; name?: string }) {
    const update: Record<string, string> = {};
    if (profile?.email) update.email = profile.email.toLowerCase();
    if (profile?.name) update.name = profile.name;
    const user = await this.users.findOneAndUpdate(
      { privyUserId },
      { $set: update, $setOnInsert: { privyUserId, name: profile?.name || "Revenue manager", role: "manager" } },
      { upsert: true, new: true },
    ).lean();
    return this.serialize(user!);
  }

  async findOrCreate(privyUserId: string) { return this.sync(privyUserId); }

  private serialize(user: any) {
    return { id: String(user._id), privyUserId: user.privyUserId, email: user.email, name: user.name, role: user.role };
  }
}
