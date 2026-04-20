import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SkusClient from "./SkusClient";

export default async function SkusPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const { data: skus } = await supabase.from("skus").select("*").order("code");

    return <SkusClient initialSkus={skus ?? []} isAdmin={profile?.role === "admin"} />;
}
