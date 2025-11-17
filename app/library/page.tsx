'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { getAllImages, deleteImage } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { useRequireAuth } from '@/lib/auth-client';

/**
 * Format location for display:
 * - USA: "City, State"
 * - Non-USA: "Region/State, Country"
 */
function formatLocationForDisplay(locationName: string): string {
  if (!locationName) return '';
  
  // Split by comma and trim each part
  const parts = locationName.split(',').map(p => p.trim());
  
  // Check if it's in the United States
  const isUSA = parts[parts.length - 1]?.toLowerCase().includes('united states');
  
  if (isUSA && parts.length >= 3) {
    // USA format: "Street, City, State ZIP, Country"
    // Return: "City, State"
    const city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2];
    // Remove ZIP code from state (e.g., "New York 10014" -> "New York")
    const state = stateZip.replace(/\s+\d+.*$/, '').trim();
    return `${city}, ${state}`;
  } else if (parts.length >= 2) {
    // Non-USA format: Return last two parts (Region, Country)
    const region = parts[parts.length - 2];
    const country = parts[parts.length - 1];
    return `${region}, ${country}`;
  }
  
  // Fallback: return as-is
  return locationName;
}

export default function LibraryPage() {
  const router = useRouter();
  const { isLoading: isAuthLoading } = useRequireAuth();
  const [images, setImages] = useState<PanoramaImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // All hooks must be called before any conditional returns
  useEffect(() => {
    // Only load images if auth check is complete
    if (isAuthLoading) return;

    const loadImages = async () => {
      try {
        setIsLoading(true);
        const data = await getAllImages();
        setImages(data);
      } catch (err) {
        console.error('Error loading images:', err);
        setError('Failed to load images');
      } finally {
        setIsLoading(false);
      }
    };

    loadImages();
  }, [isAuthLoading]);

  const handleDelete = async (imageId: string, imageTitle: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to detail page

    const confirmed = window.confirm(
      `Are you sure you want to delete "${imageTitle || 'this panorama'}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(imageId);
    try {
      const success = await deleteImage(imageId);
      if (success) {
        // Remove from local state
        setImages(images.filter(img => img.id !== imageId));
      } else {
        alert('Failed to delete panorama. Please try again.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete panorama. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Conditional rendering after all hooks
  if (isAuthLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Panorama Library</h1>
          <p className="text-muted-foreground">
            Browse all your uploaded panoramas
          </p>
        </div>
        <Link href="/upload">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload New
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading panoramas...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
        </div>
      ) : images.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No panoramas yet. Upload your first one!</p>
          <Link href="/upload">
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Upload Panorama
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <Card
              key={image.id}
              className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
              onClick={() => router.push(`/library/${image.id}`)}
            >
              <CardContent className="p-0">
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  <Image
                    src={image.thumbnail_url || image.processed_url || image.original_url}
                    alt={image.title || image.description || 'Panorama image'}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => handleDelete(image.id, image.title || '', e)}
                    disabled={deletingId === image.id}
                  >
                    <Trash2 className="h-4 w-4" />
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
                  {image.date_taken && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(image.date_taken).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}



