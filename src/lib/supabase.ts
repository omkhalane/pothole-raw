import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export type Pothole = {
  id: string;
  latitude: number;
  longitude: number;
  confidence: number;
  severity: 1 | 2 | 3 | 4 | 5;
  image_url: string;
  status: 'detected' | 'fixed';
  created_at: string;
  upvotes: number;
  downvotes: number;
};
