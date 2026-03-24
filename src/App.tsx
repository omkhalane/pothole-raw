import React, { useEffect, useState, useCallback, useRef } from 'react';
import MapView from './components/MapView';
import NavigationPanel from './components/NavigationPanel';
import PlacesSearch from './components/PlacesSearch';
import { supabase, Pothole } from './lib/supabase';
import { Route } from './types';
import * as L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, AlertCircle, Loader2, X, Navigation } from 'lucide-react';
import { cn } from './lib/utils';

export default function App() {
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [waypoints, setWaypoints] = useState<[number, number][] | null>(null);
  const [allRoutes, setAllRoutes] = useState<Route[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeInfo, setRouteInfo] = useState<Route | null>(null);
  const [avoidPotholes, setAvoidPotholes] = useState(true);
  const [showPotholesOnMap, setShowPotholesOnMap] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.5204, 73.8567]);
  const [isTracking, setIsTracking] = useState(false);
  const [travelMode, setTravelMode] = useState<string>('drive');
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationInstructions, setNavigationInstructions] = useState<string[]>([]);
  const [navigationDistances, setNavigationDistances] = useState<number[]>([]);
  const [currentInstructionIndex, setCurrentInstructionIndex] = useState(0);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [selectedPothole, setSelectedPothole] = useState<Pothole | null>(null);
  const [isolineData, setIsolineData] = useState<any>(null);
  const [isFetchingIsoline, setIsFetchingIsoline] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const lastRerouteLocation = useRef<[number, number] | null>(null);
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;

  const fetchPotholes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('potholes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPotholes(data || []);
    } catch (err: any) {
      console.error('Error fetching potholes:', err.message);
      if (!import.meta.env.VITE_SUPABASE_URL) {
        setPotholes([
          { id: '1', latitude: 18.5204, longitude: 73.8567, confidence: 0.85, severity: 4, image_url: 'https://picsum.photos/seed/pothole1/400/300', status: 'detected', created_at: new Date().toISOString() },
          { id: '2', latitude: 18.5250, longitude: 73.8600, confidence: 0.92, severity: 2, image_url: 'https://picsum.photos/seed/pothole2/400/300', status: 'fixed', created_at: new Date().toISOString() },
          { id: '3', latitude: 18.5180, longitude: 73.8500, confidence: 0.78, severity: 5, image_url: 'https://picsum.photos/seed/pothole3/400/300', status: 'detected', created_at: new Date().toISOString() }
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPotholes();

    const channel = supabase
      .channel('potholes_changes')
      .on('postgres_changes' as any, { event: '*', table: 'potholes' }, () => {
        fetchPotholes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPotholes]);

  // Rerouting logic: if tracking is on and we have a destination, reroute if user moves > 100m
  useEffect(() => {
    if (isTracking && userLocation && waypoints && waypoints.length >= 2) {
      const destination = waypoints[waypoints.length - 1];
      
      if (!lastRerouteLocation.current) {
        lastRerouteLocation.current = userLocation;
        return;
      }

      const distMoved = Math.sqrt(
        Math.pow(userLocation[0] - lastRerouteLocation.current[0], 2) + 
        Math.pow(userLocation[1] - lastRerouteLocation.current[1], 2)
      );

      // Roughly 100m in degrees (very approximate)
      if (distMoved > 0.001) {
        console.log('Significant movement detected, rerouting...');
        setWaypoints([userLocation, destination]);
        lastRerouteLocation.current = userLocation;
      }
    }
  }, [userLocation, isTracking, waypoints]);

  const handleCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setIsTracking(true);

    const fetchIPLocation = async () => {
      if (!apiKey) return;
      try {
        const response = await fetch(`https://api.geoapify.com/v1/ipgeolocation?apiKey=${apiKey}`);
        const data = await response.json();
        if (data.location) {
          const { latitude, longitude } = data.location;
          setUserLocation([latitude, longitude]);
          setMapCenter([latitude, longitude]);
        }
      } catch (error) {
        console.error('IP Geolocation error:', error);
      }
    };

    // Immediate fetch for instant feedback
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setUserLocation([lat, lon]);
        setMapCenter([lat, lon]);
        
        if (position.coords.heading !== null) {
          setUserHeading(position.coords.heading);
        }
      },
      async (error) => {
        console.error('Initial location error:', error);
        // Fallback to IP Geolocation
        await fetchIPLocation();
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    // Start continuous watching
    navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const heading = position.coords.heading;
        
        if (heading !== null) {
          setUserHeading(heading);
        }
        
        setUserLocation(prev => {
          if (!prev) return [lat, lon];
          const alpha = 0.3;
          return [
            prev[0] * (1 - alpha) + lat * alpha,
            prev[1] * (1 - alpha) + lon * alpha
          ];
        });
        
        setMapCenter([lat, lon]);
      },
      (error) => {
        console.error('Watch location error:', error);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    // Listen for orientation
    const handleOrientation = (event: any) => {
      if (event.webkitCompassHeading) {
        setUserHeading(event.webkitCompassHeading);
      } else if (event.alpha !== null) {
        setUserHeading(360 - event.alpha);
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
  };

  const handleSearch = useCallback(async (source: [number, number], destination: [number, number], mode: string = 'drive', waypointCoords?: [number, number][]) => {
    setIsSearching(true);
    setRouteInfo(null);
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    
    // Construct waypoints array: [source, ...waypoints, destination]
    const newWaypoints: [number, number][] = [source];
    if (waypointCoords && waypointCoords.length > 0) {
      newWaypoints.push(...waypointCoords);
    }
    newWaypoints.push(destination);
    
    setWaypoints(newWaypoints);
    setMapCenter(source);
    setTravelMode(mode);
    setIsSearching(false);
  }, []);

  const handlePlaceSelect = useCallback((lat: number, lon: number, name: string) => {
    if (userLocation) {
      handleSearch(userLocation, [lat, lon], 'drive');
    } else {
      setMapCenter([lat, lon]);
    }
  }, [userLocation, handleSearch]);

  const handleRoutesCalculated = useCallback((routes: Route[]) => {
    setAllRoutes(routes);
    if (routes.length > 0) {
      const selected = routes[selectedRouteIndex] || routes[0];
      setRouteInfo(selected);
      setNavigationInstructions(selected.instructions);
      setNavigationDistances(selected.stepDistances);
      setCurrentInstructionIndex(0);
    }
  }, [selectedRouteIndex]);

  const handleSelectRoute = useCallback((index: number) => {
    setSelectedRouteIndex(index);
    if (allRoutes[index]) {
      const route = allRoutes[index];
      setRouteInfo(route);
      setNavigationInstructions(route.instructions);
      setNavigationDistances(route.stepDistances);
      setCurrentInstructionIndex(0);
    }
  }, [allRoutes]);

  const handleClearRoute = useCallback(() => {
    setRouteInfo(null);
    setAllRoutes([]);
    setWaypoints(null);
    setSelectedRouteIndex(0);
    setIsNavigating(false);
  }, []);

  const fetchIsoline = useCallback(async (minutes: number = 10) => {
    if (!userLocation || !apiKey) return;
    setIsFetchingIsoline(true);
    try {
      const url = `https://api.geoapify.com/v1/isoline?lat=${userLocation[0]}&lon=${userLocation[1]}&type=time&mode=${travelMode}&range=${minutes * 60}&apiKey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features) {
        setIsolineData(data.features[0]);
      }
    } catch (error) {
      console.error('Isoline error:', error);
    } finally {
      setIsFetchingIsoline(false);
    }
  }, [userLocation, travelMode, apiKey]);

  const optimizeWaypoints = useCallback(async (source: [number, number], destination: [number, number], waypointCoords: [number, number][]) => {
    if (!apiKey) return;
    setIsOptimizing(true);
    try {
      // Prepare body for Route Planner API
      const body = {
        mode: travelMode,
        agents: [
          {
            start_location: [source[1], source[0]],
            end_location: [destination[1], destination[0]]
          }
        ],
        shipments: waypointCoords.map((wp, i) => ({
          id: `wp_${i}`,
          pickup: {
            location: [wp[1], wp[0]]
          }
        }))
      };

      const response = await fetch(`https://api.geoapify.com/v1/routeplanner?apiKey=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      
      if (data.id) {
        // Poll for result
        let result = null;
        let attempts = 0;
        while (attempts < 10) {
          await new Promise(r => setTimeout(r, 2000));
          const pollResponse = await fetch(`https://api.geoapify.com/v1/routeplanner?id=${data.id}&apiKey=${apiKey}`);
          result = await pollResponse.json();
          if (result.status === 'succeeded') break;
          attempts++;
        }

        if (result && result.status === 'succeeded') {
          const optimizedActions = result.features[0].properties.actions;
          // Extract optimized waypoint coordinates
          const optimizedWaypoints: [number, number][] = [];
          optimizedActions.forEach((action: any) => {
            if (action.type === 'pickup') {
              const shipment = result.properties.shipments.find((s: any) => s.id === action.shipment_id);
              if (shipment) {
                optimizedWaypoints.push([shipment.pickup.location[1], shipment.pickup.location[0]]);
              }
            }
          });
          
          handleSearch(source, destination, travelMode, optimizedWaypoints);
        }
      }
    } catch (error) {
      console.error('Optimization error:', error);
    } finally {
      setIsOptimizing(false);
    }
  }, [travelMode, apiKey, handleSearch]);

  const findPostcode = useCallback(async (lat: number, lon: number) => {
    if (!apiKey) return null;
    try {
      const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&type=postcode&apiKey=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        return data.features[0].properties.postcode;
      }
    } catch (error) {
      console.error('Postcode error:', error);
    }
    return null;
  }, [apiKey]);

  const startNavigation = () => {
    if (navigationInstructions.length > 0) {
      setIsNavigating(true);
      // Voice welcome
      const utterance = new SpeechSynthesisUtterance("Starting navigation. Follow the highlighted route.");
      window.speechSynthesis.speak(utterance);
    }
  };

  const nextInstruction = () => {
    if (currentInstructionIndex < navigationInstructions.length - 1) {
      const nextIdx = currentInstructionIndex + 1;
      setCurrentInstructionIndex(nextIdx);
      // Voice instruction
      const utterance = new SpeechSynthesisUtterance(navigationInstructions[nextIdx]);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsNavigating(false);
      const utterance = new SpeechSynthesisUtterance("You have reached your destination.");
      window.speechSynthesis.speak(utterance);
    }
  };

  // Re-routing logic based on deviation
  useEffect(() => {
    if (!isNavigating || !userLocation || !routeInfo || !waypoints || waypoints.length < 2) return;

    const userLatLng = L.latLng(userLocation[0], userLocation[1]);
    const polyline = routeInfo.polyline;
    
    // Check distance to the nearest point on the polyline
    // If distance > 100m, trigger re-route
    let minDistance = Infinity;
    for (let i = 0; i < polyline.length; i++) {
      const dist = userLatLng.distanceTo(L.latLng(polyline[i][0], polyline[i][1]));
      if (dist < minDistance) minDistance = dist;
    }

    if (minDistance > 100) {
      // Debounce re-routing
      const lastReroute = sessionStorage.getItem('last_reroute_time');
      const now = Date.now();
      if (!lastReroute || now - parseInt(lastReroute) > 10000) { // 10 seconds debounce
        console.log('Off-track detected, re-routing...');
        const dest = waypoints[waypoints.length - 1];
        handleSearch(userLocation, dest, travelMode);
        sessionStorage.setItem('last_reroute_time', now.toString());
      }
    }
  }, [userLocation, isNavigating, routeInfo, waypoints, travelMode, handleSearch]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Initializing Pothole Navigator...</p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 p-8 text-center">
        <MapPin className="w-16 h-16 text-blue-600 mb-6" />
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Geoapify API Key Required</h2>
        <p className="text-gray-600 max-w-md mb-8">
          To use the full power of Geoapify (Tiles, Routing, and Geocoding), please set your <strong>VITE_GEOAPIFY_API_KEY</strong> in the environment.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-100">
      <NavigationPanel 
        onSearch={handleSearch} 
        onCurrentLocation={handleCurrentLocation}
        isSearching={isSearching}
        routeInfo={routeInfo}
        allRoutes={allRoutes}
        selectedRouteIndex={selectedRouteIndex}
        onSelectRoute={handleSelectRoute}
        avoidPotholes={avoidPotholes}
        onToggleAvoid={setAvoidPotholes}
        showPotholesOnMap={showPotholesOnMap}
        onToggleShowPotholes={setShowPotholesOnMap}
        onFetchIsoline={fetchIsoline}
        onClearRoute={handleClearRoute}
        onOptimizeWaypoints={optimizeWaypoints}
        onFindPostcode={findPostcode}
        isOptimizing={isOptimizing}
        isFetchingIsoline={isFetchingIsoline}
        userLocation={userLocation}
      />
      
      <MapView 
        potholes={potholes} 
        userLocation={userLocation}
        waypoints={waypoints}
        allRoutes={allRoutes}
        selectedRouteIndex={selectedRouteIndex}
        onRoutesCalculated={handleRoutesCalculated}
        onSelectRoute={handleSelectRoute}
        avoidPotholes={avoidPotholes}
        showPotholesOnMap={showPotholesOnMap}
        onToggleShowPotholes={setShowPotholesOnMap}
        mapCenter={mapCenter}
        mode={travelMode}
        isNavigating={isNavigating}
        userHeading={userHeading}
        onPotholeClick={setSelectedPothole}
        onLocateMe={handleCurrentLocation}
        isTracking={isTracking}
        isolineData={isolineData}
        onClearIsoline={() => setIsolineData(null)}
      />

      <PlacesSearch 
        mapCenter={mapCenter} 
        onPlaceSelect={handlePlaceSelect} 
      />

      {/* Navigation Overlay */}
      <AnimatePresence>
        {isNavigating && navigationInstructions.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-white rounded-2xl shadow-2xl border border-blue-100 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white">
                  <Navigation className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    {navigationDistances[currentInstructionIndex] ? `In ${Math.round(navigationDistances[currentInstructionIndex])}m` : 'Next Step'}
                  </p>
                  <p className="text-lg font-bold text-gray-800 leading-tight">
                    {navigationInstructions[currentInstructionIndex]}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsNavigating(false)}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={nextInstruction}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
              >
                {currentInstructionIndex < navigationInstructions.length - 1 ? "Next Instruction" : "Finish"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start Navigation Button */}
      {routeInfo && !isNavigating && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={startNavigation}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-full shadow-2xl flex items-center gap-2 transition-all hover:scale-105"
          >
            <Navigation className="w-5 h-5" />
            Start Navigation
          </button>
        </div>
      )}

      {/* App Branding Overlay */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
        <span className="text-xs font-bold text-gray-700 tracking-tight uppercase">Geoapify Pothole Navigator</span>
      </div>

      {/* Image Gallery Modal */}
      <AnimatePresence>
        {selectedPothole && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelectedPothole(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={selectedPothole.image_url || `https://picsum.photos/seed/${selectedPothole.id}/1200/800`}
                alt="Pothole Detail"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold mb-1">Pothole Hazard</h3>
                    <p className="text-sm opacity-80">
                      Severity: {selectedPothole.severity} • Confidence: {(selectedPothole.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPothole(null)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
