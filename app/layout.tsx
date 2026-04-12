import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "AfterDark",
  description:
    "A cinematic, time-aware city discovery app where time drives the whole interface.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
