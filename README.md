# Walking Forward

A panorama image processing app that automates your workflow from upload to Instagram posting.

## Features

- 📤 **Upload Panoramas** - Drag and drop or browse to upload your panorama images
- ✂️ **Image Editor** - Crop, rotate, and adjust brightness, contrast, and saturation
- 📐 **Instagram Formatting** - Pre-configured aspect ratios (1:1, 4:5, 9:16) for Instagram
- 💾 **Supabase Storage** - Automatic storage and organization of your images
- 🖼️ **Gallery** - View all your processed images in a beautiful grid layout

## Tech Stack

- **Next.js 14+** (App Router) with TypeScript
- **Tailwind CSS** for styling
- **shadcn/ui** for component library
- **Supabase** for storage and database
- **react-easy-crop** for image editing

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account and project

### Setup

1. **Clone and install dependencies:**

```bash
npm install
```

2. **Set up Supabase:**

   - Create a new Supabase project at [supabase.com](https://supabase.com)
   - Create two storage buckets:
     - `raw-panoramas` (or use your preferred name)
     - `processed-images` (or use your preferred name)
   - **Configure storage policies** (choose one method):
     
     **Method 1: Make buckets public (easiest for single-user)**
     - Go to Storage → click each bucket → Settings
     - Enable "Public bucket" toggle
     - Save
     
     **Method 2: Set up RLS policies (more secure)**
     - Go to Storage → Policies in Supabase dashboard
     - Or run the SQL script in `scripts/setup-storage-policies.sql` in your Supabase SQL Editor
     - This creates policies allowing public uploads and reads

3. **Configure environment variables:**

   Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: Customize bucket names (defaults shown)
NEXT_PUBLIC_STORAGE_BUCKET_RAW=raw-panoramas
NEXT_PUBLIC_STORAGE_BUCKET_PROCESSED=processed-images

# Public site URL (used for Open Graph metadata/canonical links)
NEXT_PUBLIC_SITE_URL=https://walking.lassor.com
```

4. **Run the development server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Database Schema

The database schema is flexible and can be customized. The app currently uses storage-only mode, but you can add a database table when ready. Suggested schema:

```sql
CREATE TABLE panoramas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_url TEXT NOT NULL,
  processed_url TEXT,
  caption TEXT,
  location TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  posted_at TIMESTAMP WITH TIME ZONE,
  instagram_post_id TEXT
);
```

## Project Structure

```
walking-forward/
├── app/
│   ├── upload/          # Upload interface
│   ├── edit/[url]/      # Image editor
│   ├── gallery/         # Gallery view
│   └── api/             # API routes
├── components/
│   ├── ui/              # shadcn/ui components
│   ├── editor/          # Image editor components
│   ├── upload/          # Upload components
│   └── gallery/         # Gallery components
├── lib/
│   ├── supabase/        # Supabase client and storage helpers
│   ├── image-processing/ # Image processing utilities
│   └── instagram/       # Instagram API (stub)
└── types/               # TypeScript types
```

## Usage

1. **Upload:** Go to `/upload` and drag & drop or select your panorama image
2. **Edit:** After upload, you'll be redirected to the editor where you can:
   - Select aspect ratio (1:1, 4:5, 9:16, or free)
   - Crop and rotate the image
   - Adjust brightness, contrast, and saturation
   - Export and download the processed image
3. **Gallery:** View all your images at `/gallery`

## Instagram Integration

Instagram API integration is currently stubbed. To implement:

1. Set up a Facebook App
2. Connect your Instagram Business/Creator account
3. Complete OAuth flow for access tokens
4. Implement the Instagram Graph API in `lib/instagram/api.ts`

For now, you can export images and post them manually to Instagram.

## Open Graph previews

- Each public panorama/library page now exposes full OG + Twitter metadata. The first generated Instagram panel (1080x1080) is used for cards; if no panels exist, the app falls back to the processed image and finally to `public/og-default.png`.
- If you update panels or notice the fallback image, open the panorama in `/library/[id]`, regenerate the panels, and publish to ensure a square preview exists.
- **Set `NEXT_PUBLIC_SITE_URL`:** point it at the domain you expect scrapers to use (e.g., `https://walking.lassor.com`) so canonical URLs and OG tags match production.
- **Local verification:** run `npm run dev`, open the route in your browser, or inspect the tags via `curl -L http://localhost:3000/panorama/<id> | rg 'og:'`.
- **Social debugger tests:** Facebook/Twitter/LinkedIn cannot reach `localhost`. Use a Vercel preview/production deploy or tunnel your dev server (e.g., `npx ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`) before running the sharing debuggers.

## Future Enhancements

- Database integration for metadata storage
- Instagram API integration for automatic posting
- User authentication (currently single-user)
- Location tagging and mapping
- Batch processing
- Image history and versioning

## License

MIT
