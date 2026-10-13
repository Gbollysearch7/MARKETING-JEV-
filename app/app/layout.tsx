import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Jev Content Engine",
  description: "Decisions over content, powered by TypeSafe Jev.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex font-sans text-[14px] leading-[1.45]">
        <nav aria-label="Main" className="w-[220px] shrink-0 bg-side text-[#d7dae0] flex flex-col gap-1 px-3 py-5">
          <Link href="/" className="flex items-center gap-2.5 px-2 pb-4 text-white font-semibold text-[15px]">
            <span className="w-7 h-7 rounded-lg bg-teal text-white flex items-center justify-center text-sm">J</span>
            Jev Content Engine
          </Link>
          <Link href="/" className="min-h-11 flex items-center px-2.5 rounded-lg hover:bg-side-hover hover:text-white">Sites</Link>
          <Link href="/settings" className="min-h-11 flex items-center px-2.5 rounded-lg hover:bg-side-hover hover:text-white">Settings</Link>
          <div className="grow" />
          <div className="px-2.5 pt-3 border-t border-[#343a45] text-xs text-faint leading-relaxed">
            <div>Model <span className="font-mono text-[#d7dae0]">{process.env.JEV_MODEL ?? "jev-1.13.0"}</span></div>
            <div>{process.env.TYPESAFE_API_KEY ? "Live key configured" : "No key: mock decisions"}</div>
          </div>
        </nav>
        <main className="grow min-w-0 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
