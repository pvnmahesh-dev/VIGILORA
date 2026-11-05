import type { Metadata } from "next";
import {
  Bodoni_Moda,
  IBM_Plex_Mono,
  Cormorant_SC,
  Oswald,
  Cinzel,
} from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import { AwsPreflightProvider } from "@/context/AwsPreflightContext";

const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cormorantSC = Cormorant_SC({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#080D13",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://vigilora.internal"),
  title: {
    default: "VIGILORA | Incident Intelligence Platform",
    template: "%s | VIGILORA",
  },
  description:
    "VIGILORA – Intelligent Incident Reporting and Emergency Response Coordination.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "VIGILORA | Incident Intelligence Platform",
    description:
      "VIGILORA – Intelligent Incident Reporting and Emergency Response Coordination.",
    images: [
      {
        url: "/vigilora-logo.png",
        width: 504,
        height: 504,
        alt: "VIGILORA Official Logo",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bodoniModa.variable} ${ibmPlexMono.variable} ${cormorantSC.variable} ${oswald.variable} ${cinzel.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-[#050506] text-[#F2EEE9] font-mono-plex selection:bg-[#C00012]/40 selection:text-white">
        <AuthProvider>
          <AwsPreflightProvider>
            <AppShell>{children}</AppShell>
          </AwsPreflightProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
