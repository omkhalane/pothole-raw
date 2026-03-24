import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Navigation, X, ArrowRight, ShieldCheck, Clock, Map as MapIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Suggestion {
  properties: {
    formatted: string;
    lat: number;
    lon: number;
    place_id: string;
  };
}

interface NavigationPanelProps {
  onSearch: (source: [number, number], destination: [number, number]) => void;
  onCurrentLocation: () => void;
  isSearching: boolean;
  routeInfo: { distance: number; time: number; potholes: number } | null;
  avoidPotholes: boolean;
  onToggleAvoid: (val: boolean) => void;
}

export default function NavigationPanel({ 
  onSearch, 
  onCurrentLocation, 
  isSearching, 
  routeInfo,
  avoidPotholes,
  onToggleAvoid
}: NavigationPanelProps) {
  const [sourceText, setSourceText] = useState('');
  const [destText, setDestText] = useState('');
  const [sourceCoords, setSourceCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  
  const [sourceSuggestions, setSourceSuggestions] = useState<Suggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([]);
  const [activeInput, setActiveInput] = useState<'source' | 'dest' | null>(null);

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestions = async (text: string, type: 'source' | 'dest') => {
    if (!text || text.length < 3 || !apiKey) {
      type === 'source' ? setSourceSuggestions([]) : setDestSuggestions([]);
      return;
    }

    try {
      const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&apiKey=${apiKey}&limit=5`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features) {
        type === 'source' ? setSourceSuggestions(data.features) : setDestSuggestions(data.features);
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (activeInput === 'source') fetchSuggestions(sourceText, 'source');
    }, 300);
  }, [sourceText]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (activeInput === 'dest') fetchSuggestions(destText, 'dest');
    }, 300);
  }, [destText]);

  const handleSelectSuggestion = (suggestion: Suggestion, type: 'source' | 'dest') => {
    const { lat, lon, formatted } = suggestion.properties;
    if (type === 'source') {
      setSourceText(formatted);
      setSourceCoords([lat, lon]);
      setSourceSuggestions([]);
    } else {
      setDestText(formatted);
      setDestCoords([lat, lon]);
      setDestSuggestions([]);
    }
    setActiveInput(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceCoords && destCoords) {
      onSearch(sourceCoords, destCoords);
    } else {
      // Fallback geocode if they didn't pick from suggestions
      const sCoords = sourceCoords || await geocode(sourceText);
      const dCoords = destCoords || await geocode(destText);
      
      if (sCoords && dCoords) {
        onSearch(sCoords, dCoords);
      } else {
        alert('Please select locations from the suggestions or be more specific.');
      }
    }
  };

  const geocode = async (text: string): Promise<[number, number] | null> => {
    if (!apiKey) return null;
    try {
      const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&apiKey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        return [lat, lng];
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  const formatDistance = (meters: number) => {
    return meters > 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    return mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
  };

  return (
    <div className="absolute top-4 left-4 z-20 w-full max-w-md px-4 sm:px-0">
      <motion.div
        layout
        className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-visible"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-blue-600" />
              Smart Route Navigator
            </h2>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-visible"
              >
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="Starting point..."
                      value={sourceText}
                      onChange={(e) => {
                        setSourceText(e.target.value);
                        setSourceCoords(null);
                        setActiveInput('source');
                      }}
                      onFocus={() => setActiveInput('source')}
                      className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={onCurrentLocation}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Use current location"
                    >
                      <Navigation className="w-4 h-4" />
                    </button>

                    {/* Source Suggestions Dropdown */}
                    <AnimatePresence>
                      {activeInput === 'source' && sourceSuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-60 overflow-y-auto"
                        >
                          {sourceSuggestions.map((s) => (
                            <button
                              key={s.properties.place_id}
                              type="button"
                              onClick={() => handleSelectSuggestion(s, 'source')}
                              className="w-full px-4 py-3 text-left text-sm hover:bg-blue-50 border-b border-gray-50 last:border-none flex items-start gap-3 transition-colors"
                            >
                              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 line-clamp-2">{s.properties.formatted}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="Where to?"
                      value={destText}
                      onChange={(e) => {
                        setDestText(e.target.value);
                        setDestCoords(null);
                        setActiveInput('dest');
                      }}
                      onFocus={() => setActiveInput('dest')}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                    />

                    {/* Destination Suggestions Dropdown */}
                    <AnimatePresence>
                      {activeInput === 'dest' && destSuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-60 overflow-y-auto"
                        >
                          {destSuggestions.map((s) => (
                            <button
                              key={s.properties.place_id}
                              type="button"
                              onClick={() => handleSelectSuggestion(s, 'dest')}
                              className="w-full px-4 py-3 text-left text-sm hover:bg-blue-50 border-b border-gray-50 last:border-none flex items-start gap-3 transition-colors"
                            >
                              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 line-clamp-2">{s.properties.formatted}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center justify-between py-2 px-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={cn("w-5 h-5", avoidPotholes ? "text-green-600" : "text-gray-400")} />
                      <span className="text-sm font-medium text-gray-700">Safe Mode (Avoid Potholes)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleAvoid(!avoidPotholes)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                        avoidPotholes ? "bg-green-600" : "bg-gray-200"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                          avoidPotholes ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSearching || !sourceText || !destText}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200"
                  >
                    {isSearching ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Navigation className="w-4 h-4" />
                        Find Best Route
                      </>
                    )}
                  </button>
                </form>

                {routeInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100"
                  >
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Distance</div>
                        <div className="text-sm font-bold text-blue-900">{formatDistance(routeInfo.distance)}</div>
                      </div>
                      <div className="text-center border-x border-blue-200">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Time</div>
                        <div className="text-sm font-bold text-blue-900 flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTime(routeInfo.time)}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">Potholes</div>
                        <div className={cn(
                          "text-sm font-bold",
                          routeInfo.potholes > 0 ? "text-red-600" : "text-green-600"
                        )}>
                          {routeInfo.potholes}
                        </div>
                      </div>
                    </div>
                    
                    {routeInfo.potholes > 0 && (
                      <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg border border-red-100">
                        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                        <span>Caution: {routeInfo.potholes} potholes detected on this path. Drive carefully!</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
