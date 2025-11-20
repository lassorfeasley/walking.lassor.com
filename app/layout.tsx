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
import { buildHomeMetadataPayload } from "@/lib/metadata";

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
const faviconSvgPath = "/icons/wf-favicon.svg";
const webclipSvgPath = "/icons/wf-webclip.svg";

export async function generateMetadata(): Promise<Metadata> {
  const payload = await buildHomeMetadataPayload();

  return {
    metadataBase,
    title: {
      default: payload.title || SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    description: payload.description || SITE_DESCRIPTION,
    openGraph: {
      type: "website",
      url: payload.url || siteUrl,
      title: payload.title,
      siteName: SITE_NAME,
      description: payload.description,
      images: [
        {
          url: payload.imageUrl || defaultOgImage,
          width: 1080,
          height: 1080,
          alt: "Walking Forward latest panorama preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: payload.title,
      description: payload.description,
      images: [payload.imageUrl || defaultOgImage],
    },
    icons: {
      icon: [
        { url: faviconSvgPath, type: "image/svg+xml" },
        { url: "/favicon.ico", type: "image/x-icon", sizes: "32x32" },
      ],
      shortcut: [{ url: faviconSvgPath, type: "image/svg+xml" }],
      apple: [{ url: webclipSvgPath, type: "image/svg+xml" }],
      other: [{ rel: "mask-icon", url: faviconSvgPath, color: "#404040" }],
    },
    appleWebApp: {
      capable: true,
      title: payload.title || SITE_NAME,
    },
  };
}

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
