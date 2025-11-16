'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { RotateCw, ChevronDown, ChevronUp } from 'lucide-react';
import { cropImage, getPanelDimensions, addWhiteBlocks, applyHighlightsShadows, applySelectiveColor, generatePanelImages } from '@/lib/image-processing/utils';
import { uploadFile, PROCESSED_BUCKET } from '@/lib/supabase/storage';
import { saveImageMetadata, getImageMetadata, getImageByUrl, getAllTags, savePanels } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { ImageMetadataForm } from './ImageMetadataForm';
import JSZip from 'jszip';

interface ImageEditorProps {
  imageUrl: string;
  imageId?: string;
  onSave?: (recordId: string) => void;
}

export function ImageEditor({ imageUrl, imageId, onSave }: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [panelCount, setPanelCount] = useState<number>(3);
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    exposure: 0,
    highlights: 0,
    shadows: 0,
  });
  const [selectiveColor, setSelectiveColor] = useState<{
    selectedColor: 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta' | null;
    adjustments: {
      red: { saturation: number; luminance: number };
      yellow: { saturation: number; luminance: number };
      green: { saturation: number; luminance: number };
      cyan: { saturation: number; luminance: number };
      blue: { saturation: number; luminance: number };
      magenta: { saturation: number; luminance: number };
    };
  }>({
    selectedColor: 'red',
    adjustments: {
      red: { saturation: 0, luminance: 0 },
      yellow: { saturation: 0, luminance: 0 },
      green: { saturation: 0, luminance: 0 },
      cyan: { saturation: 0, luminance: 0 },
      blue: { saturation: 0, luminance: 0 },
      magenta: { saturation: 0, luminance: 0 },
    },
  });
  const [isSelectiveColorOpen, setIsSelectiveColorOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [initialZoomSet, setInitialZoomSet] = useState(false);
  const [filteredPreviewUrl, setFilteredPreviewUrl] = useState<string | null>(null);
  const [isUpdatingPreview, setIsUpdatingPreview] = useState(false);
  const [metadata, setMetadata] = useState<Partial<PanoramaImage>>({
    title: '',
    location_name: '',
    latitude: 0,
    longitude: 0,
    description: '',
    date_taken: new Date().toISOString().split('T')[0],
    tags: [],
    status: 'draft',
  });
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const prevPanelCountRef = useRef<number>(panelCount);
  const previewUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const aspectRatioValue = useCallback(() => {
    // Calculate aspect ratio for the image strip area (excluding white blocks)
    const panelHeight = 1080;
    const blockRatio = 0.1685;
    const blockHeight = Math.round(panelHeight * blockRatio);
    const imageStripHeight = panelHeight - blockHeight * 2;
    const imageStripWidth = panelCount * panelHeight;
    // Return width/height ratio for the image strip area
    return imageStripWidth / imageStripHeight;
  }, [panelCount]);

  // Calculate initial zoom so image fills the full width of the panels
  // react-easy-crop's zoom is relative to the "fit" size (zoom = 1.0 means fit to container)
  // To fill width, we calculate: zoom = (container width / image width) / (fit zoom)
  const calculateInitialZoom = useCallback((
    imageWidth: number,
    imageHeight: number,
    rotation: number,
    panelCount: number
  ): number => {
    // Account for rotation: if 90° or 270°, swap dimensions
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const is90or270 = normalizedRotation === 90 || normalizedRotation === 270;
    
    const effectiveWidth = is90or270 ? imageHeight : imageWidth;
    const effectiveHeight = is90or270 ? imageWidth : imageHeight;

    // Frame dimensions (image strip area - middle section of panels, excluding white blocks)
    const panelHeight = 1080;
    const blockRatio = 0.1685;
    const blockHeight = Math.round(panelHeight * blockRatio);
    const imageStripHeight = panelHeight - blockHeight * 2;
    const imageStripWidth = panelCount * panelHeight;

    // Calculate the aspect ratio of the container and image
    const containerAspectRatio = imageStripWidth / imageStripHeight;
    const imageAspectRatio = effectiveWidth / effectiveHeight;

    // Calculate the "fit" zoom (what react-easy-crop uses for zoom = 1.0)
    // This is the zoom that fits the image to the container while maintaining aspect ratio
    const fitZoomWidth = imageStripWidth / effectiveWidth;
    const fitZoomHeight = imageStripHeight / effectiveHeight;
    const fitZoom = Math.min(fitZoomWidth, fitZoomHeight); // Fit uses the smaller one

    // Calculate the zoom needed to fill the width
    const widthFillZoom = imageStripWidth / effectiveWidth;

    // Return the zoom relative to the fit zoom
    // If we want width to fill, we need: widthFillZoom / fitZoom
    return widthFillZoom / fitZoom;
  }, []);

  const onCropComplete = useCallback(
    (croppedArea: any, croppedAreaPixels: any) => {
      // Use react-easy-crop's accurate calculation
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  // Also update crop area during dragging for real-time preview
  // We'll rely on onCropComplete for accurate values, but try to calculate approximate values during dragging
  const onCropChange = useCallback((cropArea: any) => {
    setCrop(cropArea);
    // Don't update croppedAreaPixels here - let onCropComplete handle it for accuracy
    // The preview will update when dragging stops, which is better than showing wrong area
  }, []);

  // Track zoom to preserve it when filtered image changes
  const zoomRef = useRef<number>(1);

  // Update filtered preview image when highlights/shadows change
  const updateFilteredPreview = useCallback(async () => {
    if (!imageRef.current || !imageRef.current.complete) return;

    setIsUpdatingPreview(true);

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      const img = imageRef.current;
      if (!img || !img.complete) {
        setIsUpdatingPreview(false);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsUpdatingPreview(false);
        return;
      }

      // Optimize: Use smaller canvas for preview (max 1920px width)
      const MAX_PREVIEW_WIDTH = 1920;
      const scale = Math.min(1, MAX_PREVIEW_WIDTH / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      // Apply CSS filters first (fast, GPU-accelerated)
      const effectiveBrightness = Math.max(0, filters.brightness + filters.exposure);
      ctx.filter = [
        `brightness(${effectiveBrightness}%)`,
        `contrast(${filters.contrast}%)`,
        `saturate(${filters.saturation}%)`,
      ].join(' ');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Check if we need pixel-based filters
      const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
      const hasSelectiveColor = Object.values(selectiveColor.adjustments).some(
        (adj) => adj.saturation !== 0 || adj.luminance !== 0
      );

      // Optimize: Get ImageData once, apply all pixel-based filters, put back once
      if (hasHighlightsShadows || hasSelectiveColor) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Apply highlights and shadows if non-zero
        if (hasHighlightsShadows) {
          applyHighlightsShadows(imageData, filters.highlights, filters.shadows);
        }

        // Apply selective color adjustments for all active colors
        if (hasSelectiveColor) {
          (['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).forEach((color) => {
            const adj = selectiveColor.adjustments[color];
            if (adj.saturation !== 0 || adj.luminance !== 0) {
              applySelectiveColor(imageData, color, adj.saturation, adj.luminance);
            }
          });
        }

        // Put ImageData back once after all filters are applied
        ctx.putImageData(imageData, 0, 0);
      }

      // Optimize: Lower JPEG quality for preview (0.75 instead of 0.95)
      // Export still uses 0.95 quality
      canvas.toBlob((blob) => {
        if (blob) {
          setFilteredPreviewUrl((prevUrl) => {
            // Revoke previous URL
            if (prevUrl) {
              URL.revokeObjectURL(prevUrl);
            }
            return URL.createObjectURL(blob);
          });
        }
        setIsUpdatingPreview(false);
      }, 'image/jpeg', 0.75);
    });
  }, [filters.highlights, filters.shadows, filters.brightness, filters.contrast, filters.saturation, filters.exposure, selectiveColor.adjustments]);

  // Debounced update of filtered preview when filters change
  useEffect(() => {
    if (previewUpdateTimeoutRef.current) {
      clearTimeout(previewUpdateTimeoutRef.current);
    }
    
    // Update if highlights/shadows or selective color are active
    const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
    const hasSelectiveColor = Object.values(selectiveColor.adjustments).some(
      (adj) => adj.saturation !== 0 || adj.luminance !== 0
    );
    
    if (hasHighlightsShadows || hasSelectiveColor) {
      previewUpdateTimeoutRef.current = setTimeout(() => {
        updateFilteredPreview();
      }, 300); // Debounce by 300ms (increased from 150ms for better performance)
    } else {
      // Clean up preview URL if no canvas-based filters are active
      setFilteredPreviewUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        return null;
      });
    }

    return () => {
      if (previewUpdateTimeoutRef.current) {
        clearTimeout(previewUpdateTimeoutRef.current);
      }
    };
  }, [filters.highlights, filters.shadows, filters.brightness, filters.contrast, filters.saturation, filters.exposure, selectiveColor.adjustments, updateFilteredPreview]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (filteredPreviewUrl) {
        URL.revokeObjectURL(filteredPreviewUrl);
      }
    };
  }, [filteredPreviewUrl]);

  // Set initial zoom when image loads (images are already landscape from upload)
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imageRef.current = img;
    
    // Update filtered preview if highlights/shadows are set
    if (filters.highlights !== 0 || filters.shadows !== 0) {
      setTimeout(() => {
        updateFilteredPreview();
      }, 100);
    }
  }, [filters.highlights, filters.shadows, updateFilteredPreview]);

  // Set initial zoom after image loads and component is ready
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete && !initialZoomSet) {
      const img = imageRef.current;
      const zoomValue = calculateInitialZoom(
        img.naturalWidth,
        img.naturalHeight,
        rotation,
        panelCount
      );
      // Use multiple timeouts to ensure react-easy-crop has fully initialized
      setTimeout(() => {
        setZoom(zoomValue);
        zoomRef.current = zoomValue;
        // Set again after a short delay to override any react-easy-crop recalculation
        setTimeout(() => {
          setZoom(zoomValue);
          zoomRef.current = zoomValue;
        }, 200);
      }, 150);
      setInitialZoomSet(true);
    }
  }, [imageRef.current?.complete, calculateInitialZoom, panelCount, rotation, initialZoomSet]);

  // Recalculate zoom when panelCount changes (but not when rotation changes manually)
  useEffect(() => {
    if (imageRef.current && initialZoomSet && prevPanelCountRef.current !== panelCount) {
      // Only recalculate when panelCount actually changes
      const zoomValue = calculateInitialZoom(
        imageRef.current.naturalWidth,
        imageRef.current.naturalHeight,
        rotation,
        panelCount
      );
      setZoom(zoomValue);
      zoomRef.current = zoomValue;
      prevPanelCountRef.current = panelCount;
    }
  }, [panelCount, calculateInitialZoom, rotation, initialZoomSet]);

  // Load existing metadata and tags
  useEffect(() => {
    const loadMetadata = async () => {
      setIsLoadingMetadata(true);
      try {
        // Load all tags for autocomplete
        const tags = await getAllTags();
        setExistingTags(tags);

        // Load existing metadata if imageId provided
        if (imageId) {
          const existing = await getImageMetadata(imageId);
          if (existing) {
            setMetadata({
              title: existing.title,
              location_name: existing.location_name,
              latitude: existing.latitude,
              longitude: existing.longitude,
              description: existing.description,
              date_taken: existing.date_taken,
              tags: existing.tags,
              status: existing.status,
            });
          }
        } else {
          // Try to find by URL
          const existing = await getImageByUrl(imageUrl);
          if (existing) {
            setMetadata({
              title: existing.title,
              location_name: existing.location_name,
              latitude: existing.latitude,
              longitude: existing.longitude,
              description: existing.description,
              date_taken: existing.date_taken,
              tags: existing.tags,
              status: existing.status,
            });
          }
        }
      } catch (error) {
        console.error('Error loading metadata:', error);
      } finally {
        setIsLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, [imageId, imageUrl]);


  // Trigger initial crop calculation when image loads
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete && !croppedAreaPixels) {
      // react-easy-crop should call onCropComplete on mount
      // If not, user interaction will trigger it
    }
  }, [imageRef.current?.complete, croppedAreaPixels]);

  const handleSave = useCallback(async () => {
    // Validate required metadata fields
    if (!metadata.title || !metadata.location_name || !metadata.description || !metadata.date_taken || 
        !metadata.tags || metadata.tags.length === 0 || !metadata.status) {
      alert('Please fill in all required metadata fields');
      return;
    }

    setIsProcessing(true);
    try {
      // First, export the processed image if needed
      let processedUrl = imageUrl;
      
      if (croppedAreaPixels && imageRef.current) {
        // Process and upload the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        const img = imageRef.current;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Apply filters (same logic as handleExport)
        const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
        const hasSelectiveColor = Object.values(selectiveColor.adjustments).some(
          (adj) => adj.saturation !== 0 || adj.luminance !== 0
        );
        
        if (hasHighlightsShadows || hasSelectiveColor) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (hasHighlightsShadows) {
            applyHighlightsShadows(imageData, filters.highlights, filters.shadows);
          }
          
          if (hasSelectiveColor) {
            (['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).forEach((color) => {
              const adj = selectiveColor.adjustments[color];
              if (adj.saturation !== 0 || adj.luminance !== 0) {
                applySelectiveColor(imageData, color, adj.saturation, adj.luminance);
              }
            });
          }
          
          ctx.putImageData(imageData, 0, 0);
          const modifiedImg = new Image();
          modifiedImg.crossOrigin = 'anonymous';
          modifiedImg.src = canvas.toDataURL();
          
          await new Promise((resolve) => {
            modifiedImg.onload = resolve;
          });
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const effectiveBrightness = Math.max(0, filters.brightness + filters.exposure);
          ctx.filter = [
            `brightness(${effectiveBrightness}%)`,
            `contrast(${filters.contrast}%)`,
            `saturate(${filters.saturation}%)`,
          ].join(' ');
          ctx.drawImage(modifiedImg, 0, 0);
        } else {
          const effectiveBrightness = Math.max(0, filters.brightness + filters.exposure);
          ctx.filter = [
            `brightness(${effectiveBrightness}%)`,
            `contrast(${filters.contrast}%)`,
            `saturate(${filters.saturation}%)`,
          ].join(' ');
          ctx.drawImage(img, 0, 0);
        }

        const filteredImg = new Image();
        filteredImg.crossOrigin = 'anonymous';
        filteredImg.src = canvas.toDataURL();

        await new Promise((resolve) => {
          filteredImg.onload = resolve;
        });

        const outputDimensions = getPanelDimensions(panelCount, 1080);

        const croppedBlob = await cropImage(filteredImg, croppedAreaPixels, outputDimensions);
        const timestamp = Date.now();
        const file = new File([croppedBlob], `processed-${timestamp}.jpg`, {
          type: 'image/jpeg',
        });

        const result = await uploadFile(file, {
          bucket: PROCESSED_BUCKET,
        });

        if (result) {
          processedUrl = result.url;
        }
      }

      // Generate and save panels
      let panelUrls: Array<{ panel_order: number; panel_url: string }> = [];
      if (croppedAreaPixels && imageRef.current && processedUrl) {
        // Load the processed image to extract panels from
        const processedImg = new Image();
        processedImg.crossOrigin = 'anonymous';
        processedImg.src = processedUrl;

        await new Promise((resolve, reject) => {
          processedImg.onload = resolve;
          processedImg.onerror = reject;
        });

        // Generate panel images
        const panels = await generatePanelImages(processedImg, panelCount, 1080, 0.1685);

        // Upload each panel
        for (const panel of panels) {
          const panelFile = new File([panel.blob], `panel-${panel.order}-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });

          const uploadResult = await uploadFile(panelFile, {
            bucket: PROCESSED_BUCKET,
          });

          if (uploadResult) {
            panelUrls.push({
              panel_order: panel.order,
              panel_url: uploadResult.url,
            });
          }
        }
      }

      // Save metadata to database
      const imageData: Partial<PanoramaImage> = {
        original_url: imageUrl,
        processed_url: processedUrl,
        panel_count: panelCount,
        title: metadata.title!,
        location_name: metadata.location_name!,
        latitude: metadata.latitude!,
        longitude: metadata.longitude!,
        description: metadata.description!,
        date_taken: metadata.date_taken!,
        tags: metadata.tags!,
        status: metadata.status!,
      };

      // Only include id if we're updating an existing record
      if (imageId) {
        imageData.id = imageId;
      }

      const saved = await saveImageMetadata(imageData as PanoramaImage);
      
      if (saved) {
        // Save panels to database
        if (panelUrls.length > 0) {
          await savePanels(saved.id, panelUrls);
        }

        if (onSave) {
          onSave(saved.id);
        }
        alert('Image saved successfully!');
      } else {
        console.error('Save returned null or undefined');
        alert('Failed to save image metadata. Check console for details.');
      }
    } catch (error) {
      console.error('Save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to save image: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [metadata, imageUrl, imageId, croppedAreaPixels, filters, panelCount, selectiveColor, onSave, imageRef]);

  const handleExportAndDownload = useCallback(async () => {
    if (!imageRef.current || !croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      // Create canvas for filters
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const img = imageRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Apply highlights/shadows and selective color FIRST to the original image
      const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
      const hasSelectiveColor = Object.values(selectiveColor.adjustments).some(
        (adj) => adj.saturation !== 0 || adj.luminance !== 0
      );
      
      if (hasHighlightsShadows || hasSelectiveColor) {
        // Draw original image
        ctx.drawImage(img, 0, 0);
        
        // Get image data from original image
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Apply highlights/shadows if active
        if (hasHighlightsShadows) {
          applyHighlightsShadows(imageData, filters.highlights, filters.shadows);
        }
        
        // Apply selective color adjustments for all active colors
        if (hasSelectiveColor) {
          (['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).forEach((color) => {
            const adj = selectiveColor.adjustments[color];
            if (adj.saturation !== 0 || adj.luminance !== 0) {
              applySelectiveColor(imageData, color, adj.saturation, adj.luminance);
            }
          });
        }
        
        // Put the modified data back
        ctx.putImageData(imageData, 0, 0);
        
        // Create a new image from the modified canvas
        const modifiedImg = new Image();
        modifiedImg.crossOrigin = 'anonymous';
        modifiedImg.src = canvas.toDataURL();
        
        await new Promise((resolve) => {
          modifiedImg.onload = resolve;
        });
        
        // Clear canvas and apply CSS filters to the modified image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const effectiveBrightness = Math.max(0, filters.brightness + filters.exposure);
        ctx.filter = [
          `brightness(${effectiveBrightness}%)`,
          `contrast(${filters.contrast}%)`,
          `saturate(${filters.saturation}%)`,
        ].join(' ');
        ctx.drawImage(modifiedImg, 0, 0);
      } else {
        // No canvas-based filters, just apply CSS filters directly
        const effectiveBrightness = Math.max(0, filters.brightness + filters.exposure);
        ctx.filter = [
          `brightness(${effectiveBrightness}%)`,
          `contrast(${filters.contrast}%)`,
          `saturate(${filters.saturation}%)`,
        ].join(' ');
        ctx.drawImage(img, 0, 0);
      }

      // Create filtered image
      const filteredImg = new Image();
      filteredImg.crossOrigin = 'anonymous';
      filteredImg.src = canvas.toDataURL();

      await new Promise((resolve) => {
        filteredImg.onload = resolve;
      });

      // Calculate output dimensions based on panel count
      const outputDimensions = getPanelDimensions(panelCount, 1080);

      // Crop the image
      const croppedBlob = await cropImage(filteredImg, croppedAreaPixels, outputDimensions);

      // Load the cropped image
      const croppedImg = new Image();
      croppedImg.crossOrigin = 'anonymous';
      croppedImg.src = URL.createObjectURL(croppedBlob);

      await new Promise((resolve) => {
        croppedImg.onload = resolve;
      });

      // Create zip file with images
      const zip = new JSZip();
      const timestamp = Date.now();
      const panelHeight = 1080;
      let combinedBlob: Blob;
        // Split into individual panels FIRST (before adding white blocks)
        const panelWidth = croppedImg.width / panelCount;
        const panelHeightPx = croppedImg.height; // This is the image strip height (without white blocks)

        // Create individual panel images with white blocks
        const panelImagesWithBlocks: HTMLImageElement[] = [];
        
        for (let i = 0; i < panelCount; i++) {
          // Extract panel from cropped image (without white blocks)
          const panelCanvas = document.createElement('canvas');
          const panelCtx = panelCanvas.getContext('2d');
          if (!panelCtx) continue;

          panelCanvas.width = panelWidth;
          panelCanvas.height = panelHeightPx;

          // Draw the panel section from the cropped image
          panelCtx.drawImage(
            croppedImg,
            i * panelWidth, // source x
            0, // source y
            panelWidth, // source width
            panelHeightPx, // source height
            0, // destination x
            0, // destination y
            panelWidth, // destination width
            panelHeightPx // destination height
          );

          // Convert to image
          const panelBlob = await new Promise<Blob>((resolve, reject) => {
            panelCanvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to create panel blob'));
                }
              },
              'image/jpeg',
              0.95
            );
          });

          // Load as image and add white blocks to make it square
          const panelImg = new Image();
          panelImg.crossOrigin = 'anonymous';
          panelImg.src = URL.createObjectURL(panelBlob);

          await new Promise((resolve) => {
            panelImg.onload = resolve;
          });

          // Add white blocks to make it exactly square (1080x1080)
          // Calculate block height to ensure final image is exactly panelHeight x panelHeight
          const blockRatio = 0.1685;
          const blockHeight = Math.round(panelHeight * blockRatio);
          const imageStripHeight = panelHeight - blockHeight * 2;
          
          // Create canvas exactly panelHeight x panelHeight
          const squareCanvas = document.createElement('canvas');
          const squareCtx = squareCanvas.getContext('2d');
          if (!squareCtx) continue;
          
          squareCanvas.width = panelHeight; // Square: width = height
          squareCanvas.height = panelHeight;
          
          // Fill with white
          squareCtx.fillStyle = '#FFFFFF';
          squareCtx.fillRect(0, 0, squareCanvas.width, squareCanvas.height);
          
          // Draw the panel strip in the middle, scaled to fit the image strip area
          squareCtx.drawImage(
            panelImg,
            0, // source x
            0, // source y
            panelImg.width, // source width
            panelImg.height, // source height
            0, // destination x
            blockHeight, // destination y (start after top white block)
            panelHeight, // destination width (full width of square)
            imageStripHeight // destination height (image strip area)
          );
          
          // Convert to blob
          const panelWithBlocksBlob = await new Promise<Blob>((resolve, reject) => {
            squareCanvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error('Failed to create square panel blob'));
                }
              },
              'image/jpeg',
              0.95
            );
          });
          
          // Load the panel with white blocks for combining
          const panelWithBlocks = new Image();
          panelWithBlocks.crossOrigin = 'anonymous';
          const panelWithBlocksUrl = URL.createObjectURL(panelWithBlocksBlob);
          panelWithBlocks.src = panelWithBlocksUrl;
          
          await new Promise((resolve) => {
            panelWithBlocks.onload = resolve;
          });
          
          panelImagesWithBlocks.push(panelWithBlocks);
          
          // Add to zip
          zip.file(`panel-${i + 1}-${timestamp}.jpg`, panelWithBlocksBlob);
          
          // Clean up
          const panelBlobUrl = panelImg.src;
          URL.revokeObjectURL(panelBlobUrl);
          // Note: panelWithBlocksUrl will be cleaned up later
        }

        // Create combined image by stitching panels together
        const combinedCanvas = document.createElement('canvas');
        const combinedCtx = combinedCanvas.getContext('2d');
        if (!combinedCtx) throw new Error('Could not get canvas context');

        // Combined width = panelCount * 1080, height = 1080 (each panel is square)
        combinedCanvas.width = panelCount * panelHeight;
        combinedCanvas.height = panelHeight;

        // Draw each panel side by side
        for (let i = 0; i < panelCount; i++) {
          const panelImg = panelImagesWithBlocks[i];
          combinedCtx.drawImage(
            panelImg,
            i * panelHeight, // destination x
            0, // destination y
            panelHeight, // destination width
            panelHeight // destination height (square)
          );
        }

        // Convert combined canvas to blob
        combinedBlob = await new Promise<Blob>((resolve, reject) => {
          combinedCanvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create combined blob'));
              }
            },
            'image/jpeg',
            0.95
          );
        });

        // Add combined image to zip
        zip.file(`combined-${timestamp}.jpg`, combinedBlob);

        // Clean up panel image URLs
        panelImagesWithBlocks.forEach((img) => {
          if (img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
          }
        });

      // Clean up object URL
      URL.revokeObjectURL(croppedImg.src);

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Upload combined image to Supabase
      const file = new File([combinedBlob], `processed-${timestamp}.jpg`, {
        type: 'image/jpeg',
      });

      const result = await uploadFile(file, {
        bucket: PROCESSED_BUCKET,
      });

      if (result && onSave) {
        onSave(result.url);
      }

      // Download zip file
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `walking-forward-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export image');
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, filters, panelCount, selectiveColor]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Image Editor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            {/* Left side: Image editor */}
            <div className="flex-1 space-y-6">
              {/* Unified Editor/Preview: Shows final export with white padding and panel dividers */}
              <div className="relative w-full bg-white rounded-lg overflow-hidden border border-border shadow-sm sticky top-6">
            {(() => {
              // Calculate dimensions - each panel is a square with white blocks inside
              const panelHeight = 1080;
              const blockRatio = 0.1685; // 16.85% of panel height
              const blockHeight = Math.round(panelHeight * blockRatio);
              const imageStripHeight = panelHeight - blockHeight * 2; // Height of image area within each panel
              const totalWidth = panelCount * panelHeight; // Total width (panelCount squares side by side)
              const totalHeight = panelHeight; // Each panel is square, so total height = panel height
              const finalAspectRatio = totalWidth / totalHeight; // panelCount:1

              return (
                <div 
                  className="relative w-full"
                  style={{ aspectRatio: `${finalAspectRatio}` }}
                >
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt="Editor"
                    className="hidden"
                    crossOrigin="anonymous"
                    onLoad={handleImageLoad}
                    onError={(e) => {
                      console.error('Failed to load image:', e);
                    }}
                  />
                  
                  {/* Image strip area - react-easy-crop container spans all panels, constrained to middle section */}
                  <div 
                    className="absolute left-0 w-full"
                    style={{
                      top: `${(blockHeight / panelHeight) * 100}%`,
                      height: `${(imageStripHeight / panelHeight) * 100}%`,
                      zIndex: 1
                    }}
                  >
                    <div 
                      className="relative w-full h-full"
                      style={{
                        filter: filteredPreviewUrl ? 'none' : `brightness(${Math.max(0, filters.brightness + filters.exposure)}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`,
                        opacity: isUpdatingPreview ? 0.7 : 1,
                        transition: 'opacity 0.2s ease-in-out'
                      }}
                    >
                      <Cropper
                        image={filteredPreviewUrl || imageUrl}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={aspectRatioValue()}
                        onCropChange={onCropChange}
                        onZoomChange={(newZoom) => {
                          setZoom(newZoom);
                          zoomRef.current = newZoom;
                        }}
                        onRotationChange={setRotation}
                        onCropComplete={onCropComplete}
                        cropShape="rect"
                      />
                      {/* Loading indicator overlay */}
                      {isUpdatingPreview && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/5 pointer-events-none z-20">
                          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      
                      {/* Panel dividers overlay */}
                      {Array.from({ length: panelCount - 1 }).map((_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 w-0.5 bg-black opacity-40 pointer-events-none"
                          style={{
                            left: `${((i + 1) / panelCount) * 100}%`,
                            zIndex: 3,
                            boxShadow: '0 0 2px rgba(255,255,255,0.5)'
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  {/* Translucent white overlays - one for each panel at top */}
                  {Array.from({ length: panelCount }).map((_, panelIndex) => (
                    <div
                      key={`top-${panelIndex}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${(panelIndex / panelCount) * 100}%`,
                        width: `${(1 / panelCount) * 100}%`,
                        top: 0,
                        height: `${(blockHeight / panelHeight) * 100}%`,
                        background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7))',
                        borderBottom: '2px dashed rgba(0, 0, 0, 0.2)',
                        zIndex: 10,
                        boxShadow: 'inset 0 -1px 3px rgba(0, 0, 0, 0.05)'
                      }}
                    />
                  ))}
                  
                  {/* Translucent white overlays - one for each panel at bottom */}
                  {Array.from({ length: panelCount }).map((_, panelIndex) => (
                    <div
                      key={`bottom-${panelIndex}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: `${(panelIndex / panelCount) * 100}%`,
                        width: `${(1 / panelCount) * 100}%`,
                        bottom: 0,
                        height: `${(blockHeight / panelHeight) * 100}%`,
                        background: 'linear-gradient(to top, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7))',
                        borderTop: '2px dashed rgba(0, 0, 0, 0.2)',
                        zIndex: 10,
                        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}
                    />
                  ))}
                </div>
              );
            })()}
            </div>
            </div>

            {/* Right sidebar: All controls */}
            <div className="w-80 space-y-5 flex-shrink-0">
              <div className="sticky top-6 space-y-5">
            {/* Panel Count Selector */}
            <div className="space-y-3 pb-5 border-b border-border">
              <label className="text-sm font-medium">Panels</label>
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Slider
                    value={[panelCount]}
                    onValueChange={(value) => setPanelCount(value[0])}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={panelCount}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value) && value >= 1 && value <= 10) {
                        setPanelCount(value);
                      }
                    }}
                    className="w-20"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {panelCount} panel{panelCount !== 1 ? 's' : ''} ({panelCount}:1 aspect ratio)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Zoom: {Math.round(zoom * 100)}%
              </label>
              <Slider
                value={[zoom]}
                onValueChange={(value) => setZoom(value[0])}
                min={1}
                max={3}
                step={0.1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Rotation: {rotation > 0 ? '+' : ''}{rotation}°
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[rotation]}
                  onValueChange={(value) => setRotation(value[0])}
                  min={-180}
                  max={180}
                  step={1}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const newRotation = ((rotation + 90) % 360);
                    // Normalize to -180 to 180 range
                    setRotation(newRotation > 180 ? newRotation - 360 : newRotation);
                  }}
                  className="shrink-0"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Brightness: {filters.brightness}%
              </label>
              <Slider
                value={[filters.brightness]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, brightness: value[0] }))
                }
                min={0}
                max={200}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Contrast: {filters.contrast}%
              </label>
              <Slider
                value={[filters.contrast]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, contrast: value[0] }))
                }
                min={0}
                max={200}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Saturation: {filters.saturation}%
              </label>
              <Slider
                value={[filters.saturation]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, saturation: value[0] }))
                }
                min={0}
                max={200}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Exposure: {filters.exposure > 0 ? '+' : ''}{filters.exposure.toFixed(1)}
              </label>
              <Slider
                value={[filters.exposure]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, exposure: value[0] }))
                }
                min={-100}
                max={100}
                step={0.1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Highlights: {filters.highlights > 0 ? '+' : ''}{filters.highlights.toFixed(1)}
              </label>
              <Slider
                value={[filters.highlights]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, highlights: value[0] }))
                }
                min={-100}
                max={100}
                step={0.1}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Shadows: {filters.shadows > 0 ? '+' : ''}{filters.shadows.toFixed(1)}
              </label>
              <Slider
                value={[filters.shadows]}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, shadows: value[0] }))
                }
                min={-100}
                max={100}
                step={0.1}
              />
            </div>

            {/* Selective Color Section */}
            <div className="border-t border-border pt-5 mt-2">
              <button
                onClick={() => setIsSelectiveColorOpen(!isSelectiveColorOpen)}
                className="flex items-center justify-between w-full text-sm font-medium text-foreground hover:text-foreground/80 transition-colors mb-4"
              >
                <span>Selective Color</span>
                {isSelectiveColorOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {isSelectiveColorOpen && (
                <div className="space-y-5">
                  {/* Color Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Select Color
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map((color) => {
                        const colors: Record<string, string> = {
                          red: '#FF0000',
                          yellow: '#FFFF00',
                          green: '#00FF00',
                          cyan: '#00FFFF',
                          blue: '#0000FF',
                          magenta: '#FF00FF',
                        };
                        return (
                          <button
                            key={color}
                            onClick={() =>
                              setSelectiveColor((prev) => ({
                                ...prev,
                                selectedColor: prev.selectedColor === color ? null : color,
                              }))
                            }
                            className={`h-10 rounded-md border-2 transition-all ${
                              selectiveColor.selectedColor === color
                                ? 'border-primary ring-2 ring-primary ring-offset-2 shadow-sm'
                                : 'border-border hover:border-border/80'
                            }`}
                            style={{ backgroundColor: colors[color] }}
                            title={color.charAt(0).toUpperCase() + color.slice(1)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Adjustment Sliders (shown when a color is selected) */}
                  {selectiveColor.selectedColor && (
                    <div className="space-y-5 pt-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Saturation: {selectiveColor.adjustments[selectiveColor.selectedColor].saturation > 0 ? '+' : ''}
                          {selectiveColor.adjustments[selectiveColor.selectedColor].saturation.toFixed(1)}
                        </label>
                        <Slider
                          value={[selectiveColor.adjustments[selectiveColor.selectedColor].saturation]}
                          onValueChange={(value) =>
                            setSelectiveColor((prev) => ({
                              ...prev,
                              adjustments: {
                                ...prev.adjustments,
                                [prev.selectedColor!]: {
                                  ...prev.adjustments[prev.selectedColor!],
                                  saturation: value[0],
                                },
                              },
                            }))
                          }
                          min={-100}
                          max={100}
                          step={0.1}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Luminance: {selectiveColor.adjustments[selectiveColor.selectedColor].luminance > 0 ? '+' : ''}
                          {selectiveColor.adjustments[selectiveColor.selectedColor].luminance.toFixed(1)}
                        </label>
                        <Slider
                          value={[selectiveColor.adjustments[selectiveColor.selectedColor].luminance]}
                          onValueChange={(value) =>
                            setSelectiveColor((prev) => ({
                              ...prev,
                              adjustments: {
                                ...prev.adjustments,
                                [prev.selectedColor!]: {
                                  ...prev.adjustments[prev.selectedColor!],
                                  luminance: value[0],
                                },
                              },
                            }))
                          }
                          min={-100}
                          max={100}
                          step={0.1}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Form */}
            <div className="pt-5 border-t border-border">
              {!isLoadingMetadata && (
                <ImageMetadataForm
                  metadata={metadata}
                  onChange={setMetadata}
                  existingTags={existingTags}
                />
              )}
            </div>

            {/* Save Button */}
            <div className="pt-5 border-t border-border">
              <Button
                onClick={handleSave}
                disabled={isProcessing}
                className="w-full"
                size="lg"
              >
                {isProcessing ? 'Saving...' : 'Save'}
              </Button>
            </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

