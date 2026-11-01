import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const pixel = Pixelify_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-pixel", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = { title: "DayQuest · A day worth visiting", description: "Turn the little moments of a day into a world to share." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fff6ea" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${pixel.variable} ${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
