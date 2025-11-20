'use server';

import { PanoramaImage, PanoramaPanel } from '@/types';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_PANORAMA_DESCRIPTION,
  DEFAULT_PANORAMA_TITLE,
  absoluteUrl,
} from '@/lib/site-config';

async function fetchPanoramaRecord(id: string): Promise<PanoramaImage | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('panorama_images')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return null;
    }

    return data as PanoramaImage;
  } catch (error) {
    console.error('Failed to fetch panorama record for metadata:', error);
    return null;
  }
}

async function fetchPanoramaPanels(id: string): Promise<PanoramaPanel[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('panorama_panels')
      .select('id, panel_order, panel_url, panorama_image_id')
      .eq('panorama_image_id', id)
      .order('panel_order', { ascending: true });

    if (error) {
      return [];
    }

    return (data || []) as PanoramaPanel[];
  } catch (error) {
    console.error('Failed to fetch panorama panels for metadata:', error);
    return [];
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
  const [record, panels] = await Promise.all([fetchPanoramaRecord(id), fetchPanoramaPanels(id)]);

  const title = record?.title?.trim() || DEFAULT_PANORAMA_TITLE;
  const description = record?.description?.trim() || DEFAULT_PANORAMA_DESCRIPTION;

  const primaryPanel = panels[0]?.panel_url;
  const fallbackImage =
    record?.thumbnail_url ||
    record?.preview_url ||
    record?.processed_url ||
    record?.original_url ||
    DEFAULT_OG_IMAGE_PATH;

  const imageUrl = absoluteUrl(primaryPanel || fallbackImage);

  return {
    record,
    panels,
    title,
    description,
    imageUrl,
  };
}

