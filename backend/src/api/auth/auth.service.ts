import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Membership, OrganizationRole } from "./schemas/membership.schema";
import { Organization } from "./schemas/organization.schema";
import { User } from "./schemas/user.schema";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(Membership.name) private readonly memberships: Model<Membership>,
  ) {}

  async sync(privyUserId: string, profile?: { email?: string; name?: string }) {
    const update: Record<string, string> = {};
    if (profile?.email) update.email = profile.email.toLowerCase();
    if (profile?.name) update.name = profile.name;
    const user = await this.users.findOneAndUpdate(
      { privyUserId },
      { $set: update, $setOnInsert: { privyUserId, name: profile?.name || "Revenue manager", role: "manager" } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    const membership = await this.ensureWorkspace(user!);
    return this.serialize(user!, membership);
  }

  async findOrCreate(privyUserId: string, requestedOrganizationId?: string) {
    const synced = await this.sync(privyUserId);
    if (!requestedOrganizationId || requestedOrganizationId === synced.organizationId) return synced;
    if (!Types.ObjectId.isValid(requestedOrganizationId)) throw new ForbiddenException("Organization access is invalid");
    const membership = await this.memberships.findOne({
      organizationId: new Types.ObjectId(requestedOrganizationId),
      userId: new Types.ObjectId(synced.id),
      status: "active",
    }).lean();
    if (!membership) throw new ForbiddenException("You do not have access to this organization");
    const organization = await this.organizations.findOne({ _id: membership.organizationId, status: "active" }).lean();
    if (!organization) throw new NotFoundException("Organization not found");
    return {
      ...synced,
      role: membership.role,
      organizationId: String(membership.organizationId),
      organizationRole: membership.role,
      organization: {
        id: String(organization._id), name: organization.name, slug: organization.slug,
        defaultCurrency: organization.defaultCurrency, defaultTimezone: organization.defaultTimezone,
      },
    };
  }

  async listOrganizations(userId: string) {
    const memberships = await this.memberships.find({ userId: new Types.ObjectId(userId), status: "active" }).lean();
    const organizations = await this.organizations.find({ _id: { $in: memberships.map((item) => item.organizationId) }, status: "active" }).lean();
    const roles = new Map(memberships.map((item) => [String(item.organizationId), item.role]));
    return organizations.map((organization) => ({
      id: String(organization._id), name: organization.name, slug: organization.slug,
      role: roles.get(String(organization._id)), defaultCurrency: organization.defaultCurrency,
      defaultTimezone: organization.defaultTimezone,
    }));
  }

  private async ensureWorkspace(user: { _id: Types.ObjectId; name: string }) {
    const existing = await this.memberships.findOne({ userId: user._id, status: "active" }).sort({ createdAt: 1 }).lean();
    if (existing) return existing;
    const organization = await this.organizations.create({
      name: `${user.name || "Revenue"}'s workspace`,
      slug: `workspace-${String(user._id).toLowerCase()}`,
      createdBy: user._id,
      defaultTimezone: "UTC",
    });
    return this.memberships.create({ organizationId: organization._id, userId: user._id, role: "owner", status: "active" });
  }

  private serialize(user: any, membership?: { organizationId: Types.ObjectId; role: OrganizationRole }, organization?: any) {
    return {
      id: String(user._id), privyUserId: user.privyUserId, email: user.email, name: user.name,
      role: membership?.role || user.role,
      organizationId: membership ? String(membership.organizationId) : undefined,
      organizationRole: membership?.role,
      organization: organization ? {
        id: String(organization._id), name: organization.name, slug: organization.slug,
        defaultCurrency: organization.defaultCurrency, defaultTimezone: organization.defaultTimezone,
      } : undefined,
    };
  }
}
