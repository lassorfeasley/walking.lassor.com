import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const includePanels = new URL(request.url).searchParams.get('includePanels');

    const { data, error } = await supabase
      .from('panorama_images')
      .select('*')
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Latest panorama query error:', error);
      return NextResponse.json({ error: 'Failed to load latest panorama' }, { status: 500 });
    }

    const record = data?.[0];

    if (!record) {
      return NextResponse.json({ error: 'No panoramas found' }, { status: 404 });
    }

    if (includePanels) {
      const { data: panels, error: panelError } = await supabase
        .from('panorama_panels')
        .select('id, panel_order, panel_url, panorama_image_id')
        .eq('panorama_image_id', record.id)
        .order('panel_order', { ascending: true });

      if (panelError) {
        console.error('Failed to fetch panels for latest panorama:', panelError);
        return NextResponse.json(record);
      }

      return NextResponse.json({
        ...record,
        panels: panels || [],
      });
    }

    return NextResponse.json(record);
  } catch (error) {
    console.error('Latest panorama API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

