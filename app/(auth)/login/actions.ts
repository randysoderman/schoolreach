"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const LoginInput = z.object({
  email: z.string().email(),
  next: z.string().optional(),
});

export type LoginResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function sendMagicLink(formData: FormData): Promise<LoginResult> {
  const parsed = LoginInput.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const supabase = createClient();
  const origin = headers().get("origin") ?? "";
  const callbackUrl = new URL("/auth/callback", origin);
  if (parsed.data.next) callbackUrl.searchParams.set("next", parsed.data.next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Single-tenant: only emails already in auth.users can sign in.
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, email: parsed.data.email };
}
