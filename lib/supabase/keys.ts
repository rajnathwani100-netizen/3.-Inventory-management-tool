/**
 * Supabase introduced a new key format in April 2025:
 *   sb_publishable_<random>.<jwt_payload>
 *   sb_secret_<random>.<jwt_payload>
 *
 * Older @supabase/supabase-js versions expect a full 3-part JWT.
 * This helper extracts the JWT payload part so it can be used
 * with any version of the client library.
 *
 * When the library is updated to support the new format natively,
 * this helper can be removed and the env vars passed directly.
 */
export function resolveSupabaseKey(key: string): string {
    if (!key) return key;
    // New format: sb_publishable_XXX.<payload> or sb_secret_XXX.<payload>
    if (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) {
        const dotIndex = key.indexOf(".");
        if (dotIndex !== -1) {
            // The JWT payload part after the first dot
            return key.slice(dotIndex + 1);
        }
    }
    return key;
}
