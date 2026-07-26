import type { Metadata } from "next";
import { DM_Mono, Silkscreen, Archivo } from "next/font/google";
import "./globals.css";
import { Footer } from "./components/Footer";

// The arcade type system: DM Mono for body/UI, Silkscreen for the pixel
// wordmark and badges, Archivo as the sans fallback. Exposed as CSS variables
// the arcade classes in globals.css read from.
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "BattleCadia",
  description:
    "Beat choice paralysis with head-to-head bracket battles — pick winners in rapid 1v1 matchups until a champion is crowned.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmMono.variable} ${silkscreen.variable} ${archivo.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Footer />
      </body>
    </html>
  );
}
