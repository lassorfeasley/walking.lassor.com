import type { PanoramaImage } from '@/types';

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    const hasProtocol = process.env.VERCEL_URL.startsWith('http');
    return hasProtocol ? process.env.VERCEL_URL : `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

async function fetchPanorama(id: string): Promise<PanoramaImage | null> {
  const url = `${getBaseUrl()}/api/images/${id}`;
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      // Disable Next caching and ensure request runs on server
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      console.error('Failed to load panorama metadata for head:', response.statusText);
      return null;
    }

    return (await response.json()) as PanoramaImage;
  } catch (error) {
    console.error('Unexpected error loading panorama metadata for head:', error);
    return null;
  }
}

export default async function Head({ params }: { params: { id: string } }) {
  const record = await fetchPanorama(params.id);

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

