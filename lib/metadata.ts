'use server';

import { PanoramaImage, PanoramaPanel } from '@/types';
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_PANORAMA_DESCRIPTION,
  DEFAULT_PANORAMA_TITLE,
  absoluteUrl,
  getSiteUrl,
} from '@/lib/site-config';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';

interface PanoramaApiResponse extends PanoramaImage {
  panels?: PanoramaPanel[];
}

async function resolveRequestBaseUrl() {
  try {
    const hdrs = await headers();
    const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
    if (host) {
      const protocol =
        hdrs.get('x-forwarded-proto') ??
        (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https');
      return `${protocol}://${host}`;
    }
  } catch {
    // headers() is only available during a request, fall back to env-based URL.
  }
  return getSiteUrl();
}

async function fetchPanoramaFromApi(id: string): Promise<PanoramaApiResponse | null> {
  try {
    const baseUrl = await resolveRequestBaseUrl();
    const url = new URL(`/api/images/${id}`, baseUrl);
    url.searchParams.set('includePanels', '1');

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      console.warn('Failed to fetch panorama metadata via API:', url.toString(), response.status, response.statusText);
      return null;
    }

    return (await response.json()) as PanoramaApiResponse;
  } catch (error) {
    console.error('Unexpected API error fetching panorama metadata:', error);
    return null;
  }
}

async function fetchPanoramaViaAdmin(id: string): Promise<PanoramaApiResponse | null> {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return null;
    }

    const { data: record, error } = await admin
      .from('panorama_images')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !record) {
      return null;
    }

    const { data: panelData, error: panelError } = await admin
      .from('panorama_panels')
      .select('id, panel_order, panel_url, panorama_image_id')
      .eq('panorama_image_id', id)
      .order('panel_order', { ascending: true });

    if (panelError) {
      console.warn(`Admin metadata fetch: failed to load panels for panorama ${id}`, panelError);
    }

    return {
      ...(record as PanoramaImage),
      panels: (panelData || []) as PanoramaPanel[],
    };
  } catch (error) {
    console.error('Admin metadata fetch failed:', error);
    return null;
  }
}

export interface PanoramaMetadataPayload {
  record: PanoramaImage | null;
  panels: PanoramaPanel[];
  title: string;
  description: string;
  imageUrl: string;
}

export async function buildPanoramaMetadataPayload(id: string): Promise<PanoramaMetadataPayload> {
  let recordWithPanels = await fetchPanoramaFromApi(id);

  if (!recordWithPanels) {
    recordWithPanels = await fetchPanoramaViaAdmin(id);
  }

  const record = recordWithPanels ?? null;
  const panels = recordWithPanels?.panels ?? [];

  const title = record?.title?.trim() || DEFAULT_PANORAMA_TITLE;
  const description = record?.description?.trim() || DEFAULT_PANORAMA_DESCRIPTION;

  const firstPanelUrl = panels.find((panel) => !!panel.panel_url)?.panel_url;

  if (!firstPanelUrl) {
    console.warn(`Panorama ${id} is missing panel images; falling back to processed/thumbnail asset.`);
  }

  const fallbackImage =
    record?.thumbnail_url ||
    record?.preview_url ||
    record?.processed_url ||
    record?.original_url ||
    DEFAULT_OG_IMAGE_PATH;

  const imageUrl = absoluteUrl(firstPanelUrl || fallbackImage);

  return {
    record,
    panels,
    title,
    description,
    imageUrl,
  };
}

