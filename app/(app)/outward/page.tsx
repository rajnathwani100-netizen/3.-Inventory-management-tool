export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import OutwardClient from "./OutwardClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function OutwardPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: batches },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("entry_batches")
            .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
            .eq("direction", "outward")
            .order("created_at", { ascending: false })
            .limit(20),
        getPackTypes(),
    ]);

    return <OutwardClient skus={skus ?? []} initialBatches={batches ?? []} packTypes={packTypes} />;
}
