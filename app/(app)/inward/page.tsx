import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InwardClient from "./InwardClient";

export default async function InwardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: skus } = await supabase.from("skus").select("*").eq("is_active", true).order("code");
    const { data: batches } = await supabase
        .from("entry_batches")
        .select("*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name)")
        .eq("direction", "inward")
        .order("created_at", { ascending: false })
        .limit(20);

    return <InwardClient skus={skus ?? []} initialBatches={batches ?? []} />;
}
