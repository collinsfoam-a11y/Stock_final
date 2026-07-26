db = db.getSiblingDB('stockverify');
db.createUser({
  user: "stockverify",
  pwd: process.env.MONGO_PASSWORD || "CHANGEME",
  roles: [{ role: "readWrite", db: "stockverify" }]
});
