import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Provenance Workspace",
  description: "Interactive workspace for dataset analysis, provenance tracking, and decision capture.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
