import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WipConversionsClient from "./WipConversionsClient";

export const dynamic = "force-dynamic";

export default async function ConversionsPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const [{ data: skus }, { data: packTypes }, { data: recipes }, { data: conversions }] = await Promise.all([
        supabase.from("skus").select("*").eq("is_active", true).order("name"),
        supabase.from("pack_types").select("*").eq("is_active", true).order("sort_order"),
        // Load recipes with their static ingredients (+ joined sku names)
        supabase
            .from("conversion_recipes")
            .select("*, ingredients:conversion_recipe_ingredients(*, sku:skus(*))")
            .eq("is_active", true)
            .order("sort_order"),
        // Load recent conversions with full detail
        supabase
            .from("wip_conversions")
            .select(`
                *,
                inputs:wip_conversion_inputs(*, sku:skus(*)),
                outputs:wip_conversion_outputs(*, sku:skus(*)),
                recipe:conversion_recipes(name)
            `)
            .order("created_at", { ascending: false })
            .limit(50),
    ]);

    return (
        <WipConversionsClient
            skus={skus ?? []}
            packTypes={packTypes ?? []}
            recipes={recipes ?? []}
            initialConversions={conversions as any ?? []}
            role={profile?.role ?? "staff"}
        />
    );
}
