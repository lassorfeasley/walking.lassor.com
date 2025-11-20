import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPanoramaMetadataPayload } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/site-config";

type LayoutProps = {
  children: ReactNode;
};

type GenerateMetadataProps = {
  params: { id: string };
};

export async function generateMetadata({ params }: GenerateMetadataProps): Promise<Metadata> {
  const { id } = params;
  const payload = await buildPanoramaMetadataPayload(id);
  const canonicalUrl = absoluteUrl(`/library/${id}`);
  const images = [
    {
      url: payload.imageUrl,
      width: 1080,
      height: 1080,
      alt: `${payload.title} panel preview`,
    },
  ];

  return {
    title: payload.title,
    description: payload.description,
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

