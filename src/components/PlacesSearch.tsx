import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Coffee, Fuel, Utensils, ShoppingBag, Info, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Place {
  properties: {
    name: string;
    formatted: string;
    categories: string[];
    lat: number;
    lon: number;
    place_id: string;
    contact?: {
      phone?: string;
      email?: string;
    };
    website?: string;
    opening_hours?: string;
    facilities?: {
      wheelchair?: string;
      parking?: string;
    };
  };
}

interface PlacesSearchProps {
  mapCenter: [number, number];
  onPlaceSelect: (lat: number, lon: number, name: string) => void;
}

const CATEGORIES = [
  { id: 'catering.restaurant', label: 'Restaurants', icon: 'restaurant', color: '#ff5722' },
  { id: 'service.fuel', label: 'Gas Stations', icon: 'gas_station', color: '#f44336' },
  { id: 'commercial.supermarket', label: 'Supermarkets', icon: 'shopping_cart', color: '#4caf50' },
  { id: 'accommodation.hotel', label: 'Hotels', icon: 'hotel', color: '#2196f3' },
  { id: 'entertainment.cinema', label: 'Cinemas', icon: 'movie', color: '#9c27b0' },
  { id: 'tourism.attraction', label: 'Attractions', icon: 'camera', color: '#ff9800' },
];

const CONDITIONS = [
  { id: 'wheelchair', label: 'Wheelchair', icon: 'accessible' },
  { id: 'internet_access', label: 'WiFi', icon: 'wifi' },
  { id: 'no_entry_fee', label: 'Free Entry', icon: 'money_off' },
];

export default function PlacesSearch({ mapCenter, onPlaceSelect }: PlacesSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [cache, setCache] = useState<Record<string, Place[]>>({});

  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
  const abortControllerRef = useRef<AbortController | null>(null);

  const toggleCondition = (conditionId: string) => {
    setSelectedConditions(prev => 
      prev.includes(conditionId) 
        ? prev.filter(id => id !== conditionId) 
        : [...prev, conditionId]
    );
  };

  const fetchPlaces = async (category: string) => {
    if (!apiKey) return;

    const [lat, lon] = mapCenter;
    const conditionsParam = selectedConditions.length > 0 ? `&conditions=${selectedConditions.join(',')}` : '';
    const cacheKey = `${category}-${conditionsParam}-${lat.toFixed(3)}-${lon.toFixed(3)}`;

    if (cache[cacheKey]) {
      setPlaces(cache[cacheKey]);
      setSelectedCategory(category);
      return;
    }

    setIsLoading(true);
    setSelectedCategory(category);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const url = `https://api.geoapify.com/v2/places?categories=${category}${conditionsParam}&filter=circle:${lon},${lat},5000&bias=proximity:${lon},${lat}&limit=20&apiKey=${apiKey}`;
      const response = await fetch(url, { signal: abortControllerRef.current.signal });
      const data = await response.json();
      if (data.features) {
        setPlaces(data.features);
        setCache(prev => ({ ...prev, [cacheKey]: data.features }));
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Places search error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPlaceDetails = async (placeId: string) => {
    if (!apiKey) return;
    setIsFetchingDetails(true);
    try {
      const url = `https://api.geoapify.com/v2/place-details?id=${placeId}&apiKey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        setSelectedPlace(data.features[0]);
      }
    } catch (error) {
      console.error('Place details error:', error);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handlePlaceClick = (place: Place) => {
    fetchPlaceDetails(place.properties.place_id);
  };

  return (
    <div className="absolute bottom-44 right-4 z-10 flex flex-col items-end gap-2">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white/90 backdrop-blur rounded-2xl shadow-2xl border border-gray-200 w-64 overflow-hidden mb-2"
          >
            <div className="p-3 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Search className="w-4 h-4" /> Nearby Places
              </h3>
              <button onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1">Categories</p>
              <div className="grid grid-cols-3 gap-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => fetchPlaces(cat.id)}
                    className={cn(
                      "flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all",
                      selectedCategory === cat.id 
                        ? "bg-blue-50 border-blue-300 text-blue-700" 
                        : "bg-gray-50 border-gray-100 text-gray-600 hover:bg-white hover:border-blue-200"
                    )}
                  >
                    <img 
                      src={`https://api.geoapify.com/v1/icon/?icon=${cat.icon}&color=${encodeURIComponent(cat.color)}&size=small&apiKey=${apiKey}`}
                      alt={cat.label}
                      className="w-5 h-5 mb-0.5"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-[9px] font-medium text-center leading-tight">{cat.label}</span>
                  </button>
                ))}
              </div>

              <p className="text-[10px] font-bold text-gray-400 uppercase mt-3 mb-2 px-1">Conditions</p>
              <div className="flex flex-wrap gap-1">
                {CONDITIONS.map((cond) => (
                  <button
                    key={cond.id}
                    onClick={() => toggleCondition(cond.id)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-full border text-[9px] font-medium transition-all",
                      selectedConditions.includes(cond.id)
                        ? "bg-green-50 border-green-300 text-green-700"
                        : "bg-gray-50 border-gray-100 text-gray-600 hover:bg-white"
                    )}
                  >
                    <img 
                      src={`https://api.geoapify.com/v1/icon/?icon=${cond.icon}&color=${selectedConditions.includes(cond.id) ? '%232e7d32' : '%23757575'}&size=small&apiKey=${apiKey}`}
                      alt={cond.label}
                      className="w-3 h-3"
                      referrerPolicy="no-referrer"
                    />
                    {cond.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto p-2 space-y-2 border-t border-gray-100">
              {isLoading ? (
                <div className="flex flex-col items-center py-4 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <span className="text-xs">Searching...</span>
                </div>
              ) : places.length > 0 ? (
                places.map((place) => (
                  <button
                    key={place.properties.place_id}
                    onClick={() => handlePlaceClick(place)}
                    className="w-full text-left p-2 rounded-lg hover:bg-blue-50 transition-colors group"
                  >
                    <div className="text-xs font-bold text-gray-800 group-hover:text-blue-700 truncate">
                      {place.properties.name || 'Unnamed Place'}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {place.properties.formatted}
                    </div>
                  </button>
                ))
              ) : selectedCategory ? (
                <div className="text-center py-4 text-xs text-gray-400 italic">
                  No places found nearby.
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-gray-400 italic">
                  Select a category to search.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlace && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-72 overflow-hidden mb-2 absolute bottom-0 right-72"
          >
            <div className="p-3 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold truncate pr-4">
                {selectedPlace.properties.name || 'Place Details'}
              </h3>
              <button onClick={() => setSelectedPlace(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <div className="text-xs text-gray-600">
                <p className="font-bold text-gray-800 mb-1">Address</p>
                <p>{selectedPlace.properties.formatted}</p>
              </div>

              {selectedPlace.properties.contact?.phone && (
                <div className="text-xs text-gray-600">
                  <p className="font-bold text-gray-800 mb-1">Phone</p>
                  <p>{selectedPlace.properties.contact.phone}</p>
                </div>
              )}

              {selectedPlace.properties.website && (
                <div className="text-xs text-gray-600">
                  <p className="font-bold text-gray-800 mb-1">Website</p>
                  <a 
                    href={selectedPlace.properties.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {selectedPlace.properties.website}
                  </a>
                </div>
              )}

              {selectedPlace.properties.opening_hours && (
                <div className="text-xs text-gray-600">
                  <p className="font-bold text-gray-800 mb-1">Opening Hours</p>
                  <p className="whitespace-pre-line">{selectedPlace.properties.opening_hours}</p>
                </div>
              )}

              <button
                onClick={() => {
                  onPlaceSelect(selectedPlace.properties.lat, selectedPlace.properties.lon, selectedPlace.properties.name || selectedPlace.properties.formatted);
                  setSelectedPlace(null);
                }}
                className="w-full bg-blue-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" />
                Go to this Place
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all overflow-hidden",
          isOpen ? "bg-blue-600 text-white rotate-90" : "bg-white text-blue-600 hover:scale-110"
        )}
      >
        <img 
          src={`https://api.geoapify.com/v2/icon/?type=material&color=${isOpen ? '%23ffffff' : '%232563eb'}&size=48&icon=search&iconType=material&noShadow&apiKey=${apiKey}`}
          alt="Search"
          className="w-8 h-8 object-contain"
          referrerPolicy="no-referrer"
        />
      </button>
    </div>
  );
}
