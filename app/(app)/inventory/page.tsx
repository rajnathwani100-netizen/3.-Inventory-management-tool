export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InventoryClient from "./InventoryClient";

export default async function InventoryPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: skus } = await supabase
        .from("skus")
        .select("*")
        .eq("is_active", true)
        .order("code");

    const { data: stockLevels } = await supabase
        .from("stock_levels")
        .select("*, sku:skus(*)");

    return (
        <InventoryClient
            initialSkus={skus ?? []}
            initialStockLevels={stockLevels ?? []}
        />
    );
}
