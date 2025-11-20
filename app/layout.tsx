import type { Metadata } from "next";
import { Geist, Geist_Mono, Inconsolata, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { AdminNav } from "@/components/auth/AdminNav";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  DEFAULT_OG_IMAGE_PATH,
  getSiteUrl,
  absoluteUrl,
} from "@/lib/site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();
const metadataBase = new URL(siteUrl);
const defaultOgImage = absoluteUrl(DEFAULT_OG_IMAGE_PATH);

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    url: siteUrl,
    title: SITE_NAME,
    siteName: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 1200,
        alt: "Walking Forward default panorama preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [defaultOgImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inconsolata.variable} ${beVietnamPro.variable} antialiased`}
      >
        <AdminNav />
        {children}
      </body>
    </html>
  );
}
