-- Create panorama_images table
CREATE TABLE IF NOT EXISTS panorama_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_url TEXT NOT NULL,
  processed_url TEXT,
  location_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  description TEXT NOT NULL,
  date_taken DATE NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'posted', 'private')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  posted_at TIMESTAMP WITH TIME ZONE,
  instagram_post_id TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_panorama_images_date_taken ON panorama_images(date_taken);
CREATE INDEX IF NOT EXISTS idx_panorama_images_status ON panorama_images(status);
CREATE INDEX IF NOT EXISTS idx_panorama_images_tags ON panorama_images USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_panorama_images_original_url ON panorama_images(original_url);
CREATE INDEX IF NOT EXISTS idx_panorama_images_processed_url ON panorama_images(processed_url);

-- Enable Row Level Security
ALTER TABLE panorama_images ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (for single-user app, allow all operations)
-- Adjust these policies based on your authentication setup
CREATE POLICY "Allow all operations for authenticated users" ON panorama_images
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Alternative: For public access (single-user app without auth)
-- CREATE POLICY "Allow all operations" ON panorama_images
--   FOR ALL
--   USING (true)
--   WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_panorama_images_updated_at
  BEFORE UPDATE ON panorama_images
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();





