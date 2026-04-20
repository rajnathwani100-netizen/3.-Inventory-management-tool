import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabaseKey } from "./keys";

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        resolveSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    );
}
