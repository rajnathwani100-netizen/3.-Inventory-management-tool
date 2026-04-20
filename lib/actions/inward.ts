"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface SubmitBatchParams {
    direction: "inward" | "outward";
    packType: string;
    reason: string;
    notes: string;
    date: string;
    items: { skuId: string; quantity: number }[];
}

export async function submitBatchEntry(params: SubmitBatchParams) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (params.items.length === 0) throw new Error("Select at least one SKU");

    const { data: batch, error: batchError } = await supabase
        .from("entry_batches")
        .insert({
            direction: params.direction,
            pack_type: params.packType,
            reason: params.reason,
            notes: params.notes || null,
            date: params.date,
            status: "pending",
            submitted_by: user.id,
        })
        .select()
        .single();

    if (batchError || !batch) throw new Error(batchError?.message ?? "Failed to create entry");

    const { error: itemsError } = await supabase
        .from("batch_items")
        .insert(
            params.items.map((item) => ({
                batch_id: batch.id,
                sku_id: item.skuId,
                quantity: item.quantity,
            }))
        );

    if (itemsError) throw new Error(itemsError.message);

    revalidatePath("/inward");
    revalidatePath("/outward");
    revalidatePath("/approvals");

    return { success: true, batchId: batch.id };
}
