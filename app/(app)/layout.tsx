import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already gates this, but double-check on the server in case the
  // matcher is bypassed for any reason.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-muted/20 px-4 py-6 md:flex">
        <div className="mb-6 px-2">
          <h2 className="text-lg font-semibold tracking-tight">SchoolReach</h2>
        </div>
        <div className="flex-1">
          <AppNav />
        </div>
        <div className="mt-6 border-t pt-4">
          <p className="px-2 text-xs text-muted-foreground truncate" title={user.email ?? ""}>
            {user.email}
          </p>
          <form action="/auth/signout" method="post" className="mt-2 px-2">
            <Button type="submit" variant="outline" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
