import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "DayQuest · A day worth visiting", description: "Turn the little moments of a day into a world to share." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
