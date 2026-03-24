import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Popup, 
  useMap, 
  Polyline, 
  LayersControl,
  Polygon,
  ZoomControl
} from 'react-leaflet';
import * as L from 'leaflet';
import { Pothole } from '../lib/supabase';
import { Route } from '../types';
import { Info, Filter, AlertTriangle, Navigation2, ThumbsUp, ThumbsDown, Github } from 'lucide-react';
import { cn } from '../lib/utils';

// Fix Leaflet marker icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom Pothole Icon
const potholeIcon = (severity: number, confidence: number) => {
  const size = 15 + (severity * 5); // Size based on severity
  const opacity = 0.3 + (confidence * 0.7); // Opacity based on confidence
  const color = `rgba(220, 38, 38, ${opacity})`; // Red with confidence-based opacity
  
  return L.divIcon({
    className: 'custom-pothole-icon',
    html: `
      <div style="
        width: ${size}px; 
        height: ${size}px; 
        background-color: ${color}; 
        border: 2px solid #991b1b; 
        border-radius: 50%; 
        box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 40%; height: 40%; background: rgba(0,0,0,0.2); border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const userLocationIcon = (heading: number | null) => L.divIcon({
  className: 'user-location-icon',
  html: `
    <div style="transform: rotate(${heading || 0}deg); transition: transform 0.3s ease;">
      <div style="
        width: 24px; 
        height: 24px; 
        background: #3b82f6; 
        border: 3px solid white; 
        border-radius: 50%; 
        box-shadow: 0 0 10px rgba(0,0,0,0.3);
        position: relative;
      ">
        <div style="
          position: absolute; 
          top: -8px; 
          left: 50%; 
          transform: translateX(-50%); 
          width: 0; 
          height: 0; 
          border-left: 6px solid transparent; 
          border-right: 6px solid transparent; 
          border-bottom: 10px solid #3b82f6;
        "></div>
      </div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const destinationIcon = (apiKey: string) => new L.Icon({
  iconUrl: `https://api.geoapify.com/v2/icon/?type=material&color=%23ef4444&size=48&icon=flag&iconType=material&apiKey=${apiKey}`,
  iconSize: [36, 53],
  iconAnchor: [18, 48],
  popupAnchor: [0, -44]
});

const sourceIcon = (apiKey: string) => new L.Icon({
  iconUrl: `https://api.geoapify.com/v2/icon/?type=material&color=%233b82f6&size=48&icon=location_on&iconType=material&apiKey=${apiKey}`,
  iconSize: [36, 53],
  iconAnchor: [18, 48],
  popupAnchor: [0, -44]
});

// Remove local Route interface
interface MapProps {
  potholes: Pothole[];
  userLocation: [number, number] | null;
  waypoints: [number, number][] | null;
  allRoutes: Route[];
  selectedRouteIndex: number;
  onRoutesCalculated: (routes: Route[]) => void;
  onSelectRoute: (index: number) => void;
  avoidPotholes: boolean;
  showPotholesOnMap: boolean;
  onToggleShowPotholes: (val: boolean) => void;
  mapCenter: [number, number];
  mode: string;
  isNavigating: boolean;
  userHeading: number | null;
  onPotholeClick: (p: Pothole) => void;
  onLocateMe: () => void;
  isTracking: boolean;
  isolineData?: any;
  onClearIsoline?: () => void;
}

function MapController({ center, routePolyline, isNavigating, userLocation, userHeading, isTracking }: { 
  center: [number, number], 
  routePolyline?: [number, number][],
  isNavigating: boolean,
  userLocation: [number, number] | null,
  userHeading: number | null,
  isTracking: boolean
}) {
  const map = useMap();

  useEffect(() => {
    if ((isNavigating || isTracking) && userLocation) {
      // Zoom in very much (e.g. 19 or 20)
      const zoomLevel = isNavigating ? 18 : 19;
      map.setView(userLocation, zoomLevel, { animate: true });
      
      // Auto-rotate map based on heading
      if (userHeading !== null) {
        const mapContainer = map.getContainer();
        mapContainer.style.transform = `rotate(${-userHeading}deg)`;
        mapContainer.style.transition = 'transform 0.5s ease';
      }
    } else if (routePolyline && routePolyline.length > 0) {
      const bounds = L.latLngBounds(routePolyline);
      map.fitBounds(bounds, { padding: [50, 50] });
      // Reset rotation
      const mapContainer = map.getContainer();
      mapContainer.style.transform = 'none';
    } else if (center) {
      map.panTo(center);
      // Reset rotation
      const mapContainer = map.getContainer();
      mapContainer.style.transform = 'none';
    }
  }, [center, routePolyline, map, isNavigating, userLocation, userHeading, isTracking]);

  return null;
}

export default function MapView({ 
  potholes, 
  userLocation, 
  waypoints, 
  allRoutes,
  selectedRouteIndex,
  onRoutesCalculated, 
  onSelectRoute,
  avoidPotholes, 
  showPotholesOnMap, 
  onToggleShowPotholes,
  mapCenter, 
  mode,
  isNavigating,
  userHeading,
  onPotholeClick,
  onLocateMe,
  isTracking,
  isolineData,
  onClearIsoline
}: MapProps) {
  const [filter, setFilter] = useState<'all' | 'detected' | 'fixed'>('all');
  const [minConfidence, setMinConfidence] = useState(0);

  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY;
  const abortControllerRef = useRef<AbortController | null>(null);

  const filteredPotholes = useMemo(() => {
    let result = potholes.filter(p => p.status === 'detected');

    // If navigating, strictly show only potholes on the active route (within 20m)
    if (isNavigating && allRoutes[selectedRouteIndex]) {
      const polyline = allRoutes[selectedRouteIndex].polyline;
      result = result.filter(p => {
        const pLatLng = L.latLng(p.latitude, p.longitude);
        return polyline.some(point => {
          // Tighter bounding box for performance (approx 20m)
          if (Math.abs(p.latitude - point[0]) > 0.0002 || Math.abs(p.longitude - point[1]) > 0.0002) return false;
          return pLatLng.distanceTo(L.latLng(point[0], point[1])) < 20;
        });
      });
    } 
    // If a route is selected but not navigating, show potholes near the route (within 50m)
    else if (allRoutes[selectedRouteIndex]) {
      const polyline = allRoutes[selectedRouteIndex].polyline;
      result = result.filter(p => {
        const pLatLng = L.latLng(p.latitude, p.longitude);
        return polyline.some(point => {
          if (Math.abs(p.latitude - point[0]) > 0.0005 || Math.abs(p.longitude - point[1]) > 0.0005) return false;
          return pLatLng.distanceTo(L.latLng(point[0], point[1])) < 50;
        });
      });
    }

    return result;
  }, [potholes, allRoutes, selectedRouteIndex, isNavigating]);

  useEffect(() => {
    if (!waypoints || waypoints.length < 2 || !apiKey) {
      onRoutesCalculated([]);
      return;
    }

    const fetchRoutes = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const waypointsStr = waypoints.map(wp => `${wp[0]},${wp[1]}`).join('|');
        // Request alternatives
        const url = `https://api.geoapify.com/v1/routing?waypoints=${waypointsStr}&mode=${mode}&apiKey=${apiKey}&details=route_details&alternatives=true`;
        
        const response = await fetch(url, { signal: abortControllerRef.current.signal });
        const data = await response.json();

        if (data.features && data.features.length > 0) {
          const candidatePotholes = potholes.filter(p => p.status === 'detected');
          const newRoutes: Route[] = data.features.map((feature: any, index: number) => {
            const coordinates = feature.geometry.coordinates[0];
            const polyline: [number, number][] = coordinates.map((coord: number[]) => [coord[1], coord[0]]);
            const distance = feature.properties.distance;
            const time = feature.properties.time;

            // Sample points for pothole matching - use more points for better accuracy
            const sampledPolyline = polyline.filter((_, i) => i % 2 === 0);
            
            let potholeSeverityScore = 0;
            const nearby = candidatePotholes.filter(p => {
              const pLatLng = L.latLng(p.latitude, p.longitude);
              const isNear = sampledPolyline.some(point => {
                // Quick bounding box check
                if (Math.abs(p.latitude - point[0]) > 0.0003 || Math.abs(p.longitude - point[1]) > 0.0003) return false;
                return pLatLng.distanceTo(L.latLng(point[0], point[1])) < 30; // 30m radius for better precision
              });
              if (isNear) {
                potholeSeverityScore += (p.severity || 3);
              }
              return isNear;
            });

            // Extract instructions and step distances
            const instructions: string[] = [];
            const stepDistances: number[] = [];
            let signalsCount = 0;
            if (feature.properties.legs) {
              feature.properties.legs.forEach((leg: any) => {
                if (leg.steps) {
                  leg.steps.forEach((step: any) => {
                    if (step.instruction) {
                      instructions.push(step.instruction.text);
                      stepDistances.push(step.distance || 0);
                      if (step.instruction.text.toLowerCase().includes('signal') || step.instruction.text.toLowerCase().includes('traffic light')) {
                        signalsCount++;
                      }
                    }
                  });
                }
              });
            }

            // Remove simulated traffic and road type
            const trafficScore = 0; 
            const roadTypeScore = 0; 
            
            // ETA Prediction System: Refine time based on potholes
            const baseTime = feature.properties.time;
            const potholePenalty = potholeSeverityScore * 5; // 5 seconds per severity point
            const adjustedTime = baseTime + potholePenalty;

            // COST FUNCTION: Total Cost = w1 * distance + w2 * time + w3 * pothole_severity + w4 * signals
            // Normalize values to make weights meaningful
            const w1 = 0.3; // distance weight (km)
            const w2 = 0.3; // time weight (minutes)
            const w3 = avoidPotholes ? 15.0 : 1.0; // pothole severity weight (EXTREMELY high if avoiding)
            const w4 = 0.1; // signals weight
            
            const distanceKm = distance / 1000;
            const timeMin = adjustedTime / 60;
            
            const totalCost = (w1 * distanceKm) + (w2 * timeMin) + (w3 * potholeSeverityScore) + (w4 * signalsCount);

            // Use real segments if available or empty
            const segments: Route['segments'] = [];
            const segmentSize = Math.ceil(polyline.length / 10);
            for (let i = 0; i < polyline.length; i += segmentSize) {
              const segmentPoly = polyline.slice(i, i + segmentSize + 1);
              if (segmentPoly.length < 2) continue;
              segments.push({
                polyline: segmentPoly,
                traffic: 'low' // Default to low since we don't have real-time data
              });
            }

            return {
              polyline,
              distance,
              time: adjustedTime,
              potholes: nearby.length,
              id: index,
              instructions,
              stepDistances,
              trafficScore,
              potholeSeverityScore,
              roadTypeScore,
              signalsCount,
              totalCost,
              segments
            };
          });

          // Sort routes based on total cost
          newRoutes.sort((a, b) => a.totalCost - b.totalCost);

          onRoutesCalculated(newRoutes);
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching routes:', error);
        }
      }
    };

    fetchRoutes();
  }, [waypoints, potholes, apiKey, onRoutesCalculated, avoidPotholes, mode]);

  // Proximity Alert System
  useEffect(() => {
    if (!userLocation || potholes.length === 0) return;

    const userLatLng = L.latLng(userLocation[0], userLocation[1]);
    const nearbyPothole = potholes.find(p => {
      if (p.status !== 'detected') return false;
      const pLatLng = L.latLng(p.latitude, p.longitude);
      return userLatLng.distanceTo(pLatLng) < 100; // 100 meters alert radius
    });

    if (nearbyPothole) {
      // Debounce alert to avoid spamming
      const lastAlert = sessionStorage.getItem('last_pothole_alert');
      const now = Date.now();
      if (!lastAlert || now - parseInt(lastAlert) > 30000) { // 30 seconds debounce
        const utterance = new SpeechSynthesisUtterance(`Caution! Pothole ahead. Severity level ${nearbyPothole.severity || 3}`);
        window.speechSynthesis.speak(utterance);
        sessionStorage.setItem('last_pothole_alert', now.toString());
      }
    }
  }, [userLocation, potholes]);

  const handleRouteSelect = (index: number) => {
    onSelectRoute(index);
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
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <MapController 
          center={mapCenter} 
          routePolyline={allRoutes[selectedRouteIndex]?.polyline} 
          isNavigating={isNavigating}
          userLocation={userLocation}
          userHeading={userHeading}
          isTracking={isTracking}
        />

        {/* GitHub Star Button */}
        <div className="absolute top-2 right-14 z-[1000]">
          <a
            href="https://github.com/Safe-Roads/Map"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-md border border-gray-200 hover:bg-white transition-all hover:scale-105 active:scale-95 group"
          >
            <Github className="w-4 h-4 text-gray-700 group-hover:text-black" />
            <span className="text-xs font-bold text-gray-700 group-hover:text-black">Star us</span>
          </a>
        </div>

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
          <LayersControl.BaseLayer name="Terrain">
            <TileLayer
              attribution='&copy; <a href="https://www.geoapify.com/">Geoapify</a> contributors'
              url={getTileUrl('terrain-light')}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Toner">
            <TileLayer
              attribution='&copy; <a href="https://www.geoapify.com/">Geoapify</a> contributors'
              url={getTileUrl('toner-grey')}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        {/* Isoline Layer */}
        {isolineData && (
          <Polygon
            positions={isolineData.geometry.coordinates[0].map((coord: any) => [coord[1], coord[0]])}
            pathOptions={{
              fillColor: '#3b82f6',
              fillOpacity: 0.2,
              color: '#2563eb',
              weight: 2,
              dashArray: '5, 5'
            }}
          >
            <Popup>
              <div className="p-2">
                <h3 className="text-sm font-bold text-blue-800">Safe Reachable Area</h3>
                <p className="text-xs text-gray-600">This area is reachable within your selected time limit.</p>
                <button 
                  onClick={onClearIsoline}
                  className="mt-2 text-[10px] text-red-600 hover:underline font-bold"
                >
                  Clear Area
                </button>
              </div>
            </Popup>
          </Polygon>
        )}

        {userLocation && (
          <Marker position={userLocation} icon={userLocationIcon(userHeading)}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {/* Render all routes, highlight selected */}
        {allRoutes.map((route, index) => (
          <React.Fragment key={route.id}>
            {route.segments.map((segment, sIdx) => (
              <Polyline
                key={`${route.id}-${sIdx}`}
                positions={segment.polyline}
                pathOptions={{
                  color: index === selectedRouteIndex 
                    ? (segment.traffic === 'high' ? '#ef4444' : segment.traffic === 'medium' ? '#f59e0b' : (avoidPotholes ? '#10b981' : '#3b82f6'))
                    : '#94a3b8',
                  weight: index === selectedRouteIndex ? 6 : 4,
                  opacity: index === selectedRouteIndex ? 0.9 : 0.4,
                  lineJoin: 'round'
                }}
                eventHandlers={{
                  click: () => onSelectRoute(index)
                }}
              />
            ))}
          </React.Fragment>
        ))}

        {/* Source and Destination Markers */}
        {allRoutes[selectedRouteIndex] && (
          <>
            <Marker 
              position={allRoutes[selectedRouteIndex].polyline[0]} 
              icon={sourceIcon(apiKey)}
            >
              <Popup>Source</Popup>
            </Marker>
            <Marker 
              position={allRoutes[selectedRouteIndex].polyline[allRoutes[selectedRouteIndex].polyline.length - 1]} 
              icon={destinationIcon(apiKey)}
            >
              <Popup>Destination</Popup>
            </Marker>
          </>
        )}

        {showPotholesOnMap && filteredPotholes.map((pothole) => (
          <Marker
            key={pothole.id}
            position={[pothole.latitude, pothole.longitude]}
            icon={potholeIcon(pothole.severity || 3, pothole.confidence)}
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
                      {pothole.status} (S{pothole.severity || 3})
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(pothole.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-700">
                      <Info className="w-4 h-4 mr-2 text-blue-500" />
                      Confidence: {(pothole.confidence * 100).toFixed(1)}%
                    </div>
                    <button 
                      onClick={() => onPotholeClick(pothole)}
                      className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 rounded-lg transition-colors"
                    >
                      View Full Photo
                    </button>
                    <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                      <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors">
                        <ThumbsUp className="w-3 h-3" /> {pothole.upvotes || 0}
                      </button>
                      <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors">
                        <ThumbsDown className="w-3 h-3" /> {pothole.downvotes || 0}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* UI Overlays */}
      <div className="absolute top-4 right-12 z-10 flex flex-col gap-2 items-end">
        {/* GitHub Star Button */}
        <a
          href="https://github.com/Safe-Roads/Map"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/90 backdrop-blur px-3 py-2 rounded-xl shadow-lg border border-gray-200 flex items-center gap-2 hover:bg-white transition-all hover:scale-105 group"
          title="Star us on GitHub"
        >
          <Github className="w-4 h-4 text-gray-900" />
          <span className="text-xs font-bold text-gray-700">Star us on GitHub</span>
        </a>

        {/* Alternate Routes Panel */}
        {allRoutes.length > 1 && (
          <div className="bg-white/90 backdrop-blur p-3 rounded-xl shadow-lg border border-gray-200 w-48">
            <h3 className="text-sm font-semibold mb-3 flex items-center">
              <Navigation2 className="w-4 h-4 mr-2" /> Alternate Routes
            </h3>
            <div className="space-y-2">
              {allRoutes.map((route, idx) => (
                <button
                  key={route.id}
                  onClick={() => onSelectRoute(idx)}
                  className={cn(
                    "w-full text-left p-2 rounded-lg text-xs transition-all border",
                    selectedRouteIndex === idx 
                      ? "bg-blue-50 border-blue-200 text-blue-700 font-bold" 
                      : "bg-white border-gray-100 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <div className="flex justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span>Route {idx + 1}</span>
                      {idx === 0 && (
                        <span className="bg-green-100 text-green-700 text-[8px] px-1.5 py-0.5 rounded-full uppercase font-bold">
                          Best
                        </span>
                      )}
                    </div>
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

      {/* Bottom Right Controls */}
      <div className="absolute bottom-28 right-3 z-10">
        <button
          onClick={onLocateMe}
          className="bg-white p-1 rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-all hover:scale-110 active:scale-95 flex items-center justify-center overflow-hidden w-14 h-14"
          title="Current Location"
        >
          <img 
            src={`https://api.geoapify.com/v2/icon/?type=material&color=%233b82f6&size=48&icon=my_location&iconType=material&apiKey=${apiKey}`}
            alt="Current Location"
            className="w-12 h-12 object-contain"
            referrerPolicy="no-referrer"
          />
        </button>
      </div>
    </div>
  );
}
