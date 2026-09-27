import type { Metadata } from "next";
import { TopBar } from "@/components/shell/top-bar";

import "./globals.css";

export const metadata: Metadata = {
  title: "Persona",
  description: "Start on the band, finish on the phone - an onboarding that follows you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
