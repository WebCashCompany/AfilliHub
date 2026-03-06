// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://igajnjftlcrykmzcefxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYWpuamZ0bGNyeWttemNlZnh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTU5NjUsImV4cCI6MjA4NzM3MTk2NX0.LDTS1a58MparzYWk91CMW6UsSspc2u9o2R5wuNIMKmQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Roles atualizados: basico < premium < max
export type UserRole = 'basico' | 'premium' | 'max';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
}