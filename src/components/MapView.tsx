import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { Pothole } from '../lib/supabase';
import { Info, Filter, AlertTriangle, Layers, Navigation2 } from 'lucide-react';
import { cn } from '../lib/utils';

// Fix Leaflet marker icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const detectedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const fixedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface Route {
  polyline: [number, number][];
  distance: number;
  time: number;
  potholes: number;
  id: number;
}

interface MapProps {
  potholes: Pothole[];
  userLocation: [number, number] | null;
  waypoints: [number, number][] | null;
  onRouteCalculated: (potholesCount: number, distance: number, time: number) => void;
  avoidPotholes: boolean;
  mapCenter: [number, number];
}

function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.panTo(center);
    }
  }, [center, map]);
  return null;
}

export default function MapView({ potholes, userLocation, waypoints, onRouteCalculated, avoidPotholes, mapCenter }: MapProps) {
  const [filter, setFilter] = useState<'all' | 'detected' | 'fixed'>('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;

  const filteredPotholes = useMemo(() => {
    return potholes.filter(p => {
      const statusMatch = filter === 'all' || p.status === filter;
      const confidenceMatch = p.confidence >= minConfidence;
      return statusMatch && confidenceMatch;
    });
  }, [potholes, filter, minConfidence]);

  useEffect(() => {
    if (!waypoints || waypoints.length < 2 || !apiKey) {
      setRoutes([]);
      return;
    }

    const fetchRoutes = async () => {
      try {
        const waypointsStr = waypoints.map(wp => `${wp[0]},${wp[1]}`).join('|');
        // Request alternatives
        const url = `https://api.geoapify.com/v1/routing?waypoints=${waypointsStr}&mode=drive&apiKey=${apiKey}&details=route_details&alternatives=true`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.features && data.features.length > 0) {
          const newRoutes: Route[] = data.features.map((feature: any, index: number) => {
            const coordinates = feature.geometry.coordinates[0];
            const polyline: [number, number][] = coordinates.map((coord: number[]) => [coord[1], coord[0]]);
            const distance = feature.properties.distance;
            const time = feature.properties.time;

            // Calculate potholes near this specific route
            const nearby = potholes.filter(p => {
              if (p.status === 'fixed') return false;
              return polyline.some(point => {
                const dist = L.latLng(p.latitude, p.longitude).distanceTo(L.latLng(point[0], point[1]));
                return dist < 50; // 50 meters
              });
            });

            return {
              polyline,
              distance,
              time,
              potholes: nearby.length,
              id: index
            };
          });

          // Sort routes: if avoidPotholes is true, prioritize routes with fewer potholes
          if (avoidPotholes) {
            newRoutes.sort((a, b) => a.potholes - b.potholes || a.time - b.time);
          }

          setRoutes(newRoutes);
          setSelectedRouteIndex(0);
          
          if (newRoutes.length > 0) {
            onRouteCalculated(newRoutes[0].potholes, newRoutes[0].distance, newRoutes[0].time);
          }
        }
      } catch (error) {
        console.error('Error fetching routes:', error);
      }
    };

    fetchRoutes();
  }, [waypoints, potholes, apiKey, onRouteCalculated, avoidPotholes]);

  const handleRouteSelect = (index: number) => {
    setSelectedRouteIndex(index);
    const route = routes[index];
    onRouteCalculated(route.potholes, route.distance, route.time);
  };

  if (!apiKey) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Geoapify API Key Missing</h2>
        <p className="text-gray-600 max-w-md">
          Please set your <strong>VITE_GEOAPIFY_API_KEY</strong> in the environment to enable Geoapify features.
        </p>
      </div>
    );
  }

  const getTileUrl = (style: string) => `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}.png?apiKey=${apiKey}`;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={[18.5204, 73.8567]}
        zoom={13}
        className="w-full h-full z-0"
      >
        <MapController center={mapCenter} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Standard">
            <TileLayer
              attribution='&copy; <a href="https://www.geoapify.com/">Geoapify</a> contributors'
              url={getTileUrl('carto')}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Dark Mode">
            <TileLayer
              attribution='&copy; <a href="https://www.geoapify.com/">Geoapify</a> contributors'
              url={getTileUrl('dark-matter')}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='&copy; <a href="https://www.geoapify.com/">Geoapify</a> contributors'
              url={getTileUrl('klokantech-basic')}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        {userLocation && (
          <Marker position={userLocation}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {/* Render all routes, highlight selected */}
        {routes.map((route, index) => (
          <Polyline 
            key={route.id}
            positions={route.polyline} 
            color={index === selectedRouteIndex ? (avoidPotholes ? '#10b981' : '#3b82f6') : '#94a3b8'} 
            weight={index === selectedRouteIndex ? 6 : 4} 
            opacity={index === selectedRouteIndex ? 0.9 : 0.4}
            eventHandlers={{
              click: () => handleRouteSelect(index)
            }}
          />
        ))}

        {filteredPotholes.map((pothole) => (
          <Marker
            key={pothole.id}
            position={[pothole.latitude, pothole.longitude]}
            icon={pothole.status === 'detected' ? detectedIcon : fixedIcon}
          >
            <Popup className="p-0 overflow-hidden rounded-lg">
              <div className="w-64">
                {pothole.image_url && (
                  <img
                    src={pothole.image_url}
                    alt="Pothole"
                    className="w-full h-32 object-cover rounded-t-lg"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn(
                      "text-xs font-bold px-2 py-1 rounded-full uppercase",
                      pothole.status === 'detected' ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                    )}>
                      {pothole.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(pothole.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-sm text-gray-700">
                      <Info className="w-4 h-4 mr-2 text-blue-500" />
                      Confidence: {(pothole.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* UI Overlays */}
      <div className="absolute top-4 right-12 z-10 flex flex-col gap-2">
        {/* Filters Panel */}
        <div className="bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-gray-200 w-48">
          <h3 className="text-sm font-semibold mb-3 flex items-center">
            <Filter className="w-4 h-4 mr-2" /> Filters
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="w-full text-sm border-gray-200 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Potholes</option>
                <option value="detected">Detected Only</option>
                <option value="fixed">Fixed Only</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Min Confidence: {Math.round(minConfidence * 100)}%</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={minConfidence}
                onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Alternate Routes Panel */}
        {routes.length > 1 && (
          <div className="bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-gray-200 w-48">
            <h3 className="text-sm font-semibold mb-3 flex items-center">
              <Navigation2 className="w-4 h-4 mr-2" /> Alternate Routes
            </h3>
            <div className="space-y-2">
              {routes.map((route, idx) => (
                <button
                  key={route.id}
                  onClick={() => handleRouteSelect(idx)}
                  className={cn(
                    "w-full text-left p-2 rounded-lg text-xs transition-all border",
                    selectedRouteIndex === idx 
                      ? "bg-blue-50 border-blue-200 text-blue-700 font-bold" 
                      : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <div className="flex justify-between mb-1">
                    <span>Route {idx + 1}</span>
                    <span className={cn(
                      "font-bold",
                      route.potholes > 0 ? "text-red-500" : "text-green-500"
                    )}>
                      {route.potholes} 🕳️
                    </span>
                  </div>
                  <div className="text-[10px] opacity-70">
                    {(route.distance / 1000).toFixed(1)} km • {Math.round(route.time / 60)} min
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
