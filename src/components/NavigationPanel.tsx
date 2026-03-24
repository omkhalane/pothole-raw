import React, { useState, useEffect, useRef } from 'react';
import { Route } from '../types';
import { Search, MapPin, Navigation, X, ArrowRight, ShieldCheck, Clock, Map as MapIcon, Loader2, Car, Bike, Footprints, AlertTriangle, Activity, DollarSign, RotateCcw } from 'lucide-react';
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
  onSearch: (source: [number, number], destination: [number, number], mode: string, waypoints?: [number, number][]) => void;
  onCurrentLocation: () => void;
  isSearching: boolean;
  routeInfo: Route | null;
  allRoutes: Route[];
  selectedRouteIndex: number;
  onSelectRoute: (index: number) => void;
  avoidPotholes: boolean;
  onToggleAvoid: (val: boolean) => void;
  showPotholesOnMap: boolean;
  onToggleShowPotholes: (val: boolean) => void;
  onFetchIsoline: (minutes: number) => void;
  onClearRoute: () => void;
  onOptimizeWaypoints: (source: [number, number], destination: [number, number], waypoints: [number, number][]) => void;
  onFindPostcode: (lat: number, lon: number) => Promise<string | null>;
  isOptimizing: boolean;
  isFetchingIsoline: boolean;
  userLocation: [number, number] | null;
}

export default function NavigationPanel({ 
  onSearch, 
  onCurrentLocation, 
  isSearching, 
  routeInfo,
  allRoutes,
  selectedRouteIndex,
  onSelectRoute,
  avoidPotholes,
  onToggleAvoid,
  showPotholesOnMap,
  onToggleShowPotholes,
  onFetchIsoline,
  onClearRoute,
  onOptimizeWaypoints,
  onFindPostcode,
  isOptimizing,
  isFetchingIsoline,
  userLocation
}: NavigationPanelProps) {
  const [sourceText, setSourceText] = useState('');
  const [destText, setDestText] = useState('');
  const [sourceCoords, setSourceCoords] = useState<[number, number] | null>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [waypoints, setWaypoints] = useState<{text: string, coords: [number, number] | null}[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [travelMode, setTravelMode] = useState<'drive' | 'bicycle' | 'walk'>('drive');
  
  const [sourceSuggestions, setSourceSuggestions] = useState<Suggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<Suggestion[]>([]);
  const [waypointSuggestions, setWaypointSuggestions] = useState<Suggestion[][]>([]);
  const [activeInput, setActiveInput] = useState<{type: 'source' | 'dest' | 'waypoint', index?: number} | null>(null);

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchSuggestions = async (text: string, type: 'source' | 'dest' | 'waypoint', index?: number) => {
    if (!text || text.length < 3 || !apiKey) {
      if (type === 'source') setSourceSuggestions([]);
      else if (type === 'dest') setDestSuggestions([]);
      else if (type === 'waypoint' && index !== undefined) {
        const newSugg = [...waypointSuggestions];
        newSugg[index] = [];
        setWaypointSuggestions(newSugg);
      }
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&apiKey=${apiKey}&limit=5`;
      const response = await fetch(url, { signal: abortControllerRef.current.signal });
      const data = await response.json();
      if (data.features) {
        if (type === 'source') setSourceSuggestions(data.features);
        else if (type === 'dest') setDestSuggestions(data.features);
        else if (type === 'waypoint' && index !== undefined) {
          const newSugg = [...waypointSuggestions];
          newSugg[index] = data.features;
          setWaypointSuggestions(newSugg);
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Autocomplete error:', error);
      }
    }
  };

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (activeInput?.type === 'source') fetchSuggestions(sourceText, 'source');
      else if (activeInput?.type === 'dest') fetchSuggestions(destText, 'dest');
      else if (activeInput?.type === 'waypoint' && activeInput.index !== undefined) {
        fetchSuggestions(waypoints[activeInput.index].text, 'waypoint', activeInput.index);
      }
    }, 150);
  }, [sourceText, destText, waypoints, activeInput]);

  const handleSelectSuggestion = (suggestion: Suggestion, type: 'source' | 'dest' | 'waypoint', index?: number) => {
    const { lat, lon, formatted } = suggestion.properties;
    if (type === 'source') {
      setSourceText(formatted);
      setSourceCoords([lat, lon]);
      setSourceSuggestions([]);
    } else if (type === 'dest') {
      setDestText(formatted);
      setDestCoords([lat, lon]);
      setDestSuggestions([]);
    } else if (type === 'waypoint' && index !== undefined) {
      const newWaypoints = [...waypoints];
      newWaypoints[index] = { text: formatted, coords: [lat, lon] };
      setWaypoints(newWaypoints);
      const newSugg = [...waypointSuggestions];
      newSugg[index] = [];
      setWaypointSuggestions(newSugg);
    }
    setActiveInput(null);
  };

  const handleUseCurrentLocation = () => {
    onCurrentLocation();
    if (userLocation) {
      setSourceText('Current Location');
      setSourceCoords(userLocation);
    } else {
      // If location isn't available yet, we'll wait for it
      setSourceText('Locating...');
    }
  };

  useEffect(() => {
    if (sourceText === 'Locating...' && userLocation) {
      setSourceText('Current Location');
      setSourceCoords(userLocation);
    }
  }, [userLocation, sourceText]);

  const handleClear = () => {
    setSourceText('');
    setDestText('');
    setSourceCoords(null);
    setDestCoords(null);
    setWaypoints([]);
    setWaypointSuggestions([]);
    onClearRoute();
  };

  const handleOptimize = async () => {
    if (sourceCoords && destCoords && waypoints.length > 0) {
      const waypointCoords = waypoints.map(w => w.coords).filter(c => c !== null) as [number, number][];
      onOptimizeWaypoints(sourceCoords, destCoords, waypointCoords);
    }
  };

  const handleFindPostcode = async () => {
    if (userLocation) {
      const postcode = await onFindPostcode(userLocation[0], userLocation[1]);
      if (postcode) {
        alert(`Your current postcode is: ${postcode}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceCoords && destCoords) {
      const waypointCoords = waypoints.map(w => w.coords).filter(c => c !== null) as [number, number][];
      onSearch(sourceCoords, destCoords, travelMode, waypointCoords);
    } else {
      // Fallback geocode
      const sCoords = sourceCoords || await geocode(sourceText);
      const dCoords = destCoords || await geocode(destText);
      const waypointCoords = await Promise.all(waypoints.map(async w => w.coords || await geocode(w.text)));
      const validWaypointCoords = waypointCoords.filter(c => c !== null) as [number, number][];
      
      if (sCoords && dCoords) {
        onSearch(sCoords, dCoords, travelMode, validWaypointCoords);
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
    <div className="absolute top-4 left-4 z-20">
      <motion.div
        layout
        initial={false}
        animate={{ 
          width: isExpanded ? (window.innerWidth < 640 ? 'calc(100vw - 32px)' : '448px') : '48px',
          height: isExpanded ? 'auto' : '48px'
        }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
      >
        {!isExpanded ? (
          <div 
            className="w-12 h-12 flex items-center justify-center text-blue-600 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setIsExpanded(true)}
          >
            <Search className="w-6 h-6" />
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <MapIcon className="w-5 h-5 text-blue-600" />
                Smart Route Navigator
              </h2>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleClear}
                  className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                  title="Clear all"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-visible">
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
                        setActiveInput({type: 'source'});
                      }}
                      onFocus={() => setActiveInput({type: 'source'})}
                      className="w-full pl-10 pr-20 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center overflow-hidden w-8 h-8"
                      title="Use current location"
                    >
                      <img 
                        src={`https://api.geoapify.com/v2/icon/?type=material&color=%233b82f6&size=32&icon=my_location&iconType=material&noShadow&apiKey=${apiKey}`}
                        alt="Current Location"
                        className="w-5 h-5 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={handleFindPostcode}
                      className="absolute right-10 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center overflow-hidden w-8 h-8"
                      title="Find Postcode"
                    >
                      <img 
                        src={`https://api.geoapify.com/v2/icon/?type=material&color=%239ca3af&size=32&icon=markunread_mailbox&iconType=material&noShadow&apiKey=${apiKey}`}
                        alt="Find Postcode"
                        className="w-5 h-5 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </button>

                    {/* Source Suggestions Dropdown */}
                    <AnimatePresence>
                      {activeInput?.type === 'source' && sourceSuggestions.length > 0 && (
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

                  {/* Waypoints */}
                  {waypoints.map((wp, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        placeholder="Add stop..."
                        value={wp.text}
                        onChange={(e) => {
                          const newWps = [...waypoints];
                          newWps[idx] = { ...newWps[idx], text: e.target.value, coords: null };
                          setWaypoints(newWps);
                          setActiveInput({type: 'waypoint', index: idx});
                        }}
                        onFocus={() => setActiveInput({type: 'waypoint', index: idx})}
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newWps = waypoints.filter((_, i) => i !== idx);
                          setWaypoints(newWps);
                          const newSugg = waypointSuggestions.filter((_, i) => i !== idx);
                          setWaypointSuggestions(newSugg);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {activeInput?.type === 'waypoint' && activeInput.index === idx && waypointSuggestions[idx]?.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 max-h-60 overflow-y-auto"
                          >
                            {waypointSuggestions[idx].map((s) => (
                              <button
                                key={s.properties.place_id}
                                type="button"
                                onClick={() => handleSelectSuggestion(s, 'waypoint', idx)}
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
                  ))}

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
                        setActiveInput({type: 'dest'});
                      }}
                      onFocus={() => setActiveInput({type: 'dest'})}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                    />

                    {/* Destination Suggestions Dropdown */}
                    <AnimatePresence>
                      {activeInput?.type === 'dest' && destSuggestions.length > 0 && (
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

                  <div className="flex gap-2 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWaypoints([...waypoints, { text: '', coords: null }]);
                        setWaypointSuggestions([...waypointSuggestions, []]);
                      }}
                      className="flex-1 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      + Add Stop
                    </button>
                    {waypoints.length > 1 && (
                      <button
                        type="button"
                        onClick={handleOptimize}
                        disabled={isOptimizing}
                        className="flex-1 py-1.5 text-xs font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded-lg hover:bg-purple-100 transition-colors flex items-center justify-center gap-1"
                      >
                        {isOptimizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                        Optimize
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 py-1">
                    <button
                      type="button"
                      onClick={() => setTravelMode('drive')}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                        travelMode === 'drive' ? "bg-blue-50 border-blue-200 text-blue-600 font-bold" : "bg-white border-gray-100 text-gray-400 hover:bg-gray-50"
                      )}
                    >
                      <Car className="w-5 h-5" />
                      <span className="text-[10px] uppercase tracking-wider">Car</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTravelMode('bicycle')}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                        travelMode === 'bicycle' ? "bg-blue-50 border-blue-200 text-blue-600 font-bold" : "bg-white border-gray-100 text-gray-400 hover:bg-gray-50"
                      )}
                    >
                      <Bike className="w-5 h-5" />
                      <span className="text-[10px] uppercase tracking-wider">Bike</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTravelMode('walk')}
                      className={cn(
                        "flex-1 flex flex-col items-center gap-1 p-2 rounded-xl border transition-all",
                        travelMode === 'walk' ? "bg-blue-50 border-blue-200 text-blue-600 font-bold" : "bg-white border-gray-100 text-gray-400 hover:bg-gray-50"
                      )}
                    >
                      <Footprints className="w-5 h-5" />
                      <span className="text-[10px] uppercase tracking-wider">Walk</span>
                    </button>
                  </div>

                  <div className="space-y-2">
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

                    <div className="flex items-center justify-between py-2 px-1">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={cn("w-5 h-5", showPotholesOnMap ? "text-yellow-600" : "text-gray-400")} />
                        <span className="text-sm font-medium text-gray-700">Show Potholes on Map</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleShowPotholes(!showPotholesOnMap)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                          showPotholesOnMap ? "bg-yellow-600" : "bg-gray-200"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            showPotholesOnMap ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between py-2 px-1">
                      <div className="flex items-center gap-2">
                        <Clock className={cn("w-5 h-5", isFetchingIsoline ? "text-blue-600 animate-pulse" : "text-gray-400")} />
                        <span className="text-sm font-medium text-gray-700">Show Safe Reachable Area</span>
                      </div>
                      <div className="flex gap-1">
                        {[5, 10, 15].map(min => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => onFetchIsoline(min)}
                            disabled={isFetchingIsoline}
                            className="px-2 py-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            {min}m
                          </button>
                        ))}
                      </div>
                    </div>
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

                {allRoutes.length > 1 && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Alternative Routes</h3>
                      <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-full">
                        {allRoutes.length} Found
                      </span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                      {allRoutes.map((route, idx) => {
                        const isSelected = selectedRouteIndex === idx;
                        // Calculate a "Safety Score" out of 100
                        // Potholes are the biggest factor, then signals
                        const potholePenalty = route.potholes * 10;
                        const signalPenalty = route.signalsCount * 2;
                        const safetyScore = Math.max(0, 100 - potholePenalty - signalPenalty);
                        
                        return (
                          <button
                            key={route.id}
                            onClick={() => onSelectRoute(idx)}
                            className={cn(
                              "w-full text-left p-3 rounded-2xl border transition-all relative group",
                              isSelected 
                                ? "bg-white border-blue-500 shadow-lg ring-1 ring-blue-500/20" 
                                : "bg-gray-50 border-transparent text-gray-700 hover:bg-white hover:border-gray-200"
                            )}
                          >
                            {isSelected && (
                              <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full" />
                            )}
                            
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "text-sm font-bold",
                                    isSelected ? "text-blue-600" : "text-gray-900"
                                  )}>
                                    Route {idx + 1}
                                  </span>
                                  {idx === 0 && (
                                    <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md uppercase tracking-tighter">
                                      Recommended
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                                  {formatDistance(route.distance)} • {formatTime(route.time)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={cn(
                                  "text-xs font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1",
                                  safetyScore > 80 ? "bg-green-50 text-green-700" : safetyScore > 50 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"
                                )}>
                                  <ShieldCheck className="w-3 h-3" />
                                  {safetyScore}% Safe
                                </div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-100">
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                <AlertTriangle className={cn("w-3 h-3", route.potholes > 0 ? "text-red-500" : "text-green-500")} />
                                <span>{route.potholes} Potholes</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                <Activity className="w-3 h-3 text-orange-500" />
                                <span>{route.signalsCount} Signals</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {routeInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100"
                  >
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-100">
                        <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-1">
                          <Clock className="w-3 h-3" />
                          <span>ETA</span>
                        </div>
                        <div className="text-sm font-bold text-blue-900">
                          {formatTime(routeInfo.time)}
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-100">
                        <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-1">
                          <Navigation className="w-3 h-3" />
                          <span>Distance</span>
                        </div>
                        <div className="text-sm font-bold text-blue-900">
                          {formatDistance(routeInfo.distance)}
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-100">
                        <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-1">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                          <span>Potholes</span>
                        </div>
                        <div className="text-sm font-bold text-red-600">
                          {routeInfo.potholes}
                        </div>
                      </div>
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-100">
                        <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-1">
                          <MapIcon className="w-3 h-3 text-orange-500" />
                          <span>Signals</span>
                        </div>
                        <div className="text-sm font-bold text-orange-600">
                          {routeInfo.signalsCount}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-blue-100">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Est. Travel Time: {formatTime(routeInfo.time)}</span>
                      </div>
                    </div>
                    
                    {routeInfo.potholes > 0 && (
                      <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg border border-red-100">
                        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                        <span>Caution: {routeInfo.potholes} potholes detected on this path. Drive carefully!</span>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">Route Instructions</h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {routeInfo.instructions.map((inst, i) => (
                          <div key={i} className="flex gap-3 p-2 rounded-lg hover:bg-white transition-colors text-xs text-gray-700 border border-transparent hover:border-gray-100">
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 font-bold text-[10px]">
                              {i + 1}
                            </div>
                            <p className="leading-relaxed">{inst}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
  );
}
