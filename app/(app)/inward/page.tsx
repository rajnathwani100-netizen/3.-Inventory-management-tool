export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import InwardClient from "./InwardClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function InwardPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: batches },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("entry_batches")
            .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
            .eq("direction", "inward")
            .order("created_at", { ascending: false })
            .limit(20),
        getPackTypes(),
    ]);

    return <InwardClient skus={skus ?? []} initialBatches={batches ?? []} packTypes={packTypes} />;
}
