import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Plex Sans for all UI text; Plex Mono reserved for numbers, timestamps,
// coordinates, and IDs (see globals.css @theme).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  // no `weight` -> variable font (verified available in next/font typings)
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "LUWAS",
  // description: "Post-disaster logistics coordination for NGO coordinators.",
  icons: {
    icon: "/LUWAS_logo.png",
    shortcut: "/LUWAS_logo.png",
    apple: "/LUWAS_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}