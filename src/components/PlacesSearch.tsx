import React, { useState, useEffect } from 'react';
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
  };
}

interface PlacesSearchProps {
  mapCenter: [number, number];
  onPlaceSelect: (lat: number, lon: number, name: string) => void;
}

const CATEGORIES = [
  { id: 'catering.restaurant', label: 'Restaurants', icon: Utensils },
  { id: 'catering.cafe', label: 'Cafes', icon: Coffee },
  { id: 'service.fuel', label: 'Gas Stations', icon: Fuel },
  { id: 'commercial.shopping_mall', label: 'Shopping', icon: ShoppingBag },
];

export default function PlacesSearch({ mapCenter, onPlaceSelect }: PlacesSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;

  const fetchPlaces = async (category: string) => {
    if (!apiKey) return;
    setIsLoading(true);
    setSelectedCategory(category);
    try {
      const [lat, lon] = mapCenter;
      const url = `https://api.geoapify.com/v2/places?categories=${category}&filter=circle:${lon},${lat},5000&bias=proximity:${lon},${lat}&limit=10&apiKey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features) {
        setPlaces(data.features);
      }
    } catch (error) {
      console.error('Places search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="absolute bottom-20 right-4 z-10 flex flex-col items-end gap-2">
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

            <div className="p-2 grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => fetchPlaces(cat.id)}
                  className={cn(
                    "flex flex-col items-center justify-center p-2 rounded-xl border transition-all",
                    selectedCategory === cat.id 
                      ? "bg-blue-50 border-blue-300 text-blue-700" 
                      : "bg-gray-50 border-gray-100 text-gray-600 hover:bg-white hover:border-blue-200"
                  )}
                >
                  <cat.icon className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-medium">{cat.label}</span>
                </button>
              ))}
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
                    onClick={() => onPlaceSelect(place.properties.lat, place.properties.lon, place.properties.name || place.properties.formatted)}
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

      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all",
          isOpen ? "bg-blue-600 text-white rotate-90" : "bg-white text-blue-600 hover:scale-110"
        )}
      >
        <Search className="w-6 h-6" />
      </button>
    </div>
  );
}
