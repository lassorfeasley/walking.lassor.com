// Flexible image data structure - can adapt to final database schema
export interface PanoramaImage {
  id: string;
  original_url: string;
  processed_url?: string;
  thumbnail_url?: string; // 400px, quality 0.80 - for grid views
  preview_url?: string; // 1920px, quality 0.85 - for detail views
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
  adjustments?: ImageAdjustments;
}

export interface ImageAdjustments {
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  filters: {
    brightness: number;
    contrast: number;
    saturation: number;
    exposure: number;
    highlights: number;
    shadows: number;
  };
  selectiveColor: {
    selectedColor: 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta' | null;
    adjustments: {
      red: { saturation: number; luminance: number };
      yellow: { saturation: number; luminance: number };
      green: { saturation: number; luminance: number };
      cyan: { saturation: number; luminance: number };
      blue: { saturation: number; luminance: number };
      magenta: { saturation: number; luminance: number };
    };
  };
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
    // Added to match what is actually used in components, though EditorState might not be strictly used elsewhere
  };
  aspectRatio: '1:1' | '4:5' | '9:16' | 'free';
  filters: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
  zoom: number;
}
