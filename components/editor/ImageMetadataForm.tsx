'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { PanoramaImage } from '@/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

// Dynamically import SearchBox to avoid SSR issues
// SearchBox is the correct component for geocoding with coordinates
const SearchBox = dynamic(
  () => import('@mapbox/search-js-react').then((mod) => mod.SearchBox),
  { 
    ssr: false,
    loading: () => <Input id="location" type="text" placeholder="Loading location search..." disabled />
  }
);

interface ImageMetadataFormProps {
  metadata: Partial<PanoramaImage>;
  onChange: (metadata: Partial<PanoramaImage>) => void;
  existingTags: string[];
}

// Country list with ISO codes
const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'BQ', name: 'Caribbean Netherlands', flag: '🇧🇶' },
  { code: 'CW', name: 'Curaçao', flag: '🇨🇼' },
  { code: 'SX', name: 'Sint Maarten', flag: '🇸🇽' },
  { code: 'AW', name: 'Aruba', flag: '🇦🇼' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧' },
  { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹' },
  { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷' },
  { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
  { code: 'HT', name: 'Haiti', flag: '🇭🇹' },
  { code: 'KY', name: 'Cayman Islands', flag: '🇰🇾' },
  { code: 'VG', name: 'British Virgin Islands', flag: '🇻🇬' },
  { code: 'VI', name: 'US Virgin Islands', flag: '🇻🇮' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'RU', name: 'Russia', flag: '🇷🇺' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦' },
  { code: 'IS', name: 'Iceland', flag: '🇮🇸' },
];

export function ImageMetadataForm({ metadata, onChange, existingTags }: ImageMetadataFormProps) {
  const [locationInput, setLocationInput] = useState(metadata.location_name || '');
  const [tagInput, setTagInput] = useState((metadata.tags || []).join(', '));
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState('US');
  const [countrySearch, setCountrySearch] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const countryDropdownRef = useRef<HTMLDivElement>(null);

  // Prefill with test data on mount
  useEffect(() => {
    if (!metadata.title && !metadata.location_name && !metadata.description && !metadata.date_taken) {
      const today = new Date().toISOString().split('T')[0];
      onChange({
        title: 'Walking Forward Panorama',
        location_name: 'San Francisco, CA',
        latitude: 37.7749,
        longitude: -122.4194,
        description: 'A beautiful walking panorama capturing the essence of the city streets.',
        date_taken: today,
        tags: ['urban', 'city', 'walking'],
        status: 'draft',
      });
      setLocationInput('San Francisco, CA');
      setTagInput('urban, city, walking');
    }
  }, []);

  // Update tag suggestions based on input
  useEffect(() => {
    if (tagInput.trim()) {
      const inputTags = tagInput.split(',').map(t => t.trim().toLowerCase());
      const lastTag = inputTags[inputTags.length - 1];
      if (lastTag) {
        const suggestions = existingTags
          .filter(tag => tag.toLowerCase().startsWith(lastTag.toLowerCase()))
          .filter(tag => !inputTags.includes(tag.toLowerCase()))
          .slice(0, 5);
        setTagSuggestions(suggestions);
      } else {
        setTagSuggestions([]);
      }
    } else {
      setTagSuggestions([]);
    }
  }, [tagInput, existingTags]);

  // Check if Mapbox token is available on mount
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    console.log('🗺️ Mapbox SearchBox component mounted');
    console.log('🗺️ Mapbox token available:', !!token);
    console.log('🗺️ Mapbox token length:', token?.length || 0);
  }, []);

  // Sync locationInput when metadata.location_name changes externally
  useEffect(() => {
    if (metadata.location_name && metadata.location_name !== locationInput) {
      setLocationInput(metadata.location_name);
    }
  }, [metadata.location_name]);

  // Update map preview when coordinates change
  useEffect(() => {
    if (metadata.latitude && metadata.longitude && mapContainerRef.current) {
      // Simple static map preview using Mapbox Static Images API
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (mapboxToken) {
        const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+ff0000(${metadata.longitude},${metadata.latitude})/${metadata.longitude},${metadata.latitude},12,0/300x200@2x?access_token=${mapboxToken}`;
        if (mapContainerRef.current) {
          mapContainerRef.current.innerHTML = `<img src="${mapUrl}" alt="Location map" className="w-full h-full object-cover rounded-md" />`;
        }
      }
    }
  }, [metadata.latitude, metadata.longitude]);

  const handleLocationRetrieve = (retrieveResponse: any) => {
    console.log('Location retrieve response received:', retrieveResponse);
    console.log('Full response structure:', JSON.stringify(retrieveResponse, null, 2));
    
    // Handle different response formats from AddressAutofill retrieve
    // The retrieve response should be a FeatureCollection
    let feature = null;
    let coordinates: number[] = [];
    let locationName = '';
    
    // The retrieve response should be a FeatureCollection
    // Check if it's directly a FeatureCollection
    if (retrieveResponse?.type === 'FeatureCollection' && retrieveResponse?.features && retrieveResponse.features.length > 0) {
      feature = retrieveResponse.features[0];
    } 
    // Check if it's wrapped in a response object
    else if (retrieveResponse?.features && Array.isArray(retrieveResponse.features) && retrieveResponse.features.length > 0) {
      feature = retrieveResponse.features[0];
    }
    // Check if it has a feature property (single feature response)
    else if (retrieveResponse?.feature) {
      feature = retrieveResponse.feature;
    } 
    // Check if it's already a feature
    else if (retrieveResponse?.geometry || retrieveResponse?.properties || retrieveResponse?.center) {
      feature = retrieveResponse;
    }
    // Check if it's wrapped in a suggestion object
    else if (retrieveResponse?.suggestion) {
      const suggestion = retrieveResponse.suggestion;
      if (suggestion.feature) {
        feature = suggestion.feature;
      } else if (suggestion.geometry || suggestion.properties || suggestion.center) {
        feature = suggestion;
      }
    }
    
    // Extract from feature if we have one
    if (feature) {
      const properties = feature.properties || {};
      const geometry = feature.geometry;
      
      // Extract location name - try multiple possible property names
      locationName = properties.full_address || 
                    properties.place_name || 
                    properties.name || 
                    properties.text ||
                    properties.address ||
                    feature.place_name ||
                    feature.name ||
                    '';
      
      // Extract coordinates - Mapbox can provide them in different ways:
      // 1. geometry.coordinates (for Point geometry) - [lng, lat]
      // 2. center property (common in Mapbox responses) - [lng, lat]
      // 3. geometry.coordinates for other geometry types
      
      // First, try the center property (most common in Mapbox Search API)
      if (feature.center && Array.isArray(feature.center) && feature.center.length >= 2) {
        coordinates = feature.center;
        console.log('✅ Using center property:', coordinates);
      }
      // Then try geometry.coordinates
      else if (geometry?.coordinates && Array.isArray(geometry.coordinates)) {
        // For Point geometry, coordinates is [lng, lat]
        if (geometry.type === 'Point' && geometry.coordinates.length >= 2) {
          coordinates = geometry.coordinates;
          console.log('✅ Using Point geometry coordinates:', coordinates);
        } else if (geometry.coordinates[0] && Array.isArray(geometry.coordinates[0])) {
          // Multi-point or polygon - take first coordinate
          coordinates = geometry.coordinates[0];
          console.log('✅ Using first coordinate from multi-point geometry:', coordinates);
        } else {
          coordinates = geometry.coordinates;
          console.log('✅ Using geometry coordinates:', coordinates);
        }
      } 
      // Try properties.center as fallback
      else if (properties.center && Array.isArray(properties.center) && properties.center.length >= 2) {
        coordinates = properties.center;
        console.log('✅ Using properties.center:', coordinates);
      }
      // Last resort: try lng/lat properties
      else if (geometry?.lng !== undefined && geometry?.lat !== undefined) {
        coordinates = [geometry.lng, geometry.lat];
        console.log('✅ Using geometry lng/lat:', coordinates);
      }
      
      console.log('📊 Extracted from feature:', {
        locationName,
        coordinates,
        geometryType: geometry?.type,
        hasProperties: !!properties,
        hasGeometry: !!geometry,
        hasCenter: !!feature.center
      });
    }
    
    // Parse coordinates
    const [lng, lat] = coordinates.length >= 2 ? coordinates : [0, 0];
    
    // Validate coordinates (check if they're valid lat/lng values)
    const isValidLat = lat >= -90 && lat <= 90;
    const isValidLng = lng >= -180 && lng <= 180;
    
    if (!isValidLat || !isValidLng || (lat === 0 && lng === 0)) {
      console.warn('❌ Could not extract valid coordinates from retrieve response:', {
        retrieveResponse,
        feature,
        coordinates,
        locationName,
        isValidLat,
        isValidLng
      });
      return;
    }
    
    // Get the location name from the input field (AddressAutofill should have filled it)
    const inputElement = document.getElementById('location') as HTMLInputElement;
    const inputValue = inputElement?.value || locationName || locationInput;
    
    // Update state
    setLocationInput(inputValue);
    
    onChange({
      ...metadata,
      location_name: inputValue,
      latitude: lat,
      longitude: lng,
    });
    
    console.log('🎉 Location successfully updated:', {
      locationName: inputValue,
      latitude: lat,
      longitude: lng
    });
  };

  const handleTagChange = (value: string) => {
    setTagInput(value);
    const tags = value
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    onChange({
      ...metadata,
      tags,
    });
  };

  const handleTagSuggestionClick = (suggestion: string) => {
    const currentTags = tagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const lastTagIndex = tagInput.lastIndexOf(',');
    const beforeLastTag = lastTagIndex >= 0 ? tagInput.substring(0, lastTagIndex + 1) : '';
    const newTagInput = beforeLastTag + (beforeLastTag ? ' ' : '') + suggestion;
    handleTagChange(newTagInput);
    setTagSuggestions([]);
  };

  // Filter countries based on search
  const filteredCountries = COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    country.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  // Close country dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target as Node)) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Image Metadata</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Location Section */}
        <div className="space-y-3">
          <Label htmlFor="location">Location *</Label>
          
          {/* Country Selector - Searchable Combobox */}
          <div className="space-y-2">
            <Label htmlFor="country" className="text-xs text-muted-foreground">Country</Label>
            <div className="relative" ref={countryDropdownRef}>
              <button
                type="button"
                onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span>
                  {COUNTRIES.find(c => c.code === selectedCountry)?.flag}{' '}
                  {COUNTRIES.find(c => c.code === selectedCountry)?.name}
                </span>
                <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {showCountryDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-hidden">
                  <div className="p-2 border-b border-border sticky top-0 bg-popover">
                    <Input
                      type="text"
                      placeholder="Search countries..."
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-64">
                    {filteredCountries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => {
                          setSelectedCountry(country.code);
                          setShowCountryDropdown(false);
                          setCountrySearch('');
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2 ${
                          selectedCountry === country.code ? 'bg-accent' : ''
                        }`}
                      >
                        <span className="text-lg">{country.flag}</span>
                        <span>{country.name}</span>
                        {selectedCountry === country.code && (
                          <svg className="ml-auto h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No countries found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="location" className="text-xs text-muted-foreground">Address / Place</Label>
            {process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ? (
              <SearchBox
                accessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
                onRetrieve={(retrieveResponse) => {
                  try {
                    console.log('✅✅✅ SearchBox onRetrieve callback fired! ✅✅✅');
                    console.log('Retrieve response:', retrieveResponse);
                    console.log('Response type:', typeof retrieveResponse);
                    console.log('Response keys:', retrieveResponse ? Object.keys(retrieveResponse) : 'null');
                    console.log('Full response JSON:', JSON.stringify(retrieveResponse, null, 2));
                    handleLocationRetrieve(retrieveResponse);
                  } catch (error) {
                    console.error('❌ Error in onRetrieve callback:', error);
                  }
                }}
                placeholder="Search for a location..."
                options={{
                  language: 'en',
                  country: selectedCountry,
                  types: 'address,poi,place,locality,neighborhood,district,postcode,region',
                  limit: 10,
                }}
              />
            ) : (
              <div className="space-y-1">
                <Input
                  id="location"
                  type="text"
                  placeholder="Enter location manually (e.g., San Francisco, CA)"
                  value={locationInput}
                  onChange={(e) => {
                    setLocationInput(e.target.value);
                    onChange({
                      ...metadata,
                      location_name: e.target.value,
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  💡 Add <code className="text-xs bg-muted px-1 rounded">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to enable location autocomplete
                </p>
              </div>
            )}
            {metadata.latitude && metadata.longitude && (
              <div className="h-48 w-full rounded-md overflow-hidden border border-border bg-muted">
                <div ref={mapContainerRef} className="w-full h-full" />
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Coordinates: {metadata.latitude?.toFixed(4)}, {metadata.longitude?.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Title Section */}
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            type="text"
            placeholder="Enter a title for this image..."
            value={metadata.title || ''}
            onChange={(e) => onChange({ ...metadata, title: e.target.value })}
            required
          />
        </div>

        {/* Description Section */}
        <div className="space-y-2">
          <Label htmlFor="description">Description (Instagram Caption) *</Label>
          <Textarea
            id="description"
            placeholder="Enter a description for this image..."
            value={metadata.description || ''}
            onChange={(e) => onChange({ ...metadata, description: e.target.value })}
            rows={4}
            required
          />
        </div>

        {/* Date Taken Section */}
        <div className="space-y-2">
          <Label htmlFor="date_taken">Date Taken *</Label>
          <Input
            id="date_taken"
            type="date"
            value={metadata.date_taken || new Date().toISOString().split('T')[0]}
            onChange={(e) => onChange({ ...metadata, date_taken: e.target.value })}
            required
          />
        </div>

        {/* Tags Section */}
        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma-separated) *</Label>
          <div className="relative">
            <Input
              id="tags"
              type="text"
              placeholder="urban, city, walking..."
              value={tagInput}
              onChange={(e) => handleTagChange(e.target.value)}
              required
            />
            {tagSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg">
                {tagSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleTagSuggestionClick(suggestion)}
                    className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {metadata.tags?.length || 0} tag(s) added
          </div>
        </div>

        {/* Status Section */}
        <div className="space-y-2">
          <Label htmlFor="status">Status *</Label>
          <Select
            id="status"
            value={metadata.status || 'draft'}
            onChange={(e) => onChange({ ...metadata, status: e.target.value as PanoramaImage['status'] })}
            required
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="posted">Posted</option>
            <option value="private">Private</option>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

