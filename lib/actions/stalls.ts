"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function openStall(params: {
    name: string;
    location?: string;
    date: string;
    skuId: string;
    packType: string;
    dispatched: number;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: stall, error } = await supabase
        .from("stall_sessions")
        .insert({
            name: params.name,
            location: params.location || null,
            date: params.date,
            status: "active",
            created_by: user.id,
        })
        .select()
        .single();

    if (error || !stall) throw new Error(error?.message ?? "Failed to create stall");

    await supabase.from("stall_items").insert({
        stall_id: stall.id,
        sku_id: params.skuId,
        pack_type: params.packType,
        dispatched: params.dispatched,
    });

    await supabase.from("entry_batches").insert({
        direction: "outward",
        pack_type: params.packType,
        reason: "Stall dispatch",
        notes: `Stall: ${params.name}`,
        date: params.date,
        status: "approved",
        submitted_by: user.id,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
    });

    const serviceSupabase = await createServiceClient();
    const { data: existing } = await serviceSupabase
        .from("stock_levels")
        .select("quantity, id")
        .eq("sku_id", params.skuId)
        .eq("pack_type", params.packType)
        .single();

    if (existing) {
        await serviceSupabase
            .from("stock_levels")
            .update({
                quantity: Math.max(0, existing.quantity - params.dispatched),
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
    }

    revalidatePath("/stalls");
    revalidatePath("/inventory");
    return { success: true };
}

export async function logReturn(params: { stallId: string; stallItemId: string; returned: number }) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    await supabase
        .from("stall_items")
        .update({ returned: params.returned })
        .eq("id", params.stallItemId);

    await supabase
        .from("stall_sessions")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", params.stallId);

    const { data: item } = await supabase
        .from("stall_items")
        .select("sku_id, pack_type")
        .eq("id", params.stallItemId)
        .single();

    if (item) {
        const serviceSupabase = await createServiceClient();
        const { data: existing } = await serviceSupabase
            .from("stock_levels")
            .select("quantity, id")
            .eq("sku_id", item.sku_id)
            .eq("pack_type", item.pack_type)
            .single();

        if (existing) {
            await serviceSupabase
                .from("stock_levels")
                .update({
                    quantity: existing.quantity + params.returned,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);
        }
    }

    revalidatePath("/stalls");
    revalidatePath("/inventory");
    return { success: true };
}
