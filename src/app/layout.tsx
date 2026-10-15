import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const jetbrains = localFont({
  src: "./fonts/JetBrainsMono-var.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

const inter = localFont({
  src: "./fonts/Inter-var.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM | Inženirji.si",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sl" className={`${jetbrains.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-base">{children}</body>
    </html>
  );
}
