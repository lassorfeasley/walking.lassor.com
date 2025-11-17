'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAllImages } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { format } from 'date-fns';
import { ArrowUp, Globe } from 'lucide-react';

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

// Determine variant based on index for visual variety
function getVariant(index: number): 'Default' | 'Variant2' | 'Variant3' {
  const pattern = index % 3;
  if (pattern === 0) return 'Default';
  if (pattern === 1) return 'Variant2';
  return 'Variant3';
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
    <div className="w-full flex flex-col min-h-screen bg-white">
      {/* Content Section - grows to fill available space */}
      <div className="flex-1 flex flex-col gap-10">
        {/* Header Section */}
        <div className="w-full p-10 bg-white flex justify-between items-start">
          <div className="flex-1 max-w-2xl inline-flex flex-col justify-start items-start gap-4">
            <div className="justify-start text-stone-900 text-2xl font-extralight font-mono">
              walking forward
            </div>
            <div className="self-stretch h-14 justify-start text-neutral-500 text-xs font-medium font-mono leading-4">
              Walking Forward documents Lassor's travels from an unconventional point of view. Each panel is a digital panoramic capture, creating a continuous record of motion. The work contrasts Lassor's fleeting movement through space with the enduring character of each place.
            </div>
          </div>
          <div className="size- flex justify-start items-end gap-4">
            <Link href="/signin" className="justify-start text-neutral-400 text-3xl font-black cursor-pointer hover:text-neutral-600 transition-colors">
              <ArrowUp className="w-8 h-8" />
            </Link>
            <div className="justify-start text-neutral-400 text-3xl font-black">
              <Globe className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Images Grid */}
        {isLoading ? (
          <div className="w-full flex justify-center items-center py-12">
            <p className="text-neutral-500 text-xs font-medium font-mono">Loading panoramas...</p>
          </div>
        ) : error ? (
          <div className="w-full flex justify-center items-center py-12">
            <p className="text-neutral-500 text-xs font-medium font-mono">{error}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="w-full flex justify-center items-center py-12">
            <p className="text-neutral-500 text-xs font-medium font-mono">No panoramas yet.</p>
          </div>
        ) : (
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-px">
            {images.map((image, index) => {
              const variant = getVariant(index);
              // Use optimized images for fast loading: preview for quality, thumbnail as fallback
              const imageUrl = image.preview_url || image.thumbnail_url || image.processed_url || image.original_url;
              const latDMS = toDMS(image.latitude, true);
              const lngDMS = toDMS(image.longitude, false);
              const dateFormatted = image.date_taken ? formatDateMonthYear(image.date_taken) : '';

              return (
                <div
                  key={image.id}
                  className="w-full flex flex-col cursor-pointer hover:opacity-90 transition-opacity bg-white"
                  onClick={() => router.push(`/panorama/${image.id}`)}
                >
                  {/* Header with Title and Coordinates */}
                  <div className="w-full px-3 py-1 flex justify-between items-center min-h-[20px]">
                    <div className="justify-start text-neutral-300 text-[8px] font-extrabold font-mono truncate flex-1">
                      {image.title || 'Title'}
                    </div>
                    <div className="flex justify-start items-center gap-2 flex-shrink-0 ml-2">
                      <div className="justify-start text-neutral-300 text-[8px] font-extrabold font-mono whitespace-nowrap">
                        {latDMS}
                      </div>
                      <div className="justify-start text-neutral-300 text-[8px] font-extrabold font-mono whitespace-nowrap">
                        {lngDMS}
                      </div>
                    </div>
                  </div>

                  {/* Image Container */}
                  <div className="w-full relative flex items-center justify-center bg-white">
                    {variant === 'Default' && (
                      <img
                        className="w-full h-auto object-contain"
                        src={imageUrl}
                        alt={image.title || image.description || 'Panorama image'}
                      />
                    )}
                    {variant === 'Variant2' && (
                      <div className="w-full relative">
                        <img
                          className="w-full h-auto object-contain relative z-10"
                          src={imageUrl}
                          alt={image.title || image.description || 'Panorama image'}
                        />
                        <img
                          className="w-full h-auto object-contain absolute top-0 left-0 opacity-50"
                          src={imageUrl}
                          alt={image.title || image.description || 'Panorama image'}
                        />
                      </div>
                    )}
                    {variant === 'Variant3' && (
                      <img
                        className="w-[calc(100%+8px)] h-auto object-contain -mx-1"
                        src={imageUrl}
                        alt={image.title || image.description || 'Panorama image'}
                      />
                    )}
                  </div>

                  {/* Footer with Location and Date */}
                  <div className="w-full px-3 py-1 flex justify-between items-center min-h-[20px]">
                    <div className="justify-start text-neutral-300 text-[8px] font-extrabold font-mono truncate flex-1">
                      {image.location_name || 'Location'}
                    </div>
                    <div className="justify-start text-neutral-300 text-[8px] font-extrabold font-mono whitespace-nowrap flex-shrink-0 ml-2">
                      {dateFormatted || 'Date'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Section - always at bottom */}
      <div className="w-full flex flex-col justify-start items-center mt-auto">
        <div className="w-full h-36 px-3 pt-3 pb-24 border-t border-neutral-300 flex flex-col justify-start items-start gap-3">
          <div className="self-stretch min-w-36 justify-start text-neutral-500 text-xs font-bold leading-4">
            Developed by Lassor
          </div>
          <div className="self-stretch flex flex-col justify-start items-start gap-1">
            <div className="self-stretch justify-start text-neutral-500 text-xs font-medium leading-4">
              www.Lassor.com
            </div>
            <div className="w-56 justify-start text-neutral-500 text-xs font-medium leading-4">
              Feasley@Lassor.com
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
