/**
 * Image processing utilities
 */

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Calculate dimensions for N square panels
 * @param panelCount Number of panels (each panel is square)
 * @param panelSize Size of each square panel in pixels (default 1080)
 * @returns Dimensions object with width and height
 */
export function getPanelDimensions(
  panelCount: number,
  panelSize: number = 1080
): ImageDimensions {
  return {
    width: panelCount * panelSize,
    height: panelSize,
  };
}

/**
 * Create a canvas with the image and apply crop
 * @param image The image element to crop
 * @param cropArea The crop area in pixels
 * @param outputDimensions Optional output dimensions (if different from crop area)
 * @param format Output format: 'png' for lossless or 'jpeg' for compressed (default: 'png')
 * @param quality JPEG quality 0-1 (only used if format is 'jpeg', default: 0.95)
 * @returns Promise that resolves to a Blob of the cropped image
 */
export function cropImage(
  image: HTMLImageElement,
  cropArea: CropArea,
  outputDimensions?: ImageDimensions,
  format: 'png' | 'jpeg' = 'png',
  quality: number = 0.95
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const outputWidth = outputDimensions?.width || cropArea.width;
    const outputHeight = outputDimensions?.height || cropArea.height;

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    ctx.drawImage(
      image,
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      outputWidth,
      outputHeight
    );

    // Use PNG for lossless quality, JPEG for smaller file size
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      mimeType,
      format === 'jpeg' ? quality : undefined
    );
  });
}

/**
 * Convert HEIC/HEIF image to JPEG format with maximum quality
 * If the file is not HEIC/HEIF, returns it unchanged
 * @param file The image file to convert
 * @returns Promise that resolves to a File with the converted JPEG (or original if not HEIC)
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  // Check if file is HEIC/HEIF format
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  const isHeic = 
    fileName.endsWith('.heic') || 
    fileName.endsWith('.heif') ||
    fileType === 'image/heic' ||
    fileType === 'image/heif' ||
    fileType === 'image/heic-sequence' ||
    fileType === 'image/heif-sequence';

  console.log('convertHeicToJpeg:', {
    fileName,
    fileType,
    isHeic,
    fileSize: file.size
  });

  // If not HEIC, return original file unchanged
  if (!isHeic) {
    console.log('File is not HEIC, returning original');
    return file;
  }

  try {
    // Ensure we're in a browser environment
    if (typeof window === 'undefined') {
      throw new Error('HEIC conversion must run in browser environment');
    }

    // Dynamically import heic2any (it's a browser-only library)
    // Use dynamic import for Next.js compatibility
    const heic2anyModule = await import('heic2any');
    // heic2any exports as default, but might also have named exports
    const heic2any = (heic2anyModule.default || heic2anyModule) as any;
    
    if (typeof heic2any !== 'function') {
      console.error('heic2any import issue:', heic2anyModule);
      throw new Error('Failed to import heic2any library');
    }
    
    console.log('Converting HEIC to JPEG...');
    console.log('File details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
    // Convert HEIC to JPEG with maximum quality (1.0)
    // heic2any expects a Blob, File extends Blob so this should work
    let conversionResult: Blob | Blob[];
    try {
      conversionResult = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 1.0, // Maximum quality to preserve image quality
      });
    } catch (conversionError) {
      console.error('heic2any conversion error:', conversionError);
      throw new Error(`HEIC conversion failed: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`);
    }

    console.log('HEIC conversion result type:', typeof conversionResult, Array.isArray(conversionResult));
    console.log('HEIC conversion result:', conversionResult);
    if (Array.isArray(conversionResult)) {
      console.log('Array length:', conversionResult.length);
      conversionResult.forEach((blob, i) => {
        console.log(`Blob ${i}:`, { size: blob.size, type: blob.type });
      });
    } else if (conversionResult instanceof Blob) {
      console.log('Single blob:', { size: conversionResult.size, type: conversionResult.type });
    }

    // heic2any returns an array of blobs (usually just one) or a single blob
    let convertedBlob: Blob;
    if (Array.isArray(conversionResult)) {
      if (conversionResult.length === 0) {
        throw new Error('HEIC conversion returned empty array');
      }
      convertedBlob = conversionResult[0];
      // Validate the blob
      if (!(convertedBlob instanceof Blob)) {
        throw new Error('HEIC conversion returned array with invalid blob');
      }
    } else if (conversionResult instanceof Blob) {
      convertedBlob = conversionResult;
    } else {
      console.error('Unexpected conversion result:', conversionResult);
      const result = conversionResult as any;
      console.error('Result constructor:', result?.constructor?.name);
      console.error('Result keys:', Object.keys(result || {}));
      throw new Error(`HEIC conversion returned unexpected result type: ${typeof conversionResult}`);
    }

    console.log('Converted blob details:', {
      size: convertedBlob.size,
      type: convertedBlob.type,
      constructor: convertedBlob.constructor.name,
      isValid: convertedBlob instanceof Blob
    });

    // Validate the converted blob is reasonable size (at least 1KB for a real image)
    if (convertedBlob.size < 1024) {
      // Try to read the blob to see what's in it
      const text = await convertedBlob.slice(0, 100).text();
      console.error('Small blob content (first 100 bytes):', text);
      throw new Error(`HEIC conversion produced suspiciously small file (${convertedBlob.size} bytes). Expected at least 1KB. Conversion may have failed.`);
    }

    // Create new filename with .jpg extension
    const newFileName = fileName
      .replace(/\.heic$/i, '.jpg')
      .replace(/\.heif$/i, '.jpg');

    // Convert blob to File object
    const convertedFile = new File([convertedBlob], newFileName, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });

    console.log('HEIC conversion successful:', {
      originalName: file.name,
      convertedName: convertedFile.name,
      originalSize: file.size,
      convertedSize: convertedFile.size,
      convertedType: convertedFile.type
    });

    return convertedFile;
  } catch (error) {
    console.error('Failed to convert HEIC to JPEG:', error);
    // If conversion fails, throw error (don't silently fail)
    throw new Error(
      `Failed to convert HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Rotate a portrait image to landscape orientation (90° clockwise)
 * If the image is already landscape, returns it unchanged
 * @param file The image file to rotate
 * @returns Promise that resolves to a File with the rotated image (or original if already landscape)
 */
export function rotateToLandscape(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    // Validate file is actually a File object
    if (!(file instanceof File)) {
      reject(new Error('Invalid file object'));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    // Set up error handler first
    img.onerror = async (error) => {
      URL.revokeObjectURL(url);
      console.error('Image load error:', error);
      console.error('File details:', {
        name: file.name,
        type: file.type,
        size: file.size
      });
      
      // Check if this might be a HEIC file that wasn't detected
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();
      const mightBeHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif') || 
                         fileType === 'image/heic' || fileType === 'image/heif' ||
                         fileType === ''; // Sometimes HEIC files have empty type
      
      if (mightBeHeic) {
        console.log('File might be HEIC, attempting conversion...');
        try {
          const converted = await convertHeicToJpeg(file);
          // Retry rotation with converted file
          const retryUrl = URL.createObjectURL(converted);
          const retryImg = new Image();
          retryImg.onload = () => {
            URL.revokeObjectURL(retryUrl);
            // Check if image is portrait (height > width)
            if (retryImg.naturalHeight <= retryImg.naturalWidth) {
              resolve(converted);
              return;
            }
            // Portrait image - rotate 90° clockwise
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }
            canvas.width = retryImg.naturalHeight;
            canvas.height = retryImg.naturalWidth;
            ctx.translate(canvas.width, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(retryImg, 0, 0);
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(new File([blob], converted.name, {
                    type: converted.type || 'image/jpeg',
                    lastModified: Date.now(),
                  }));
                } else {
                  reject(new Error('Failed to create blob from canvas'));
                }
              },
              converted.type || 'image/jpeg',
              0.95
            );
          };
          retryImg.onerror = () => {
            URL.revokeObjectURL(retryUrl);
            reject(new Error('Failed to load converted image. The file may be corrupted or in an unsupported format.'));
          };
          retryImg.src = retryUrl;
          return;
        } catch (convertError) {
          console.error('HEIC conversion also failed:', convertError);
        }
      }
      
      reject(new Error('Failed to load image. The file may be corrupted or in an unsupported format.'));
    };

    img.onload = () => {
      try {
        URL.revokeObjectURL(url);

        // Check if image is portrait (height > width)
        if (img.naturalHeight <= img.naturalWidth) {
          // Already landscape, return original file
          resolve(file);
          return;
        }

        // Portrait image - rotate 90° clockwise
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Swap dimensions for 90° rotation
        canvas.width = img.naturalHeight;
        canvas.height = img.naturalWidth;

        // Rotate and translate to position image correctly
        ctx.translate(canvas.width, 0);
        ctx.rotate(Math.PI / 2); // 90 degrees in radians
        ctx.drawImage(img, 0, 0);

        // Use toBlob instead of toDataURL to avoid data URI issues
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Create a new File with the rotated image
              const rotatedFile = new File([blob], file.name, {
                type: file.type || 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(rotatedFile);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          },
          file.type || 'image/jpeg',
          0.95
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Unknown error during image processing'));
      }
    };

    // Set src after handlers are set up
    img.src = url;
  });
}

/**
 * Apply highlights and shadows adjustments to an image using tone curve manipulation
 * Similar to how Lightroom/Photoshop handles highlights and shadows
 * @param imageData ImageData from canvas context
 * @param highlights Adjustment value (-100 to 100, positive = brighten highlights, negative = darken)
 * @param shadows Adjustment value (-100 to 100, positive = brighten shadows, negative = darken)
 */
export function applyHighlightsShadows(
  imageData: ImageData,
  highlights: number,
  shadows: number
): void {
  const data = imageData.data;
  
  console.log('Applying highlights/shadows:', { highlights, shadows });
  
  // Convert to factors (-1 to 1)
  const highlightsFactor = highlights / 100;
  const shadowsFactor = shadows / 100;

  let highlightsApplied = 0;
  let shadowsApplied = 0;
  let maxHighlightAdjust = 0;
  let maxShadowAdjust = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Calculate luminance (perceived brightness) - normalized 0 to 1
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const normalizedLuminance = luminance / 255;
    
    // Calculate adjustment for highlights (affects bright areas, luminance > 0.5)
    let highlightAdjustment = 0;
    if (highlightsFactor !== 0 && normalizedLuminance > 0.5) {
      highlightsApplied++;
      // Smooth curve: 0 at 0.5 luminance, 1 at 1.0 luminance
      // Use a gentler curve for smoother transitions
      const highlightWeight = Math.pow((normalizedLuminance - 0.5) * 2, 0.7);
      // Scale adjustment: at max (100), this should give ~150-200 pixel adjustment
      highlightAdjustment = highlightWeight * highlightsFactor * 250;
      maxHighlightAdjust = Math.max(maxHighlightAdjust, Math.abs(highlightAdjustment));
    }
    
    // Calculate adjustment for shadows (affects dark areas, luminance < 0.5)
    let shadowAdjustment = 0;
    if (shadowsFactor !== 0 && normalizedLuminance < 0.5) {
      shadowsApplied++;
      // Smooth curve: 1 at 0 luminance, 0 at 0.5 luminance
      // Use a gentler curve for smoother transitions
      const shadowWeight = Math.pow((0.5 - normalizedLuminance) * 2, 0.7);
      // Scale adjustment: at max (100), this should give ~150-200 pixel adjustment
      shadowAdjustment = shadowWeight * shadowsFactor * 250;
      maxShadowAdjust = Math.max(maxShadowAdjust, Math.abs(shadowAdjustment));
    }
    
    // Apply both adjustments (they don't overlap, so we can add them)
    const totalAdjustment = highlightAdjustment + shadowAdjustment;
    
    // Apply to each channel proportionally to maintain color balance
    const rNew = Math.min(255, Math.max(0, r + totalAdjustment));
    const gNew = Math.min(255, Math.max(0, g + totalAdjustment));
    const bNew = Math.min(255, Math.max(0, b + totalAdjustment));
    
    // Apply the new values
    data[i] = Math.round(rNew);
    data[i + 1] = Math.round(gNew);
    data[i + 2] = Math.round(bNew);
  }
  
  console.log(`Highlights applied to ${highlightsApplied} pixels (max adjustment: ${maxHighlightAdjust.toFixed(1)}), shadows to ${shadowsApplied} pixels (max adjustment: ${maxShadowAdjust.toFixed(1)})`);
}

/**
 * Convert RGB to HSL
 * @param r Red (0-255)
 * @param g Green (0-255)
 * @param b Blue (0-255)
 * @returns HSL values: { h: 0-360, s: 0-100, l: 0-100 }
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/**
 * Convert HSL to RGB
 * @param h Hue (0-360)
 * @param s Saturation (0-100)
 * @param l Lightness (0-100)
 * @returns RGB values: { r: 0-255, g: 0-255, b: 0-255 }
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Get hue range for a color
 * @param color Color name
 * @returns { min: number, max: number } hue range
 */
function getColorHueRange(color: string): { min: number; max: number } {
  const ranges: Record<string, { min: number; max: number }> = {
    red: { min: 0, max: 30 },
    yellow: { min: 30, max: 90 },
    green: { min: 90, max: 150 },
    cyan: { min: 150, max: 210 },
    blue: { min: 210, max: 270 },
    magenta: { min: 270, max: 330 },
  };
  return ranges[color] || { min: 0, max: 360 };
}

/**
 * Calculate color mask weight based on hue distance and range parameter
 * @param pixelHue Pixel hue (0-360)
 * @param targetColor Target color name
 * @param range Range parameter (0-100)
 * @returns Mask weight (0-1)
 */
function calculateColorMask(pixelHue: number, targetColor: string, range: number): number {
  const { min, max } = getColorHueRange(targetColor);
  const rangePercent = range / 100;
  
  // Handle red which spans 0-30 and 330-360
  let distance = 0;
  if (targetColor === 'red') {
    if (pixelHue >= 0 && pixelHue <= 30) {
      distance = 0; // In range
    } else if (pixelHue >= 330 && pixelHue <= 360) {
      distance = 0; // In range
    } else if (pixelHue > 30 && pixelHue < 330) {
      // Find closest edge
      const distTo30 = Math.min(pixelHue - 30, 360 - pixelHue + 30);
      const distTo330 = Math.min(330 - pixelHue, pixelHue + 360 - 330);
      distance = Math.min(distTo30, distTo330);
    }
  } else {
    // For other colors, check if in range
    if (pixelHue >= min && pixelHue <= max) {
      distance = 0;
    } else {
      // Find distance to nearest edge
      const distToMin = pixelHue < min ? min - pixelHue : 360 - pixelHue + min;
      const distToMax = pixelHue > max ? pixelHue - max : pixelHue + 360 - max;
      distance = Math.min(distToMin, distToMax);
    }
  }
  
  // Convert distance to mask weight with smooth falloff
  // Range of 0 = very sharp (only exact match), Range of 100 = smooth transition
  const maxDistance = 60 * (1 - rangePercent * 0.5); // Adjust based on range
  const weight = Math.max(0, 1 - distance / maxDistance);
  
  // Apply smooth curve
  return Math.pow(weight, 1.5);
}

/**
 * Apply selective color adjustment to an image
 * @param imageData ImageData from canvas context
 * @param color Color to adjust ('red', 'yellow', 'green', 'cyan', 'blue', 'magenta')
 * @param saturation Saturation adjustment (-100 to 100)
 * @param luminance Luminance adjustment (-100 to 100)
 */
export function applySelectiveColor(
  imageData: ImageData,
  color: string,
  saturation: number,
  luminance: number
): void {
  const data = imageData.data;
  const range = 100; // Default range (full color range)
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Convert to HSL
    const hsl = rgbToHsl(r, g, b);
    
    // Calculate mask weight for this color
    const maskWeight = calculateColorMask(hsl.h, color, range);
    
    if (maskWeight > 0) {
      // Apply adjustments (hue removed, only saturation and luminance)
      let newS = hsl.s + (saturation / 100) * 100 * maskWeight;
      newS = Math.max(0, Math.min(100, newS));
      
      let newL = hsl.l + (luminance / 100) * 100 * maskWeight;
      newL = Math.max(0, Math.min(100, newL));
      
      // Convert back to RGB (preserve original hue)
      const rgb = hslToRgb(hsl.h, newS, newL);
      
      // Blend with original based on mask weight
      data[i] = Math.round(r + (rgb.r - r) * maskWeight);
      data[i + 1] = Math.round(g + (rgb.g - g) * maskWeight);
      data[i + 2] = Math.round(b + (rgb.b - b) * maskWeight);
    }
  }
}

/**
 * Apply multiple selective color adjustments in a single optimized pass
 * This is more efficient than calling applySelectiveColor multiple times
 * @param imageData ImageData from canvas context
 * @param adjustments Array of color adjustments: { color: string, saturation: number, luminance: number }
 */
export function applySelectiveColorsCombined(
  imageData: ImageData,
  adjustments: Array<{ color: string; saturation: number; luminance: number }>
): void {
  if (adjustments.length === 0) return;
  
  const data = imageData.data;
  const range = 100; // Default range (full color range)
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Convert to HSL once per pixel (instead of once per color)
    const hsl = rgbToHsl(r, g, b);
    
    // Apply all active color adjustments to this pixel
    let totalSaturationDelta = 0;
    let totalLuminanceDelta = 0;
    let maxWeight = 0;
    
    for (const { color, saturation, luminance } of adjustments) {
      const maskWeight = calculateColorMask(hsl.h, color, range);
      if (maskWeight > 0) {
        totalSaturationDelta += (saturation / 100) * 100 * maskWeight;
        totalLuminanceDelta += (luminance / 100) * 100 * maskWeight;
        maxWeight = Math.max(maxWeight, maskWeight);
      }
    }
    
    // Apply combined adjustments if any color matched
    if (maxWeight > 0) {
      let newS = hsl.s + totalSaturationDelta;
      newS = Math.max(0, Math.min(100, newS));
      
      let newL = hsl.l + totalLuminanceDelta;
      newL = Math.max(0, Math.min(100, newL));
      
      // Convert back to RGB once
      const rgb = hslToRgb(hsl.h, newS, newL);
      
      // Blend with original based on max weight
      data[i] = Math.round(r + (rgb.r - r) * maxWeight);
      data[i + 1] = Math.round(g + (rgb.g - g) * maxWeight);
      data[i + 2] = Math.round(b + (rgb.b - b) * maxWeight);
    }
  }
}

/**
 * Generate web-optimized version of an image
 * @param image The image element
 * @param maxWidth Maximum width in pixels
 * @param quality JPEG quality (0-1)
 * @returns Promise that resolves to a Blob
 */
export function generateWebOptimized(
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

    // Calculate dimensions maintaining aspect ratio
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

/**
 * Add white blocks (letterbox padding) to the top and bottom of an image
 * @param image The image to add white blocks to
 * @param panelHeight The height of one square panel (used to calculate block height)
 * @param blockRatio The ratio of block height to panel height (default 0.1685 = 16.85%)
 * @returns Promise that resolves to a Blob of the image with white blocks
 */
export function addWhiteBlocks(
  image: HTMLImageElement,
  panelHeight: number,
  blockRatio: number = 0.1685
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const blockHeight = Math.round(panelHeight * blockRatio);
    const totalHeight = image.height + blockHeight * 2;
    canvas.width = image.width;
    canvas.height = totalHeight;

    // Fill entire canvas with white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the image in the middle (between white blocks)
    ctx.drawImage(image, 0, blockHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      },
      'image/jpeg',
      0.95
    );
  });
}

/**
 * Create an SVG panel with embedded raster image and vector overlay
 * @param imageUrl URL to the raster image (can be data URL or external URL)
 * @param panelSize Size of the square panel in pixels (default 1080)
 * @param blockColor Color of the white blocks (default '#FFFFFF')
 * @param blockRatio Ratio of block height to panel height (default 0.1685 = 16.85%)
 * @returns SVG string
 */
export function createSVGPanel(
  imageUrl: string,
  panelSize: number = 1080,
  blockColor: string = '#FFFFFF',
  blockRatio: number = 0.1685
): string {
  const blockHeight = Math.round(panelSize * blockRatio);
  const imageStripHeight = panelSize - blockHeight * 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${panelSize}" height="${panelSize}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <!-- Top white block -->
  <rect x="0" y="0" width="${panelSize}" height="${blockHeight}" fill="${blockColor}"/>
  <!-- Embedded raster image -->
  <image href="${imageUrl}" x="0" y="${blockHeight}" width="${panelSize}" height="${imageStripHeight}" preserveAspectRatio="xMidYMid slice"/>
  <!-- Bottom white block -->
  <rect x="0" y="${panelSize - blockHeight}" width="${panelSize}" height="${blockHeight}" fill="${blockColor}"/>
</svg>`;
}

/**
 * Generate individual square panel images with white blocks from a cropped panorama image
 * @param croppedImage The cropped image element (panorama strip)
 * @param panelCount Number of panels to extract
 * @param panelSize Size of each square panel in pixels (default 1080)
 * @param blockRatio Ratio of block height to panel height (default 0.1685)
 * @returns Promise that resolves to array of panel blobs with order information
 */
export async function generatePanelImages(
  croppedImage: HTMLImageElement,
  panelCount: number,
  panelSize: number = 1080,
  blockRatio: number = 0.1685
): Promise<Array<{ order: number; blob: Blob }>> {
  const panelWidth = croppedImage.width / panelCount;
  const panelHeightPx = croppedImage.height; // Image strip height (without white blocks)
  const blockHeight = Math.round(panelSize * blockRatio);
  const imageStripHeight = panelSize - blockHeight * 2;

  const panels: Array<{ order: number; blob: Blob }> = [];

  for (let i = 0; i < panelCount; i++) {
    // Extract panel from cropped image (without white blocks)
    const panelCanvas = document.createElement('canvas');
    const panelCtx = panelCanvas.getContext('2d');
    if (!panelCtx) continue;

    panelCanvas.width = panelWidth;
    panelCanvas.height = panelHeightPx;

    // Draw the panel section from the cropped image
    panelCtx.drawImage(
      croppedImage,
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

    await new Promise((resolve, reject) => {
      panelImg.onload = resolve;
      panelImg.onerror = reject;
    });

    // Create square canvas with white blocks
    const squareCanvas = document.createElement('canvas');
    const squareCtx = squareCanvas.getContext('2d');
    if (!squareCtx) {
      URL.revokeObjectURL(panelImg.src);
      continue;
    }

    squareCanvas.width = panelSize; // Square: width = height
    squareCanvas.height = panelSize;

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
      panelSize, // destination width (full width of square)
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

    panels.push({
      order: i + 1, // 1-indexed
      blob: panelWithBlocksBlob,
    });

    // Clean up
    URL.revokeObjectURL(panelImg.src);
  }

  return panels;
}

