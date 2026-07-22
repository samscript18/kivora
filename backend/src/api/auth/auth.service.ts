import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes } from "crypto";
import { Model, Types } from "mongoose";
import { Membership, OrganizationRole } from "./schemas/membership.schema";
import { Organization } from "./schemas/organization.schema";
import { User } from "./schemas/user.schema";
import { Invitation } from "./schemas/invitation.schema";
import { AuthenticatedUser } from "./guards/privy-auth.guard";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(Membership.name) private readonly memberships: Model<Membership>,
    @InjectModel(Invitation.name) private readonly invitations: Model<Invitation>,
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
    const stored = await this.users.findById(synced.id).select("defaultOrganizationId").lean();
    const selected = requestedOrganizationId || (stored?.defaultOrganizationId ? String(stored.defaultOrganizationId) : synced.organizationId);
    if (!selected || selected === synced.organizationId) return synced;
    if (!Types.ObjectId.isValid(selected)) throw new ForbiddenException("Organization access is invalid");
    const membership = await this.memberships.findOne({
      organizationId: new Types.ObjectId(selected),
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

  async createOrganization(userId: string, input: { name: string; slug?: string; defaultCurrency?: string; defaultTimezone?: string }) {
    const objectUserId = this.objectId(userId, "User");
    const baseSlug = (input.slug || input.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (baseSlug.length < 3) throw new BadRequestException("Organization slug must contain at least three characters");
    let slug = baseSlug;
    for (let suffix = 1; await this.organizations.exists({ slug }); suffix++) slug = `${baseSlug}-${suffix}`;
    const organization = await this.organizations.create({
      name: input.name.trim(), slug, createdBy: objectUserId,
      defaultCurrency: input.defaultCurrency || "USD", defaultTimezone: input.defaultTimezone || "UTC",
    });
    await this.memberships.create({ organizationId: organization._id, userId: objectUserId, role: "owner", status: "active", joinedAt: new Date() });
    await this.users.updateOne({ _id: objectUserId, defaultOrganizationId: { $exists: false } }, { $set: { defaultOrganizationId: organization._id } });
    return { id: String(organization._id), name: organization.name, slug: organization.slug, role: "owner", defaultCurrency: organization.defaultCurrency, defaultTimezone: organization.defaultTimezone };
  }

  async updateOrganization(actor: AuthenticatedUser, input: { name?: string; defaultCurrency?: string; defaultTimezone?: string }) {
    this.requireRole(actor, ["owner", "administrator"]);
    const updated = await this.organizations.findOneAndUpdate(
      { _id: this.objectId(actor.organizationId, "Organization"), status: "active" },
      { $set: input }, { returnDocument: "after", runValidators: true },
    ).lean();
    if (!updated) throw new NotFoundException("Organization not found");
    return { id: String(updated._id), name: updated.name, slug: updated.slug, defaultCurrency: updated.defaultCurrency, defaultTimezone: updated.defaultTimezone };
  }

  async setDefaultOrganization(userId: string, organizationId: string) {
    const membership = await this.memberships.exists({ userId: this.objectId(userId, "User"), organizationId: this.objectId(organizationId, "Organization"), status: "active" });
    if (!membership) throw new ForbiddenException("You do not have access to this organization");
    await this.users.updateOne({ _id: userId }, { $set: { defaultOrganizationId: organizationId } });
    return { organizationId, default: true };
  }

  async listMembers(actor: AuthenticatedUser) {
    const organizationId = this.objectId(actor.organizationId, "Organization");
    const [memberships, invitations] = await Promise.all([
      this.memberships.find({ organizationId, status: { $ne: "removed" } }).sort({ createdAt: 1 }).lean(),
      this.invitations.find({ organizationId, status: "pending", expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean(),
    ]);
    const users = await this.users.find({ _id: { $in: memberships.map((membership) => membership.userId) } }).select("name email timezone").lean();
    const byId = new Map(users.map((user) => [String(user._id), user]));
    return {
      members: memberships.map((membership) => ({ id: String(membership._id), userId: String(membership.userId), role: membership.role, status: membership.status, joinedAt: membership.joinedAt, user: byId.get(String(membership.userId)) })),
      invitations: invitations.map((invitation) => ({ id: String(invitation._id), email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt, createdBy: String(invitation.createdBy) })),
    };
  }

  async invite(actor: AuthenticatedUser, input: { email: string; role: OrganizationRole }) {
    this.requireRole(actor, ["owner", "administrator"]);
    const organizationId = this.objectId(actor.organizationId, "Organization");
    const email = input.email.toLowerCase();
    const existingUser = await this.users.findOne({ email }).lean();
    if (existingUser && await this.memberships.exists({ organizationId, userId: existingUser._id, status: { $ne: "removed" } })) throw new ConflictException("This user is already a member");
    await this.invitations.updateMany({ organizationId, email, status: "pending" }, { $set: { status: "revoked", revokedAt: new Date() } });
    const token = randomBytes(32).toString("base64url");
    const invitation = await this.invitations.create({ organizationId, email, role: input.role, tokenHash: this.hash(token), createdBy: this.objectId(actor.sub, "User"), expiresAt: new Date(Date.now() + 7 * 86_400_000) });
    // The raw token is returned exactly once so the caller can deliver it via an
    // explicitly configured channel. Only its SHA-256 digest is persisted.
    return { id: String(invitation._id), email, role: input.role, token, expiresAt: invitation.expiresAt };
  }

  async revokeInvitation(actor: AuthenticatedUser, invitationId: string) {
    this.requireRole(actor, ["owner", "administrator"]);
    const result = await this.invitations.findOneAndUpdate({ _id: this.objectId(invitationId, "Invitation"), organizationId: this.objectId(actor.organizationId, "Organization"), status: "pending" }, { $set: { status: "revoked", revokedAt: new Date() } }, { returnDocument: "after" }).lean();
    if (!result) throw new NotFoundException("Pending invitation not found");
    return { id: invitationId, status: "revoked" };
  }

  async acceptInvitation(actor: AuthenticatedUser, token: string) {
    const invitation = await this.invitations.findOneAndUpdate(
      { tokenHash: this.hash(token), status: "pending", expiresAt: { $gt: new Date() } },
      { $set: { status: "accepted", acceptedAt: new Date(), acceptedBy: this.objectId(actor.sub, "User") } },
      { returnDocument: "after" },
    ).select("+tokenHash").lean();
    if (!invitation) throw new BadRequestException("Invitation is invalid, expired, or already used");
    if (!actor.email || invitation.email !== actor.email.toLowerCase()) {
      await this.invitations.updateOne({ _id: invitation._id }, { $set: { status: "pending" }, $unset: { acceptedAt: 1, acceptedBy: 1 } });
      throw new ForbiddenException("Invitation email does not match the signed-in account");
    }
    await this.memberships.findOneAndUpdate(
      { organizationId: invitation.organizationId, userId: this.objectId(actor.sub, "User") },
      { $set: { role: invitation.role, status: "active", invitedBy: invitation.createdBy, joinedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
    return { organizationId: String(invitation.organizationId), role: invitation.role, status: "active" };
  }

  async changeMember(actor: AuthenticatedUser, membershipId: string, input: { role?: OrganizationRole; status?: string }) {
    this.requireRole(actor, ["owner", "administrator"]);
    if (!input.role && !input.status) throw new BadRequestException("Provide a role or status change");
    const membership = await this.memberships.findOne({ _id: this.objectId(membershipId, "Membership"), organizationId: this.objectId(actor.organizationId, "Organization") }).lean();
    if (!membership) throw new NotFoundException("Member not found");
    if (membership.role === "owner") throw new ForbiddenException("Transfer ownership before changing the owner membership");
    if (String(membership.userId) === actor.sub && input.status && input.status !== "active") throw new ForbiddenException("You cannot suspend or remove your own membership");
    return this.memberships.findByIdAndUpdate(membership._id, { $set: input }, { returnDocument: "after", runValidators: true }).lean();
  }

  async transferOwnership(actor: AuthenticatedUser, targetMembershipId: string) {
    this.requireRole(actor, ["owner"]);
    const organizationId = this.objectId(actor.organizationId, "Organization");
    const target = await this.memberships.findOne({ _id: this.objectId(targetMembershipId, "Membership"), organizationId, status: "active" }).lean();
    if (!target) throw new NotFoundException("Active target member not found");
    if (String(target.userId) === actor.sub) throw new BadRequestException("You already own this organization");
    const session = await this.memberships.db.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await this.memberships.findOneAndUpdate({ organizationId, userId: this.objectId(actor.sub, "User"), role: "owner", status: "active" }, { $set: { role: "administrator" } }, { session, returnDocument: "after" });
        if (!current) throw new ForbiddenException("Only the current owner can transfer ownership");
        await this.memberships.updateOne({ _id: target._id, organizationId }, { $set: { role: "owner" } }, { session });
      });
    } finally { await session.endSession(); }
    return { organizationId: actor.organizationId, ownerMembershipId: targetMembershipId };
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
    const membership = await this.memberships.create({ organizationId: organization._id, userId: user._id, role: "owner", status: "active", joinedAt: new Date() });
    await this.users.updateOne({ _id: user._id }, { $set: { defaultOrganizationId: organization._id } });
    return membership;
  }

  private objectId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${label} identifier is invalid`);
    return new Types.ObjectId(value);
  }
  private hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
  private requireRole(actor: AuthenticatedUser, roles: OrganizationRole[]) {
    if (!roles.includes(actor.organizationRole as OrganizationRole)) throw new ForbiddenException("Your organization role cannot perform this action");
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
