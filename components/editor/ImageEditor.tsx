'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { RotateCw, ChevronDown, ChevronUp, Eye, RotateCcw } from 'lucide-react';
import { cropImage, getPanelDimensions, addWhiteBlocks, applyHighlightsShadows, applySelectiveColor, applySelectiveColorsCombined, applyCssFilters, generatePanelImages, generateWebOptimized } from '@/lib/image-processing/utils';
import { uploadFile, PROCESSED_BUCKET, OPTIMIZED_BUCKET } from '@/lib/supabase/storage';
import { saveImageMetadata, getImageMetadata, getImageByUrl, getAllTags, savePanels } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { ImageMetadataForm } from './ImageMetadataForm';
import JSZip from 'jszip';

interface ImageEditorProps {
  imageUrl: string;
  imageId?: string;
  onSave?: (recordId: string) => void;
}

const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function ImageEditor({ imageUrl, imageId, onSave }: ImageEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [croppedAreaRelative, setCroppedAreaRelative] = useState<any>(null);
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
  const [showOriginal, setShowOriginal] = useState(false);
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
  const previewUpdateInProgressRef = useRef(false);
  const previewUpdateCancelRef = useRef(false);
  const filteredPreviewUrlRef = useRef<string | null>(null);
  
  // Track initial visual state to detect changes
  const initialVisualStateRef = useRef<{
    crop: { x: number; y: number };
    zoom: number;
    rotation: number;
    filters: typeof filters;
    selectiveColor: typeof selectiveColor;
    panelCount: number;
    croppedAreaPixels: any;
  } | null>(null);
  
  // Store existing image URLs from database
  const [existingImageUrls, setExistingImageUrls] = useState<{
    processed_url?: string;
    thumbnail_url?: string;
    preview_url?: string;
    panel_count?: number;
    original_url?: string;
  }>({});
  
  // Track if we're using a fallback image (processed instead of original)
  const [isUsingFallbackImage, setIsUsingFallbackImage] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

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

  // Calculate adjusted crop area to match required aspect ratio
  const calculateAdjustedCropArea = useCallback((
    cropArea: { x: number; y: number; width: number; height: number },
    imageWidth: number,
    imageHeight: number
  ): { x: number; y: number; width: number; height: number } => {
    const requiredAspectRatio = aspectRatioValue();
    const currentAspectRatio = cropArea.width / cropArea.height;
    
    // If aspect ratio already matches (within tolerance), return as-is
    if (Math.abs(currentAspectRatio - requiredAspectRatio) <= 0.01) {
      return cropArea;
    }
    
    // Need to adjust to match required aspect ratio
    // Keep the center position, adjust dimensions
    const centerX = cropArea.x + cropArea.width / 2;
    const centerY = cropArea.y + cropArea.height / 2;
    
    // Calculate new dimensions based on required aspect ratio
    // Try to maintain the selected height, adjust width
    let newWidth = cropArea.height * requiredAspectRatio;
    let newHeight = cropArea.height;
    
    // If new width exceeds image bounds, adjust height instead
    if (newWidth > imageWidth) {
      newHeight = imageWidth / requiredAspectRatio;
      newWidth = imageWidth;
    }
    
    // Calculate new position to keep center
    const newX = Math.max(0, Math.min(centerX - newWidth / 2, imageWidth - newWidth));
    const newY = Math.max(0, Math.min(centerY - newHeight / 2, imageHeight - newHeight));
    
    return {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    };
  }, [aspectRatioValue]);

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
      console.log('=== CROP COMPLETE DEBUG ===');
      console.log('croppedArea (relative):', croppedArea);
      console.log('croppedAreaPixels (absolute):', croppedAreaPixels);
      console.log('imageRef dimensions:', {
        naturalWidth: imageRef.current?.naturalWidth,
        naturalHeight: imageRef.current?.naturalHeight,
        clientWidth: imageRef.current?.clientWidth,
        clientHeight: imageRef.current?.clientHeight,
      });
      console.log('aspectRatio:', aspectRatioValue());
      console.log('panelCount:', panelCount);
      console.log('zoom:', zoom);
      console.log('rotation:', rotation);
      // Use react-easy-crop's accurate calculation
      setCroppedAreaPixels(croppedAreaPixels);
      setCroppedAreaRelative(croppedArea);
    },
    [aspectRatioValue, panelCount, zoom, rotation]
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

    // Check if update was cancelled
    if (previewUpdateCancelRef.current) {
      previewUpdateCancelRef.current = false;
      return;
    }

    previewUpdateInProgressRef.current = true;
    setIsUpdatingPreview(true);

    try {
      const img = imageRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');

      // Optimize: Use smaller canvas for preview (max 1920px width)
      const MAX_PREVIEW_WIDTH = 1920;
      const scale = Math.min(1, MAX_PREVIEW_WIDTH / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      // Apply CSS filters first (fast, GPU-accelerated)
      // Note: We NO LONGER apply brightness/contrast/saturation here for the preview blob.
      // Instead, we apply them via CSS on the container so they are instant.
      // This prevents "baked" filters from doubling up with CSS filters, and makes sliders instant.
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Check if we need pixel-based filters
      const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
      
      // OPTIMIZATION: Only collect active selective colors (skip colors with 0 adjustments)
      const activeSelectiveColors: Array<{ color: string; saturation: number; luminance: number }> = [];
      (['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).forEach((color) => {
        const adj = selectiveColor.adjustments[color];
        if (adj.saturation !== 0 || adj.luminance !== 0) {
          activeSelectiveColors.push({ color, saturation: adj.saturation, luminance: adj.luminance });
        }
      });
      const hasSelectiveColor = activeSelectiveColors.length > 0;

      // Optimize: Get ImageData once, apply all pixel-based filters, put back once
      if (hasHighlightsShadows || hasSelectiveColor) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Apply highlights and shadows if non-zero
        if (hasHighlightsShadows) {
          applyHighlightsShadows(imageData, filters.highlights, filters.shadows);
        }

        // OPTIMIZATION: Use combined function for single-pass selective color processing
        if (hasSelectiveColor) {
          applySelectiveColorsCombined(imageData, activeSelectiveColors);
        }

        // Put ImageData back once after all filters are applied
        ctx.putImageData(imageData, 0, 0);
      }

      // Check cancellation before creating blob
      if (previewUpdateCancelRef.current) return;

      // Optimize: Lower JPEG quality for preview (0.75 instead of 0.95)
      const blob = await new Promise<Blob | null>(resolve => 
        canvas.toBlob(resolve, 'image/jpeg', 0.75)
      );

      // Final cancellation check before updating state
      if (previewUpdateCancelRef.current) return;

      if (blob) {
        setFilteredPreviewUrl((prevUrl) => {
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          const newUrl = URL.createObjectURL(blob);
          filteredPreviewUrlRef.current = newUrl;
          return newUrl;
        });
      }
    } catch (error) {
      console.error('Failed to update preview:', error);
    } finally {
      if (!previewUpdateCancelRef.current) {
        previewUpdateInProgressRef.current = false;
        setIsUpdatingPreview(false);
      }
    }
  }, [filters.highlights, filters.shadows, selectiveColor.adjustments]);

  // Debounced update of filtered preview when filters change
  useEffect(() => {
    // Cancel any pending timeout
    if (previewUpdateTimeoutRef.current) {
      clearTimeout(previewUpdateTimeoutRef.current);
    }
    
    // Mark that we want to cancel any in-progress update
    previewUpdateCancelRef.current = true;
    
    // Check if pixel-based filters are active
    const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
    const hasSelectiveColor = Object.values(selectiveColor.adjustments).some(
      (adj) => adj.saturation !== 0 || adj.luminance !== 0
    );
    const hasPixelBasedFilters = hasHighlightsShadows || hasSelectiveColor;
    
    // IMPORTANT: Always update preview if Pixel-based filters are active
    // If only CSS filters are active, we can clear the preview URL and use CSS filters on the element for better performance
    if (hasPixelBasedFilters) {
      previewUpdateTimeoutRef.current = setTimeout(() => {
        previewUpdateCancelRef.current = false;
        updateFilteredPreview();
      }, 200); // Reduced from 300ms for more responsive preview
    } else {
      // Clean up preview URL if no canvas-based filters are active
      setFilteredPreviewUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        filteredPreviewUrlRef.current = null;
        return null;
      });
    }

    return () => {
      if (previewUpdateTimeoutRef.current) {
        clearTimeout(previewUpdateTimeoutRef.current);
      }
      previewUpdateCancelRef.current = true;
    };
  }, [filters.highlights, filters.shadows, selectiveColor.adjustments, updateFilteredPreview]);

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
    setImageLoadError(null);
    
    // Update filtered preview if highlights/shadows are set
    if (filters.highlights !== 0 || filters.shadows !== 0) {
      setTimeout(() => {
        updateFilteredPreview();
      }, 100);
    }
  }, [filters.highlights, filters.shadows, updateFilteredPreview]);
  
  // Handle image load errors and try fallback
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error('Failed to load image:', imageUrl);
    setImageLoadError(`Failed to load image: ${imageUrl.substring(0, 50)}...`);
    
    // If we have a processed_url as fallback and we're not already using it, try that
    if (existingImageUrls.processed_url && !isUsingFallbackImage && imageUrl !== existingImageUrls.processed_url) {
      console.log('Attempting to use processed_url as fallback');
      setIsUsingFallbackImage(true);
      // The imageUrl prop won't change, but we can update the src in the img tag
      // Actually, we need to handle this differently - the parent needs to pass the fallback
    }
  }, [imageUrl, existingImageUrls.processed_url, isUsingFallbackImage]);

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

        let existing: PanoramaImage | null = null;

        // Load existing metadata if imageId provided
        if (imageId) {
          existing = await getImageMetadata(imageId);
        } else {
          // Try to find by URL
          existing = await getImageByUrl(imageUrl);
        }

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

          // Restore visual adjustments if they exist
          if (existing.adjustments) {
            setCrop(existing.adjustments.crop);
            setZoom(existing.adjustments.zoom);
            setRotation(existing.adjustments.rotation);
            setFilters(existing.adjustments.filters);
            setSelectiveColor(existing.adjustments.selectiveColor);
            
            // Update refs so we don't detect false changes immediately
            zoomRef.current = existing.adjustments.zoom;
            
            // Set initial visual state to match these loaded adjustments
            // This ensures the "Has Visual Changes" check works correctly against the saved state
            console.log('=== SETTING INITIAL STATE FROM EXISTING ADJUSTMENTS ===');
            console.log('Existing adjustments:', existing.adjustments);
            initialVisualStateRef.current = {
              crop: existing.adjustments.crop,
              zoom: existing.adjustments.zoom,
              rotation: existing.adjustments.rotation,
              filters: existing.adjustments.filters,
              selectiveColor: existing.adjustments.selectiveColor,
              panelCount: existing.panel_count || 3,
              croppedAreaPixels: null // Will be populated by the cropper on mount
            };
            console.log('Initial state set:', initialVisualStateRef.current);
          }

          // Store existing image URLs
          setExistingImageUrls({
            processed_url: existing.processed_url,
            thumbnail_url: existing.thumbnail_url,
            preview_url: existing.preview_url,
            panel_count: existing.panel_count,
            original_url: existing.original_url,
          });
          
          // Check if we need to use processed_url as fallback
          // If original_url is missing/empty and we have processed_url, we're using a fallback
          if ((!existing.original_url || existing.original_url.trim() === '') && existing.processed_url) {
            setIsUsingFallbackImage(true);
          }

          // Set panel count from existing if available
          if (existing.panel_count) {
            setPanelCount(existing.panel_count);
          }

          // Note: Initial visual state will be set when croppedAreaPixels is first calculated
          // See useEffect below that watches for croppedAreaPixels
        } else {
          // New image - reset existing URLs
          setExistingImageUrls({});
        }
      } catch (error) {
        console.error('Error loading metadata:', error);
      } finally {
        setIsLoadingMetadata(false);
      }
    };

    loadMetadata();
  }, [imageId, imageUrl]);


  // Initialize visual state when croppedAreaPixels is first set (for existing images)
  useEffect(() => {
    if (
      croppedAreaPixels &&
      imageRef.current &&
      initialVisualStateRef.current === null &&
      (existingImageUrls.processed_url || imageId)
    ) {
      // This is an existing image and we're setting the initial visual state
      console.log('=== SETTING INITIAL STATE FROM CURRENT STATE (no existing adjustments) ===');
      console.log('Current filters:', filters);
      initialVisualStateRef.current = {
        crop: { ...crop },
        zoom,
        rotation,
        filters: { ...filters },
        selectiveColor: {
          selectedColor: selectiveColor.selectedColor,
          adjustments: {
            red: { ...selectiveColor.adjustments.red },
            yellow: { ...selectiveColor.adjustments.yellow },
            green: { ...selectiveColor.adjustments.green },
            cyan: { ...selectiveColor.adjustments.cyan },
            blue: { ...selectiveColor.adjustments.blue },
            magenta: { ...selectiveColor.adjustments.magenta },
          },
        },
        panelCount: existingImageUrls.panel_count || panelCount,
        croppedAreaPixels: { ...croppedAreaPixels },
      };
      console.log('Initial state set:', initialVisualStateRef.current);
    }
  }, [croppedAreaPixels, imageId, existingImageUrls.processed_url, existingImageUrls.panel_count, crop, zoom, rotation, filters, selectiveColor, panelCount]);

  // Trigger initial crop calculation when image loads
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete && !croppedAreaPixels) {
      // react-easy-crop should call onCropComplete on mount
      // If not, user interaction will trigger it
    }
  }, [imageRef.current?.complete, croppedAreaPixels]);

  // Check if visual changes have been made
  const hasVisualChanges = useCallback((): boolean => {
    const initial = initialVisualStateRef.current;
    
    console.log('=== HAS VISUAL CHANGES DEBUG ===');
    console.log('Initial state:', initial);
    console.log('Current filters:', filters);
    console.log('Current selectiveColor:', selectiveColor);
    
    // If no initial state recorded, assume it's a new image (always regenerate)
    if (!initial) {
      console.log('No initial state - returning true (new image)');
      return true;
    }

    // Check crop position
    if (Math.abs(crop.x - initial.crop.x) > 0.1 || Math.abs(crop.y - initial.crop.y) > 0.1) {
      console.log('Crop position changed');
      return true;
    }

    // Check zoom
    if (Math.abs(zoom - initial.zoom) > 0.01) {
      console.log('Zoom changed:', { current: zoom, initial: initial.zoom });
      return true;
    }

    // Check rotation
    if (rotation !== initial.rotation) {
      console.log('Rotation changed:', { current: rotation, initial: initial.rotation });
      return true;
    }

    // Check filters
    const filterChanges = {
      brightness: Math.abs(filters.brightness - initial.filters.brightness),
      contrast: Math.abs(filters.contrast - initial.filters.contrast),
      saturation: Math.abs(filters.saturation - initial.filters.saturation),
      exposure: Math.abs(filters.exposure - initial.filters.exposure),
      highlights: Math.abs(filters.highlights - initial.filters.highlights),
      shadows: Math.abs(filters.shadows - initial.filters.shadows),
    };
    console.log('Filter changes:', filterChanges);
    console.log('Initial filters:', initial.filters);
    
    if (
      filterChanges.brightness > 0.1 ||
      filterChanges.contrast > 0.1 ||
      filterChanges.saturation > 0.1 ||
      filterChanges.exposure > 0.1 ||
      filterChanges.highlights > 0.1 ||
      filterChanges.shadows > 0.1
    ) {
      console.log('Filters changed - returning true');
      return true;
    }

    // Check selective color adjustments
    const colorKeys: Array<keyof typeof selectiveColor.adjustments> = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
    for (const color of colorKeys) {
      const current = selectiveColor.adjustments[color];
      const initialAdj = initial.selectiveColor.adjustments[color];
      if (
        Math.abs(current.saturation - initialAdj.saturation) > 0.1 ||
        Math.abs(current.luminance - initialAdj.luminance) > 0.1
      ) {
        console.log(`Selective color ${color} changed`);
        return true;
      }
    }

    // Check panel count
    if (panelCount !== initial.panelCount) {
      console.log('Panel count changed:', { current: panelCount, initial: initial.panelCount });
      return true;
    }

    // Check croppedAreaPixels (crop size/position)
    if (croppedAreaPixels && initial.croppedAreaPixels) {
      if (
        Math.abs(croppedAreaPixels.x - initial.croppedAreaPixels.x) > 0.1 ||
        Math.abs(croppedAreaPixels.y - initial.croppedAreaPixels.y) > 0.1 ||
        Math.abs(croppedAreaPixels.width - initial.croppedAreaPixels.width) > 0.1 ||
        Math.abs(croppedAreaPixels.height - initial.croppedAreaPixels.height) > 0.1
      ) {
        console.log('Crop area changed');
        return true;
      }
    } else if (croppedAreaPixels !== initial.croppedAreaPixels) {
      // One is null and the other isn't
      console.log('Crop area null state changed');
      return true;
    }

    console.log('No visual changes detected - returning false');
    return false;
  }, [crop, zoom, rotation, filters, selectiveColor, panelCount, croppedAreaPixels]);

  const handleSave = useCallback(async () => {
    // Validate required metadata fields
    if (!metadata.title || !metadata.location_name || !metadata.description || !metadata.date_taken || 
        !metadata.tags || metadata.tags.length === 0 || !metadata.status) {
      alert('Please fill in all required metadata fields');
      return;
    }

    setIsProcessing(true);
    try {
      // Check if visual changes were made
      const visualChangesDetected = hasVisualChanges();
      const hasExistingUrls = !!existingImageUrls.processed_url;
      const panelCountChanged = existingImageUrls.panel_count !== undefined && panelCount !== existingImageUrls.panel_count;
      
      console.log('=== SAVE DEBUG ===');
      console.log('visualChangesDetected:', visualChangesDetected);
      console.log('hasExistingUrls:', hasExistingUrls);
      console.log('panelCountChanged:', panelCountChanged);
      console.log('croppedAreaPixels exists:', !!croppedAreaPixels);
      console.log('imageRef.current exists:', !!imageRef.current);
      
      // First, export the processed image if needed
      let processedUrl = imageUrl;
      let thumbnailUrl: string | undefined;
      let previewUrl: string | undefined;
      
      // Explicit check for filter changes as a safety net
      // This ensures filters are always applied even if hasVisualChanges() fails
      const initialFilters = initialVisualStateRef.current?.filters;
      const hasFilterChanges = !initialFilters || 
        Math.abs(filters.brightness - initialFilters.brightness) > 0.1 ||
        Math.abs(filters.contrast - initialFilters.contrast) > 0.1 ||
        Math.abs(filters.saturation - initialFilters.saturation) > 0.1 ||
        Math.abs(filters.exposure - initialFilters.exposure) > 0.1 ||
        Math.abs(filters.highlights - initialFilters.highlights) > 0.1 ||
        Math.abs(filters.shadows - initialFilters.shadows) > 0.1;
      
      // Check selective color changes
      const initialSelectiveColor = initialVisualStateRef.current?.selectiveColor;
      const hasSelectiveColorChanges = !initialSelectiveColor || 
        (['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).some(color => {
          const current = selectiveColor.adjustments[color];
          const initialAdj = initialSelectiveColor.adjustments[color];
          return Math.abs(current.saturation - initialAdj.saturation) > 0.1 ||
                 Math.abs(current.luminance - initialAdj.luminance) > 0.1;
        });
      
      console.log('hasFilterChanges:', hasFilterChanges);
      console.log('hasSelectiveColorChanges:', hasSelectiveColorChanges);
      
      // Only regenerate images if visual changes were detected, panel count changed, filter changes detected, or if no existing URLs exist
      const shouldRegenerate = (!hasExistingUrls || visualChangesDetected || panelCountChanged || hasFilterChanges || hasSelectiveColorChanges) && croppedAreaPixels && imageRef.current;
      console.log('shouldRegenerate:', shouldRegenerate);
      
      if (shouldRegenerate) {
        // Process and upload the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        const img = imageRef.current;
        if (!img) throw new Error('Image reference is missing');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // Apply filters (same logic as handleExport)
        // Always apply CSS filters when regenerating, even if no pixel-based filters are active
        const hasHighlightsShadows = filters.highlights !== 0 || filters.shadows !== 0;
        const hasSelectiveColor = Object.values(selectiveColor.adjustments).some(
          (adj) => adj.saturation !== 0 || adj.luminance !== 0
        );
        const effectiveBrightness = Math.max(0, filters.brightness + filters.exposure);
        const hasCssFilters = effectiveBrightness !== 100 || filters.contrast !== 100 || filters.saturation !== 100;
        
        console.log('=== FILTER APPLICATION DEBUG ===');
        console.log('hasHighlightsShadows:', hasHighlightsShadows, { highlights: filters.highlights, shadows: filters.shadows });
        console.log('hasSelectiveColor:', hasSelectiveColor);
        console.log('hasCssFilters:', hasCssFilters, { brightness: filters.brightness, exposure: filters.exposure, effectiveBrightness, contrast: filters.contrast, saturation: filters.saturation });
        console.log('Image dimensions:', { width: img.naturalWidth, height: img.naturalHeight });
        
        if (hasHighlightsShadows || hasSelectiveColor) {
          // Apply pixel-based filters first, then CSS filters
          console.log('Applying pixel-based filters first, then CSS filters');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (hasHighlightsShadows) {
            console.log('Applying highlights/shadows:', { highlights: filters.highlights, shadows: filters.shadows });
            applyHighlightsShadows(imageData, filters.highlights, filters.shadows);
          }
          
          if (hasSelectiveColor) {
            console.log('Applying selective color adjustments');
            // Use the combined function for better performance
            const activeSelectiveColors: Array<{ color: string; saturation: number; luminance: number }> = [];
            (['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).forEach((color) => {
              const adj = selectiveColor.adjustments[color];
              if (adj.saturation !== 0 || adj.luminance !== 0) {
                activeSelectiveColors.push({ color, saturation: adj.saturation, luminance: adj.luminance });
                console.log(`  - ${color}: saturation=${adj.saturation}, luminance=${adj.luminance}`);
              }
            });
            if (activeSelectiveColors.length > 0) {
              applySelectiveColorsCombined(imageData, activeSelectiveColors);
            }
          }
          
          ctx.putImageData(imageData, 0, 0);
          
          // Convert canvas to blob instead of data URI to avoid CORS issues
          const modifiedBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) {
                console.log('Modified blob created:', { size: blob.size, type: blob.type });
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob from modified image'));
              }
            }, 'image/png');
          });
          
          const modifiedImg = new Image();
          modifiedImg.crossOrigin = 'anonymous';
          const modifiedImgUrl = URL.createObjectURL(modifiedBlob);
          modifiedImg.src = modifiedImgUrl;
          
          await new Promise((resolve, reject) => {
            modifiedImg.onload = () => {
              console.log('Modified image loaded:', { width: modifiedImg.naturalWidth, height: modifiedImg.naturalHeight });
              resolve(undefined);
            };
            modifiedImg.onerror = () => {
              URL.revokeObjectURL(modifiedImgUrl);
              reject(new Error('Failed to load modified image'));
            };
          });
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Apply CSS filters to the modified image (Safari-compatible via pixel manipulation)
          if (hasCssFilters) {
            console.log('Applying CSS filters to modified image (Safari-compatible):', { brightness: effectiveBrightness, contrast: filters.contrast, saturation: filters.saturation });
            // Draw the image first
            ctx.drawImage(modifiedImg, 0, 0);
            // Get ImageData and apply filters manually
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            applyCssFilters(imageData, effectiveBrightness, filters.contrast, filters.saturation);
            ctx.putImageData(imageData, 0, 0);
          } else {
            // No CSS filters, just draw
            ctx.drawImage(modifiedImg, 0, 0);
          }
          
          // Revoke URL after image is drawn
          URL.revokeObjectURL(modifiedImgUrl);
        } else if (hasCssFilters) {
          // Only CSS filters, apply directly (Safari-compatible via pixel manipulation)
          console.log('Applying CSS filters only (Safari-compatible):', { brightness: effectiveBrightness, contrast: filters.contrast, saturation: filters.saturation });
          // Draw the image first
          ctx.drawImage(img, 0, 0);
          // Get ImageData and apply filters manually
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyCssFilters(imageData, effectiveBrightness, filters.contrast, filters.saturation);
          ctx.putImageData(imageData, 0, 0);
        } else {
          // No filters at all, just draw the image (shouldn't happen if shouldRegenerate is true, but handle it anyway)
          console.warn('No filters to apply, but shouldRegenerate is true. Drawing image without filters.');
          ctx.drawImage(img, 0, 0);
        }

        // Convert canvas to blob instead of data URI to avoid CORS issues
        console.log('Converting filtered canvas to blob...');
        const filteredBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              console.log('Filtered blob created successfully:', { 
                size: blob.size, 
                type: blob.type,
                sizeMB: (blob.size / 1024 / 1024).toFixed(2)
              });
              // Validate blob size is reasonable (at least 1KB for a real image)
              if (blob.size < 1024) {
                console.error('Filtered blob is suspiciously small:', blob.size);
                reject(new Error('Filtered image blob is too small. Filter application may have failed.'));
                return;
              }
              resolve(blob);
            } else {
              console.error('Failed to create blob from filtered canvas');
              reject(new Error('Failed to create blob from filtered canvas. Filter application may have failed.'));
            }
          }, 'image/png');
        });
        
        // Validate filtered blob was created
        if (!filteredBlob || filteredBlob.size === 0) {
          throw new Error('Filtered blob is invalid or empty');
        }
        
        const filteredImg = new Image();
        filteredImg.crossOrigin = 'anonymous';
        const filteredImgUrl = URL.createObjectURL(filteredBlob);
        filteredImg.src = filteredImgUrl;

        console.log('Loading filtered image for cropping...');
        await new Promise((resolve, reject) => {
          filteredImg.onload = () => {
            console.log('Filtered image loaded successfully:', { 
              width: filteredImg.naturalWidth, 
              height: filteredImg.naturalHeight 
            });
            // Validate image dimensions match canvas
            if (filteredImg.naturalWidth !== canvas.width || filteredImg.naturalHeight !== canvas.height) {
              console.warn('Filtered image dimensions mismatch:', {
                canvas: { width: canvas.width, height: canvas.height },
                image: { width: filteredImg.naturalWidth, height: filteredImg.naturalHeight }
              });
            }
            resolve(undefined);
          };
          filteredImg.onerror = (error) => {
            console.error('Failed to load filtered image:', error);
            URL.revokeObjectURL(filteredImgUrl);
            reject(new Error('Failed to load filtered image. The filtered image may be corrupted.'));
          };
        });

        console.log('=== BEFORE CROP DEBUG ===');
        console.log('croppedAreaPixels to use:', croppedAreaPixels);
        console.log('filteredImg dimensions:', {
          naturalWidth: filteredImg.naturalWidth,
          naturalHeight: filteredImg.naturalHeight,
        });
        console.log('imageRef dimensions:', {
          naturalWidth: imageRef.current?.naturalWidth,
          naturalHeight: imageRef.current?.naturalHeight,
        });
        console.log('Expected crop area:', {
          x: croppedAreaPixels.x,
          y: croppedAreaPixels.y,
          width: croppedAreaPixels.width,
          height: croppedAreaPixels.height,
          right: croppedAreaPixels.x + croppedAreaPixels.width,
          bottom: croppedAreaPixels.y + croppedAreaPixels.height,
        });
        console.log('Image bounds check:', {
          withinWidth: (croppedAreaPixels.x + croppedAreaPixels.width) <= filteredImg.naturalWidth,
          withinHeight: (croppedAreaPixels.y + croppedAreaPixels.height) <= filteredImg.naturalHeight,
        });
        console.log('Aspect ratio analysis:', {
          requiredAspectRatio: aspectRatioValue(),
          imageAspectRatio: filteredImg.naturalWidth / filteredImg.naturalHeight,
          cropAspectRatio: croppedAreaPixels.width / croppedAreaPixels.height,
          imageWidth: filteredImg.naturalWidth,
          cropWidth: croppedAreaPixels.width,
          widthDifference: filteredImg.naturalWidth - croppedAreaPixels.width,
          leftCrop: croppedAreaPixels.x,
          rightCrop: filteredImg.naturalWidth - (croppedAreaPixels.x + croppedAreaPixels.width),
        });

        // Calculate crop pixels from relative percentages if available
        // This handles the case where the preview image (used for cropping UI) 
        // has different dimensions than the full resolution image being processed.
        let cropPixelsForProcessing = croppedAreaPixels;
        
        if (croppedAreaRelative && filteredImg.naturalWidth && filteredImg.naturalHeight) {
             console.log('Recalculating crop pixels from relative percentages:', croppedAreaRelative);
             cropPixelsForProcessing = {
                x: Math.round((croppedAreaRelative.x / 100) * filteredImg.naturalWidth),
                y: Math.round((croppedAreaRelative.y / 100) * filteredImg.naturalHeight),
                width: Math.round((croppedAreaRelative.width / 100) * filteredImg.naturalWidth),
                height: Math.round((croppedAreaRelative.height / 100) * filteredImg.naturalHeight),
             };
             console.log('Recalculated pixels:', cropPixelsForProcessing);
        }

        // Apply aspect ratio constraint programmatically
        // The cropper now allows free selection, but we need to enforce the panel aspect ratio
        const finalCropArea = calculateAdjustedCropArea(
          cropPixelsForProcessing,
          filteredImg.naturalWidth,
          filteredImg.naturalHeight
        );
        
        console.log('Aspect ratio adjustment:', {
          original: cropPixelsForProcessing,
          adjusted: finalCropArea,
          requiredAspectRatio: aspectRatioValue(),
          originalAspectRatio: croppedAreaPixels.width / croppedAreaPixels.height,
          adjustedAspectRatio: finalCropArea.width / finalCropArea.height,
        });

        // Crop to the exact area selected, with aspect ratio enforced
        // Use PNG for truly lossless quality (for archival and print quality)
        // Note: croppedAreaPixels coordinates are relative to original image dimensions
        // since we always use imageUrl in the Cropper component
        console.log('Cropping filtered image with final crop area:', finalCropArea);
        let croppedBlob = await cropImage(filteredImg, finalCropArea, undefined, 'png');
        let fileExtension = 'png';
        let mimeType = 'image/png';
        
        console.log('Cropped blob created:', { 
          size: croppedBlob.size, 
          sizeMB: (croppedBlob.size / 1024 / 1024).toFixed(2),
          type: mimeType
        });

        // Check if PNG is too large (over 45MB, leaving 5MB buffer for safety)
        // Supabase free tier limit is 50MB. PNGs for panoramas can easily exceed this.
        if (croppedBlob.size > 45 * 1024 * 1024) {
          console.warn(`Generated PNG is too large (${(croppedBlob.size / 1024 / 1024).toFixed(2)}MB). Falling back to high-quality JPEG.`);
          
          // Fallback to JPEG with high quality (0.95)
          // This will likely reduce size by 90% while maintaining excellent visual quality
          croppedBlob = await cropImage(filteredImg, finalCropArea, undefined, 'jpeg', 0.95);
          fileExtension = 'jpg';
          mimeType = 'image/jpeg';
          
          console.log(`Fallback JPEG size: ${(croppedBlob.size / 1024 / 1024).toFixed(2)}MB`);
        }
        
        // Revoke URL after image is used
        URL.revokeObjectURL(filteredImgUrl);
        const timestamp = Date.now();
        
        // Save processed version
        const processedFile = new File([croppedBlob], `processed-${timestamp}.${fileExtension}`, {
          type: mimeType,
        });

        const result = await uploadFile(processedFile, {
          bucket: PROCESSED_BUCKET,
        });

        if (result) {
          processedUrl = result.url;
          
          // Load the processed image for generating optimized versions
          const processedImg = new Image();
          processedImg.crossOrigin = 'anonymous';
          processedImg.src = result.url;
          
          await new Promise((resolve, reject) => {
            processedImg.onload = resolve;
            processedImg.onerror = reject;
          });
          
          // Generate and upload thumbnail (400px, quality 0.80)
          const thumbnailBlob = await generateWebOptimized(processedImg, 400, 0.80);
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
          const previewBlob = await generateWebOptimized(processedImg, 1920, 0.85);
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
        } else {
          // If upload failed, throw an error to stop the save process
          throw new Error('Failed to upload processed image. The file might be too large or there was a network error.');
        }
      } else if (!visualChangesDetected && !panelCountChanged && !hasFilterChanges && !hasSelectiveColorChanges && hasExistingUrls) {
        // No visual changes detected and no filter changes - use existing URLs
        console.log('Using existing URLs - no changes detected');
        processedUrl = existingImageUrls.processed_url || imageUrl;
        thumbnailUrl = existingImageUrls.thumbnail_url;
        previewUrl = existingImageUrls.preview_url;
      } else {
        console.log('Skipping regeneration - missing requirements:', {
          visualChangesDetected,
          panelCountChanged,
          hasFilterChanges,
          hasSelectiveColorChanges,
          hasCroppedAreaPixels: !!croppedAreaPixels,
          hasImageRef: !!imageRef.current
        });
      }

      // Generate and save panels
      let panelUrls: Array<{ panel_order: number; panel_url: string }> = [];
      // Only regenerate panels if visual changes detected or panel count changed
      if ((visualChangesDetected || panelCountChanged) && croppedAreaPixels && imageRef.current && processedUrl) {
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
      // If editing an existing image, preserve the original original_url value
      // (don't overwrite with processed_url fallback that we might be using for editing)
      // For new images, use the imageUrl we have
      const originalUrlToSave = imageId && existingImageUrls.original_url !== undefined
        ? existingImageUrls.original_url // Preserve existing original_url value (even if empty/null)
        : imageUrl; // New image, use whatever URL we have
      
      const imageData: Partial<PanoramaImage> = {
        original_url: originalUrlToSave,
        processed_url: processedUrl,
        thumbnail_url: thumbnailUrl,
        preview_url: previewUrl,
        panel_count: panelCount,
        title: metadata.title!,
        location_name: metadata.location_name!,
        latitude: metadata.latitude!,
        longitude: metadata.longitude!,
        description: metadata.description!,
        date_taken: metadata.date_taken!,
        tags: metadata.tags!,
        status: metadata.status!,
        adjustments: {
          crop,
          zoom,
          rotation,
          filters,
          selectiveColor
        }
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
  }, [metadata, imageUrl, imageId, croppedAreaPixels, filters, panelCount, selectiveColor, onSave, imageRef, hasVisualChanges, existingImageUrls, calculateAdjustedCropArea, aspectRatioValue, crop, zoom, rotation]);

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
        
        // Convert canvas to blob instead of data URI to avoid CORS issues
        const modifiedBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          }, 'image/png');
        });
        
        // Create a new image from the modified canvas
        const modifiedImg = new Image();
        modifiedImg.crossOrigin = 'anonymous';
        const modifiedImgUrl = URL.createObjectURL(modifiedBlob);
        modifiedImg.src = modifiedImgUrl;
        
        await new Promise((resolve, reject) => {
          modifiedImg.onload = () => resolve(undefined);
          modifiedImg.onerror = () => {
            URL.revokeObjectURL(modifiedImgUrl);
            reject(new Error('Failed to load modified image'));
          };
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
        
        // Revoke URL after image is drawn
        URL.revokeObjectURL(modifiedImgUrl);
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

      // Convert canvas to blob instead of data URI to avoid CORS issues
      const filteredBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/png');
      });
      
      // Create filtered image
      const filteredImg = new Image();
      filteredImg.crossOrigin = 'anonymous';
      const filteredImgUrl = URL.createObjectURL(filteredBlob);
      filteredImg.src = filteredImgUrl;

      await new Promise((resolve, reject) => {
        filteredImg.onload = () => resolve(undefined);
        filteredImg.onerror = () => {
          URL.revokeObjectURL(filteredImgUrl);
          reject(new Error('Failed to load filtered image'));
        };
      });

      // Apply aspect ratio constraint programmatically
      // The cropper now allows free selection, but we need to enforce the panel aspect ratio
      
      // Calculate crop pixels from relative percentages if available to ensure correct scaling
      let cropPixelsForProcessing = croppedAreaPixels;
      if (croppedAreaRelative && filteredImg.naturalWidth && filteredImg.naturalHeight) {
           cropPixelsForProcessing = {
              x: Math.round((croppedAreaRelative.x / 100) * filteredImg.naturalWidth),
              y: Math.round((croppedAreaRelative.y / 100) * filteredImg.naturalHeight),
              width: Math.round((croppedAreaRelative.width / 100) * filteredImg.naturalWidth),
              height: Math.round((croppedAreaRelative.height / 100) * filteredImg.naturalHeight),
           };
      }

      const finalCropArea = calculateAdjustedCropArea(
        cropPixelsForProcessing,
        filteredImg.naturalWidth,
        filteredImg.naturalHeight
      );

      // Calculate output dimensions based on panel count
      const outputDimensions = getPanelDimensions(panelCount, 1080);

      // Crop the image (use JPEG for export/download to reduce file size)
      // Note: croppedAreaPixels coordinates are relative to original image dimensions
      // since we always use imageUrl in the Cropper component
      const croppedBlob = await cropImage(filteredImg, finalCropArea, outputDimensions, 'jpeg', 0.95);
      
      // Revoke URL after image is used
      URL.revokeObjectURL(filteredImgUrl);

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
  }, [croppedAreaPixels, filters, panelCount, selectiveColor, calculateAdjustedCropArea]);

  // Validate imageUrl is a proper HTTP/HTTPS URL, not a data URI or local file
  if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('file:')) {
    return (
      <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-medium">Invalid Image URL</p>
        <p className="mt-2">The image URL is invalid or not accessible. Please try uploading again.</p>
      </div>
    );
  }
  
  // Show warning if using fallback image
  const showFallbackWarning = isUsingFallbackImage || (!existingImageUrls.original_url && existingImageUrls.processed_url);

  return (
    <div className="space-y-6">
      {showFallbackWarning && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Editing Processed Image
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  The original image is not available. You are editing the processed version, which may have already been cropped and filtered.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {imageLoadError && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">
                  Image Load Error
                </p>
                <p className="text-xs text-destructive/80 mt-1">
                  {imageLoadError}
                </p>
                {existingImageUrls.processed_url && !isUsingFallbackImage && (
                  <p className="text-xs text-destructive/80 mt-2">
                    The processed image may be available as a fallback.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
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
                    onError={handleImageError}
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
                        filter: showOriginal ? 'none' : `brightness(${Math.max(0, filters.brightness + filters.exposure)}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`,
                        opacity: isUpdatingPreview ? 0.7 : 1,
                        transition: 'opacity 0.2s ease-in-out'
                      }}
                    >
                      <Cropper
                        image={showOriginal ? imageUrl : (filteredPreviewUrl || imageUrl)}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={undefined}
                        onCropChange={onCropChange}
                        onZoomChange={(newZoom) => {
                          setZoom(newZoom);
                          zoomRef.current = newZoom;
                        }}
                        onRotationChange={setRotation}
                        onCropComplete={onCropComplete}
                        cropShape="rect"
                        zoomWithScroll={false}
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
                Zoom
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[zoom]}
                  onValueChange={(value) => {
                    setZoom(value[0]);
                    zoomRef.current = value[0];
                  }}
                  min={1}
                  max={3}
                  step={0.01}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    step={0.1}
                    value={Math.round(zoom * 100)}
                    onChange={(e) => {
                      const percentValue = parseInt(e.target.value, 10);
                      if (!isNaN(percentValue) && percentValue >= 100 && percentValue <= 300) {
                        const zoomValue = percentValue / 100;
                        setZoom(zoomValue);
                        zoomRef.current = zoomValue;
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
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
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    min={-180}
                    max={180}
                    step={1}
                    value={Math.round(rotation)}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value) && value >= -180 && value <= 180) {
                        setRotation(value);
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">°</span>
                </div>
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
              <div className="flex items-center gap-3">
                <Slider
                  value={[clampValue(filters.brightness, 0, 200)]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, brightness: value[0] }))
                  }
                  min={0}
                  max={200}
                  step={1}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    step={1}
                    value={filters.brightness}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value)) {
                        setFilters((prev) => ({ ...prev, brightness: value }));
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Contrast: {filters.contrast}%
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[clampValue(filters.contrast, 0, 200)]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, contrast: value[0] }))
                  }
                  min={0}
                  max={200}
                  step={1}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    step={1}
                    value={filters.contrast}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value)) {
                        setFilters((prev) => ({ ...prev, contrast: value }));
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Saturation: {filters.saturation}%
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[clampValue(filters.saturation, 0, 200)]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, saturation: value[0] }))
                  }
                  min={0}
                  max={200}
                  step={1}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    step={1}
                    value={filters.saturation}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value)) {
                        setFilters((prev) => ({ ...prev, saturation: value }));
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Exposure: {filters.exposure > 0 ? '+' : ''}{filters.exposure.toFixed(1)}
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[clampValue(filters.exposure, -20, 20)]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, exposure: value[0] }))
                  }
                  min={-20}
                  max={20}
                  step={0.1}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    step={0.1}
                    value={filters.exposure.toFixed(1)}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        setFilters((prev) => ({ ...prev, exposure: value }));
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Highlights: {filters.highlights > 0 ? '+' : ''}{filters.highlights.toFixed(1)}
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[clampValue(filters.highlights, -20, 20)]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, highlights: value[0] }))
                  }
                  min={-20}
                  max={20}
                  step={0.1}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    step={0.1}
                    value={filters.highlights.toFixed(1)}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        setFilters((prev) => ({ ...prev, highlights: value }));
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Shadows: {filters.shadows > 0 ? '+' : ''}{filters.shadows.toFixed(1)}
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[clampValue(filters.shadows, -20, 20)]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, shadows: value[0] }))
                  }
                  min={-20}
                  max={20}
                  step={0.1}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    step={0.1}
                    value={filters.shadows.toFixed(1)}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        setFilters((prev) => ({ ...prev, shadows: value }));
                      }
                    }}
                    className="w-16 h-8 text-xs text-center"
                  />
                </div>
              </div>
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
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[
                              clampValue(
                                selectiveColor.adjustments[selectiveColor.selectedColor].saturation,
                                -10,
                                10
                              ),
                            ]}
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
                            min={-10}
                            max={10}
                            step={0.1}
                            className="flex-1"
                          />
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Input
                              type="number"
                              step={0.1}
                              value={selectiveColor.adjustments[selectiveColor.selectedColor].saturation.toFixed(1)}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value)) {
                                  setSelectiveColor((prev) => ({
                                    ...prev,
                                    adjustments: {
                                      ...prev.adjustments,
                                      [prev.selectedColor!]: {
                                        ...prev.adjustments[prev.selectedColor!],
                                        saturation: value,
                                      },
                                    },
                                  }));
                                }
                              }}
                              className="w-16 h-8 text-xs text-center"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Luminance: {selectiveColor.adjustments[selectiveColor.selectedColor].luminance > 0 ? '+' : ''}
                          {selectiveColor.adjustments[selectiveColor.selectedColor].luminance.toFixed(1)}
                        </label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[
                              clampValue(
                                selectiveColor.adjustments[selectiveColor.selectedColor].luminance,
                                -10,
                                10
                              ),
                            ]}
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
                            min={-10}
                            max={10}
                            step={0.1}
                            className="flex-1"
                          />
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Input
                              type="number"
                              step={0.1}
                              value={selectiveColor.adjustments[selectiveColor.selectedColor].luminance.toFixed(1)}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (!isNaN(value)) {
                                  setSelectiveColor((prev) => ({
                                    ...prev,
                                    adjustments: {
                                      ...prev.adjustments,
                                      [prev.selectedColor!]: {
                                        ...prev.adjustments[prev.selectedColor!],
                                        luminance: value,
                                      },
                                    },
                                  }));
                                }
                              }}
                              className="w-16 h-8 text-xs text-center"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-5 border-t border-border space-y-2">
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  onTouchStart={() => setShowOriginal(true)}
                  onTouchEnd={() => setShowOriginal(false)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Original
                </Button>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setFilters({
                        brightness: 100,
                        contrast: 100,
                        saturation: 100,
                        exposure: 0,
                        highlights: 0,
                        shadows: 0,
                      });
                      setSelectiveColor({
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
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Color Adjustments
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setRotation(0);
                      zoomRef.current = 1;
                    }}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Crop & Rotation
                  </Button>
                </div>
              </div>
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
