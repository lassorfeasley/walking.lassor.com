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

export default async function Head({ params }: { params: { id: string } }) {
  const record = await getOgFields(params.id);

  const heading = record?.title?.trim() || 'Walking Forward panorama';
  const description =
    record?.description?.trim() || 'Walking Forward panorama detail view.';
  const ogImage =
    record?.thumbnail_url || record?.preview_url || record?.processed_url || '';

  return (
    <>
      <title>{`${heading} | Walking Forward`}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={heading} />
      <meta property="og:description" content={description} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={heading} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
    </>
  );
}

