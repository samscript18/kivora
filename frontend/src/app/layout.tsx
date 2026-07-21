import type { Metadata } from "next";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/manrope";
import "@fontsource-variable/sora";
import CustomCursor from "@/components/CustomCursor";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kivora — Revenue, on watch.",
  description:
    "The revenue operating system for vacation-rental portfolios. See the signal, prioritize the opportunity, and make the move.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <CustomCursor />
        <div className="noise-overlay" />
      </body>
    </html>
  );
}
