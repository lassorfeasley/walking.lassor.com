-- Migration: Move from tags array to separate tags table
-- Run this after creating the tags and image_tags tables

-- Remove the tags column from panorama_images (optional - can keep for backward compatibility)
-- ALTER TABLE panorama_images DROP COLUMN IF EXISTS tags;

-- If you want to migrate existing tags from the array to the new structure:
-- This will create tags and relationships for existing images
DO $$
DECLARE
  img_record RECORD;
  tag_name TEXT;
  tag_slug TEXT;
  tag_id UUID;
BEGIN
  FOR img_record IN SELECT id, tags FROM panorama_images WHERE tags IS NOT NULL AND array_length(tags, 1) > 0 LOOP
    FOREACH tag_name IN ARRAY img_record.tags LOOP
      -- Normalize tag
      tag_slug := lower(trim(tag_name));
      tag_slug := regexp_replace(tag_slug, '\s+', '-', 'g');
      tag_slug := regexp_replace(tag_slug, '[^a-z0-9-]', '', 'g');
      
      -- Get or create tag
      SELECT id INTO tag_id FROM tags WHERE slug = tag_slug;
      
      IF tag_id IS NULL THEN
        INSERT INTO tags (name, slug, usage_count)
        VALUES (trim(tag_name), tag_slug, 0)
        RETURNING id INTO tag_id;
      END IF;
      
      -- Create relationship if it doesn't exist
      INSERT INTO image_tags (image_id, tag_id)
      VALUES (img_record.id, tag_id)
      ON CONFLICT (image_id, tag_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;




