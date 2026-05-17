import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const defaultSyncSpaceId = process.env.EXPO_PUBLIC_SYNC_SPACE_ID ?? "pedro-family";
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn("Supabase environment variables are not configured yet.");
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl ?? "", supabaseAnonKey ?? "")
  : null;
