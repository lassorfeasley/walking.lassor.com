'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  const router = useRouter();
  const [image, setImage] = useState<PanoramaImage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-white flex items-center justify-center">
        <p className="text-neutral-500 text-xs font-medium font-mono">Loading panorama...</p>
      </div>
    );
  }

  if (error || !image) {
    return (
      <div className="w-full min-h-screen bg-white flex items-center justify-center">
        <p className="text-neutral-500 text-xs font-medium font-mono">{error || 'Image not found'}</p>
      </div>
    );
  }

  const imageUrl = image.preview_url || image.processed_url || image.original_url;
  const latDMS = toDMS(image.latitude, true);
  const lngDMS = toDMS(image.longitude, false);
  const dateFormatted = image.date_taken ? formatDateMonthYear(image.date_taken) : '';
  const locationFormatted = formatLocationForDisplay(image.location_name);

  return (
    <div className="w-full bg-white flex flex-col min-h-screen">
      {/* Content Section */}
      <div className="flex-1 flex flex-col gap-10">
        {/* Breadcrumb */}
        <div className="self-stretch px-3 pt-10 bg-white flex flex-col justify-start items-start gap-5">
          <div className="justify-start text-black text-[8px] font-extrabold font-mono">
            lassor.com → Walking forward → {image.title}
          </div>
        </div>

        {/* Image Content */}
        <div className="self-stretch flex flex-col justify-start items-start gap-3">
          {/* Title and Coordinates */}
          <div className="self-stretch px-3 flex justify-between items-center">
            <div className="justify-start text-neutral-700 text-2xl font-extralight font-mono">
              {image.title}
            </div>
            <div className="flex justify-start items-center gap-5">
              <div className="justify-start text-neutral-700 text-2xl font-extralight font-mono">
                {latDMS}
              </div>
              <div className="justify-start text-neutral-600 text-2xl font-extralight font-mono">
                {lngDMS}
              </div>
            </div>
          </div>

          {/* Main Image */}
          <img
            className="self-stretch h-80 object-contain"
            src={imageUrl}
            alt={image.title || 'Panorama image'}
          />

          {/* Location and Date */}
          <div className="self-stretch px-3 flex justify-between items-center">
            <div className="justify-start text-neutral-600 text-2xl font-extralight font-mono">
              {locationFormatted}
            </div>
            <div className="justify-start text-neutral-600 text-2xl font-extralight font-mono">
              {dateFormatted}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="self-stretch px-3 flex justify-start items-center gap-2.5">
          <div className="w-96 justify-start text-neutral-500 text-xs font-medium font-mono leading-4">
            {image.description}
          </div>
        </div>
      </div>

      {/* Footer */}
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

