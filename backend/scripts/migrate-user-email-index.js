/* Run once for databases created before the partial email index was introduced. */
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);
  const users = mongoose.connection.db.collection("users");
  const index = (await users.indexes()).find((item) => item.name === "email_1");
  if (index?.unique && !index.partialFilterExpression) await users.dropIndex("email_1");
  await users.createIndex({ email: 1 }, { name: "email_1", unique: true, partialFilterExpression: { email: { $type: "string" } } });
  await mongoose.disconnect();
  console.log("User email index migrated");
}

main().catch(async (error) => { console.error(error); await mongoose.disconnect(); process.exit(1); });
