"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { syncToSheets } from "./sheets";

export type { ApproveEntryParams, RejectEntryParams };

interface ApproveEntryParams {
    batchId: string;
}

interface RejectEntryParams {
    batchId: string;
}

interface ReverseEntryParams {
    batchId: string;
    note?: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// reverseEntry (admin only)
// Fully undoes the stock effect of an approved batch by running the opposite
// movement, then marks the original batch as reversed.
// Creates a "reversal" counter-batch for audit trail.
// ─────────────────────────────────────────────────────────────────────────────
export async function reverseEntry({ batchId, note }: ReverseEntryParams) {
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

    // Load the batch to reverse
    const { data: batch, error: batchError } = await serviceSupabase
        .from("entry_batches")
        .select("*, batch_items(*, sku:skus(*))")
        .eq("id", batchId)
        .single();

    if (batchError || !batch) throw new Error("Batch not found");
    if (batch.status !== "approved") throw new Error("Can only reverse an approved entry");
    if (batch.is_reversed) throw new Error("This entry has already been reversed");

    // The reversal direction is the OPPOSITE of the original
    const reversalDirection = batch.direction === "inward" ? "outward" : "inward";

    // Run counter stock movements
    for (const item of batch.batch_items || []) {
        const { data: existing, error: fetchErr } = await serviceSupabase
            .from("stock_levels")
            .select("quantity, id")
            .eq("sku_id", item.sku_id)
            .eq("pack_type", batch.pack_type)
            .single();

        if (fetchErr && fetchErr.code !== "PGRST116") {
            throw new Error(`Stock fetch failed for ${item.sku?.name}: ${fetchErr.message}`);
        }

        const currentQty = existing?.quantity ?? 0;
        // If original was inward (+qty), reversal deducts (-qty)
        // If original was outward (-qty), reversal adds back (+qty)
        const newQty = reversalDirection === "inward"
            ? currentQty + item.quantity
            : currentQty - item.quantity;

        if (newQty < 0) {
            throw new Error(
                `Cannot reverse: reverting "${item.sku?.name}" would result in negative stock ` +
                `(current: ${currentQty}, would deduct: ${item.quantity})`
            );
        }

        if (existing) {
            const { error: upErr } = await serviceSupabase
                .from("stock_levels")
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
            if (upErr) throw new Error(`Stock update failed for ${item.sku?.name}: ${upErr.message}`);
        } else {
            const { error: insErr } = await serviceSupabase
                .from("stock_levels")
                .insert({ sku_id: item.sku_id, pack_type: batch.pack_type, quantity: newQty });
            if (insErr) throw new Error(`Stock insert failed for ${item.sku?.name}: ${insErr.message}`);
        }
    }

    // Create a counter-batch for audit trail
    const { data: reversalBatch, error: revBatchErr } = await serviceSupabase
        .from("entry_batches")
        .insert({
            direction: reversalDirection,
            pack_type: batch.pack_type,
            reason: `REVERSAL of batch ${batchId.slice(0, 8)}…`,
            notes: note || `Reversed by admin on ${new Date().toLocaleDateString("en-IN")}`,
            date: new Date().toISOString().split("T")[0],
            status: "approved",
            submitted_by: user.id,
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            reversal_of: batchId,
        })
        .select()
        .single();

    if (revBatchErr || !reversalBatch) throw new Error("Failed to create reversal record: " + revBatchErr?.message);

    // Copy batch items to the reversal batch
    const reversalItems = (batch.batch_items || []).map((item: any) => ({
        batch_id: reversalBatch.id,
        sku_id: item.sku_id,
        quantity: item.quantity,
    }));

    if (reversalItems.length > 0) {
        const { error: itemsErr } = await serviceSupabase
            .from("batch_items")
            .insert(reversalItems);
        if (itemsErr) throw new Error("Failed to copy items to reversal: " + itemsErr.message);
    }

    // Mark original batch as reversed
    const { error: markErr } = await serviceSupabase
        .from("entry_batches")
        .update({
            is_reversed: true,
            reversed_by: user.id,
            reversed_at: new Date().toISOString(),
            reversal_note: note || null,
        })
        .eq("id", batchId);

    if (markErr) throw new Error("Failed to mark batch as reversed: " + markErr.message);

    revalidatePath("/approvals");
    revalidatePath("/inventory");
    return { success: true, reversalBatchId: reversalBatch.id };
}
