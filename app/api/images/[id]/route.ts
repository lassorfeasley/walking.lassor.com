import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PanoramaImage } from '@/types';

// GET - Fetch image metadata by ID (public access)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params;
    
    // Public read allowed by RLS
    const { data, error } = await supabase
      .from('panorama_images')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Images API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update image metadata by ID (requires authentication)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', redirectTo: '/signin' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body: Partial<PanoramaImage> = await request.json();
    
    // RLS will automatically verify ownership
    const { data, error } = await supabase
      .from('panorama_images')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating image record:', error);
      return NextResponse.json(
        { error: 'Failed to update image record' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Images API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}



