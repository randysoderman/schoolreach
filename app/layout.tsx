import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SchoolReach",
  description: "Discover schools, scrape contacts, run outreach.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
