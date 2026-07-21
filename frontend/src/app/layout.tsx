import type { Metadata } from "next";
import CustomCursor from "@/components/CustomCursor";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kivora — Revenue, on watch.",
  description: "Autonomous revenue intelligence for vacation rental portfolios, powered by Wheelhouse.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers><CustomCursor/><div className="noise-overlay"/></body></html>;
}
