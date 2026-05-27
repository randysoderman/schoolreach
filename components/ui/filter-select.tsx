// Plain HTML select wrapper used by every list-page filter form.
// We avoid Radix here so we don't pull in @radix-ui/react-select.

export type FilterOption = { value: string; label: string };

export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: FilterOption[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      <span className="text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="h-9 min-w-[8rem] rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
