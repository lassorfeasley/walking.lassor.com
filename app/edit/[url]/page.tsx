'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ImageEditor } from '@/components/editor/ImageEditor';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import { getImageMetadata } from '@/lib/supabase/database';

export default function EditPage({
  params,
}: {
  params: Promise<{ url: string }>;
}) {
  const { url } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: isAuthLoading } = useRequireAuth();
  const decodedUrl = decodeURIComponent(url);
  const imageId = searchParams.get('id') || undefined;
  
  // Validate that the URL is a proper HTTP/HTTPS URL, not a data URI or local file
  const initialUrl = decodedUrl.startsWith('data:') || decodedUrl.startsWith('file:') 
    ? '' 
    : decodedUrl;
  
  const [imageUrl, setImageUrl] = useState<string>(initialUrl);
  const [isLoadingFallback, setIsLoadingFallback] = useState(false);
  
  // If we have an imageId but no valid URL, try to load the image metadata to get a fallback
  useEffect(() => {
    const loadFallback = async () => {
      if (!imageId || initialUrl) return; // Only load if we have an ID but no valid URL
      
      setIsLoadingFallback(true);
      try {
        const image = await getImageMetadata(imageId);
        if (image) {
          // Use processed_url as fallback if original_url is missing
          const fallback = image.processed_url || image.original_url;
          if (fallback) {
            setImageUrl(fallback);
          }
        }
      } catch (error) {
        console.error('Failed to load image metadata for fallback:', error);
      } finally {
        setIsLoadingFallback(false);
      }
    };
    
    loadFallback();
  }, [imageId, initialUrl]);

  if (isAuthLoading) {
    return (
      <div className="container mx-auto px-4 py-8" style={{ maxWidth: '3000px' }}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const handleSave = (recordId: string) => {
    console.log('Image saved with record ID:', recordId);
    // Navigate to the detail page for this panorama
    router.push(`/library/${recordId}`);
  };

  return (
    <div className="container mx-auto px-4 py-8" style={{ maxWidth: '3000px' }}>
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Edit Image</h1>
        <p className="text-muted-foreground">
          Crop, adjust, and format your image for Instagram
        </p>
      </div>

      {isLoadingFallback ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading image...</p>
        </div>
      ) : imageUrl ? (
        <ImageEditor imageUrl={imageUrl} imageId={imageId} onSave={handleSave} />
      ) : (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Invalid Image URL</p>
          <p className="mt-2">The image URL is invalid or not accessible. Please try uploading again.</p>
          {imageId && (
            <p className="mt-2 text-xs">
              Attempted to load image ID: {imageId}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

