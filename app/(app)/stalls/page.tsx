import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StallsClient from "./StallsClient";

export default async function StallsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: skus } = await supabase.from("skus").select("*").eq("is_active", true).order("code");
    const { data: stalls } = await supabase
        .from("stall_sessions")
        .select("*, stall_items(*, sku:skus(*))")
        .order("created_at", { ascending: false })
        .limit(30);
    const { data: conversions } = await supabase
        .from("wip_conversions")
        .select("*, sku:skus(*)")
        .order("created_at", { ascending: false })
        .limit(20);

    return <StallsClient skus={skus ?? []} initialStalls={stalls ?? []} initialConversions={conversions ?? []} />;
}
