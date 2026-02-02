import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface PanoramaLocation {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  location_name: string;
  thumbnail_url: string | null;
  date_taken: string;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('panorama_images')
      .select('id, title, latitude, longitude, location_name, thumbnail_url, date_taken')
      .neq('status', 'archived')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('date_taken', { ascending: false });

    if (error) {
      console.error('Error fetching locations:', error);
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
    }

    // Convert to GeoJSON format for Mapbox
    const geojson = {
      type: 'FeatureCollection',
      features: (data || []).map((location: PanoramaLocation) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        },
        properties: {
          id: location.id,
          title: location.title,
          location_name: location.location_name,
          thumbnail_url: location.thumbnail_url,
          date_taken: location.date_taken,
        },
      })),
    };

    return NextResponse.json(geojson);
  } catch (error) {
    console.error('Error in locations API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
