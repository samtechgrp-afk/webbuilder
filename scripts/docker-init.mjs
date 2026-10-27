// One-shot setup job for docker-compose (the image's `migrate` target):
//   1. checks the environment the same way the server does at boot
//   2. creates the uploads bucket when STORAGE_DRIVER=s3
//   3. applies migrations (`prisma migrate deploy`)
//   4. on an empty database: loads the demo data when SEED_DEMO=true, or
//      creates the first platform admin from ADMIN_EMAIL / ADMIN_PASSWORD
// Safe to run on every `docker compose up`; steps 2 to 4 skip work that's done.
import { execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertEnv } from "../src/lib/env.mjs";
import { ensureBucket, s3ConfigFrom } from "../src/lib/storage/s3.mjs";

const log = (msg) => console.log(`[init] ${msg}`);

assertEnv();

const s3 = s3ConfigFrom(process.env);
if (s3) {
  // The storage container can take a moment to accept connections.
  for (let attempt = 1; ; attempt++) {
    try {
      log((await ensureBucket(s3)) ? `Created bucket "${s3.bucket}"` : `Bucket "${s3.bucket}" is ready`);
      break;
    } catch (err) {
      if (attempt >= 20) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

log("Applying migrations");
execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });

const prisma = new PrismaClient();
try {
  if ((await prisma.user.count()) > 0) {
    log("Database already has users; nothing to seed");
  } else if (process.env.SEED_DEMO === "true") {
    log("Empty database: loading the demo sites and accounts (SEED_DEMO=true)");
    execFileSync("npx", ["prisma", "db", "seed"], { stdio: "inherit" });
  } else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
    await prisma.user.create({
      data: {
        email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
        name: process.env.ADMIN_NAME || "Platform admin",
        passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10),
        isPlatformAdmin: true,
      },
    });
    log(`Created platform admin ${process.env.ADMIN_EMAIL}; sign in and the welcome wizard starts your first site`);
  } else {
    log("Empty database. Set ADMIN_EMAIL and ADMIN_PASSWORD (or SEED_DEMO=true) and rerun, or sign up at /signup");
  }
} finally {
  await prisma.$disconnect();
}
log("Done");
