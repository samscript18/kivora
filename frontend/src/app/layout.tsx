import type { Metadata } from "next";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kivora — Revenue Operations Platform",
  description:
    "Revenue operations intelligence for modern vacation-rental portfolios.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
        <div className="noise-overlay" />
      </body>
    </html>
  );
}
