import React, { useEffect, useState, useCallback, useRef } from 'react';
import MapView from './components/MapView';
import NavigationPanel from './components/NavigationPanel';
import PlacesSearch from './components/PlacesSearch';
import { supabase, Pothole } from './lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, AlertCircle, Loader2, X, Navigation } from 'lucide-react';
import { cn } from './lib/utils';

export default function App() {
  const [potholes, setPotholes] = useState<Pothole[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [waypoints, setWaypoints] = useState<[number, number][] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; time: number; potholes: number } | null>(null);
  const [avoidPotholes, setAvoidPotholes] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.5204, 73.8567]);
  const [isTracking, setIsTracking] = useState(false);

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
          { id: '1', latitude: 18.5204, longitude: 73.8567, confidence: 0.85, image_url: 'https://picsum.photos/seed/pothole1/400/300', status: 'detected', created_at: new Date().toISOString() },
          { id: '2', latitude: 18.5250, longitude: 73.8600, confidence: 0.92, image_url: 'https://picsum.photos/seed/pothole2/400/300', status: 'fixed', created_at: new Date().toISOString() },
          { id: '3', latitude: 18.5180, longitude: 73.8500, confidence: 0.78, image_url: 'https://picsum.photos/seed/pothole3/400/300', status: 'detected', created_at: new Date().toISOString() }
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
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(loc);
          setMapCenter(loc);
          setIsTracking(true);
        },
        (error) => {
          console.error('Error getting location:', error);
          setError('Could not access your location. Please check permissions.');
        }
      );
    } else {
      setError('Geolocation is not supported by your browser.');
    }
  };

  const handleSearch = async (source: [number, number], destination: [number, number]) => {
    setIsSearching(true);
    setRouteInfo(null);
    setWaypoints([source, destination]);
    setMapCenter(source);
    setIsSearching(false);
  };

  const handlePlaceSelect = (lat: number, lon: number, name: string) => {
    if (userLocation) {
      handleSearch(userLocation, [lat, lon]);
    } else {
      setMapCenter([lat, lon]);
    }
  };

  const handleRouteCalculated = (potholesCount: number, distance: number, time: number) => {
    setRouteInfo({ distance, time, potholes: potholesCount });
  };

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
        avoidPotholes={avoidPotholes}
        onToggleAvoid={setAvoidPotholes}
      />
      
      <MapView 
        potholes={potholes} 
        userLocation={userLocation}
        waypoints={waypoints}
        onRouteCalculated={handleRouteCalculated}
        avoidPotholes={avoidPotholes}
        mapCenter={mapCenter}
      />

      <PlacesSearch 
        mapCenter={mapCenter} 
        onPlaceSelect={handlePlaceSelect} 
      />

      {/* Tracking Toggle */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setIsTracking(!isTracking)}
          className={cn(
            "w-12 h-12 rounded-full shadow-2xl flex items-center justify-center transition-all",
            isTracking ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:scale-110"
          )}
          title={isTracking ? "Tracking Active" : "Enable Tracking"}
        >
          <Navigation className={cn("w-6 h-6", isTracking && "animate-pulse")} />
        </button>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:bg-red-100 p-1 rounded">
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}

      {/* App Branding Overlay */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border border-gray-200 flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
        <span className="text-xs font-bold text-gray-700 tracking-tight uppercase">Geoapify Pothole Navigator</span>
      </div>
    </div>
  );
}
