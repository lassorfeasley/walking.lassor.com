-- Update RLS policies to allow public reads, authenticated writes
-- Run this in your Supabase SQL Editor

-- Drop existing user-specific policies
DROP POLICY IF EXISTS "Users can view their own images" ON panorama_images;
DROP POLICY IF EXISTS "Users can insert their own images" ON panorama_images;
DROP POLICY IF EXISTS "Users can update their own images" ON panorama_images;
DROP POLICY IF EXISTS "Users can delete their own images" ON panorama_images;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON panorama_images;

-- Allow public SELECT (read) for all panoramas
CREATE POLICY "Public can view all panoramas" ON panorama_images
  FOR SELECT
  USING (true);

-- Require authentication for INSERT
CREATE POLICY "Authenticated users can insert panoramas" ON panorama_images
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Require authentication for UPDATE
CREATE POLICY "Authenticated users can update panoramas" ON panorama_images
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Require authentication for DELETE
CREATE POLICY "Authenticated users can delete panoramas" ON panorama_images
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

