// Generate a magic-link URL via the Supabase admin API and print it.
// Bypasses email delivery — useful for local testing when SMTP is flaky.
//
// Usage: node scripts/generate-magic-link.mjs <email>

import "./_load-env.mjs";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/generate-magic-link.mjs <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: {
    redirectTo: "http://localhost:3000/auth/callback",
  },
});

if (error) {
  console.error("generateLink failed:", error.message);
  process.exit(1);
}

// Skip Supabase's /verify endpoint (which uses implicit flow with a hash
// fragment we can't read server-side). Hit our callback directly with the
// token_hash + type — our route then calls verifyOtp() to set the session.
const tokenHash = data.properties.hashed_token;
const directUrl = `http://localhost:3000/auth/callback?token_hash=${tokenHash}&type=magiclink`;

console.log("\nPaste this URL into your browser to sign in:\n");
console.log(directUrl);
console.log("");
