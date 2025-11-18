'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllImages } from '@/lib/supabase/database';
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

export default function Home() {
  const router = useRouter();
  const [images, setImages] = useState<PanoramaImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImages = async () => {
      try {
        setIsLoading(true);
        const data = await getAllImages();
        setImages(data);
      } catch (err) {
        console.error('Error loading images:', err);
        setError('Failed to load images');
      } finally {
        setIsLoading(false);
      }
    };

    loadImages();
  }, []);

  return (
    <div className="w-full bg-white inline-flex flex-col justify-start items-start overflow-hidden min-h-screen">
      {/* Header */}
      <div className="self-stretch h-20 px-5 py-3 border-b border-neutral-300 inline-flex justify-between items-center">
        <div className="justify-start text-neutral-500 text-xs font-normal font-[var(--font-inconsolata)]">
          <Link href="https://lassor.com" className="hover:text-neutral-700 transition-colors">
            lassor.com
          </Link>
          {' → '}
          Walking forward
        </div>
        <div className="flex justify-start items-end gap-4">
          <Link href="/signin" className="justify-start text-neutral-400 text-3xl font-black cursor-pointer hover:text-neutral-600 transition-colors">
            <i className="fas fa-arrow-up"></i>
          </Link>
          <div className="justify-start text-neutral-400 text-3xl font-black">
            <i className="fas fa-globe"></i>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="self-stretch flex flex-col justify-start items-center">
        <div className="self-stretch px-5 flex flex-col justify-start items-center gap-2.5">
          <div className="w-full max-w-[1960px] pb-10 border-l border-r border-neutral-300 flex flex-col justify-start items-start gap-5">
            {/* Description Section */}
            <div className="self-stretch px-3 pt-3 pb-5 border-b border-neutral-300 flex flex-col justify-start items-start gap-8">
              <div className="w-full max-w-[652px] flex flex-col justify-start items-start gap-2">
                <div className="justify-start text-neutral-600 text-2xl font-light font-[var(--font-be-vietnam-pro)]">
                  walking forward
                </div>
                <div className="self-stretch justify-start text-neutral-400 text-xs font-medium font-[var(--font-be-vietnam-pro)] leading-5">
                  Walking Forward documents Lassor's travels from an unconventional point of view. Each panel is a digital panoramic capture, creating a continuous record of motion. The work contrasts Lassor's fleeting movement through space with the enduring character of each place.
                </div>
              </div>
            </div>

            {/* Panorama Grid */}
            <div className="self-stretch flex flex-col justify-start items-start">
              {isLoading ? (
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
                <div className="self-stretch grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-y-[60px]">
                  {images.map((image) => {
                    const imageUrl = image.preview_url || image.thumbnail_url || image.processed_url || image.original_url;
                    const latDMS = toDMS(image.latitude, true);
                    const lngDMS = toDMS(image.longitude, false);
                    const dateFormatted = image.date_taken ? formatDateMonthYear(image.date_taken) : '';
                    const locationFormatted = formatLocationForDisplay(image.location_name);

                    return (
                      <div
                        key={image.id}
                        className="w-full min-w-[400px] inline-flex flex-col justify-start items-start gap-1 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => router.push(`/panorama/${image.id}`)}
                      >
                        {/* Header with Title and Coordinates */}
                        <div className="self-stretch px-3 inline-flex justify-between items-center">
                          <div className="justify-start text-neutral-500 text-[10px] font-medium font-[var(--font-be-vietnam-pro)] whitespace-nowrap">
                            {image.title || 'Title'}
                          </div>
                          <div className="flex justify-start items-center gap-2">
                            <div className="justify-start text-neutral-500 text-[10px] font-medium font-[var(--font-be-vietnam-pro)] whitespace-nowrap">
                              {latDMS}
                            </div>
                            <div className="justify-start text-neutral-500 text-[10px] font-medium font-[var(--font-be-vietnam-pro)] whitespace-nowrap">
                              {lngDMS}
                            </div>
                          </div>
                        </div>

                        {/* Image */}
                        <img
                          className="w-full"
                          src={imageUrl}
                          alt={image.title || image.description || 'Panorama image'}
                          style={{ display: 'block', height: 'auto', objectFit: 'contain' }}
                        />

                        {/* Footer with Location and Date */}
                        <div className="self-stretch px-3 inline-flex justify-between items-center">
                          <div className="justify-start text-neutral-500 text-[10px] font-medium font-[var(--font-be-vietnam-pro)] whitespace-nowrap">
                            {locationFormatted || 'Location'}
                          </div>
                          <div className="justify-start text-neutral-500 text-[10px] font-medium font-[var(--font-be-vietnam-pro)] whitespace-nowrap">
                            {dateFormatted || 'Date'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="self-stretch flex flex-col justify-start items-center">
          <div className="self-stretch h-36 px-3 pt-3 pb-24 border-t border-neutral-300 flex flex-col justify-start items-start gap-3">
            <div className="self-stretch min-w-36 justify-start text-neutral-500 text-xs font-bold leading-4 font-[var(--font-inconsolata)]">
              Developed by Lassor
            </div>
            <div className="self-stretch flex flex-col justify-start items-start gap-1">
              <div className="self-stretch justify-start text-neutral-500 text-xs font-medium leading-4 font-[var(--font-inconsolata)]">
                www.Lassor.com
              </div>
              <div className="w-56 justify-start text-neutral-500 text-xs font-medium leading-4 font-[var(--font-inconsolata)]">
                Feasley@Lassor.com
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
