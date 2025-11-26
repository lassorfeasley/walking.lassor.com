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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  
  // Backward compatibility: Check if initialUrl is a HEIC file and try to get a fallback
  // Note: New uploads are automatically converted to JPEG, but existing HEIC files may still exist
  useEffect(() => {
    const checkHeicAndLoadFallback = async () => {
      // Check if the URL is a HEIC file (browsers can't display HEIC)
      const isHeic = initialUrl?.toLowerCase().endsWith('.heic') || 
                    initialUrl?.toLowerCase().includes('.heic?');
      
      if (isHeic && imageId) {
        // Try to load metadata to get processed_url as fallback
        setIsLoadingFallback(true);
        try {
          const image = await getImageMetadata(imageId);
          if (image) {
            // Prefer processed_url for HEIC files
            const fallback = image.processed_url || image.preview_url || image.original_url;
            if (fallback && !fallback.toLowerCase().includes('.heic')) {
              setImageUrl(fallback);
            }
          }
        } catch (error) {
          console.error('Failed to load image metadata for HEIC fallback:', error);
        } finally {
          setIsLoadingFallback(false);
        }
      } else if (!imageId && initialUrl) {
        // No imageId but we have a URL - check if it's HEIC and warn
        if (isHeic) {
          console.warn('HEIC file detected but no imageId provided - browser may not be able to display it');
        }
      } else if (!initialUrl && imageId) {
        // No URL but we have an ID - try to load metadata
        setIsLoadingFallback(true);
        try {
          const image = await getImageMetadata(imageId);
          if (image) {
            // Backward compatibility: Use processed_url as fallback if original_url is missing or HEIC
            const isOriginalHeic = image.original_url?.toLowerCase().endsWith('.heic') || 
                                  image.original_url?.toLowerCase().includes('.heic?');
            const fallback = isOriginalHeic 
              ? (image.processed_url || image.preview_url || image.original_url)
              : (image.processed_url || image.original_url);
            if (fallback) {
              setImageUrl(fallback);
            }
          }
        } catch (error) {
          console.error('Failed to load image metadata for fallback:', error);
        } finally {
          setIsLoadingFallback(false);
        }
      }
    };
    
    checkHeicAndLoadFallback();
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

  const navigateToLibrary = (recordId: string) => {
    router.push(`/library/${recordId}`);
  };

  const handleSave = (recordId: string) => {
    setPendingRecordId(recordId);
    setShowPostDialog(true);
  };

  const handlePostToInstagram = async () => {
    if (!pendingRecordId) return;
    setIsPosting(true);
    setPostError(null);
    try {
      const response = await fetch('/api/instagram/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: pendingRecordId }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to post to Instagram');
      }

      setShowPostDialog(false);
      navigateToLibrary(pendingRecordId);
    } catch (error) {
      console.error('Instagram post error:', error);
      setPostError(
        error instanceof Error ? error.message : 'Failed to post to Instagram'
      );
    } finally {
      setIsPosting(false);
    }
  };

  const handleSkipPosting = () => {
    if (!pendingRecordId) return;
    setShowPostDialog(false);
    navigateToLibrary(pendingRecordId);
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
      <Dialog open={showPostDialog} onOpenChange={setShowPostDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post to Instagram?</DialogTitle>
            <DialogDescription>
              Your panorama has been saved. Would you like to queue it for Instagram now?
            </DialogDescription>
          </DialogHeader>
          {postError ? (
            <p className="text-sm text-destructive">{postError}</p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleSkipPosting} disabled={isPosting}>
              Skip for now
            </Button>
            <Button onClick={handlePostToInstagram} disabled={isPosting}>
              {isPosting ? 'Posting…' : 'Post to Instagram'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

