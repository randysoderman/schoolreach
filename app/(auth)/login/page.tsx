"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMagicLink, type LoginResult } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LoginResult | null>(null);

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const r = await sendMagicLink(formData);
      setResult(r);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">SchoolReach</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with a magic link.
        </p>
      </div>

      {result?.ok ? (
        <div className="rounded-md border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-muted-foreground">
            We sent a magic link to <strong>{result.email}</strong>. Click the
            link to finish signing in.
          </p>
        </div>
      ) : (
        <form action={onSubmit} className="space-y-4">
          {searchParams.next ? (
            <input type="hidden" name="next" value={searchParams.next} />
          ) : null}
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              disabled={pending}
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Sending…" : "Send magic link"}
          </Button>
          {result && !result.ok ? (
            <p className="text-sm text-destructive">{result.error}</p>
          ) : null}
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        Access is by invitation only. Contact your admin if your email isn't on
        the list.
      </p>
    </div>
  );
}
