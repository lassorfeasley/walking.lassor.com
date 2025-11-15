'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, ExternalLink, MapPin, Calendar, Tag, FileText } from 'lucide-react';
import Link from 'next/link';
import { getImageMetadata, getPanelsByImageId } from '@/lib/supabase/database';
import { useEffect, useState } from 'react';
import { PanoramaImage, PanoramaPanel } from '@/types';

export default function PanoramaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [image, setImage] = useState<PanoramaImage | null>(null);
  const [panels, setPanels] = useState<PanoramaPanel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        setIsLoading(true);
        const data = await getImageMetadata(id);
        if (data) {
          setImage(data);
          // Load panels if they exist
          const panelData = await getPanelsByImageId(id);
          setPanels(panelData);
        } else {
          setError('Image not found');
        }
      } catch (err) {
        console.error('Error loading image:', err);
        setError('Failed to load image');
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [id]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading panorama...</p>
        </div>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <p className="text-destructive mb-4">{error || 'Image not found'}</p>
          <Link href="/library">
            <Button variant="outline">Back to Library</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <Link href="/library">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Library
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Images Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Processed Image (Main Display) */}
          {image.processed_url && (
            <Card>
              <CardHeader>
                <CardTitle>Processed Image</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="relative w-full aspect-video overflow-hidden rounded-b-lg bg-muted">
                  <Image
                    src={image.processed_url}
                    alt={`${image.title || 'Panorama'} - Processed`}
                    fill
                    className="object-contain"
                    sizes="100vw"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Original Image */}
          <Card>
            <CardHeader>
              <CardTitle>Original Image</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative w-full aspect-video overflow-hidden rounded-b-lg bg-muted">
                <Image
                  src={image.original_url}
                  alt={`${image.title || 'Panorama'} - Original`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              </div>
            </CardContent>
          </Card>

          {/* Panel Images */}
          {panels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Panel Images ({panels.length} panels)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {panels.map((panel) => (
                    <div key={panel.id} className="space-y-2">
                      <div className="relative w-full aspect-square overflow-hidden rounded-lg bg-muted">
                        <Image
                          src={panel.panel_url}
                          alt={`${image.title || 'Panorama'} - Panel ${panel.panel_order}`}
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        Panel {panel.panel_order}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{image.title || 'Untitled Panorama'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Description */}
              {image.description && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Description</h3>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {image.description}
                  </p>
                </div>
              )}

              {/* Location */}
              {image.location_name && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Location</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{image.location_name}</p>
                  {image.latitude && image.longitude && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {image.latitude.toFixed(4)}, {image.longitude.toFixed(4)}
                    </p>
                  )}
                </div>
              )}

              {/* Date Taken */}
              {image.date_taken && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Date Taken</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(image.date_taken).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              )}

              {/* Tags */}
              {image.tags && image.tags.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Tags</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {image.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status */}
              {image.status && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Status</h3>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                      image.status === 'posted'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : image.status === 'ready'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : image.status === 'private'
                        ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}
                  >
                    {image.status.charAt(0).toUpperCase() + image.status.slice(1)}
                  </span>
                </div>
              )}

              {/* Created Date */}
              {image.created_at && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(image.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-2">
                <Link
                  href={`/edit/${encodeURIComponent(image.original_url)}${image.id ? `?id=${image.id}` : ''}`}
                  className="w-full"
                >
                  <Button variant="outline" className="w-full">
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(image.original_url, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Original
                </Button>
                {image.processed_url && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(image.processed_url!, '_blank')}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Processed
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}



