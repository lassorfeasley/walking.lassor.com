'use server';

import { PanoramaImage, PanoramaPanel } from '@/types';
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_PANORAMA_DESCRIPTION,
  DEFAULT_PANORAMA_TITLE,
  SITE_DESCRIPTION,
  SITE_HOME_DESCRIPTION,
  SITE_NAME,
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

async function fetchPanoramaFromApi(id?: string): Promise<PanoramaApiResponse | null> {
  if (!id) {
    return null;
  }

  try {
    const baseUrl = await resolveRequestBaseUrl();
    const url = new URL(`/api/images/${id}`, baseUrl);
    url.searchParams.set('includePanels', '1');

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
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

async function fetchPanoramaViaAdmin(id?: string): Promise<PanoramaApiResponse | null> {
  if (!id) {
    return null;
  }

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

async function fetchLatestPanoramaFromApi(): Promise<PanoramaApiResponse | null> {
  try {
    const baseUrl = await resolveRequestBaseUrl();
    const url = new URL('/api/images/latest', baseUrl);
    url.searchParams.set('includePanels', '1');

    const response = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PanoramaApiResponse;
  } catch (error) {
    console.error('Failed to fetch latest panorama via API:', error);
    return null;
  }
}

async function fetchLatestPanoramaViaAdmin(): Promise<PanoramaApiResponse | null> {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return null;
    }

    const { data: record, error } = await admin
      .from('panorama_images')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !record) {
      return null;
    }

    const { data: panelData, error: panelError } = await admin
      .from('panorama_panels')
      .select('id, panel_order, panel_url, panorama_image_id')
      .eq('panorama_image_id', record.id)
      .order('panel_order', { ascending: true });

    if (panelError) {
      console.warn(`Admin metadata fetch: failed to load panels for panorama ${record.id}`, panelError);
    }

    return {
      ...(record as PanoramaImage),
      panels: (panelData || []) as PanoramaPanel[],
    };
  } catch (error) {
    console.error('Failed to fetch latest panorama for home metadata via admin:', error);
    return null;
  }
}

async function fetchLatestPanorama(): Promise<PanoramaApiResponse | null> {
  const viaApi = await fetchLatestPanoramaFromApi();
  if (viaApi) {
    return viaApi;
  }
  return fetchLatestPanoramaViaAdmin();
}

export async function buildPanoramaMetadataPayload(id?: string): Promise<PanoramaMetadataPayload> {
  if (!id) {
    return {
      record: null,
      panels: [],
      title: DEFAULT_PANORAMA_TITLE,
      description: DEFAULT_PANORAMA_DESCRIPTION,
      imageUrl: absoluteUrl(DEFAULT_OG_IMAGE_PATH),
    };
  }

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

export interface HomeMetadataPayload {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
}

export async function buildHomeMetadataPayload(): Promise<HomeMetadataPayload> {
  const latest = await fetchLatestPanorama();
  const title = 'Walking forward by Lassor Feasley';
  const description =
    SITE_HOME_DESCRIPTION ||
    SITE_DESCRIPTION ||
    'Walking Forward documents Lassor’s travels from an unconventional point of view.';

  const firstPanelUrl = latest?.panels?.find((panel) => !!panel.panel_url)?.panel_url;

  const fallbackImage =
    latest?.thumbnail_url ||
    latest?.preview_url ||
    latest?.processed_url ||
    latest?.original_url ||
    DEFAULT_OG_IMAGE_PATH;

  const imageUrl = absoluteUrl(firstPanelUrl || fallbackImage);

  return {
    title,
    description,
    imageUrl,
    url: absoluteUrl('/'),
  };
}

