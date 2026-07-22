import { createCipheriv, randomBytes } from "crypto";
import mongoose from "mongoose";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

for (const name of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), name); if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim()); if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

type LegacyTarget = { collection: string; selector?: Record<string, unknown> };
const targets: LegacyTarget[] = [
  { collection: "auditlogs" }, { collection: "incidents" }, { collection: "ownerbriefs" },
  { collection: "reports" }, { collection: "snapshots" }, { collection: "marketsignals" },
  { collection: "telegramconnections" }, { collection: "telegramlinks" },
];

function encrypt(plaintext: string, secret: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error("WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal characters");
  const key = Buffer.from(secret, "hex"); const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv); const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  let organizations = await db.collection("organizations").find({ status: "active" }, { projection: { _id: 1, createdBy: 1, defaultCurrency: 1, defaultTimezone: 1 } }).sort({ createdAt: 1 }).toArray();
  if (!organizations.length) {
    const legacyCounts = await Promise.all(targets.map((target) => db.collection(target.collection).countDocuments({ organizationId: { $exists: false }, ...(target.selector || {}) })));
    if (legacyCounts.some(Boolean)) {
      const users = await db.collection("users").find({}, { projection: { _id: 1, name: 1 } }).limit(2).toArray();
      if (users.length !== 1) throw new Error("No active organization exists; legacy records cannot be assigned safely");
      const now = new Date(); const user = users[0];
      const result = await db.collection("organizations").insertOne({ name: `${user.name || "Revenue manager"}'s workspace`, slug: `workspace-${String(user._id).toLowerCase()}`, status: "active", defaultCurrency: "USD", defaultTimezone: "UTC", createdBy: user._id, capabilities: {}, notificationDefaults: {}, createdAt: now, updatedAt: now });
      await db.collection("memberships").updateOne({ organizationId: result.insertedId, userId: user._id }, { $setOnInsert: { organizationId: result.insertedId, userId: user._id, role: "owner", status: "active", joinedAt: now, createdAt: now, updatedAt: now } }, { upsert: true });
      await db.collection("users").updateOne({ _id: user._id }, { $set: { defaultOrganizationId: result.insertedId } });
      organizations = [{ _id: result.insertedId, createdBy: user._id, defaultCurrency: "USD", defaultTimezone: "UTC" }];
    }
  }
  if (!organizations.length) {
    const summary = { organizations: 0, migrated: {}, unresolved: {}, status: "fresh_database_no_op" };
    await db.collection("migrationlogs").updateOne({ key: "tenantize-legacy-v1" }, { $set: { key: "tenantize-legacy-v1", summary, ranAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`); await mongoose.disconnect(); return;
  }
  const soleOrganization = organizations.length === 1 ? organizations[0] : undefined;
  const summary: Record<string, unknown> = { organizations: organizations.length, migrated: {}, unresolved: {} };

  for (const target of targets) {
    const collection = db.collection(target.collection);
    const selector = { organizationId: { $exists: false }, ...(target.selector || {}) };
    const count = await collection.countDocuments(selector);
    if (!count) continue;
    if (!soleOrganization) { (summary.unresolved as Record<string, number>)[target.collection] = count; continue; }
    const result = await collection.updateMany(selector, { $set: { organizationId: soleOrganization._id, legacyTenantMigratedAt: new Date() } });
    (summary.migrated as Record<string, number>)[target.collection] = result.modifiedCount;
  }

  const legacyKey = process.env.WHEELHOUSE_API_KEY;
  const encryptionSecret = process.env.WHEELHOUSE_CREDENTIAL_ENCRYPTION_KEY;
  if (legacyKey && encryptionSecret && soleOrganization) {
    const connections = db.collection("wheelhouseconnections");
    const existing = await connections.findOne({ organizationId: soleOrganization._id, displayName: "Migrated Wheelhouse connection" });
    if (!existing) {
      const connection = await connections.insertOne({ organizationId: soleOrganization._id, displayName: "Migrated Wheelhouse connection", encryptedCredential: encrypt(legacyKey, encryptionSecret), status: "degraded", readCapability: false, writeCapability: false, supportedMutationTypes: [], capabilities: { migratedFromServerCredential: true, validationRequired: true }, createdBy: soleOrganization.createdBy, createdAt: new Date(), updatedAt: new Date(), lastError: "Run connection test and initial synchronization" });
      await db.collection("portfolios").updateOne({ organizationId: soleOrganization._id, connectionId: connection.insertedId, name: "Default portfolio" }, { $setOnInsert: { organizationId: soleOrganization._id, connectionId: connection.insertedId, name: "Default portfolio", defaultCurrency: soleOrganization.defaultCurrency || "USD", timezone: soleOrganization.defaultTimezone || "UTC", status: "active", createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
      summary.connection = "created_requires_validation";
    } else summary.connection = "already_exists";
  } else if (legacyKey) summary.connection = "unresolved_missing_encryption_key_or_ambiguous_organization";

  const replaceIndex = async (collectionName: string, legacyName: string, keys: Record<string, 1 | -1>, name: string) => {
    const collection = db.collection(collectionName); const indexes = await collection.indexes().catch(() => []);
    if (indexes.some((index) => index.name === legacyName && index.unique)) await collection.dropIndex(legacyName);
    if (indexes.some((index) => index.name === name)) return;
    await collection.createIndex(keys, { name, unique: true, partialFilterExpression: { organizationId: { $exists: true } } });
  };
  await replaceIndex("incidents", "externalId_1", { organizationId: 1, externalId: 1 }, "organizationId_1_externalId_1");
  await replaceIndex("marketsignals", "externalId_1", { organizationId: 1, externalId: 1 }, "organizationId_1_externalId_1");
  await replaceIndex("telegramconnections", "userId_1", { organizationId: 1, userId: 1 }, "organizationId_1_userId_1");
  await replaceIndex("telegramconnections", "chatId_1", { organizationId: 1, chatId: 1 }, "organizationId_1_chatId_1");
  summary.indexes = "tenant_compound_indexes_verified";

  await db.collection("migrationlogs").updateOne({ key: "tenantize-legacy-v1" }, { $set: { key: "tenantize-legacy-v1", summary, ranAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (Object.keys(summary.unresolved as object).length) process.exitCode = 2;
  await mongoose.disconnect();
}

void migrate().catch(async (error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1; await mongoose.disconnect(); });
