'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getImageMetadata } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { format } from 'date-fns';

// Utility function to convert decimal degrees to DMS format
function toDMS(decimal: number, isLatitude: boolean): string {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  
  const direction = isLatitude 
    ? (decimal >= 0 ? 'N' : 'S')
    : (decimal >= 0 ? 'E' : 'W');
  
  return `${degrees}°${minutes}′${seconds}″${direction}`;
}

// Utility function to format date as "Month, Year"
function formatDateMonthYear(dateString: string): string {
  try {
    const date = new Date(dateString);
    return format(date, 'MMMM, yyyy');
  } catch {
    return dateString;
  }
}

// Format location for display (City, State for US; Region, Country for non-US)
function formatLocationForDisplay(locationName: string): string {
  if (!locationName) return '';
  
  const parts = locationName.split(',').map(p => p.trim());
  const isUSA = parts[parts.length - 1]?.toLowerCase().includes('united states');
  
  if (isUSA && parts.length >= 3) {
    const city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2];
    const state = stateZip.replace(/\s+\d+.*$/, '').trim();
    return `${city}, ${state}`;
  } else if (parts.length >= 2) {
    const region = parts[parts.length - 2];
    const country = parts[parts.length - 1];
    return `${region}, ${country}`;
  }
  
  return locationName;
}

export default function PublicPanoramaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [image, setImage] = useState<PanoramaImage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [calculatedWidth, setCalculatedWidth] = useState<number>(0);
  const [calculatedHeight, setCalculatedHeight] = useState<number>(0);

  useEffect(() => {
    const loadImage = async () => {
      try {
        setIsLoading(true);
        const data = await getImageMetadata(id);
        if (data) {
          setImage(data);
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

  // Load image to get dimensions and calculate responsive sizing
  useEffect(() => {
    if (!image) return;

    const imageUrl = image.processed_url || image.original_url;
    const img = new Image();
    
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      setImageDimensions({ width: naturalWidth, height: naturalHeight });

      // Calculate max-width: min(viewport width, image width)
      const viewportWidth = window.innerWidth;
      const maxWidth = Math.min(viewportWidth, naturalWidth);
      setCalculatedWidth(maxWidth);

      // Calculate height from aspect ratio
      const aspectRatio = naturalHeight / naturalWidth;
      const height = maxWidth * aspectRatio;
      setCalculatedHeight(height);
    };

    img.onerror = () => {
      console.error('Failed to load image for dimension calculation');
    };

    img.src = imageUrl;
  }, [image]);

  // Recalculate on window resize
  useEffect(() => {
    if (!imageDimensions) return;

    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const maxWidth = Math.min(viewportWidth, imageDimensions.width);
      setCalculatedWidth(maxWidth);
      const aspectRatio = imageDimensions.height / imageDimensions.width;
      const height = maxWidth * aspectRatio;
      setCalculatedHeight(height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [imageDimensions]);

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-white flex items-center justify-center">
        <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">Loading panorama...</p>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="w-full min-h-screen bg-white flex items-center justify-center">
        <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">{error || 'Image not found'}</p>
      </div>
    );
  }

  // Use full-sized processed image, fallback to original if processed not available
  const imageUrl = image.processed_url || image.original_url;
  const latDMS = toDMS(image.latitude, true);
  const lngDMS = toDMS(image.longitude, false);
  const dateFormatted = image.date_taken ? formatDateMonthYear(image.date_taken) : '';
  const locationFormatted = formatLocationForDisplay(image.location_name);

  // Use calculated width or fallback to image width or 1960px
  const maxWidth = calculatedWidth || imageDimensions?.width || 1960;
  const imageHeight = calculatedHeight || (imageDimensions ? maxWidth * (imageDimensions.height / imageDimensions.width) : 384);

  return (
    <div className="self-stretch inline-flex flex-col justify-start items-center bg-white min-h-screen">
      {/* Breadcrumb Section */}
      <div className="self-stretch h-20 px-5 py-3 border-b border-neutral-300 flex flex-col justify-center items-start gap-5">
        <div className="justify-start text-neutral-500 text-base font-normal font-[var(--font-inconsolata)]">
          <Link href="https://lassor.com" className="hover:text-neutral-700 transition-colors">
            lassor.com
          </Link>
          {' → '}
          <Link href="/" className="hover:text-neutral-700 transition-colors">
            Walking forward
          </Link>
          {' → '}
          {image.title}
        </div>
      </div>

      {/* Main Content Container */}
      <div className="w-full flex flex-col justify-start items-start" style={{ maxWidth: `${maxWidth}px` }}>
        <div className="self-stretch px-5 flex flex-col justify-start items-start">
          {/* Content with borders */}
          <div className="self-stretch py-5 border-l border-r border-neutral-300 flex flex-col justify-start items-start gap-5">
            {/* Title and Coordinates */}
            <div className="self-stretch px-3 inline-flex justify-between items-center">
              <div className="justify-start text-neutral-700 text-xl font-extralight font-[var(--font-inconsolata)]">
                {image.title}
              </div>
              <div className="size- flex justify-start items-center gap-5">
                <div className="justify-start text-neutral-700 text-xl font-extralight font-[var(--font-inconsolata)]">
                  {latDMS}
                </div>
                <div className="justify-start text-neutral-600 text-xl font-extralight font-[var(--font-inconsolata)]">
                  {lngDMS}
                </div>
              </div>
            </div>

            {/* Main Image */}
            <img
              className="w-full"
              src={imageUrl}
              alt={image.title || 'Panorama image'}
              style={{
                width: '100%',
                height: `${imageHeight}px`,
                objectFit: 'contain',
                display: 'block',
              }}
            />

            {/* Location and Date */}
            <div className="self-stretch px-3 inline-flex justify-between items-center">
              <div className="justify-start text-neutral-600 text-xl font-extralight font-[var(--font-inconsolata)]">
                {locationFormatted}
              </div>
              <div className="justify-start text-neutral-600 text-xl font-extralight font-[var(--font-inconsolata)]">
                {dateFormatted}
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="self-stretch h-[500px] min-h-[500px] px-3 pt-5 border-l border-r border-t border-neutral-300 inline-flex justify-start items-start gap-2.5">
            <div className="w-96 justify-start text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)] leading-4">
              {image.description}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="self-stretch flex flex-col justify-start items-center">
        <div className="self-stretch h-36 px-5 pt-5 pb-24 border-t border-neutral-300 flex flex-col justify-start items-start gap-3">
          <div className="self-stretch min-w-36 justify-start text-neutral-500 text-base font-extrabold font-[var(--font-inconsolata)]">
            Developed by Lassor
          </div>
          <div className="self-stretch flex flex-col justify-start items-start gap-1">
            <div className="self-stretch justify-start text-neutral-500 text-base font-normal font-[var(--font-inconsolata)]">
              www.Lassor.com
            </div>
            <div className="w-56 justify-start text-neutral-500 text-base font-normal font-[var(--font-inconsolata)]">
              Feasley@Lassor.com
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

