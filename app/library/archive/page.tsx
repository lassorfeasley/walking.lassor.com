'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { getArchivedImagesPage, restoreImage } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { useRequireAuth } from '@/lib/auth-client';

const PANEL_HEIGHT = 1080;
const PANEL_BLOCK_RATIO = 0.1685;
const BLOCK_HEIGHT = PANEL_HEIGHT * PANEL_BLOCK_RATIO;
const IMAGE_STRIP_HEIGHT = PANEL_HEIGHT - BLOCK_HEIGHT * 2;
const THREE_PANEL_ASPECT_RATIO = (3 * PANEL_HEIGHT) / IMAGE_STRIP_HEIGHT;
const THREE_PANEL_PADDING_PERCENT = `${(100 / THREE_PANEL_ASPECT_RATIO).toFixed(6)}%`;
const PAGE_SIZE = 24;

/**
 * Format location for display
 */
function formatLocationForDisplay(locationName: string): string {
  if (!locationName) return '';
  
  const parts = locationName.split(',').map(p => p.trim());
  const isUSA = parts[parts.length - 1]?.toLowerCase().includes('united states');
  
  if (isUSA && parts.length >= 3) {
    const city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2];
    const state = stateZip.replace(/\s+\d+.*$/, '').trim();
    return `${city}, ${state}`;
  } else if (parts.length >= 2) {
    const region = parts[parts.length - 2];
    const country = parts[parts.length - 1];
    return `${region}, ${country}`;
  }
  
  return locationName;
}

export default function ArchivePage() {
  const router = useRouter();
  const { isLoading: isAuthLoading } = useRequireAuth();
  const [images, setImages] = useState<PanoramaImage[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(0);

  const loadMoreImages = useCallback(async () => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    try {
      const currentOffset = nextOffsetRef.current;
      const { images: newImages, hasMore: pageHasMore } = await getArchivedImagesPage({
        limit: PAGE_SIZE,
        offset: currentOffset,
      });

      nextOffsetRef.current = currentOffset + newImages.length;
      setImages((prev) => {
        const existingIds = new Set(prev.map((img) => img.id));
        const uniqueNewImages = newImages.filter((img) => !existingIds.has(img.id));
        if (uniqueNewImages.length === 0) {
          return prev;
        }
        return [...prev, ...uniqueNewImages];
      });
      setHasMore(pageHasMore);
      setError(null);
    } catch (err) {
      console.error('Error loading archived images:', err);
      setError('Failed to load archived images');
    } finally {
      setIsInitialLoad(false);
      setIsFetchingMore(false);
    }
  }, [hasMore, isFetchingMore]);

  useEffect(() => {
    if (isAuthLoading) return;
    loadMoreImages();
  }, [isAuthLoading, loadMoreImages]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreImages();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [isAuthLoading, loadMoreImages]);

  const handleRestore = async (imageId: string, imageTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmed = window.confirm(
      `Restore "${imageTitle || 'this panorama'}"? It will be moved back to your library as a draft.`
    );

    if (!confirmed) return;

    setRestoringId(imageId);
    try {
      const success = await restoreImage(imageId);
      if (success) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      } else {
        alert('Failed to restore panorama. Please try again.');
      }
    } catch (error) {
      console.error('Restore error:', error);
      alert('Failed to restore panorama. Please try again.');
    } finally {
      setRestoringId(null);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/library">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Archived Panoramas</h1>
            <p className="text-sm text-muted-foreground">
              These images are hidden from your library. Click restore to bring them back.
            </p>
          </div>
        </div>

        {/* Content */}
        {isInitialLoad ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading archived images...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-red-500">{error}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">No archived images</p>
            <Link href="/library">
              <Button variant="outline">Back to Library</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {images.map((image) => (
                <Card
                  key={image.id}
                  className="group cursor-pointer overflow-hidden hover:shadow-lg transition-shadow"
                  onClick={() => router.push(`/library/${image.id}`)}
                >
                  <CardContent className="p-0">
                    <div
                      className="relative w-full overflow-hidden bg-muted"
                      style={{ paddingBottom: THREE_PANEL_PADDING_PERCENT }}
                    >
                      <Image
                        src={image.thumbnail_url || image.processed_url || image.original_url}
                        alt={image.title || image.description || 'Panorama image'}
                        fill
                        className="object-cover transition-transform group-hover:scale-105 opacity-60"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        quality={90}
                        unoptimized={false}
                      />
                      <div className="absolute inset-0 bg-black/20" />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={(e) => handleRestore(image.id, image.title || '', e)}
                        disabled={restoringId === image.id}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        {restoringId === image.id ? 'Restoring...' : 'Restore'}
                      </Button>
                    </div>
                    <div className="p-3">
                      {image.title && (
                        <p className="text-sm font-medium line-clamp-2 mb-1">{image.title}</p>
                      )}
                      {image.location_name && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {formatLocationForDisplay(image.location_name)}
                        </p>
                      )}
                      {image.archived_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Archived {new Date(image.archived_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Loading indicator and sentinel */}
            <div className="flex justify-center py-8">
              {isFetchingMore && (
                <p className="text-muted-foreground">Loading more...</p>
              )}
              <div ref={sentinelRef} className="h-1" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

