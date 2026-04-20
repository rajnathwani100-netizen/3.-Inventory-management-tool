import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveSupabaseKey } from "./keys";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        resolveSupabaseKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!),
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Server component — read-only context
                    }
                },
            },
        }
    );
}

export async function createServiceClient() {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        resolveSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY!),
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch { }
                },
            },
        }
    );
}
