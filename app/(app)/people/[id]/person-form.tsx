"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SOCIAL_PLATFORMS, type SocialProfiles } from "@/lib/social";
import { setVerified, updatePerson, type UpdatePersonResult } from "./actions";

type Initial = {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  roleCategory: "coach" | "leader" | "staff";
  coachRole: string | null;
  teamGender: string | null;
  sport: string | null;
  email: string | null;
  phone: string | null;
  bioUrl: string | null;
  photoUrl: string | null;
  emailStatus: string;
  verified: boolean;
  socialProfiles: SocialProfiles | null;
};

type CoachRoleOption = { value: string; label: string };
type TeamGenderOption = { value: string; label: string };

export function PersonForm({
  id,
  initial,
  coachRoleOptions,
  teamGenderOptions,
  sportOptions,
}: {
  id: string;
  initial: Initial;
  coachRoleOptions: CoachRoleOption[];
  teamGenderOptions: TeamGenderOption[];
  sportOptions: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [verifyPending, startVerify] = useTransition();
  const [result, setResult] = useState<UpdatePersonResult | null>(null);
  const [verified, setVerifiedState] = useState(initial.verified);

  function onSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      setResult(await updatePerson(id, formData));
    });
  }

  function onToggleVerified() {
    const next = !verified;
    setVerifiedState(next);
    startVerify(async () => {
      const r = await setVerified(id, next);
      if (!r.ok) setVerifiedState(!next);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <form action={onSubmit} className="space-y-4 rounded-md border p-6">
        <FieldRow>
          <Field label="Full name" name="fullName" required defaultValue={initial.fullName} />
        </FieldRow>
        <FieldRow>
          <Field label="First name" name="firstName" defaultValue={initial.firstName ?? ""} />
          <Field label="Last name" name="lastName" defaultValue={initial.lastName ?? ""} />
        </FieldRow>
        <FieldRow>
          <Field label="Title (raw)" name="title" defaultValue={initial.title ?? ""} />
          <SelectField
            label="Role category"
            name="roleCategory"
            defaultValue={initial.roleCategory}
            required
            options={[
              { value: "coach", label: "coach" },
              { value: "leader", label: "leader" },
              { value: "staff", label: "staff" },
            ]}
          />
        </FieldRow>
        <FieldRow>
          <SelectField
            label="Coach role"
            name="coachRole"
            defaultValue={initial.coachRole ?? ""}
            options={[{ value: "", label: "—" }, ...coachRoleOptions]}
          />
          <SelectField
            label="Team"
            name="teamGender"
            defaultValue={initial.teamGender ?? ""}
            options={[{ value: "", label: "—" }, ...teamGenderOptions]}
          />
          <SelectField
            label="Sport"
            name="sport"
            defaultValue={initial.sport ?? ""}
            options={[
              { value: "", label: "—" },
              ...sportOptions.map((s) => ({ value: s, label: s })),
            ]}
          />
        </FieldRow>
        <FieldRow>
          <Field label="Email" name="email" type="email" defaultValue={initial.email ?? ""} />
          <SelectField
            label="Email status"
            name="emailStatus"
            defaultValue={initial.emailStatus}
            options={[
              { value: "unknown", label: "unknown" },
              { value: "valid", label: "valid" },
              { value: "invalid", label: "invalid" },
              { value: "risky", label: "risky" },
            ]}
          />
          <Field label="Phone" name="phone" defaultValue={initial.phone ?? ""} />
        </FieldRow>
        <FieldRow>
          <Field label="Bio URL" name="bioUrl" type="url" defaultValue={initial.bioUrl ?? ""} />
          <Field label="Photo URL" name="photoUrl" type="url" defaultValue={initial.photoUrl ?? ""} />
        </FieldRow>

        <fieldset className="space-y-3 rounded-md border bg-muted/10 p-4">
          <legend className="px-1 text-xs font-medium text-muted-foreground">
            Social profiles
          </legend>
          <div className="grid gap-3 md:grid-cols-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <Field
                key={p.key}
                label={p.label}
                name={`social_${p.key}`}
                type="url"
                placeholder={p.placeholder}
                defaultValue={initial.socialProfiles?.[p.key] ?? ""}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {result?.ok ? (
            <span className="text-sm text-emerald-700">Saved.</span>
          ) : null}
          {result && !result.ok ? (
            <span className="text-sm text-destructive">{result.error}</span>
          ) : null}
        </div>
      </form>

      <aside className="space-y-4">
        <div className="rounded-md border p-4">
          <h3 className="text-sm font-semibold">Verification</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Mark a person as verified once you've confirmed their email and role manually.
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                verified
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-zinc-200 text-zinc-700"
              }`}
            >
              {verified ? "verified" : "not verified"}
            </span>
            <Button
              type="button"
              variant={verified ? "outline" : "default"}
              size="sm"
              disabled={verifyPending}
              onClick={onToggleVerified}
            >
              {verifyPending
                ? "…"
                : verified
                  ? "Unverify"
                  : "Mark verified"}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Field({
  label,
  name,
  defaultValue,
  type,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <Input
        name={name}
        type={type ?? "text"}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? " *" : ""}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
      >
        {options.map((o) => (
          <option key={`${name}-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
