import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Display face available to client sites through the `fonts.display` token.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Offered by the design-system font selector. Not preloaded: only sites whose
// tokens use them download the files.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", preload: false });

export const metadata: Metadata = {
  title: { default: "Website Builder", template: "%s · Website Builder" },
  description: "Visual website builder and multi-tenant CMS with a client portal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${inter.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
