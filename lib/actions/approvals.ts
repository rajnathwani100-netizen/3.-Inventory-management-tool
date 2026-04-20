"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { syncToSheets } from "./sheets";

interface ApproveEntryParams {
    batchId: string;
}

interface RejectEntryParams {
    batchId: string;
}

export async function approveEntry({ batchId }: ApproveEntryParams) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, name")
        .eq("id", user.id)
        .single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    const { data: batch, error: batchError } = await serviceSupabase
        .from("entry_batches")
        .select("*, batch_items(*, sku:skus(*))")
        .eq("id", batchId)
        .single();

    if (batchError || !batch) throw new Error("Batch not found");
    if (batch.status !== "pending") throw new Error("Batch already processed");

    for (const item of batch.batch_items || []) {
        const { data: existing } = await serviceSupabase
            .from("stock_levels")
            .select("quantity, id")
            .eq("sku_id", item.sku_id)
            .eq("pack_type", batch.pack_type)
            .single();

        const currentQty = existing?.quantity ?? 0;
        const newQty =
            batch.direction === "inward"
                ? currentQty + item.quantity
                : currentQty - item.quantity;

        if (newQty < 0 && batch.direction === "outward") {
            throw new Error(
                `Insufficient stock for ${item.sku?.name ?? item.sku_id}. Current: ${currentQty}, Requested: ${item.quantity}`
            );
        }

        if (existing) {
            await serviceSupabase
                .from("stock_levels")
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
        } else {
            await serviceSupabase
                .from("stock_levels")
                .insert({ sku_id: item.sku_id, pack_type: batch.pack_type, quantity: newQty });
        }
    }

    await serviceSupabase
        .from("entry_batches")
        .update({
            status: "approved",
            approved_by: user.id,
            approved_at: new Date().toISOString(),
        })
        .eq("id", batchId);

    let sheetsSyncFailed = false;
    try {
        await syncToSheets(batch, profile?.name ?? user.email ?? "Unknown");
    } catch (err) {
        console.error("Sheets sync failed:", err);
        sheetsSyncFailed = true;
    }

    revalidatePath("/approvals");
    revalidatePath("/inventory");

    return { success: true, sheetsSyncFailed };
}

export async function rejectEntry({ batchId }: RejectEntryParams) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    await serviceSupabase
        .from("entry_batches")
        .update({
            status: "rejected",
            approved_by: user.id,
            approved_at: new Date().toISOString(),
        })
        .eq("id", batchId);

    revalidatePath("/approvals");
    return { success: true };
}
