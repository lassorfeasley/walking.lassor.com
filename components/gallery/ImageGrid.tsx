'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Edit } from 'lucide-react';
import Link from 'next/link';
import type { PanoramaImage } from '@/types';

interface ImageGridProps {
  images: PanoramaImage[];
}

export function ImageGrid({ images }: ImageGridProps) {
  const [selectedImage, setSelectedImage] = useState<PanoramaImage | null>(null);

  if (images.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No images yet. Upload your first panorama!</p>
        <Link href="/upload" className="mt-4 inline-block">
          <Button>Upload Image</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {images.map((image) => (
          <Card
            key={image.id}
            className="group cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
            onClick={() => setSelectedImage(image)}
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
              </div>
              {image.title && (
                <div className="p-3">
                  <p className="text-sm font-medium line-clamp-2">{image.title}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {selectedImage?.title || selectedImage?.description || 'Panorama Image'}
            </DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="space-y-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                <Image
                  src={selectedImage.preview_url || selectedImage.processed_url || selectedImage.original_url}
                  alt={selectedImage.title || selectedImage.description || 'Panorama image'}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              </div>
              {selectedImage.title && (
                <div>
                  <p className="text-sm font-medium">{selectedImage.title}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Link href={`/edit/${encodeURIComponent(selectedImage.original_url)}${selectedImage.id ? `?id=${selectedImage.id}` : ''}`}>
                  <Button variant="outline" className="flex-1">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(selectedImage.original_url, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Original
                </Button>
              </div>
              {selectedImage.location_name && (
                <p className="text-sm text-muted-foreground">
                  Location: {selectedImage.location_name}
                </p>
              )}
              {selectedImage.tags && selectedImage.tags.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Tags: {selectedImage.tags.join(', ')}
                </p>
              )}
              {selectedImage.date_taken && (
                <p className="text-sm text-muted-foreground">
                  Date Taken: {new Date(selectedImage.date_taken).toLocaleDateString()}
                </p>
              )}
              {selectedImage.created_at && (
                <p className="text-sm text-muted-foreground">
                  Created: {new Date(selectedImage.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

