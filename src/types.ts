import { Pothole } from './lib/supabase';

export interface Route {
  polyline: [number, number][];
  distance: number;
  time: number;
  potholes: number;
  id: number;
  instructions: string[];
  stepDistances: number[];
  trafficScore: number;
  potholeSeverityScore: number;
  roadTypeScore: number;
  signalsCount: number;
  totalCost: number;
  segments: {
    polyline: [number, number][];
    traffic: 'low' | 'medium' | 'high';
  }[];
}
