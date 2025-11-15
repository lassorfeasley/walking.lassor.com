import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { PanoramaImage } from '@/types';

// GET - List images or get image by URL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (url) {
      // Get image by URL
      const { data, error } = await supabase
        .from('panorama_images')
        .select('*')
        .or(`original_url.eq.${url},processed_url.eq.${url}`)
        .single();

      if (error) {
        return NextResponse.json(
          { error: 'Image not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(data);
    }

    // List all images
    const { data, error } = await supabase
      .from('panorama_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching images:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    return NextResponse.json({ images: data });
  } catch (error) {
    console.error('Images API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create image record
export async function POST(request: NextRequest) {
  try {
    const body: PanoramaImage = await request.json();
    
    const { data, error } = await supabase
      .from('panorama_images')
      .insert({
        ...body,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating image record:', error);
      return NextResponse.json(
        { error: 'Failed to create image record' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Images API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

