import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Return all tags from tags table, sorted by usage count
// Tags remain global (shared across all users)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
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

