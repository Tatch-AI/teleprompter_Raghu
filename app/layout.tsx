import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garage Intake Copilot",
  description:
    "Preemptive intake teleprompter and application autofill copilot for GARAGE_001.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
