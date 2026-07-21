import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { Model, Types } from "mongoose";
import { AuthenticatedUser } from "../auth/guards/privy-auth.guard";
import { Organization } from "../auth/schemas/organization.schema";
import { WheelhouseService } from "../integrations/services/wheelhouse.service";
import { AuditLog } from "./schemas/audit-log.schema";
import { ListingMapping, Portfolio, WheelhouseConnection } from "./schemas/operations.schema";

@Injectable()
export class ConnectionService {
  private readonly encryptionKey?: Buffer;
  constructor(
    config: ConfigService,
    private readonly wheelhouse: WheelhouseService,
    @InjectModel(WheelhouseConnection.name) private readonly connections: Model<WheelhouseConnection>,
    @InjectModel(Portfolio.name) private readonly portfolios: Model<Portfolio>,
    @InjectModel(ListingMapping.name) private readonly listings: Model<ListingMapping>,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(AuditLog.name) private readonly audits: Model<AuditLog>,
  ) {
    const secret = config.get<string>("WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY");
    if (secret) {
      if (!/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error("WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hexadecimal key");
      this.encryptionKey = Buffer.from(secret, "hex");
    }
  }

  async create(actor: AuthenticatedUser, displayName: string, credential: string) {
    this.requireManager(actor);
    if (!this.encryptionKey) throw new ServiceUnavailableException("Wheelhouse credential encryption is not configured");
    const liveListings = await this.wheelhouse.listings(credential);
    const organizationId = this.id(actor.organizationId);
    const organization = await this.organizations.findById(organizationId).lean();
    if (!organization) throw new NotFoundException("Organization not found");
    const capabilities = this.wheelhouse.capabilities(credential);
    const connection = await this.connections.create({
      organizationId, displayName: displayName.trim(), encryptedCredential: this.encrypt(credential), status: "connected",
      capabilities, readCapability: true, writeCapability: capabilities.writeAccess === "verified",
      supportedMutationTypes: capabilities.writeAccess === "verified" ? ["pricing_preset", "remove_base_price_override", "automatic_rate_posting", "listing_sync"] : [],
      createdBy: this.id(actor.sub), lastSuccessfulSynchronization: new Date(),
    });
    const portfolio = await this.portfolios.create({
      organizationId, connectionId: connection._id, name: `${displayName.trim()} portfolio`,
      defaultCurrency: liveListings.find((listing) => listing.currency)?.currency || organization.defaultCurrency || "USD",
      timezone: organization.defaultTimezone || "UTC", status: "active",
    });
    if (liveListings.length) await this.listings.insertMany(liveListings.map((listing) => ({
      organizationId, connectionId: connection._id, portfolioId: portfolio._id,
      externalListingId: listing.id, channel: listing.channel, name: listing.nickname || listing.title || listing.id,
      market: listing.location?.address || listing.location?.country, currency: listing.currency || portfolio.defaultCurrency,
      timezone: portfolio.timezone, source: this.safeListing(listing), lastSynchronizedAt: new Date(), active: listing.is_active !== false,
    })), { ordered: false });
    await this.audit(actor, "wheelhouse_connection_created", String(connection._id), { displayName, listingCount: liveListings.length, capabilities });
    return { ...this.serialize(connection.toObject()), initialSynchronization: { listings: liveListings.length, portfolioId: String(portfolio._id), completed: true } };
  }

  async list(actor: AuthenticatedUser) {
    const rows = await this.connections.find({ organizationId: this.id(actor.organizationId) }).sort({ createdAt: 1 }).lean();
    return rows.map((row) => this.serialize(row));
  }

  async credential(actor: AuthenticatedUser, connectionId?: string) {
    const filter: Record<string, unknown> = { organizationId: this.id(actor.organizationId), status: { $ne: "revoked" } };
    if (connectionId) filter._id = this.id(connectionId);
    const connection = await this.connections.findOne(filter).select("+encryptedCredential").sort({ createdAt: 1 }).lean();
    if (!connection) throw new ServiceUnavailableException("No active Wheelhouse connection exists for this organization");
    return { connection, credential: this.decrypt(connection.encryptedCredential) };
  }

  async test(actor: AuthenticatedUser, connectionId: string) {
    const { connection, credential } = await this.credential(actor, connectionId);
    try {
      const listings = await this.wheelhouse.listings(credential);
      const capabilities = this.wheelhouse.capabilities(credential);
      await this.connections.updateOne({ _id: connection._id, organizationId: this.id(actor.organizationId) }, { $set: { status: "connected", readCapability: true, capabilities, lastSuccessfulSynchronization: new Date() }, $unset: { lastError: 1, lastFailedSynchronization: 1 } });
      return { connected: true, listingCount: listings.length, capabilities };
    } catch (error) {
      await this.connections.updateOne({ _id: connection._id }, { $set: { status: "degraded", lastFailedSynchronization: new Date(), lastError: this.errorMessage(error) } });
      throw error;
    }
  }

  async replace(actor: AuthenticatedUser, connectionId: string, credential: string) {
    this.requireManager(actor);
    const organizationId = this.id(actor.organizationId);
    const current = await this.connections.findOne({ _id: this.id(connectionId), organizationId }).lean();
    if (!current) throw new NotFoundException("Wheelhouse connection not found");
    const listings = await this.wheelhouse.listings(credential);
    const capabilities = this.wheelhouse.capabilities(credential);
    await this.connections.updateOne({ _id: current._id, organizationId }, { $set: { encryptedCredential: this.encrypt(credential), status: "connected", capabilities, readCapability: true, writeCapability: capabilities.writeAccess === "verified", lastSuccessfulSynchronization: new Date() }, $unset: { lastError: 1, revokedAt: 1 } });
    await this.audit(actor, "wheelhouse_credential_replaced", connectionId, { listingCount: listings.length, capabilities });
    return { ...this.serialize({ ...current, capabilities, status: "connected", lastSuccessfulSynchronization: new Date() }), validatedListings: listings.length };
  }

  async revoke(actor: AuthenticatedUser, connectionId: string) {
    this.requireManager(actor);
    const result = await this.connections.findOneAndUpdate({ _id: this.id(connectionId), organizationId: this.id(actor.organizationId), status: { $ne: "revoked" } }, { $set: { status: "revoked", revokedAt: new Date(), readCapability: false, writeCapability: false }, $unset: { encryptedCredential: 1 } }, { returnDocument: "after" }).lean();
    if (!result) throw new NotFoundException("Active Wheelhouse connection not found");
    await this.audit(actor, "wheelhouse_connection_revoked", connectionId, { displayName: result.displayName });
    return { id: connectionId, status: "revoked" };
  }

  async listPortfolios(actor: AuthenticatedUser) {
    const organizationId = this.id(actor.organizationId); const rows = await this.portfolios.find({ organizationId }).sort({ status: 1, name: 1 }).lean();
    const counts = await this.listings.aggregate([{ $match: { organizationId, active: true } }, { $group: { _id: "$portfolioId", count: { $sum: 1 } } }]); const byId = new Map(counts.map((row) => [String(row._id), row.count]));
    return rows.map((row) => ({ ...row, id: String(row._id), organizationId: String(row.organizationId), connectionId: String(row.connectionId), listingCount: byId.get(String(row._id)) || 0 }));
  }

  async createPortfolio(actor: AuthenticatedUser, input: { connectionId: string; name: string; description?: string; defaultCurrency?: string; timezone?: string }) {
    this.requireManager(actor); const organizationId = this.id(actor.organizationId); const connectionId = this.id(input.connectionId);
    if (!await this.connections.exists({ _id: connectionId, organizationId, status: { $ne: "revoked" } })) throw new NotFoundException("Active Wheelhouse connection not found");
    const organization = await this.organizations.findById(organizationId).lean(); const portfolio = await this.portfolios.create({ organizationId, connectionId, name: input.name.trim(), description: input.description, defaultCurrency: input.defaultCurrency || organization?.defaultCurrency || "USD", timezone: input.timezone || organization?.defaultTimezone || "UTC", status: "active" });
    await this.audit(actor, "portfolio_created", String(portfolio._id), { name: portfolio.name, connectionId: input.connectionId }); return { ...portfolio.toObject(), id: String(portfolio._id) };
  }

  async moveListing(actor: AuthenticatedUser, listingMappingId: string, portfolioId: string) {
    this.requireManager(actor); const organizationId = this.id(actor.organizationId); const mapping = await this.listings.findOne({ _id: this.id(listingMappingId), organizationId, active: true }).lean();
    if (!mapping) throw new NotFoundException("Listing mapping not found"); const portfolio = await this.portfolios.findOne({ _id: this.id(portfolioId), organizationId, connectionId: mapping.connectionId, status: "active" }).lean();
    if (!portfolio) throw new BadRequestException("Target portfolio must be active and use the same Wheelhouse connection");
    await this.listings.updateOne({ _id: mapping._id, organizationId }, { $set: { portfolioId: portfolio._id } }); await this.audit(actor, "listing_moved", String(mapping._id), { fromPortfolioId: String(mapping.portfolioId), toPortfolioId: portfolioId, externalListingId: mapping.externalListingId }); return { id: listingMappingId, portfolioId };
  }

  async archivePortfolio(actor: AuthenticatedUser, portfolioId: string) {
    this.requireManager(actor); const organizationId = this.id(actor.organizationId); const activeListings = await this.listings.countDocuments({ organizationId, portfolioId: this.id(portfolioId), active: true });
    if (activeListings) throw new ConflictException("Move active listings before archiving this portfolio"); const portfolio = await this.portfolios.findOneAndUpdate({ _id: this.id(portfolioId), organizationId, status: "active" }, { $set: { status: "archived" } }, { returnDocument: "after" }).lean();
    if (!portfolio) throw new NotFoundException("Active portfolio not found"); await this.audit(actor, "portfolio_archived", portfolioId, { name: portfolio.name }); return { id: portfolioId, status: "archived" };
  }

  private encrypt(plaintext: string) {
    if (!this.encryptionKey) throw new ServiceUnavailableException("Wheelhouse credential encryption is not configured");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }
  private decrypt(payload: string) {
    if (!this.encryptionKey) throw new ServiceUnavailableException("Wheelhouse credential encryption is not configured");
    const [version, iv, tag, ciphertext] = payload.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new ServiceUnavailableException("Stored Wheelhouse credential cannot be decrypted");
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
    } catch { throw new ServiceUnavailableException("Stored Wheelhouse credential failed authentication"); }
  }
  private serialize(value: any) { const { encryptedCredential: _secret, ...safe } = value; return { ...safe, id: String(value._id), organizationId: String(value.organizationId), createdBy: String(value.createdBy) }; }
  private safeListing(listing: unknown) { return JSON.parse(JSON.stringify(listing)) as Record<string, unknown>; }
  private id(value: string) { if (!Types.ObjectId.isValid(value)) throw new BadRequestException("Resource identifier is invalid"); return new Types.ObjectId(value); }
  private requireManager(actor: AuthenticatedUser) { if (!["owner", "administrator", "revenue_manager"].includes(actor.organizationRole)) throw new ForbiddenException("Revenue manager permission is required"); }
  private errorMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : "Wheelhouse request failed"; }
  private audit(actor: AuthenticatedUser, action: string, entityId: string, after: Record<string, unknown>) { return this.audits.create({ organizationId: this.id(actor.organizationId), actorUserId: this.id(actor.sub), actor: actor.name, action, entityType: "wheelhouse_connection", entityId, after, source: "Kivora", verified: true }); }
}
