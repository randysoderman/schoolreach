"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  School,
  Users,
  Mail,
  Briefcase,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/schools", label: "Schools", Icon: School },
  { href: "/people", label: "People", Icon: Users },
  { href: "/campaigns", label: "Campaigns", Icon: Mail },
  { href: "/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/segments", label: "Segments", Icon: Filter },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {NAV.map(({ href, label, Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
