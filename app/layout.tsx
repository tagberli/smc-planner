import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMC Ed Planner",
  description: "A simple transfer planning tool for Santa Monica College students.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
