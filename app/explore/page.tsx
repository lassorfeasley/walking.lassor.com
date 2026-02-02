'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import { SearchDialog } from '@/components/SearchDialog';
import { CloudUpload } from 'lucide-react';
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

interface PanoramaFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    title: string;
    location_name: string;
    thumbnail_url: string | null;
    date_taken: string;
  };
}

interface GeoJSONResponse {
  type: 'FeatureCollection';
  features: PanoramaFeature[];
}

export default function ExplorePage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const minZoomLevel = useRef<number>(1.5); // Track min allowed zoom (can't zoom out past initial)
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [centerCoords, setCenterCoords] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });

  // Update center coordinates when map moves
  const handleMapMove = useCallback(() => {
    if (map.current) {
      const center = map.current.getCenter();
      setCenterCoords({ lat: center.lat, lng: center.lng });
    }
  }, []);

  useEffect(() => {
    if (!mapContainer.current) return;

    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      setError('Mapbox access token not configured');
      setIsLoading(false);
      return;
    }

    mapboxgl.accessToken = accessToken;

    // Initialize the map with globe projection - custom contour style
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      // Empty style = no borders, no labels, no roads
      style: {
        version: 8,
        sources: {},
        layers: [],
      },
      projection: 'globe',
      zoom: 1.5,
      center: [0, 20],
      pitch: 0,
      scrollZoom: false, // Disable default scroll zoom (we'll handle it manually)
      doubleClickZoom: false, // Disable double-click zoom in
    });

    const mapInstance = map.current;

    // Listen for map movement to update coordinates
    mapInstance.on('move', handleMapMove);
    // Set initial coordinates
    handleMapMove();

    // Custom wheel handler: only allow zooming OUT (never in - that's only via cluster clicks)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentZoom = mapInstance.getZoom();
      
      // deltaY > 0 means scrolling down = zoom out (allowed down to minZoomLevel)
      // deltaY < 0 means scrolling up = zoom in (NEVER allowed via scroll)
      if (e.deltaY > 0) {
        // Zooming out - only allowed down to minZoomLevel
        const newZoom = Math.max(currentZoom - 0.5, minZoomLevel.current);
        if (newZoom < currentZoom) {
          mapInstance.easeTo({ zoom: newZoom, duration: 150 });
        }
      }
      // Zoom in via scroll is completely disabled - only cluster clicks can zoom in
    };

    const containerEl = mapContainer.current;
    containerEl.addEventListener('wheel', handleWheel, { passive: false });

    mapInstance.on('load', async () => {
      try {

        // Add mapbox streets source for water
        mapInstance.addSource('mapbox-streets', {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-streets-v8',
        });

        // Land base - white fill
        mapInstance.addLayer({
          id: 'land',
          type: 'background',
          paint: {
            'background-color': '#f2f2f2', // light grey
          },
        });

        // Water layer - near white
        mapInstance.addLayer({
          id: 'water',
          type: 'fill',
          source: 'mapbox-streets',
          'source-layer': 'water',
          paint: {
            'fill-color': '#e5e5e5', // slightly darker grey
          },
        });

        // Add source for polar cap cover (covers distorted Arctic rendering)
        mapInstance.addSource('north-pole-cover', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-180, 78], [180, 78], [180, 90], [-180, 90], [-180, 78]
              ]],
            },
            properties: {},
          },
        });

        // Cover the North Pole distortion (placed after water layer)
        mapInstance.addLayer({
          id: 'north-pole-cover',
          type: 'fill',
          source: 'north-pole-cover',
          paint: {
            'fill-color': '#e5e5e5', // match water color since it's mostly ocean
          },
        });

        // Add terrain source for contours
        mapInstance.addSource('terrain', {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-terrain-v2',
        });

        // Contour lines - the main visual element
        mapInstance.addLayer({
          id: 'contours',
          type: 'line',
          source: 'terrain',
          'source-layer': 'contour',
          paint: {
            'line-color': '#a0a0a0', // medium gray
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 0.3,
              5, 0.5,
              10, 0.7,
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, ['case', ['==', ['%', ['get', 'ele'], 500], 0], 0.8, 0.3],
              5, ['case', ['==', ['%', ['get', 'ele'], 500], 0], 1.2, 0.5],
              10, ['case', ['==', ['%', ['get', 'ele'], 500], 0], 1.5, 0.7],
            ],
          },
        });

        // Coastline emphasis
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

        // Fetch panorama locations
        const response = await fetch('/api/locations');
        if (!response.ok) {
          throw new Error('Failed to fetch locations');
        }
        const data: GeoJSONResponse = await response.json();

        // Calculate average coordinates and center the globe
        if (data.features.length > 0) {
          let totalLng = 0;
          let totalLat = 0;
          data.features.forEach((feature) => {
            totalLng += feature.geometry.coordinates[0];
            totalLat += feature.geometry.coordinates[1];
          });
          const avgLng = totalLng / data.features.length;
          const avgLat = totalLat / data.features.length;
          
          mapInstance.flyTo({
            center: [avgLng, avgLat],
            duration: 1500,
          });
        }

        // Create Phosphor Fill MapTrifold icon for clusters - desaturated green with grey stroke
        const clusterSize = 24;
        const clusterSvg = `
          <svg width="${clusterSize}" height="${clusterSize}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
            <path d="M232,56v144a8,8,0,0,1-5.94,7.76l-64,16a8,8,0,0,1-1.94.24,8.15,8.15,0,0,1-3.58-.84L95.07,192.24,33.94,207.76A8,8,0,0,1,24,200V56a8,8,0,0,1,5.94-7.76l64-16a8,8,0,0,1,5.52.6l61.35,30.68,61.13-15.28a8,8,0,0,1,6.86,1.45A8,8,0,0,1,232,56Z" fill="#70a070" stroke="#707070" stroke-width="8"/>
            <path d="M96,176V48l64,40V216Z" fill="#ffffff"/>
          </svg>
        `;
        const clusterImg = new Image(clusterSize, clusterSize);
        clusterImg.onload = () => {
          if (!mapInstance.hasImage('phosphor-map')) {
            mapInstance.addImage('phosphor-map', clusterImg);
          }
        };
        clusterImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clusterSvg);

        // Create Phosphor PushPin icon - desaturated red with grey border
        const pinSize = 24;
        const pinSvg = `
          <svg width="${pinSize}" height="${pinSize}" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
            <path d="M235.32,81.37,174.63,20.69a16,16,0,0,0-22.63,0L98.37,74.49c-10.66-3.34-35-7.37-60.4,13.14a16,16,0,0,0-1.29,23.78L85,159.71,42.34,202.34a8,8,0,0,0,11.32,11.32L96.29,171l48.29,48.29A16,16,0,0,0,155.9,224c.38,0,.75,0,1.13,0a15.93,15.93,0,0,0,11.64-6.33c19.64-26.1,17.75-47.32,13.19-60L235.33,104A16,16,0,0,0,235.32,81.37Z" fill="#b07070"/>
            <path d="M235.32,81.37,174.63,20.69a16,16,0,0,0-22.63,0L98.37,74.49c-10.66-3.34-35-7.37-60.4,13.14a16,16,0,0,0-1.29,23.78L85,159.71,42.34,202.34a8,8,0,0,0,11.32,11.32L96.29,171l48.29,48.29A16,16,0,0,0,155.9,224c.38,0,.75,0,1.13,0a15.93,15.93,0,0,0,11.64-6.33c19.64-26.1,17.75-47.32,13.19-60L235.33,104A16,16,0,0,0,235.32,81.37ZM224,92.69h0l-57.27,57.46a8,8,0,0,0-1.49,9.22c9.46,18.93-1.8,38.59-9.34,48.62L48,100.08c12.08-9.74,23.64-12.31,32.48-12.31A40.13,40.13,0,0,1,96.81,91a8,8,0,0,0,9.25-1.51L163.32,32,224,92.68Z" fill="#707070"/>
          </svg>
        `;
        const pinImg = new Image(pinSize, pinSize);
        pinImg.onload = () => {
          if (!mapInstance.hasImage('phosphor-pin')) {
            mapInstance.addImage('phosphor-pin', pinImg);
          }
        };
        pinImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSvg);

        // Add the source for panorama locations
        mapInstance.addSource('panoramas', {
          type: 'geojson',
          data: data,
          cluster: true,
          clusterMaxZoom: 14, // Continue clustering until zoom 14 for multi-level
          clusterRadius: 40, // Cluster pins within 40px of each other
        });

        // Add clustered points - Phosphor Duotone Map icon
        mapInstance.addLayer({
          id: 'clusters',
          type: 'symbol',
          source: 'panoramas',
          filter: ['has', 'point_count'],
          layout: {
            'icon-image': 'phosphor-map',
            'icon-size': 0.85,
            'icon-allow-overlap': true,
          },
        });

        // Add individual pins - Phosphor Duotone PushPin icon
        mapInstance.addLayer({
          id: 'unclustered-point',
          type: 'symbol',
          source: 'panoramas',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'icon-image': 'phosphor-pin',
            'icon-size': 0.85,
            'icon-allow-overlap': true,
          },
        });

        // Click handler for clusters - zoom in to spread points across screen
        mapInstance.on('click', 'clusters', (e) => {
          const features = mapInstance.queryRenderedFeatures(e.point, {
            layers: ['clusters'],
          });
          if (!features.length) return;
          
          const clusterId = features[0].properties?.cluster_id;
          const source = mapInstance.getSource('panoramas') as mapboxgl.GeoJSONSource;
          
          // Get all points in this cluster to calculate bounds
          source.getClusterLeaves(clusterId, 100, 0, (err, leaves) => {
            if (err || !leaves || leaves.length === 0) return;
            
            // Calculate bounding box of all points in cluster
            let minLng = Infinity, maxLng = -Infinity;
            let minLat = Infinity, maxLat = -Infinity;
            
            leaves.forEach((leaf) => {
              if (leaf.geometry.type === 'Point') {
                const [lng, lat] = leaf.geometry.coordinates;
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
              }
            });
            
            // Fit map to bounds with padding for nice spacing
            mapInstance.fitBounds(
              [[minLng, minLat], [maxLng, maxLat]],
              {
                padding: { top: 100, bottom: 100, left: 100, right: 100 },
                maxZoom: 16,
                duration: 500,
              }
            );
          });
        });

        // Click handler for individual points - handle overlapping pins
        const selectionPopup = new mapboxgl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 15,
          className: 'selection-popup',
        });

        mapInstance.on('click', 'unclustered-point', (e) => {
          if (!e.features?.length) return;
          
          // Query ALL features at this point, not just the top one
          const allFeatures = mapInstance.queryRenderedFeatures(e.point, {
            layers: ['unclustered-point'],
          });
          
          if (allFeatures.length === 1) {
            // Single pin - navigate directly
            const properties = allFeatures[0].properties;
            if (properties?.id) {
              router.push(`/panorama/${properties.id}`);
            }
          } else if (allFeatures.length > 1) {
            // Multiple overlapping pins - show selection popup
            const coordinates = e.lngLat;
            
            const listItems = allFeatures.map((feature) => {
              const props = feature.properties;
              const thumbnailUrl = props?.thumbnail_url || '';
              return `
                <div 
                  class="selection-item" 
                  data-id="${props?.id || ''}"
                  style="cursor: pointer; transition: opacity 0.15s;"
                  onmouseover="this.style.opacity='0.8'"
                  onmouseout="this.style.opacity='1'"
                >
                  <img 
                    src="${thumbnailUrl}" 
                    alt="${props?.title || 'Panorama'}"
                    style="width: 100%; height: 60px; object-fit: cover; display: block;"
                  />
                </div>
              `;
            }).join('');
            
            selectionPopup
              .setLngLat(coordinates)
              .setHTML(`
                <div style="width: 150px; max-height: 250px; overflow-y: auto; margin: -10px -12px; display: flex; flex-direction: column; gap: 2px;">
                  ${listItems}
                </div>
              `)
              .addTo(mapInstance);
            
            // Add click handlers to list items after popup is added
            setTimeout(() => {
              const items = document.querySelectorAll('.selection-item');
              items.forEach((item) => {
                item.addEventListener('click', () => {
                  const id = item.getAttribute('data-id');
                  if (id) {
                    selectionPopup.remove();
                    router.push(`/panorama/${id}`);
                  }
                });
              });
            }, 0);
          }
        });

        // Change cursor on hover
        mapInstance.on('mouseenter', 'clusters', () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'clusters', () => {
          mapInstance.getCanvas().style.cursor = '';
        });
        mapInstance.on('mouseenter', 'unclustered-point', () => {
          mapInstance.getCanvas().style.cursor = 'pointer';
        });
        mapInstance.on('mouseleave', 'unclustered-point', () => {
          mapInstance.getCanvas().style.cursor = '';
        });

        // Add popup on hover for individual points
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 15,
          className: 'panorama-popup',
        });

        mapInstance.on('mouseenter', 'unclustered-point', (e) => {
          if (!e.features?.length) return;
          
          // Query ALL features at this point
          const allFeatures = mapInstance.queryRenderedFeatures(e.point, {
            layers: ['unclustered-point'],
          });
          
          const coordinates = e.lngLat;
          
          // Build image list for all features at this location
          const imageItems = allFeatures.map((feature) => {
            const props = feature.properties;
            const thumbnailUrl = props?.thumbnail_url || '';
            return `
              <img 
                src="${thumbnailUrl}" 
                alt="${props?.title || 'Panorama'}"
                style="width: 100%; height: 60px; object-fit: cover; display: block;"
              />
            `;
          }).join('');

          popup
            .setLngLat(coordinates)
            .setHTML(`
              <div style="width: 150px; max-height: 250px; overflow-y: auto; margin: -4px; display: flex; flex-direction: column; gap: 2px;">
                ${imageItems}
              </div>
            `)
            .addTo(mapInstance);
        });

        mapInstance.on('mouseleave', 'unclustered-point', () => {
          popup.remove();
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Error loading map data:', err);
        setError('Failed to load panorama locations');
        setIsLoading(false);
      }
    });

    // Cleanup
    return () => {
      containerEl.removeEventListener('wheel', handleWheel);
      mapInstance.off('move', handleMapMove);
      mapInstance.remove();
    };
  }, [router, handleMapMove]);

  return (
    <div className="w-full flex flex-col justify-start items-center bg-white min-h-screen">
      {/* Breadcrumb Header */}
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
          Explore
        </div>
        <div className="flex justify-start items-center gap-2">
          <Link
            href="/"
            className="justify-start text-neutral-400 text-base font-black cursor-pointer hover:text-neutral-600 transition-colors"
          >
            <i className="fas fa-grid-2"></i>
          </Link>
          <div className="justify-start text-neutral-600 text-base font-black">
            <i className="fas fa-globe"></i>
          </div>
          <SearchDialog />
        </div>
      </div>

      {/* Main Content - matching panorama page layout */}
      <div className="w-full flex flex-col justify-start items-center">
        <div className="w-full flex flex-col justify-start items-center mx-auto">
          <div className="self-stretch px-5 flex flex-col justify-start items-start">
            <div className="self-stretch pt-10 border-l border-r border-neutral-300 flex flex-col justify-start items-start gap-10">
              {/* Globe Section with top/bottom borders */}
              <div className="self-stretch border-t border-b border-neutral-300 flex flex-col justify-start items-start">
                {/* Top bar - Title and Coordinates */}
                <div className="self-stretch h-10 px-2 border-b border-neutral-300 inline-flex justify-between items-center">
                  <div className="text-neutral-700 text-base font-light font-[var(--font-be-vietnam-pro)]">
                    Explore
                  </div>
                  <div className="flex justify-start items-center gap-5">
                    <div className="text-neutral-700 text-base font-light font-[var(--font-be-vietnam-pro)]">
                      {toDMS(centerCoords.lat, true)}
                    </div>
                    <div className="text-neutral-600 text-base font-light font-[var(--font-be-vietnam-pro)]">
                      {toDMS(centerCoords.lng, false)}
                    </div>
                  </div>
                </div>

                {/* Map Container - viewport height minus header and bars */}
                <div className="w-full relative" style={{ height: 'calc(100vh - 180px)' }}>
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                      <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)]">
                        Loading map...
                      </p>
                    </div>
                  )}
                  {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                      <div className="text-center">
                        <p className="text-neutral-500 text-xs font-medium font-[var(--font-inconsolata)] mb-2">
                          {error}
                        </p>
                        <p className="text-neutral-400 text-[10px] font-[var(--font-be-vietnam-pro)]">
                          Make sure NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is set in your .env.local
                        </p>
                      </div>
                    </div>
                  )}
                  <div ref={mapContainer} className="w-full h-full" />
                </div>

                {/* Bottom bar */}
                <div className="self-stretch h-10 px-2 border-t border-neutral-300 inline-flex justify-between items-center">
                  <div className="text-neutral-600 text-base font-light font-[var(--font-be-vietnam-pro)]">
                    Planet Earth
                  </div>
                  <div className="text-neutral-600 text-base font-light font-[var(--font-be-vietnam-pro)]">
                    {/* Could add zoom level or other info here */}
                  </div>
                </div>
              </div>

              {/* Spacer section - matches description section on panorama pages */}
              <div className="self-stretch min-h-[500px] px-3 pt-3 border-t border-neutral-300">
                {/* Empty spacer to push footer below viewport */}
              </div>
            </div>
          </div>
        </div>
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

      {/* Custom popup styles */}
      <style jsx global>{`
        .mapboxgl-popup-content {
          padding: 4px;
          border-radius: 4px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.9);
          background: white;
        }
        .mapboxgl-popup-tip {
          display: none;
        }
      `}</style>
    </div>
  );
}
