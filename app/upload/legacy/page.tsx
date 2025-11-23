'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Upload, X, ArrowUp, ArrowDown, Check } from 'lucide-react';
import Link from 'next/link';
import { uploadFile, PROCESSED_BUCKET, RAW_BUCKET, OPTIMIZED_BUCKET } from '@/lib/supabase/storage';
import { saveImageMetadata, savePanels, getAllTags } from '@/lib/supabase/database';
import { ImageMetadataForm } from '@/components/editor/ImageMetadataForm';
import { cropImage, generatePanelImages, generateWebOptimized } from '@/lib/image-processing/utils';
import type { PanoramaImage } from '@/types';

interface UploadedFile {
  file: File | null;
  url?: string;
  uploading: boolean;
  croppedFile?: File | null; // Cropped version of the file
  croppedPreviewUrl?: string; // Preview URL for cropped file
}

interface GeneratedPanel {
  order: number;
  blob: Blob;
  previewUrl: string;
}

// Panel constants matching the editor
const PANEL_SIZE = 1080;
const BLOCK_RATIO = 0.1685;
const BLOCK_HEIGHT = Math.round(PANEL_SIZE * BLOCK_RATIO);
const IMAGE_STRIP_HEIGHT = PANEL_SIZE - BLOCK_HEIGHT * 2; // 716px


export default function LegacyUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<'upload' | 'metadata' | 'saving'>('upload');
  
  // File states
  const [originalFile, setOriginalFile] = useState<UploadedFile | null>(null);
  const [processedFile, setProcessedFile] = useState<UploadedFile | null>(null);
  const [generatedPanels, setGeneratedPanels] = useState<GeneratedPanel[]>([]);
  const [processedPanelCount, setProcessedPanelCount] = useState<number>(3);
  const [isGeneratingPanels, setIsGeneratingPanels] = useState(false);
  
  // Crop preview state
  const [processedCropPreview, setProcessedCropPreview] = useState<{
    originalUrl: string;
    cropBounds: { x: number; y: number; width: number; height: number };
    imageDimensions: { width: number; height: number };
  } | null>(null);
  
  
  // Metadata
  const [metadata, setMetadata] = useState<Partial<PanoramaImage>>({
    status: 'draft',
  });
  const [existingTags, setExistingTags] = useState<string[]>([]);
  
  // Loading states
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Removed crop state - no longer needed for manual cropping

  // Load existing tags
  useEffect(() => {
    getAllTags().then(setExistingTags).catch(console.error);
  }, []);

  // Function to automatically detect and crop white space
  const autoCropWhiteSpace = useCallback(async (
    file: File,
    url: string,
    type: 'processed',
    panelIndex: undefined,
    panelCount?: number
  ) => {
    try {
      setIsUploading(true);
      setError(null);

      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      // Create canvas to analyze image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Threshold for "white" (adjustable, but 240/255 is a good default)
      const whiteThreshold = 240;
      
      // Find top edge (scan from top)
      let top = 0;
      for (let y = 0; y < canvas.height; y++) {
        let isWhiteRow = true;
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Check if pixel is white (all channels above threshold)
          if (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold) {
            isWhiteRow = false;
            break;
          }
        }
        if (!isWhiteRow) {
          top = y;
          break;
        }
      }

      // Find bottom edge (scan from bottom)
      let bottom = canvas.height;
      for (let y = canvas.height - 1; y >= 0; y--) {
        let isWhiteRow = true;
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          if (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold) {
            isWhiteRow = false;
            break;
          }
        }
        if (!isWhiteRow) {
          bottom = y + 1;
          break;
        }
      }

      // Find left edge (scan from left)
      let left = 0;
      for (let x = 0; x < canvas.width; x++) {
        let isWhiteCol = true;
        for (let y = 0; y < canvas.height; y++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          if (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold) {
            isWhiteCol = false;
            break;
          }
        }
        if (!isWhiteCol) {
          left = x;
          break;
        }
      }

      // Find right edge (scan from right)
      let right = canvas.width;
      for (let x = canvas.width - 1; x >= 0; x--) {
        let isWhiteCol = true;
        for (let y = 0; y < canvas.height; y++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          if (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold) {
            isWhiteCol = false;
            break;
          }
        }
        if (!isWhiteCol) {
          right = x + 1;
          break;
        }
      }

      // Calculate the required aspect ratio based on panel count
      let requiredAspect: number | null = null;
      if (type === 'processed' && panelCount) {
        // Processed image with N panels: should be (N * 1080):716
        requiredAspect = (panelCount * PANEL_SIZE) / IMAGE_STRIP_HEIGHT;
      }

      // Calculate crop area
      let croppedAreaPixels = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };

      // If aspect ratio is required, adjust the crop to match it
      if (requiredAspect) {
        const detectedWidth = right - left;
        const detectedHeight = bottom - top;
        const detectedAspect = detectedWidth / detectedHeight;

        if (Math.abs(detectedAspect - requiredAspect) > 0.01) {
          // Need to adjust to match required aspect ratio
          // Keep the detected width, adjust height
          const requiredHeight = detectedWidth / requiredAspect;
          
          // Center the crop vertically within the detected area
          const centerY = top + (detectedHeight / 2);
          const newTop = Math.max(0, centerY - (requiredHeight / 2));
          const newBottom = Math.min(img.height, newTop + requiredHeight);
          
          // If we hit the top or bottom edge, adjust
          if (newTop < 0) {
            croppedAreaPixels = {
              x: left,
              y: 0,
              width: detectedWidth,
              height: requiredHeight,
            };
          } else if (newBottom > img.height) {
            croppedAreaPixels = {
              x: left,
              y: img.height - requiredHeight,
              width: detectedWidth,
              height: requiredHeight,
            };
          } else {
            croppedAreaPixels = {
              x: left,
              y: newTop,
              width: detectedWidth,
              height: requiredHeight,
            };
          }
        }
      }

      const croppedBlob = await cropImage(img, croppedAreaPixels, undefined, 'jpeg', 0.95);
      const croppedFile = new File([croppedBlob], file.name, {
        type: file.type,
        lastModified: Date.now(),
      });

      // Create preview URL for cropped file
      const croppedPreviewUrl = URL.createObjectURL(croppedBlob);

      // Store crop preview information (don't revoke URL yet - we need it for preview)
      if (type === 'processed') {
        // Clean up old preview if it exists
        if (processedCropPreview?.originalUrl) {
          URL.revokeObjectURL(processedCropPreview.originalUrl);
        }
        // Create a new URL for the preview (don't use the one that will be cleaned up)
        const previewUrl = URL.createObjectURL(file);
        setProcessedCropPreview({
          originalUrl: previewUrl,
          cropBounds: croppedAreaPixels,
          imageDimensions: { width: img.width, height: img.height },
        });
      }

      // Update the appropriate file state
      if (type === 'processed') {
        setProcessedFile({
          file,
          croppedFile,
          croppedPreviewUrl,
          uploading: false,
        });
        
        // Automatically generate panels from the cropped image
        if (croppedFile && panelCount) {
          generatePanelsFromCropped(croppedFile, panelCount);
        }
      }

      // Clean up
      URL.revokeObjectURL(url);
      setIsUploading(false);
    } catch (err) {
      console.error('Auto crop error:', err);
      setError('Failed to automatically crop white space');
      setIsUploading(false);
      URL.revokeObjectURL(url);
    }
  }, []);

  // Generate panels from cropped processed image
  const generatePanelsFromCropped = useCallback(async (croppedFile: File, panelCount: number) => {
    try {
      setIsGeneratingPanels(true);
      setError(null);

      // Clean up old panels
      setGeneratedPanels((currentPanels) => {
        currentPanels.forEach(panel => {
          URL.revokeObjectURL(panel.previewUrl);
        });
        return [];
      });

      // Load the cropped image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const imgUrl = URL.createObjectURL(croppedFile);
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imgUrl;
      });

      // Generate panel images
      const panels = await generatePanelImages(img, panelCount, PANEL_SIZE, BLOCK_RATIO);

      // Create preview URLs for each panel
      const panelsWithPreviews: GeneratedPanel[] = panels.map(panel => ({
        order: panel.order,
        blob: panel.blob,
        previewUrl: URL.createObjectURL(panel.blob),
      }));

      setGeneratedPanels(panelsWithPreviews);
      URL.revokeObjectURL(imgUrl);
      setIsGeneratingPanels(false);
    } catch (err) {
      console.error('Panel generation error:', err);
      setError('Failed to generate panels');
      setIsGeneratingPanels(false);
    }
  }, []);

  const handleFileSelect = (
    type: 'original' | 'processed',
    file: File | null
  ) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // For processed images, automatically detect and crop white space
    if (type === 'processed') {
      const url = URL.createObjectURL(file);
      
      // Automatically detect and crop white space
      autoCropWhiteSpace(file, url, 'processed', undefined, processedPanelCount);
      return;
    }

    // For original images, just set the file directly
    const uploadedFile: UploadedFile = { file, uploading: false };
    setOriginalFile(uploadedFile);
    setError(null);
  };



  const handleContinueToMetadata = () => {
    // At least one file (original or processed) should be uploaded
    if (!originalFile && !processedFile) {
      setError('Please upload at least the original or processed panorama');
      return;
    }
    setStep('metadata');
    setError(null);
  };

  const handleSave = async (postToInstagram: boolean = false) => {
    // At least one file (original or processed) should be uploaded
    if (!originalFile && !processedFile) {
      setError('Please upload at least the original or processed panorama');
      return;
    }

    // Validate metadata
    if (
      !metadata.title ||
      !metadata.location_name ||
      !metadata.latitude ||
      !metadata.longitude ||
      !metadata.description ||
      !metadata.date_taken
    ) {
      setError('Please fill in all required metadata fields');
      return;
    }

    setIsUploading(true);
    setError(null);
    setStep('saving');

    try {
      // Upload original (if provided)
      let originalUrl: string | undefined;
      if (originalFile && originalFile.file) {
        const originalResult = await uploadFile(originalFile.file, {
          bucket: RAW_BUCKET,
        });
        if (!originalResult) {
          throw new Error('Failed to upload original image');
        }
        originalUrl = originalResult.url;
      }

      // Upload processed (if provided) - use cropped version if available
      let processedUrl: string | undefined;
      let thumbnailUrl: string | undefined;
      let previewUrl: string | undefined;
      
      if (processedFile) {
        const fileToUpload = processedFile.croppedFile || processedFile.file;
        if (fileToUpload) {
          const processedResult = await uploadFile(fileToUpload, {
            bucket: PROCESSED_BUCKET,
          });
          if (processedResult) {
            processedUrl = processedResult.url;
            
            // Generate thumbnail and preview from processed image
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = processedResult.url;
            
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });
            
            const timestamp = Date.now();
            
            // Generate and upload thumbnail (400px, quality 0.80)
            const thumbnailBlob = await generateWebOptimized(img, 400, 0.80);
            const thumbnailFile = new File([thumbnailBlob], `thumb-${timestamp}.jpg`, {
              type: 'image/jpeg',
            });
            const thumbnailResult = await uploadFile(thumbnailFile, {
              bucket: OPTIMIZED_BUCKET,
              folder: 'thumbnails',
            });
            if (thumbnailResult) {
              thumbnailUrl = thumbnailResult.url;
            }
            
            // Generate and upload preview (1920px, quality 0.85)
            const previewBlob = await generateWebOptimized(img, 1920, 0.85);
            const previewFile = new File([previewBlob], `preview-${timestamp}.jpg`, {
              type: 'image/jpeg',
            });
            const previewResult = await uploadFile(previewFile, {
              bucket: OPTIMIZED_BUCKET,
              folder: 'previews',
            });
            if (previewResult) {
              previewUrl = previewResult.url;
            }
          }
        }
      }

      // If no original but we have processed, use processed as original
      // (since original_url is NOT NULL in the database)
      const finalOriginalUrl = originalUrl || processedUrl;
      if (!finalOriginalUrl) {
        throw new Error('At least one image (original or processed) must be uploaded');
      }

      // Upload generated panels
      const panelUrls: Array<{ panel_order: number; panel_url: string }> = [];
      for (const panel of generatedPanels) {
        const panelFile = new File([panel.blob], `panel-${panel.order}-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        const panelResult = await uploadFile(panelFile, {
          bucket: PROCESSED_BUCKET,
          folder: 'panels',
        });
        if (panelResult) {
          panelUrls.push({
            panel_order: panel.order,
            panel_url: panelResult.url,
          });
        }
      }

      // Save metadata
      const imageData: PanoramaImage = {
        id: '', // Will be generated
        original_url: finalOriginalUrl, // Use processed as original if original not provided
        processed_url: processedUrl,
        thumbnail_url: thumbnailUrl,
        preview_url: previewUrl,
        title: metadata.title!,
        location_name: metadata.location_name!,
        latitude: metadata.latitude!,
        longitude: metadata.longitude!,
        description: metadata.description!,
        date_taken: metadata.date_taken!,
        tags: metadata.tags || [],
        status: metadata.status || 'draft',
        panel_count: panelUrls.length > 0 ? panelUrls.length : undefined,
      };

      const saved = await saveImageMetadata(imageData);

      if (!saved) {
        throw new Error('Failed to save image metadata');
      }

      // Save panels
      if (panelUrls.length > 0 && saved.id) {
        await savePanels(saved.id, panelUrls);
      }

      if (postToInstagram && saved.id) {
        try {
          const response = await fetch('/api/instagram/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageId: saved.id }),
          });

          const payload = await response.json();
          if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'Instagram post failed');
          }
        } catch (error) {
          console.error('Instagram post error:', error);
          alert(
            `Image saved, but failed to post to Instagram: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      // Success - redirect to library
      router.push(`/library/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('metadata');
      console.error('Save error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/upload">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Upload
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Legacy Upload</h1>
        <p className="text-muted-foreground">
          Upload pre-processed panoramas and panels with metadata
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading indicator for auto-cropping */}
      {isUploading && (
        <Card className="mb-6">
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Detecting and cropping white space...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'upload' && (
        <div className="space-y-6">
          {/* Original Panorama */}
          <Card>
            <CardHeader>
              <CardTitle>Original Panorama (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUploadZone
                file={originalFile}
                onFileSelect={(file) => handleFileSelect('original', file)}
                onRemove={() => setOriginalFile(null)}
                label="Upload unedited panorama"
              />
            </CardContent>
          </Card>

          {/* Processed Panorama */}
          <Card>
            <CardHeader>
              <CardTitle>Processed Panorama (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUploadZone
                file={processedFile}
                onFileSelect={(file) => handleFileSelect('processed', file)}
                onRemove={() => {
                  // Clean up preview URLs
                  if (processedFile?.croppedPreviewUrl) {
                    URL.revokeObjectURL(processedFile.croppedPreviewUrl);
                  }
                  if (processedCropPreview?.originalUrl) {
                    URL.revokeObjectURL(processedCropPreview.originalUrl);
                  }
                  setProcessedFile(null);
                  setProcessedCropPreview(null);
                }}
                label="Upload processed/edited panorama"
              />
              <div className="space-y-2 mt-4">
                <Label htmlFor="processedPanelCount">Number of Panels</Label>
                <Input
                  id="processedPanelCount"
                  type="number"
                  min="1"
                  max="10"
                  value={processedPanelCount}
                  onChange={(e) => {
                    const count = parseInt(e.target.value) || 3;
                    setProcessedPanelCount(count);
                    // Re-crop if we already have a file
                    if (processedFile?.file) {
                      const url = URL.createObjectURL(processedFile.file);
                      autoCropWhiteSpace(processedFile.file, url, 'processed', undefined, count);
                    } else if (processedFile?.croppedFile) {
                      // If we have a cropped file, just regenerate panels
                      generatePanelsFromCropped(processedFile.croppedFile, count);
                    }
                  }}
                />
              </div>
              {processedFile?.croppedFile && processedFile?.croppedPreviewUrl && processedCropPreview && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Original Image (with crop overlay)</p>
                    <CropPreviewImage
                      originalUrl={processedCropPreview.originalUrl}
                      cropBounds={processedCropPreview.cropBounds}
                      imageDimensions={processedCropPreview.imageDimensions}
                      maxHeight={256}
                    />
                    <p className="text-xs text-muted-foreground">
                      Red dashed box shows what will be kept. Darkened areas will be cropped.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Cropped Result</p>
                    <div className="border rounded-lg overflow-hidden">
                      <img
                        src={processedFile.croppedPreviewUrl}
                        alt="Cropped preview"
                        className="w-full h-auto max-h-64 object-contain"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ✓ Final cropped version (white space removed, aspect ratio: {processedPanelCount}:1)
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated Panels */}
          {generatedPanels.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Panels ({generatedPanels.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {generatedPanels.map((panel) => (
                    <div key={panel.order} className="space-y-2">
                      <div className="border rounded-lg overflow-hidden">
                        <img
                          src={panel.previewUrl}
                          alt={`Panel ${panel.order}`}
                          className="w-full h-auto object-contain"
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        Panel {panel.order}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Panels are automatically generated from the cropped processed image.
                </p>
              </CardContent>
            </Card>
          )}
          
          {isGeneratingPanels && (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Generating panels...</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button 
              onClick={handleContinueToMetadata} 
              disabled={!originalFile && !processedFile}
            >
              Continue to Metadata
            </Button>
          </div>
        </div>
      )}

      {step === 'metadata' && (
        <div className="space-y-6">
          <ImageMetadataForm
            metadata={metadata}
            onChange={setMetadata}
            existingTags={existingTags}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="outline" onClick={() => setStep('upload')}>
              Back
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => handleSave(false)} disabled={isUploading}>
                {isUploading ? 'Saving...' : 'Save Image'}
              </Button>
              <Button onClick={() => handleSave(true)} disabled={isUploading}>
                {isUploading ? 'Saving...' : 'Save and post to Instagram'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Uploading files and saving...</p>
        </div>
      )}
    </div>
  );
}

// Component to show original image with crop overlay
function CropPreviewImage({
  originalUrl,
  cropBounds,
  imageDimensions,
  maxHeight = 256,
}: {
  originalUrl: string;
  cropBounds: { x: number; y: number; width: number; height: number };
  imageDimensions: { width: number; height: number };
  maxHeight?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDisplaySize, setImageDisplaySize] = useState<{ width: number; height: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (imageRef.current && containerRef.current) {
        const img = imageRef.current;
        const container = containerRef.current;
        
        // Wait for image to load
        if (img.complete && img.naturalWidth > 0) {
          const containerWidth = container.clientWidth;
          const containerHeight = Math.min(maxHeight, container.clientHeight);
          
          // Use actual displayed image dimensions
          const imgRect = img.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          const displayWidth = imgRect.width;
          const displayHeight = imgRect.height;
          const offsetX = imgRect.left - containerRect.left;
          const offsetY = imgRect.top - containerRect.top;
          
          setImageDisplaySize({ width: displayWidth, height: displayHeight, offsetX, offsetY });
        }
      }
    };

    // Use a small delay to ensure image is rendered
    const timeoutId = setTimeout(updateSize, 100);
    
    updateSize();
    window.addEventListener('resize', updateSize);
    if (imageRef.current) {
      imageRef.current.addEventListener('load', updateSize);
      // Also try after a short delay in case load event already fired
      setTimeout(updateSize, 200);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateSize);
      if (imageRef.current) {
        imageRef.current.removeEventListener('load', updateSize);
      }
    };
  }, [imageDimensions, maxHeight, originalUrl]);

  if (!imageDisplaySize) {
    return (
      <div className="border rounded-lg overflow-hidden relative bg-gray-100" style={{ minHeight: `${maxHeight}px` }} ref={containerRef}>
        <img
          ref={imageRef}
          src={originalUrl}
          alt="Original with crop overlay"
          className="w-full h-auto object-contain"
          style={{ maxHeight: `${maxHeight}px` }}
        />
      </div>
    );
  }

  // Calculate crop overlay position relative to displayed image
  const scaleX = imageDisplaySize.width / imageDimensions.width;
  const scaleY = imageDisplaySize.height / imageDimensions.height;
  
  const overlayLeft = imageDisplaySize.offsetX + (cropBounds.x * scaleX);
  const overlayTop = imageDisplaySize.offsetY + (cropBounds.y * scaleY);
  const overlayWidth = cropBounds.width * scaleX;
  const overlayHeight = cropBounds.height * scaleY;

  return (
    <div className="border rounded-lg overflow-hidden relative bg-gray-100" style={{ minHeight: `${maxHeight}px` }} ref={containerRef}>
      <img
        ref={imageRef}
        src={originalUrl}
        alt="Original with crop overlay"
        className="w-full h-auto object-contain"
        style={{ maxHeight: `${maxHeight}px` }}
      />
      {/* Red dashed box showing what will be kept */}
      <div
        className="absolute border-2 border-red-500 border-dashed pointer-events-none z-10"
        style={{
          left: `${overlayLeft}px`,
          top: `${overlayTop}px`,
          width: `${overlayWidth}px`,
          height: `${overlayHeight}px`,
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
        }}
      />
      {/* Darken areas that will be cropped - top/bottom */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${imageDisplaySize.offsetX}px`,
          top: `${imageDisplaySize.offsetY}px`,
          width: `${imageDisplaySize.width}px`,
          height: `${overlayTop - imageDisplaySize.offsetY}px`,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${imageDisplaySize.offsetX}px`,
          top: `${overlayTop + overlayHeight}px`,
          width: `${imageDisplaySize.width}px`,
          height: `${(imageDisplaySize.offsetY + imageDisplaySize.height) - (overlayTop + overlayHeight)}px`,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
      />
      {/* Darken areas that will be cropped - left/right */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${imageDisplaySize.offsetX}px`,
          top: `${overlayTop}px`,
          width: `${overlayLeft - imageDisplaySize.offsetX}px`,
          height: `${overlayHeight}px`,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${overlayLeft + overlayWidth}px`,
          top: `${overlayTop}px`,
          width: `${(imageDisplaySize.offsetX + imageDisplaySize.width) - (overlayLeft + overlayWidth)}px`,
          height: `${overlayHeight}px`,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
        }}
      />
    </div>
  );
}

// Helper component for file upload
function FileUploadZone({
  file,
  onFileSelect,
  onRemove,
  label,
  compact = false,
}: {
  file: UploadedFile | null;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  label: string;
  compact?: boolean;
}) {
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      onFileSelect(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      onFileSelect(droppedFile);
    }
  };

  if (file?.file && file.file.size > 0) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">{file.file.name}</p>
            <p className="text-sm text-muted-foreground">
              {(file.file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : ''
        } ${compact ? 'p-2' : 'p-8'}`}
      >
        <div className="text-center">
          <Upload className={`mx-auto text-muted-foreground mb-2 ${compact ? 'h-6 w-6' : 'h-12 w-12'}`} />
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {compact ? 'Click to select' : 'Drag and drop or click to select file'}
          </p>
        </div>
      </div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </label>
  );
}

