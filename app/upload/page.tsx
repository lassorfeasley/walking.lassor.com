'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadZone } from '@/components/upload/UploadZone';
import { uploadFile } from '@/lib/supabase/storage';
import { rotateToLandscape } from '@/lib/image-processing/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function UploadPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      // Validate file size (max 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('File size exceeds 50MB limit');
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }

      // Rotate portrait images to landscape before uploading
      const processedFile = await rotateToLandscape(file);

      // Upload to Supabase storage
      const result = await uploadFile(processedFile, {
        bucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET_RAW || 'raw-panoramas',
      });

      if (!result) {
        throw new Error('Failed to upload file');
      }

      // TODO: Save metadata to database when schema is finalized
      // For now, we'll redirect to edit page with the image URL
      // In a real implementation, you'd create a database record and use its ID
      const imageId = result.path.replace(/\.[^/.]+$/, ''); // Remove extension for ID
      router.push(`/edit/${encodeURIComponent(result.url)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Upload Panorama</h1>
          <Link href="/upload/legacy">
            <Button variant="outline" size="sm">
              Legacy Upload
            </Button>
          </Link>
        </div>
        <p className="text-muted-foreground">
          Upload your panorama image to get started
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <UploadZone onUpload={handleUpload} isUploading={isUploading} />
    </div>
  );
}

