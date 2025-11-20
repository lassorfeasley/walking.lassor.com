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
  const [isMobile, setIsMobile] = useState(false);

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
    const updateViewportInfo = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth <= 640);
    };

    updateViewportInfo();
    window.addEventListener('resize', updateViewportInfo);
    return () => window.removeEventListener('resize', updateViewportInfo);
  }, []);

  useEffect(() => {
    if (!image) return;

    const imageUrl =
      (isMobile ? image.thumbnail_url : undefined) ||
      image.preview_url ||
      image.processed_url ||
      image.original_url;
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
  }, [image, isMobile]);

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
  const imageUrl =
    (isMobile ? image.thumbnail_url : undefined) ||
    image.preview_url ||
    image.processed_url ||
    image.original_url;
  const latDMS = toDMS(image.latitude, true);
  const lngDMS = toDMS(image.longitude, false);
  const dateFormatted = image.date_taken ? formatDateMonthYear(image.date_taken) : '';
  const locationFormatted = formatLocationForDisplay(image.location_name);

  // Use calculated width or fallback to image width or 1960px
  const baseWidth = calculatedWidth || imageDimensions?.width || 1960;
  const displayWidth = baseWidth;
  const baseHeight =
    calculatedHeight || (imageDimensions && baseWidth
      ? baseWidth * (imageDimensions.height / imageDimensions.width)
      : 384);
  const imageHeight = baseWidth ? baseHeight * (displayWidth / baseWidth) : baseHeight;

  return (
    <div className="w-full flex flex-col justify-start items-center bg-white min-h-screen">
      {/* Breadcrumb Section */}
      <div className="self-stretch h-10 px-3 py-2 border-b border-neutral-300 inline-flex justify-between items-center">
        <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
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
        <div className="flex justify-start items-end gap-2">
          <Link href="/signin" className="justify-start text-neutral-400 text-base font-black cursor-pointer hover:text-neutral-600 transition-colors">
            <i className="fas fa-arrow-up"></i>
          </Link>
          <div className="justify-start text-neutral-400 text-base font-black">
            <i className="fas fa-globe"></i>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="w-full flex flex-col justify-start items-center">
        {isMobile ? (
          <div className="detail-mobile-wrapper w-full px-5 flex flex-col justify-start items-center mx-auto">
            <div className="detail-mobile-panel self-stretch pt-5 border-l border-r border-neutral-300 flex flex-col justify-start items-start gap-5">
              <div className="detail-mobile-pano self-stretch py-1 border-t border-b border-neutral-300 flex flex-col justify-start items-start gap-1">
                <div className="self-stretch px-2 inline-flex justify-between items-center">
                  <div className="text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                    {image.title || 'Title'}
                  </div>
                  <div className="flex justify-start items-center gap-2">
                    <div className="text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                      {latDMS}
                    </div>
                    <div className="text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                      {lngDMS}
                    </div>
                  </div>
                </div>
                <img
                  className="w-full"
                  src={imageUrl}
                  alt={image.title || 'Panorama image'}
                  style={{ display: 'block', height: 'auto', objectFit: 'contain' }}
                />
                <div className="self-stretch px-2 inline-flex justify-between items-center">
                  <div className="text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                    {locationFormatted || image.location_name || 'Location'}
                  </div>
                  <div className="text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                    {dateFormatted || 'Date'}
                  </div>
                </div>
              </div>
              <div className="detail-mobile-description self-stretch min-h-[500px] px-3 pt-3 border-t border-neutral-300 inline-flex justify-start items-start gap-2.5">
                <div className="w-full lg:w-1/2 xl:w-1/3 lg:min-w-[400px] max-w-[651px] flex flex-col justify-start items-start gap-1 text-neutral-500 text-xs font-medium font-[var(--font-be-vietnam-pro)] leading-5">
                  {image.description || 'No description available.'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="detail-desktop-frame w-full flex flex-col justify-start items-center mx-auto"
            style={{ width: '100%', maxWidth: `${displayWidth}px` }}
          >
            <div className="detail-desktop-inner self-stretch px-5 flex flex-col justify-start items-start">
              <div className="detail-desktop-panel self-stretch pt-10 border-l border-r border-neutral-300 flex flex-col justify-start items-start gap-10">
                <div className="detail-pano-section self-stretch border-t border-b border-neutral-300 flex flex-col justify-start items-start">
                  <div className="self-stretch h-10 px-2 inline-flex justify-between items-center">
                    <div className="text-neutral-700 text-base font-light font-[var(--font-be-vietnam-pro)]">
                      {image.title || 'Untitled Panorama'}
                    </div>
                    <div className="flex justify-start items-center gap-5">
                      <div className="text-neutral-700 text-base font-light font-[var(--font-be-vietnam-pro)]">
                        {latDMS}
                      </div>
                      <div className="text-neutral-600 text-base font-light font-[var(--font-be-vietnam-pro)]">
                        {lngDMS}
                      </div>
                    </div>
                  </div>

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

                  <div className="self-stretch h-10 px-2 inline-flex justify-between items-center">
                    <div className="text-neutral-600 text-base font-light font-[var(--font-be-vietnam-pro)]">
                      {locationFormatted || image.location_name || '—'}
                    </div>
                    <div className="text-neutral-600 text-base font-light font-[var(--font-be-vietnam-pro)]">
                      {dateFormatted || '—'}
                    </div>
                  </div>
                </div>

                <div className="detail-description-section self-stretch min-h-[500px] px-3 pt-3 border-t border-neutral-300 inline-flex justify-start items-start gap-2.5">
                  <div className="w-full lg:w-1/2 xl:w-1/3 lg:min-w-[400px] max-w-[651px] flex flex-col justify-start items-start gap-1 text-neutral-500 text-xs font-medium font-[var(--font-be-vietnam-pro)] leading-5">
                    {image.description || 'No description available.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="self-stretch flex flex-col justify-start items-center">
        <div className="self-stretch h-36 px-3 pt-3 pb-24 border-t border-neutral-300 inline-flex flex-col justify-start items-start gap-2">
          <div className="self-stretch min-w-36 justify-start text-neutral-500 text-[10px] font-bold font-[var(--font-be-vietnam-pro)]">
            Developed by Lassor
          </div>
          <div className="self-stretch flex flex-col justify-start items-start gap-1">
            <div className="self-stretch justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
              www.Lassor.com
            </div>
            <div className="w-56 justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
              Feasley@Lassor.com
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

