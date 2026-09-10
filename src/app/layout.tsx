import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "Thruput Explorer",
  description: "Explore transactions, addresses, and token transfers on Thruput.",
};

export const viewport: Viewport = {
  themeColor: "#10110f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-svh flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
