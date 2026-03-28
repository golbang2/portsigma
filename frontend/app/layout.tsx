import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portsigma",
  description: "Portfolio analytics with FastAPI, Next.js, Yahoo Finance, FX conversion, and GARCH."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
