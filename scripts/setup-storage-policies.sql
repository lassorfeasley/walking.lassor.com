-- Supabase Storage Policy Setup
-- Run this in your Supabase SQL Editor to set up storage policies

-- Policy for raw-panoramas bucket: Allow public uploads and reads
CREATE POLICY "Allow public uploads to raw-panoramas"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'raw-panoramas');

CREATE POLICY "Allow public reads from raw-panoramas"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'raw-panoramas');

-- Policy for processed-images bucket: Allow public uploads and reads
CREATE POLICY "Allow public uploads to processed-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'processed-images');

CREATE POLICY "Allow public reads from processed-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'processed-images');

-- Policy for optimized-web bucket: Allow public uploads and reads
CREATE POLICY "Allow public uploads to optimized-web"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'optimized-web');

CREATE POLICY "Allow public reads from optimized-web"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'optimized-web');

-- Optional: Allow updates and deletes (uncomment if needed)
-- CREATE POLICY "Allow public updates to raw-panoramas"
-- ON storage.objects FOR UPDATE
-- TO public
-- USING (bucket_id = 'raw-panoramas');

-- CREATE POLICY "Allow public deletes from raw-panoramas"
-- ON storage.objects FOR DELETE
-- TO public
-- USING (bucket_id = 'raw-panoramas');

