import Link from "next/link";
import { createManualSchool } from "./actions";
import { AddSchoolForm } from "./add-form";

export default function AddSchoolPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/schools"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Schools
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Add a school manually
        </h1>
        <p className="text-sm text-muted-foreground">
          Use this when NCES (2022 data) doesn't have the school you want — a
          new charter, a recently opened HS, a niche program. Provide a name +
          state + level; the scrape pipeline takes care of the rest.
        </p>
      </div>

      {searchParams.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {searchParams.error}
        </p>
      ) : null}

      <AddSchoolForm formAction={createManualSchool} />
    </div>
  );
}
