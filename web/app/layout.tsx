import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Inter for all UI text; JetBrains Mono reserved for incident IDs,
// coordinates, and route numbers (see globals.css @theme).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}