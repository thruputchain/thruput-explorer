import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "Thruput Explorer",
  description: "Explore transactions, addresses, and token transfers on Thruput.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f0" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
