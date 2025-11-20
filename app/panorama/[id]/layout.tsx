import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { PanoramaImage } from '@/types';

type OgFields = Pick<
  PanoramaImage,
  'title' | 'description' | 'thumbnail_url' | 'preview_url' | 'processed_url'
>;

async function getOgFields(id: string): Promise<OgFields | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('panorama_images')
      .select('title, description, thumbnail_url, preview_url, processed_url')
      .eq('id', id)
      .single();

    if (error || !data) {
      if (error) {
        console.error('Failed to fetch panorama metadata for OG tags:', error);
      }
      return null;
    }

    return data as OgFields;
  } catch (err) {
    console.error('Unexpected error loading panorama metadata for OG tags:', err);
    return null;
  }
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const record = await getOgFields(params.id);

  const heading = record?.title?.trim() || 'Walking Forward panorama';
  const description =
    record?.description?.trim() || 'Walking Forward panorama detail view.';
  const ogImage =
    record?.thumbnail_url || record?.preview_url || record?.processed_url || '';

  return {
    title: `${heading} | Walking Forward`,
    description,
    openGraph: {
      type: 'article',
      title: heading,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: heading,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default function PanoramaLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

