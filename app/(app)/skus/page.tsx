export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SkusClient from "./SkusClient";
import { getPackTypes } from "@/lib/actions/packTypes";

export default async function SkusPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const isAdmin = profile?.role === "admin";

    const [
        { data: skus },
        { data: stockLevels },
        packTypes,
    ] = await Promise.all([
        supabase.from("skus").select("*").order("code"),
        isAdmin ? supabase.from("stock_levels").select("*") : Promise.resolve({ data: [] }),
        isAdmin ? getPackTypes() : Promise.resolve([]),
    ]);

    return (
        <SkusClient
            initialSkus={skus ?? []}
            initialStockLevels={stockLevels ?? []}
            initialPackTypes={packTypes}
            isAdmin={isAdmin}
        />
    );
}
