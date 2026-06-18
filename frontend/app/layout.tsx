import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { BackdropFX } from "@/components/BackdropFX";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Veil Bridge - private cross chain transfers to QIE",
  description:
    "A trustless, privacy preserving bridge from Ethereum to QIE using zero knowledge proofs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-ink-950 text-slate-200 antialiased">
        <Providers>
          <BackdropFX />
          <div className="relative z-10 flex min-h-screen flex-col">
            <Nav />
            <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-24 pt-10 sm:px-8">
              {children}
            </main>
            <footer className="border-t border-white/5 px-6 py-6 text-center text-xs text-slate-500">
              Veil Bridge. ZK inclusion proofs plus shielded claims. Testnet only.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
