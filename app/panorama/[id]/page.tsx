'use client';

import { use, useRef } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getImageMetadata } from '@/lib/supabase/database';
import { PanoramaImage } from '@/types';
import { format } from 'date-fns';
import { SearchDialog } from '@/components/SearchDialog';
import { CloudUpload } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  const miniMapContainer = useRef<HTMLDivElement>(null);
  const miniMap = useRef<mapboxgl.Map | null>(null);

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

  // Initialize mini globe
  useEffect(() => {
    if (!miniMapContainer.current || !image || miniMap.current) return;

    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!accessToken) return;

    mapboxgl.accessToken = accessToken;

    miniMap.current = new mapboxgl.Map({
      container: miniMapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      projection: 'globe',
      zoom: 0.8,
      center: [image.longitude, image.latitude],
      pitch: 0,
      scrollZoom: false,
      doubleClickZoom: false,
    });

    const mapInstance = miniMap.current;

    mapInstance.on('load', () => {
      // Ensure globe projection is set
      mapInstance.setProjection('globe');
      
      // Add mapbox streets source for water
      mapInstance.addSource('mapbox-streets', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      });

      // Land base
      mapInstance.addLayer({
        id: 'land',
        type: 'background',
        paint: {
          'background-color': '#f2f2f2',
        },
      });

      // Water layer
      mapInstance.addLayer({
        id: 'water',
        type: 'fill',
        source: 'mapbox-streets',
        'source-layer': 'water',
        paint: {
          'fill-color': '#e5e5e5',
        },
      });

      // Add terrain source for contours
      mapInstance.addSource('terrain', {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2',
      });

      // Contour lines
      mapInstance.addLayer({
        id: 'contours',
        type: 'line',
        source: 'terrain',
        'source-layer': 'contour',
        paint: {
          'line-color': '#a0a0a0',
          'line-opacity': 0.4,
          'line-width': 0.5,
        },
      });

      // Coastline
      mapInstance.addLayer({
        id: 'coastline',
        type: 'line',
        source: 'mapbox-streets',
        'source-layer': 'water',
        paint: {
          'line-color': '#909090',
          'line-width': 1,
          'line-opacity': 0.8,
        },
      });

      // Create red pin marker SVG
      const pinSize = 24;
      const pinSvg = `
        <svg width="${pinSize}" height="${pinSize}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
          <path d="M235.32,81.37,174.63,20.69a16,16,0,0,0-22.63,0L98.37,74.49c-10.66-3.34-35-7.37-60.4,13.14a16,16,0,0,0-1.29,23.78L85,159.71,42.34,202.34a8,8,0,0,0,11.32,11.32L96.29,171l48.29,48.29A16,16,0,0,0,155.9,224c.38,0,.75,0,1.13,0a15.93,15.93,0,0,0,11.64-6.33c19.64-26.1,17.75-47.32,13.19-60L235.33,104A16,16,0,0,0,235.32,81.37Z" fill="#b07070"/>
          <path d="M235.32,81.37,174.63,20.69a16,16,0,0,0-22.63,0L98.37,74.49c-10.66-3.34-35-7.37-60.4,13.14a16,16,0,0,0-1.29,23.78L85,159.71,42.34,202.34a8,8,0,0,0,11.32,11.32L96.29,171l48.29,48.29A16,16,0,0,0,155.9,224c.38,0,.75,0,1.13,0a15.93,15.93,0,0,0,11.64-6.33c19.64-26.1,17.75-47.32,13.19-60L235.33,104A16,16,0,0,0,235.32,81.37ZM224,92.69h0l-57.27,57.46a8,8,0,0,0-1.49,9.22c9.46,18.93-1.8,38.59-9.34,48.62L48,100.08c12.08-9.74,23.64-12.31,32.48-12.31A40.13,40.13,0,0,1,96.81,91a8,8,0,0,0,9.25-1.51L163.32,32,224,92.68Z" fill="#707070"/>
        </svg>
      `;
      const pinImg = new Image(pinSize, pinSize);
      pinImg.onload = () => {
        if (!mapInstance.hasImage('red-pin')) {
          mapInstance.addImage('red-pin', pinImg);
        }

        // Add the single pin as a source and layer
        mapInstance.addSource('location-pin', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [image.longitude, image.latitude],
            },
            properties: {},
          },
        });

        mapInstance.addLayer({
          id: 'location-pin',
          type: 'symbol',
          source: 'location-pin',
          layout: {
            'icon-image': 'red-pin',
            'icon-size': 1,
            'icon-allow-overlap': true,
          },
        });
      };
      pinImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSvg);
    });

    return () => {
      if (miniMap.current) {
        miniMap.current.remove();
        miniMap.current = null;
      }
    };
  }, [image, isMobile]);

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
        <div className="flex justify-start items-center gap-2">
          <Link href="/explore" className="flex items-center text-neutral-400 text-base font-black cursor-pointer hover:text-neutral-600 transition-colors">
            <i className="fas fa-globe"></i>
          </Link>
          <SearchDialog />
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
              <div className="detail-mobile-description self-stretch min-h-[500px] px-3 pt-3 border-t border-neutral-300 flex flex-col justify-start items-start gap-2.5">
                <div className="w-full lg:w-1/2 xl:w-1/3 lg:min-w-[400px] max-w-[651px] flex flex-col justify-start items-start gap-1 text-neutral-500 text-xs font-medium font-[var(--font-be-vietnam-pro)] leading-5">
                  {image.description || 'No description available.'}
                </div>
                {/* Mini Globe - Mobile */}
                <div className="self-stretch mt-8">
                  <div 
                    ref={miniMapContainer} 
                    className="w-full aspect-square"
                  />
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

                <div className="detail-description-section self-stretch px-3 pt-3 pb-[200px] border-t border-neutral-300 flex flex-col justify-start items-start">
                  <div className="w-full lg:w-1/2 xl:w-1/3 lg:min-w-[400px] max-w-[651px] flex flex-col justify-start items-start gap-1 text-neutral-500 text-xs font-medium font-[var(--font-be-vietnam-pro)] leading-5 min-h-[200px]">
                    {image.description || 'No description available.'}
                  </div>
                  {/* Mini Globe */}
                  <div className="self-stretch flex justify-start mt-[40px]">
                    <div 
                      ref={miniMapContainer} 
                      className="w-[300px] h-[300px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="self-stretch flex flex-col justify-start items-center">
        <div className="self-stretch h-36 px-3 pt-3 pb-24 border-t border-neutral-300 inline-flex justify-between items-start gap-2">
          <div className="flex flex-col justify-start items-start gap-2">
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
          <Link href="/signin" className="text-neutral-400 cursor-pointer hover:text-neutral-600 transition-colors">
            <CloudUpload size={18} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </div>
  );
}

