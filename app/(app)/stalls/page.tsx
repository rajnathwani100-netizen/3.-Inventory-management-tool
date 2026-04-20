export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import StallsClient from "./StallsClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function StallsPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: stalls },
        { data: conversions },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("stall_sessions")
            .select("*, stall_items(*, sku:skus(*))")
            .order("created_at", { ascending: false })
            .limit(20),
        supabase.from("wip_conversions")
            .select("*, sku:skus(*)")
            .order("created_at", { ascending: false })
            .limit(20),
        getPackTypes(),
    ]);

    return (
        <StallsClient
            skus={skus ?? []}
            initialStalls={stalls ?? []}
            initialConversions={conversions ?? []}
            packTypes={packTypes}
        />
    );
}
