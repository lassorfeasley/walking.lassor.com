'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit, ExternalLink, MapPin, Calendar, Tag, FileText, Download, Trash2, Instagram } from 'lucide-react';
import Link from 'next/link';
import { getImageMetadata, getPanelsByImageId, deleteImage, saveImageMetadata } from '@/lib/supabase/database';
import { useEffect, useState } from 'react';
import { PanoramaImage, PanoramaPanel } from '@/types';
import JSZip from 'jszip';
import { uploadFile } from '@/lib/supabase/storage';
import { useRequireAuth } from '@/lib/auth-client';

// Helper function to generate web-optimized version
async function generateWebOptimized(
  image: HTMLImageElement,
  maxWidth: number,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    let width = image.naturalWidth;
    let height = image.naturalHeight;
    
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

export default function PanoramaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { isLoading: isAuthLoading } = useRequireAuth();
  const [image, setImage] = useState<PanoramaImage | null>(null);
  const [panels, setPanels] = useState<PanoramaPanel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingOptimized, setIsGeneratingOptimized] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const handlePostToInstagram = async () => {
    if (!image || isPosting) return;

    const confirmed = window.confirm(
      `Post "${image.title || 'this panorama'}" to Instagram now?`
    );

    if (!confirmed) return;

    setIsPosting(true);
    try {
      const response = await fetch('/api/instagram/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: image.id }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to post');
      }

      const nextImage = {
        ...image,
        status: 'posted',
        posted_at: new Date().toISOString(),
        instagram_post_id: payload.postId,
      };
      setImage(nextImage);
      alert(
        `Queued for Instagram (stub). Reference: ${payload.postId ?? 'n/a'}`
      );
    } catch (error) {
      console.error('Instagram post error', error);
      alert(
        `Failed to post to Instagram: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      setIsPosting(false);
    }
  };


  // All hooks must be called before any conditional returns
  useEffect(() => {
    // Only load image if auth check is complete
    if (isAuthLoading) return;

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
  }, [id, isAuthLoading]);

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

  const handleDelete = async () => {
    if (!image) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${image.title || 'this panorama'}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const success = await deleteImage(image.id);
      if (success) {
        // Redirect to library after successful deletion
        router.push('/library');
      } else {
        alert('Failed to delete panorama. Please try again.');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete panorama. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGenerateOptimizedVersions = async () => {
    if (!image) return;

    setIsGeneratingOptimized(true);
    try {
      // Use processed_url if available, otherwise use original_url
      const sourceUrl = image.processed_url || image.original_url;
      
      // Load the source image
      const img = document.createElement('img');
      img.crossOrigin = 'anonymous';
      img.src = sourceUrl;
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });

      const timestamp = Date.now();
      let thumbnailUrl: string | undefined = image.thumbnail_url;
      let previewUrl: string | undefined = image.preview_url;

      // Generate thumbnail if missing
      if (!image.thumbnail_url) {
        const thumbnailBlob = await generateWebOptimized(img, 400, 0.80);
        const thumbnailFile = new File([thumbnailBlob], `thumb-${timestamp}.jpg`, {
          type: 'image/jpeg',
        });
        const thumbnailResult = await uploadFile(thumbnailFile, {
          bucket: 'optimized-web',
          folder: 'thumbnails',
        });
        if (thumbnailResult) {
          thumbnailUrl = thumbnailResult.url;
        }
      }

      // Generate preview if missing
      if (!image.preview_url) {
        const previewBlob = await generateWebOptimized(img, 1920, 0.85);
        const previewFile = new File([previewBlob], `preview-${timestamp}.jpg`, {
          type: 'image/jpeg',
        });
        const previewResult = await uploadFile(previewFile, {
          bucket: 'optimized-web',
          folder: 'previews',
        });
        if (previewResult) {
          previewUrl = previewResult.url;
        }
      }

      // Update the database
      const updatedImage = {
        ...image,
        thumbnail_url: thumbnailUrl,
        preview_url: previewUrl,
      };

      await saveImageMetadata(updatedImage);

      // Refresh the page data
      const refreshedImage = await getImageMetadata(id);
      if (refreshedImage) {
        setImage(refreshedImage);
      }

      alert('Optimized versions generated successfully!');
    } catch (error) {
      console.error('Generate optimized versions error:', error);
      alert('Failed to generate optimized versions. Please try again.');
    } finally {
      setIsGeneratingOptimized(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!image) return;

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const timestamp = Date.now();

      // Download processed image and add to zip
      if (image.processed_url) {
        const response = await fetch(image.processed_url);
        const blob = await response.blob();
        zip.file(`processed-${timestamp}.jpg`, blob);
      }

      // Download all panel images and add to zip
      if (panels.length > 0) {
        for (const panel of panels) {
          const response = await fetch(panel.panel_url);
          const blob = await response.blob();
          zip.file(`panel-${panel.panel_order}-${timestamp}.jpg`, blob);
        }
      }

      // Generate and download the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `walking-forward-${image.title?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'panorama'}-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download images. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

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
                    src={image.preview_url || image.processed_url}
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
              {image.original_url ? (
                <div className="relative w-full aspect-video overflow-hidden rounded-b-lg bg-muted">
                  <Image
                    src={image.original_url}
                    alt={`${image.title || 'Panorama'} - Original`}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    onError={(e) => {
                      console.error('Failed to load original image:', image.original_url);
                    }}
                  />
                </div>
              ) : (
                <div className="relative w-full aspect-video overflow-hidden rounded-b-lg bg-muted flex items-center justify-center">
                  <div className="text-center p-6">
                    <p className="text-sm text-muted-foreground mb-2">Original image not available</p>
                    <p className="text-xs text-muted-foreground">
                      The original image was not uploaded, but processed versions are available.
                    </p>
                    {image.processed_url && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Using processed image as source.
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                  href={`/edit/${encodeURIComponent(image.original_url || image.processed_url || '')}${image.id ? `?id=${image.id}` : ''}`}
                  className="w-full"
                >
                  <Button 
                    variant="outline" 
                    className="w-full"
                    disabled={!image.original_url && !image.processed_url}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </Link>
                <Button
                  className="w-full"
                  onClick={handlePostToInstagram}
                  disabled={isPosting}
                >
                  <Instagram className="mr-2 h-4 w-4" />
                  {isPosting ? 'Posting...' : 'Post to Instagram'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDownloadZip}
                  disabled={isDownloading || (!image.processed_url && panels.length === 0)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {isDownloading ? 'Downloading...' : 'Download Zip'}
                </Button>
                
                {/* Generate Optimized Versions Button */}
                {(!image.thumbnail_url || !image.preview_url) && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleGenerateOptimizedVersions}
                    disabled={isGeneratingOptimized}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {isGeneratingOptimized ? 'Generating...' : 'Generate Missing Versions'}
                  </Button>
                )}
                
                {/* Download Quality Tiers Section */}
                <div className="border-t border-border pt-3 mt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Download Quality Tiers</p>
                  <div className="flex flex-col gap-1.5">
                    {image.original_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-xs h-8"
                        onClick={() => window.open(image.original_url, '_blank')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Original (Unedited)
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-xs h-8 opacity-50 cursor-not-allowed"
                        disabled
                        title="Original image not available"
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Original (Unedited) - Not Available
                      </Button>
                    )}
                    {image.processed_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-xs h-8"
                        onClick={() => window.open(image.processed_url!, '_blank')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Processed (PNG Lossless)
                      </Button>
                    )}
                    {image.preview_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-xs h-8"
                        onClick={() => window.open(image.preview_url!, '_blank')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Preview (1920px JPEG)
                      </Button>
                    )}
                    {image.thumbnail_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-xs h-8"
                        onClick={() => window.open(image.thumbnail_url!, '_blank')}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Thumbnail (400px JPEG)
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Download Panel Images Section */}
                {panels.length > 0 && (
                  <div className="border-t border-border pt-3 mt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Download Panel Images ({panels.length})
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {panels.map((panel) => (
                        <Button
                          key={panel.id}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs h-8"
                          onClick={() => window.open(panel.panel_url, '_blank')}
                        >
                          <Download className="mr-2 h-3 w-3" />
                          Panel {panel.panel_order} (1080x1080)
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="border-t border-border mt-2 pt-2">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'Deleting...' : 'Delete Panorama'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}




