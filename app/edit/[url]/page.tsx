'use client';

import { use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ImageEditor } from '@/components/editor/ImageEditor';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditPage({
  params,
}: {
  params: Promise<{ url: string }>;
}) {
  const { url } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageUrl = decodeURIComponent(url);
  const imageId = searchParams.get('id') || undefined;

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

      <ImageEditor imageUrl={imageUrl} imageId={imageId} onSave={handleSave} />
    </div>
  );
}

