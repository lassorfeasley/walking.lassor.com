'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
}

export function UploadZone({ onUpload, isUploading = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        setSelectedFile(file);
      }
    },
    []
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFile) {
      await onUpload(selectedFile);
      setSelectedFile(null);
    }
  }, [selectedFile, onUpload]);

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <div className="space-y-4">
      <Card
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
      >
        <CardContent className="flex flex-col items-center justify-center p-12">
          {selectedFile ? (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemove}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? 'Uploading...' : 'Upload Image'}
              </Button>
            </div>
          ) : (
            <>
              <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="mb-2 text-sm font-medium">
                  Drag and drop your panorama image here
                </p>
                <p className="mb-4 text-xs text-muted-foreground">
                  or click to browse
                </p>
                <label>
                  <Button asChild variant="outline" disabled={isUploading}>
                    <span>Select File</span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

