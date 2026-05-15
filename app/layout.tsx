import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Architect",
  description: "Generate high-quality, SEO-optimized articles in seconds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
