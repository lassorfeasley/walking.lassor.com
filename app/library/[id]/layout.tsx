import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPanoramaMetadataPayload } from "@/lib/metadata";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-config";

type LayoutProps = {
  children: ReactNode;
};

type ParamsOrPromise =
  | { id?: string }
  | Promise<{
      id?: string;
    }>;

type GenerateMetadataProps = {
  params: ParamsOrPromise;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function resolveId(params: ParamsOrPromise): Promise<string | undefined> {
  if (!params) return undefined;
  if (typeof (params as Promise<unknown>).then === "function") {
    const resolved = (await params) as { id?: string };
    return resolved?.id;
  }
  return (params as { id?: string })?.id;
}

export async function generateMetadata({ params }: GenerateMetadataProps): Promise<Metadata> {
  const id = await resolveId(params);
  const payload = await buildPanoramaMetadataPayload(id);
  const resolvedId = payload.record?.id ?? id ?? "";
  const canonicalUrl = absoluteUrl(resolvedId ? `/library/${resolvedId}` : "/library");
  const images = [
    {
      url: payload.imageUrl,
      width: 1080,
      height: 1080,
      alt: `${payload.title} panel preview`,
    },
  ];

  return {
    title: payload.title || SITE_NAME,
    description: payload.description || SITE_DESCRIPTION,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "article",
      url: canonicalUrl,
      title: payload.title,
      description: payload.description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: payload.title,
      description: payload.description,
      images: [payload.imageUrl],
    },
  };
}

export default function LibraryPanoramaLayout({ children }: LayoutProps) {
  return <>{children}</>;
}

