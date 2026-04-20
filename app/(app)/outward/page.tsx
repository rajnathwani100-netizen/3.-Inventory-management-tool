import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OutwardClient from "./OutwardClient";

export default async function OutwardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: skus } = await supabase.from("skus").select("*").eq("is_active", true).order("code");
    const { data: batches } = await supabase
        .from("entry_batches")
        .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
        .eq("direction", "outward")
        .order("created_at", { ascending: false })
        .limit(20);

    return <OutwardClient skus={skus ?? []} initialBatches={batches ?? []} />;
}
