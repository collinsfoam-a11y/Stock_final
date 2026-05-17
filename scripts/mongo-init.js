const dbName = process.env.MONGO_INITDB_DATABASE || "stock_verification";
const appUser = process.env.MONGO_APP_USER || "";
const appPassword = process.env.MONGO_APP_PASSWORD || "";

if (!appUser || !appPassword) {
  print("MONGO_APP_USER or MONGO_APP_PASSWORD not set; skipping app user creation.");
} else {
  const appDb = db.getSiblingDB(dbName);
  const existing = appDb.getUser(appUser);

  if (existing) {
    print(`Mongo user '${appUser}' already exists in '${dbName}'.`);
  } else {
    appDb.createUser({
      user: appUser,
      pwd: appPassword,
      roles: [
        { role: "readWrite", db: dbName },
        { role: "dbAdmin", db: dbName },
      ],
    });
    print(`Created Mongo user '${appUser}' in '${dbName}'.`);
  }
}
