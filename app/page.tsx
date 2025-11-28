'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getImagesPage } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { format } from 'date-fns';
import { SearchDialog } from '@/components/SearchDialog';

const PANEL_HEIGHT = 1080;
const PANEL_BLOCK_RATIO = 0.1685;
const BLOCK_HEIGHT = PANEL_HEIGHT * PANEL_BLOCK_RATIO;
const IMAGE_STRIP_HEIGHT = PANEL_HEIGHT - BLOCK_HEIGHT * 2;
const THREE_PANEL_ASPECT_RATIO = (3 * PANEL_HEIGHT) / IMAGE_STRIP_HEIGHT; // Actual processed pano ratio
const THREE_PANEL_PADDING_PERCENT = `${(100 / THREE_PANEL_ASPECT_RATIO).toFixed(6)}%`;
const THREE_PANEL_TOLERANCE = 0.05; // Allow small variances when inferring panel count from aspect ratio
const PAGE_SIZE = 24;

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

export default function Home() {
  const router = useRouter();
  const [images, setImages] = useState<PanoramaImage[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clipMaskOverrides, setClipMaskOverrides] = useState<Record<string, boolean>>({});
  const measuredImagesRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(0);

  const loadMoreImages = useCallback(async () => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    try {
      const currentOffset = nextOffsetRef.current;
      const { images: newImages, hasMore: pageHasMore } = await getImagesPage({
        limit: PAGE_SIZE,
        offset: currentOffset,
      });

      nextOffsetRef.current = currentOffset + newImages.length;
      setImages((prev) => {
        const existingIds = new Set(prev.map((img) => img.id));
        const uniqueNewImages = newImages.filter((img) => !existingIds.has(img.id));
        if (uniqueNewImages.length === 0) {
          return prev;
        }
        return [...prev, ...uniqueNewImages];
      });
      setHasMore(pageHasMore);
      setError(null);
    } catch (err) {
      console.error('Error loading images:', err);
      setError('Failed to load images');
    } finally {
      setIsInitialLoad(false);
      setIsFetchingMore(false);
    }
  }, [hasMore, isFetchingMore]);

  useEffect(() => {
    loadMoreImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreImages();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [loadMoreImages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingImages: HTMLImageElement[] = [];

    images.forEach((image) => {
      if (typeof image.panel_count === 'number') {
        // Clean up any stale override data for images that now have metadata
        measuredImagesRef.current.delete(image.id);
        setClipMaskOverrides((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, image.id)) return prev;
          const next = { ...prev };
          delete next[image.id];
          return next;
        });
        return;
      }

      if (measuredImagesRef.current.has(image.id)) {
        return;
      }

      const src = image.thumbnail_url || image.processed_url || image.original_url;
      if (!src) return;

      const probe = new window.Image();
      probe.decoding = 'async';
      probe.loading = 'eager';

      const finalizeMeasurement = (shouldClip: boolean | null) => {
        measuredImagesRef.current.add(image.id);
        if (shouldClip === null) return;
        setClipMaskOverrides((prev) => {
          if (prev[image.id] === shouldClip) return prev;
          return {
            ...prev,
            [image.id]: shouldClip,
          };
        });
      };

      probe.onload = () => {
        const { naturalWidth, naturalHeight } = probe;
        if (!naturalWidth || !naturalHeight) {
          finalizeMeasurement(null);
          return;
        }
        const aspectRatio = naturalWidth / naturalHeight;
        const shouldClip =
          Math.abs(aspectRatio - THREE_PANEL_ASPECT_RATIO) > THREE_PANEL_TOLERANCE;
        finalizeMeasurement(shouldClip);
      };

      probe.onerror = () => finalizeMeasurement(null);
      probe.src = src;
      pendingImages.push(probe);
    });

    return () => {
      pendingImages.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [images]);

  return (
    <div className="w-full bg-white inline-flex flex-col justify-start items-start overflow-hidden min-h-screen">
      {/* Header */}
        <div className="self-stretch h-10 px-3 py-2 border-b border-neutral-300 inline-flex justify-between items-center">
        <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
          <Link href="https://lassor.com" className="hover:text-neutral-700 transition-colors">
            lassor.com
          </Link>
          {' → '}
          Walking forward
        </div>
          <div className="flex justify-start items-center gap-2">
          <Link href="/signin" className="justify-start text-neutral-400 text-base font-black cursor-pointer hover:text-neutral-600 transition-colors">
            <i className="fas fa-arrow-up"></i>
          </Link>
          <div className="justify-start text-neutral-400 text-base font-black">
            <i className="fas fa-globe"></i>
          </div>
            <SearchDialog />
        </div>
      </div>

      {/* Main Content */}
      <div className="self-stretch flex flex-col justify-start items-center">
        <div className="self-stretch px-5 flex flex-col justify-start items-center gap-2.5">
          <div className="w-full max-w-[1960px] border-l border-r border-neutral-300 flex flex-col justify-start items-start gap-0">
            {/* Description Section */}
            <div className="self-stretch px-3 pt-3 pb-14 inline-flex flex-col justify-start items-start gap-8">
              <div className="w-full lg:w-1/2 xl:w-1/3 lg:min-w-[400px] max-w-[651px] flex flex-col justify-start items-start gap-1">
                <div className="justify-start text-neutral-600 text-2xl font-light font-[var(--font-be-vietnam-pro)]">
                  walking forward
                </div>
                <div className="self-stretch max-w-[651px] justify-start text-neutral-400 text-xs font-medium font-[var(--font-be-vietnam-pro)] leading-5">
                  Walking Forward documents Lassor&rsquo;s travels from an unconventional point of view. Each panel is a digital panoramic capture, creating a continuous record of motion. The work contrasts Lassor&rsquo;s fleeting movement through space with the enduring character of each place.
                </div>
              </div>
            </div>

            {/* Panorama Grid */}
            <div className="self-stretch flex flex-col justify-start items-start">
              {isInitialLoad ? (
                <div className="w-full flex justify-center items-center py-12">
                  <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">Loading panoramas...</p>
                </div>
              ) : error ? (
                <div className="w-full flex justify-center items-center py-12">
                  <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">{error}</p>
                </div>
              ) : images.length === 0 ? (
                <div className="w-full flex justify-center items-center py-12">
                  <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">No panoramas yet.</p>
                </div>
              ) : (
                <div className="self-stretch grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-0 gap-y-10 pb-[60px]">
                  {images.map((image) => {
                    const thumbnailUrl = image.thumbnail_url || image.processed_url || image.original_url;
                    const previewUrl = image.preview_url || image.processed_url || image.original_url;
                    const latDMS = toDMS(image.latitude, true);
                    const lngDMS = toDMS(image.longitude, false);
                    const dateFormatted = image.date_taken ? formatDateMonthYear(image.date_taken) : '';
                    const locationFormatted = formatLocationForDisplay(image.location_name);
                  const hasOverride = Object.prototype.hasOwnProperty.call(clipMaskOverrides, image.id);
                  const measuredClipPreference = hasOverride ? clipMaskOverrides[image.id] : null;
                  const shouldClipToThreePanelMask =
                    typeof image.panel_count === 'number'
                      ? image.panel_count !== 3
                      : measuredClipPreference ?? true;

                    return (
                      <div
                        key={image.id}
                        className="w-full flex-1 max-w-full lg:max-w-[652px] py-1 border border-neutral-300 border-x-0 inline-flex flex-col justify-start items-start gap-1 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => router.push(`/panorama/${image.id}`)}
                      >
                        {/* Header with Title and Coordinates */}
                        <div className="self-stretch px-2 inline-flex justify-between items-center">
                          <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                            {image.title || 'Title'}
                          </div>
                          <div className="flex justify-start items-center gap-2">
                            <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                              {latDMS}
                            </div>
                            <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                              {lngDMS}
                            </div>
                          </div>
                        </div>

                        {/* Image */}
                        {shouldClipToThreePanelMask ? (
                          <div
                            className="relative w-full overflow-hidden"
                            style={{ paddingBottom: THREE_PANEL_PADDING_PERCENT }}
                          >
                            <img
                              className="absolute inset-0 w-full h-full"
                              src={thumbnailUrl}
                              srcSet={
                                previewUrl
                                  ? `${thumbnailUrl} 400w, ${previewUrl} 1920w`
                                  : undefined
                              }
                              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 652px"
                              alt={image.title || image.description || 'Panorama image'}
                              style={{ objectFit: 'cover' }}
                            />
                          </div>
                        ) : (
                          <img
                            className="w-full"
                            src={thumbnailUrl}
                            srcSet={
                              previewUrl
                                ? `${thumbnailUrl} 400w, ${previewUrl} 1920w`
                                : undefined
                            }
                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 652px"
                            alt={image.title || image.description || 'Panorama image'}
                            style={{ display: 'block', height: 'auto', objectFit: 'contain' }}
                          />
                        )}

                        {/* Footer with Location and Date */}
                        <div className="self-stretch px-2 inline-flex justify-between items-center">
                          <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                            {locationFormatted || 'Location'}
                          </div>
                          <div className="justify-start text-neutral-500 text-[10px] font-normal font-[var(--font-be-vietnam-pro)]">
                            {dateFormatted || 'Date'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="w-full flex flex-col items-center justify-center gap-2 py-6">
              {isFetchingMore && !isInitialLoad ? (
                <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">
                  Loading more panoramas...
                </p>
              ) : null}
              <div ref={sentinelRef} className="h-1 w-full" />
            </div>
          </div>
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
    </div>
  );
}
