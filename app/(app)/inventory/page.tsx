export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import InventoryClient from "./InventoryClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function InventoryPage() {
    const supabase = await createClient();
    const [
        { data: skus },
        { data: stockLevels },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("code"),
        supabase.from("stock_levels").select("*, sku:skus(*)"),
        getPackTypes(),
    ]);

    return (
        <InventoryClient
            initialSkus={skus ?? []}
            initialStockLevels={stockLevels ?? []}
            packTypes={packTypes}
        />
    );
}
