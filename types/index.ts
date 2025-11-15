// Flexible image data structure - can adapt to final database schema
export interface PanoramaImage {
  id: string;
  original_url: string;
  processed_url?: string;
  panel_count?: number;
  title: string;
  location_name: string;
  latitude: number;
  longitude: number;
  description: string; // Also used as Instagram caption
  date_taken: string; // ISO date string
  tags: string[];
  status: 'draft' | 'ready' | 'posted' | 'private';
  created_at?: string;
  updated_at?: string;
  posted_at?: string;
  instagram_post_id?: string;
}

export interface PanoramaPanel {
  id: string;
  panorama_image_id: string;
  panel_order: number; // 1-indexed: 1, 2, 3, etc.
  panel_url: string; // URL to square panel image with white blocks
  created_at?: string;
}

export interface EditorState {
  image: HTMLImageElement | null;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  aspectRatio: '1:1' | '4:5' | '9:16' | 'free';
  filters: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
  zoom: number;
}

