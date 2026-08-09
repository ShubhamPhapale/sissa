import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sissa",
    template: "%s | Sissa",
  },
  description: "Play live chess online with server clocks, move history, draw offers, and instant rematches.",
  applicationName: "Sissa",
  keywords: ["chess", "online chess", "live chess", "1v1 chess", "game review"],
  openGraph: {
    title: "Sissa",
    description: "A polished live chess experience with real-time games, spectating, and reviews.",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
