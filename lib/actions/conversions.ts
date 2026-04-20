"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createConversion(params: {
    skuId: string;
    fromPackType: string;
    toPackType: string;
    inputQty: number;
    outputQty: number;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (params.inputQty <= 0) throw new Error("Input quantity must be > 0");
    if (params.outputQty <= 0) throw new Error("Output quantity must be > 0");
    if (params.fromPackType === params.toPackType) throw new Error("From and To pack types must differ");

    const { error } = await supabase.from("wip_conversions").insert({
        sku_id: params.skuId,
        from_pack_type: params.fromPackType,
        to_pack_type: params.toPackType,
        input_qty: params.inputQty,
        output_qty: params.outputQty,
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

    // Deduct input stock
    const { data: stockFrom } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", conv.sku_id)
        .eq("pack_type", conv.from_pack_type)
        .single();

    if (!stockFrom) throw new Error(`No stock record for pack type: ${conv.from_pack_type}`);
    const newFromQty = stockFrom.quantity - conv.input_qty;
    if (newFromQty < 0) throw new Error(`Insufficient ${conv.from_pack_type} stock for conversion`);

    await serviceSupabase
        .from("stock_levels")
        .update({ quantity: newFromQty, updated_at: new Date().toISOString() })
        .eq("id", stockFrom.id);

    // Add output stock (upsert in case the row doesn't exist yet)
    const { data: stockTo } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", conv.sku_id)
        .eq("pack_type", conv.to_pack_type)
        .single();

    if (stockTo) {
        await serviceSupabase
            .from("stock_levels")
            .update({ quantity: stockTo.quantity + conv.output_qty, updated_at: new Date().toISOString() })
            .eq("id", stockTo.id);
    } else {
        await serviceSupabase
            .from("stock_levels")
            .insert({ sku_id: conv.sku_id, pack_type: conv.to_pack_type, quantity: conv.output_qty });
    }

    await serviceSupabase
        .from("wip_conversions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", conversionId);

    revalidatePath("/stalls");
    revalidatePath("/inventory");
    return { success: true };
}
