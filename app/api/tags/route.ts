import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

// GET - Return all tags from tags table, sorted by usage count
export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('tags')
      .select('name, usage_count')
      .order('usage_count', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching tags:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    const tagNames = data.map((tag) => tag.name);

    return NextResponse.json({ tags: tagNames });
  } catch (error) {
    console.error('Tags API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

