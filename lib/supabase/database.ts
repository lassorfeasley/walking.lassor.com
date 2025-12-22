import { createClient } from './browser';
import { PanoramaImage, PanoramaPanel } from '@/types';

/**
 * Fetch existing image metadata by ID
 */
export async function getImageMetadata(imageId: string): Promise<PanoramaImage | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('panorama_images')
    .select('*')
    .eq('id', imageId)
    .single();

  if (error) {
    console.error('Error fetching image metadata:', error);
    return null;
  }

  // Get tags for this image
  const tagNames = await getImageTagNames(imageId);

  return {
    ...data,
    tags: tagNames,
  } as PanoramaImage;
}

/**
 * Fetch image by URL (for editing existing images)
 */
export async function getImageByUrl(imageUrl: string): Promise<PanoramaImage | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('panorama_images')
    .select('*')
    .or(`original_url.eq.${imageUrl},processed_url.eq.${imageUrl}`)
    .maybeSingle();

  // PGRST116 means "not found" - this is expected for new images, so return null silently
  if (error) {
    if (error.code === 'PGRST116') {
      // Image not found - this is fine, it might be a new image
      return null;
    }
    console.error('Error fetching image by URL:', error);
    return null;
  }

  // If no data, return null (image doesn't exist yet)
  if (!data) {
    return null;
  }

  // Get tags for this image
  const tagNames = await getImageTagNames(data.id);

  return {
    ...data,
    tags: tagNames,
  } as PanoramaImage;
}

/**
 * Fetch all images from database (excludes archived)
 */
export async function getAllImages(): Promise<PanoramaImage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('panorama_images')
    .select('*')
    .neq('status', 'archived')
    .order('date_taken', { ascending: false });

  if (error) {
    console.error('Error fetching all images:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    // If it's an RLS policy error, log a helpful message
    if (error.code === '42501' || error.message?.includes('policy')) {
      console.error('RLS Policy Error: Make sure you have run the update-rls-public-read.sql script in Supabase');
    }
    return [];
  }

  if (!data) {
    console.log('No images found in database');
    return [];
  }

  // Get tags for each image
  const imagesWithTags = await Promise.all(
    data.map(async (image) => {
      const tagNames = await getImageTagNames(image.id);
      return {
        ...image,
        tags: tagNames,
      } as PanoramaImage;
    })
  );

  return imagesWithTags;
}

interface GetImagesPageParams {
  limit?: number;
  offset?: number;
}

interface ImagesPageResult {
  images: PanoramaImage[];
  hasMore: boolean;
}

export async function getImagesPage({
  limit = 24,
  offset = 0,
}: GetImagesPageParams = {}): Promise<ImagesPageResult> {
  const supabase = createClient()
  const rangeStart = Math.max(0, offset);
  const rangeEnd = rangeStart + Math.max(1, limit) - 1;

  const { data, error } = await supabase
    .from('panorama_images')
    .select('*')
    .neq('status', 'archived')
    .order('date_taken', { ascending: false })
    .order('id', { ascending: false })
    .range(rangeStart, rangeEnd);

  if (error) {
    console.error('Error fetching paginated images:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return { images: [], hasMore: false };
  }

  if (!data || data.length === 0) {
    return { images: [], hasMore: false };
  }

  const imagesWithTags = await Promise.all(
    data.map(async (image) => {
      const tagNames = await getImageTagNames(image.id);
      return {
        ...image,
        tags: tagNames,
      } as PanoramaImage;
    })
  );

  return {
    images: imagesWithTags,
    hasMore: imagesWithTags.length === Math.max(1, limit),
  };
}

/**
 * Save or update image metadata
 */
export async function saveImageMetadata(data: PanoramaImage): Promise<PanoramaImage | null> {
  const supabase = createClient()
  
  // Get current user for setting user_id on new records
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('User not authenticated');
    return null;
  }

  // Check if record exists (only if id is provided and not empty)
  const hasId = data.id && data.id.trim() !== '';
  const existing = hasId ? await getImageMetadata(data.id) : null;

  // Extract tags before saving (we'll handle them separately)
  const { id, tags, ...imageData } = data;

  // Include empty tags array to satisfy NOT NULL constraint (if column still exists)
  const dataToSave = {
    ...imageData,
    tags: [], // Empty array for the tags column (we use image_tags table now)
  };

  let savedImage: any;

  if (existing && hasId) {
    // Update existing record
    // RLS will verify ownership
    const { data: updated, error } = await supabase
      .from('panorama_images')
      .update({
        ...dataToSave,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating image metadata:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    savedImage = updated;
  } else {
    // Create new record (don't include id, let database generate it)
    const { data: created, error } = await supabase
      .from('panorama_images')
      .insert({
        ...dataToSave,
        user_id: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating image metadata:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    savedImage = created;
  }

  // Now handle tags separately
  if (tags && tags.length > 0) {
    await setImageTags(savedImage.id, tags);
  }

  // Fetch the complete record with tags
  const completeRecord = await getImageMetadata(savedImage.id);
  return completeRecord;
}

/**
 * Normalize tag name to slug (lowercase, trimmed, spaces to hyphens)
 */
function normalizeTagSlug(tagName: string): string {
  return tagName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Get or create tags in the tags table
 */
async function getOrCreateTags(tagNames: string[]): Promise<string[]> {
  const supabase = createClient()
  const tagIds: string[] = [];

  for (const tagName of tagNames) {
    if (!tagName || !tagName.trim()) continue;

    const normalized = tagName.trim();
    const slug = normalizeTagSlug(normalized);

    // Try to find existing tag by slug
    let { data: existingTag, error: findError } = await supabase
      .from('tags')
      .select('id')
      .eq('slug', slug)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine, but other errors are not
      console.error('Error finding tag:', findError);
      continue;
    }

    let tagId: string;

    if (existingTag) {
      tagId = existingTag.id;
    } else {
      // Create new tag
      const { data: newTag, error: createError } = await supabase
        .from('tags')
        .insert({
          name: normalized,
          slug: slug,
          usage_count: 0,
        })
        .select('id')
        .single();

      if (createError || !newTag) {
        console.error('Error creating tag:', createError);
        continue;
      }

      tagId = newTag.id;
    }

    tagIds.push(tagId);
  }

  return tagIds;
}

/**
 * Fetch all tags from the tags table, sorted by usage count
 */
export async function getAllTags(): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tags')
    .select('name')
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching tags:', error);
    return [];
  }

  return data.map((tag) => tag.name);
}

/**
 * Get tag names for an image
 */
async function getImageTagNames(imageId: string): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('image_tags')
    .select(`
      tags (
        name
      )
    `)
    .eq('image_id', imageId);

  if (error) {
    // If image_tags table doesn't exist or has no tags, return empty array
    if (error.code === '42P01' || error.code === 'PGRST116') {
      return [];
    }
    console.error('Error fetching image tags:', error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data
    .map((item: any) => item.tags?.name)
    .filter((name: any): name is string => Boolean(name));
}

/**
 * Set tags for an image (replaces existing tags)
 */
async function setImageTags(imageId: string, tagNames: string[]): Promise<void> {
  const supabase = createClient()
  // Delete existing tag relationships
  const { error: deleteError } = await supabase
    .from('image_tags')
    .delete()
    .eq('image_id', imageId);

  if (deleteError) {
    console.error('Error deleting existing tags:', deleteError);
    return;
  }

  if (tagNames.length === 0) return;

  // Get or create tags and get their IDs
  const tagIds = await getOrCreateTags(tagNames);

  if (tagIds.length === 0) return;

  // Create new relationships
  const relationships = tagIds.map((tagId) => ({
    image_id: imageId,
    tag_id: tagId,
  }));

  const { error: insertError } = await supabase
    .from('image_tags')
    .insert(relationships);

  if (insertError) {
    console.error('Error creating tag relationships:', insertError);
  }
}

/**
 * Delete all panels for an image (used when updating)
 */
export async function deletePanels(imageId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('panorama_panels')
    .delete()
    .eq('panorama_image_id', imageId);

  if (error) {
    console.error('Error deleting panels:', error);
  }
}

/**
 * Save panels for an image
 */
export async function savePanels(imageId: string, panels: Array<{ panel_order: number; panel_url: string }>): Promise<PanoramaPanel[]> {
  const supabase = createClient()
  // Delete existing panels first
  await deletePanels(imageId);

  if (panels.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('panorama_panels')
    .insert(
      panels.map((panel) => ({
        panorama_image_id: imageId,
        panel_order: panel.panel_order,
        panel_url: panel.panel_url,
      }))
    )
    .select();

  if (error) {
    console.error('Error saving panels:', error);
    return [];
  }

  return data as PanoramaPanel[];
}

/**
 * Get all panels for an image, ordered by panel_order
 */
export async function getPanelsByImageId(imageId: string): Promise<PanoramaPanel[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('panorama_panels')
    .select('*')
    .eq('panorama_image_id', imageId)
    .order('panel_order', { ascending: true });

  if (error) {
    console.error('Error fetching panels:', error);
    return [];
  }

  return (data || []) as PanoramaPanel[];
}

/**
 * Archive an image (soft delete - sets status to 'archived')
 * Images are never permanently deleted, only archived.
 */
export async function archiveImage(imageId: string): Promise<boolean> {
  try {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('panorama_images')
      .update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', imageId);

    if (error) {
      console.error('Error archiving image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in archiveImage:', error);
    return false;
  }
}

/**
 * Restore an archived image (sets status back to 'draft')
 */
export async function restoreImage(imageId: string): Promise<boolean> {
  try {
    const supabase = createClient()
    
    const { error } = await supabase
      .from('panorama_images')
      .update({
        status: 'draft',
        archived_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', imageId);

    if (error) {
      console.error('Error restoring image:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in restoreImage:', error);
    return false;
  }
}

/**
 * Fetch paginated archived images
 */
export async function getArchivedImagesPage({
  limit = 24,
  offset = 0,
}: GetImagesPageParams = {}): Promise<ImagesPageResult> {
  const supabase = createClient()
  const rangeStart = Math.max(0, offset);
  const rangeEnd = rangeStart + Math.max(1, limit) - 1;

  const { data, error } = await supabase
    .from('panorama_images')
    .select('*')
    .eq('status', 'archived')
    .order('archived_at', { ascending: false })
    .order('id', { ascending: false })
    .range(rangeStart, rangeEnd);

  if (error) {
    console.error('Error fetching archived images:', error);
    return { images: [], hasMore: false };
  }

  if (!data || data.length === 0) {
    return { images: [], hasMore: false };
  }

  const imagesWithTags = await Promise.all(
    data.map(async (image) => {
      const tagNames = await getImageTagNames(image.id);
      return {
        ...image,
        tags: tagNames,
      } as PanoramaImage;
    })
  );

  return {
    images: imagesWithTags,
    hasMore: imagesWithTags.length === Math.max(1, limit),
  };
}
