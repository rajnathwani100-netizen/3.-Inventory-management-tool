"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createConversion(params: { skuId: string; packs30gIn: number }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (params.packs30gIn <= 0) throw new Error("Packs must be > 0");

    const { error } = await supabase.from("wip_conversions").insert({
        sku_id: params.skuId,
        packs_30g_in: params.packs30gIn,
        status: "in_progress",
        created_by: user.id,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/stalls");
    return { success: true };
}

export async function completeConversion(conversionId: string) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: conv } = await supabase
        .from("wip_conversions")
        .select("*")
        .eq("id", conversionId)
        .single();

    if (!conv) throw new Error("Conversion not found");
    if (conv.status !== "in_progress") throw new Error("Already completed");

    const { data: stock30g } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", conv.sku_id)
        .eq("pack_type", "30g_individual")
        .single();

    if (stock30g) {
        const newQty = stock30g.quantity - conv.packs_30g_in;
        if (newQty < 0) throw new Error("Insufficient 30g stock for conversion");
        await serviceSupabase
            .from("stock_levels")
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq("id", stock30g.id);
    }

    const { data: stock6 } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", conv.sku_id)
        .eq("pack_type", "pack_of_6")
        .single();

    const packsOf6 = Math.floor(conv.packs_30g_in / 6);
    if (stock6) {
        await serviceSupabase
            .from("stock_levels")
            .update({ quantity: stock6.quantity + packsOf6, updated_at: new Date().toISOString() })
            .eq("id", stock6.id);
    }

    await serviceSupabase
        .from("wip_conversions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", conversionId);

    revalidatePath("/stalls");
    revalidatePath("/inventory");
    return { success: true };
}
