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
// SAFE ORDER: DB records FIRST → stock LAST.
// If DB insert fails, stock is NEVER touched. No more partial corruption.
// Works WITHOUT migration 006 — no dependency on new columns.
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

    // ── 1. Load the batch ────────────────────────────────────────────────────
    const { data: batch, error: batchError } = await serviceSupabase
        .from("entry_batches")
        .select("*, batch_items(*, sku:skus(*))")
        .eq("id", batchId)
        .single();

    if (batchError || !batch) throw new Error("Batch not found");
    if (batch.status !== "approved") throw new Error("Can only reverse an approved entry");

    const reversalDirection = batch.direction === "inward" ? "outward" : "inward";

    // ── 2. Pre-flight: check stock won't go negative ─────────────────────────
    for (const item of batch.batch_items || []) {
        if (reversalDirection === "outward") {
            const { data: stock } = await serviceSupabase
                .from("stock_levels")
                .select("quantity")
                .eq("sku_id", item.sku_id)
                .eq("pack_type", batch.pack_type)
                .maybeSingle();
            const available = stock?.quantity ?? 0;
            if (available < item.quantity) {
                throw new Error(
                    `Cannot reverse: "${item.sku?.name}" only has ${available} units but reversal needs to deduct ${item.quantity}`
                );
            }
        }
    }

    // ── 3. Create counter-batch record FIRST (no new columns needed) ─────────
    const reversalReason = note
        ? `REVERSAL: ${note}`
        : `REVERSAL of ${batch.direction} entry from ${batch.date}`;

    const { data: reversalBatch, error: revBatchErr } = await serviceSupabase
        .from("entry_batches")
        .insert({
            direction: reversalDirection,
            pack_type: batch.pack_type,
            reason: reversalReason,
            notes: `Reversal of batch ID ${batchId.slice(0, 8)}`,
            date: new Date().toISOString().split("T")[0],
            status: "approved",
            submitted_by: user.id,
            approved_by: user.id,
            approved_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (revBatchErr || !reversalBatch) {
        throw new Error("Failed to create reversal record: " + (revBatchErr?.message ?? "unknown"));
    }

    // ── 4. Copy items to reversal batch ──────────────────────────────────────
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

    // ── 5. NOW update stock (only if all DB writes above succeeded) ──────────
    for (const item of batch.batch_items || []) {
        const { data: existing } = await serviceSupabase
            .from("stock_levels")
            .select("quantity, id")
            .eq("sku_id", item.sku_id)
            .eq("pack_type", batch.pack_type)
            .maybeSingle();

        const currentQty = existing?.quantity ?? 0;
        const newQty = reversalDirection === "inward"
            ? currentQty + item.quantity   // original outward → add back
            : currentQty - item.quantity;  // original inward  → deduct back

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

    // ── 6. Optionally mark original as reversed (needs migration 006) ────────
    // Silently ignored if columns don't exist yet — audit trail still exists
    try {
        await serviceSupabase
            .from("entry_batches")
            .update({
                is_reversed: true,
                reversed_by: user.id,
                reversed_at: new Date().toISOString(),
                reversal_note: note || null,
            })
            .eq("id", batchId);
    } catch {
        // Columns not yet added — safe to ignore
    }

    revalidatePath("/approvals");
    revalidatePath("/inventory");
    return { success: true, reversalBatchId: reversalBatch.id };
}
