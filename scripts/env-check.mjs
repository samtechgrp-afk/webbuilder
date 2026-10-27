// Validates the environment the same way the server does at boot.
// Usage: npm run env:check   (reads .env when present)
import { checkEnv, EnvError } from "../src/lib/env.mjs";

const { env, problems, warnings } = checkEnv(process.env);
for (const w of warnings) console.warn(`⚠ ${w}`);
if (!env) {
  console.error(new EnvError(problems).message);
  process.exit(1);
}
console.log(`✓ Environment OK (platform domain ${env.ROOT_DOMAIN}, storage ${env.STORAGE_DRIVER}, email ${env.RESEND_API_KEY ? "Resend" : "log only"})`);
