import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Live Character Platform",
    template: "%s · AI Live Character Platform",
  },
  description:
    "Create characters, grant explicit consent for face and voice transforms, stream live transformed video, and keep control of your data — export or delete it any time.",
  applicationName: "AI Live Character Platform",
  openGraph: {
    type: "website",
    siteName: "AI Live Character Platform",
    title: "AI Live Character Platform",
    description:
      "Consent-first live character transformation: real workers, real job system, honest status. Credits with automatic refunds for undelivered work.",
  },
  twitter: {
    card: "summary",
    title: "AI Live Character Platform",
    description:
      "Consent-first live character transformation: real workers, real job system, honest status.",
  },
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
