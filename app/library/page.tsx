'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';
import { getAllImages } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';

export default function LibraryPage() {
  const router = useRouter();
  const [images, setImages] = useState<PanoramaImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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
                    src={image.processed_url || image.original_url}
                    alt={image.title || image.description || 'Panorama image'}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                </div>
                <div className="p-3">
                  {image.title && (
                    <p className="text-sm font-medium line-clamp-2 mb-1">{image.title}</p>
                  )}
                  {image.location_name && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{image.location_name}</p>
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



