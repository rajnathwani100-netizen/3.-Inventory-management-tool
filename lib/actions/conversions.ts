"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────────────────────────────────────────
// createConversion
// Called when staff submits a new production run.
// recipeId       — which recipe (Pack of 6 Assorted, Single-Flavour, Trio)
// selectedSkuId  — required only for Single-Flavour Pack of 6 (the flavour SKU)
// quantity       — how many output units to produce
// ─────────────────────────────────────────────────────────────────────────────
export async function createConversion(params: {
    recipeId: string;
    selectedSkuId: string | null; // null for Assorted & Trio (no user choice needed)
    quantity: number;
    notes?: string;
    date: string;
}) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (params.quantity <= 0) throw new Error("Quantity must be > 0");

    // Load recipe + its ingredients
    const { data: recipe } = await serviceSupabase
        .from("conversion_recipes")
        .select("*, ingredients:conversion_recipe_ingredients(*, sku:skus(*))")
        .eq("id", params.recipeId)
        .single();

    if (!recipe) throw new Error("Recipe not found");

    // Resolve ingredient list
    let ingredients = recipe.ingredients ?? [];

    // For assorted: pull ALL active 30g individual SKUs (1 each)
    if (recipe.is_assorted) {
        const { data: allSkus } = await serviceSupabase
            .from("skus")
            .select("*")
            .eq("is_active", true)
            .order("name");

        ingredients = (allSkus ?? []).map((sku: any) => ({
            input_sku_id: sku.id,
            input_pack_type: "30g_individual",
            qty_per_output_unit: 1,
            sku,
        }));
    }

    if (ingredients.length === 0) throw new Error("Recipe has no ingredients configured yet");

    // For single-flavour: need the selected SKU
    if (!recipe.is_assorted && ingredients.some((i: any) => i.input_sku_id === null)) {
        if (!params.selectedSkuId) throw new Error("Please select a flavour for this recipe");
    }

    // Determine output SKU
    const outputSkuId = recipe.output_sku_id ?? params.selectedSkuId;
    if (!outputSkuId) throw new Error("Could not determine output SKU — please link the recipe to an output SKU");

    // Create conversion header
    const { data: conv, error: convErr } = await supabase
        .from("wip_conversions")
        .insert({
            recipe_id: params.recipeId,
            selected_sku_id: params.selectedSkuId,
            quantity: params.quantity,
            notes: params.notes || null,
            date: params.date,
            status: "in_progress",
            created_by: user.id,
        })
        .select()
        .single();

    if (convErr || !conv) throw new Error(convErr?.message ?? "Failed to create conversion");

    // Insert input lines (ingredients × quantity)
    const inputLines = ingredients.map((ing: any) => ({
        conversion_id: conv.id,
        sku_id: ing.input_sku_id ?? params.selectedSkuId,
        pack_type: ing.input_pack_type,
        quantity: ing.qty_per_output_unit * params.quantity,
    }));

    const { error: inputErr } = await supabase
        .from("wip_conversion_inputs")
        .insert(inputLines);
    if (inputErr) throw new Error(inputErr.message);

    // Insert output line
    const { error: outputErr } = await supabase
        .from("wip_conversion_outputs")
        .insert({
            conversion_id: conv.id,
            sku_id: outputSkuId,
            pack_type: recipe.output_pack_type,
            quantity: params.quantity,
        });
    if (outputErr) throw new Error(outputErr.message);

    revalidatePath("/conversions");
    return { success: true, conversionId: conv.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// completeConversion (admin only)
// Runs a preflight stock check across ALL inputs, then atomically
// deducts inputs and adds outputs.
// ─────────────────────────────────────────────────────────────────────────────
export async function completeConversion(conversionId: string) {
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

    // Load full conversion with nested input/output lines
    const { data: conv } = await serviceSupabase
        .from("wip_conversions")
        .select(`
            *,
            inputs:wip_conversion_inputs(*, sku:skus(*)),
            outputs:wip_conversion_outputs(*, sku:skus(*))
        `)
        .eq("id", conversionId)
        .single();

    if (!conv) throw new Error("Conversion not found");
    if (conv.status !== "in_progress") throw new Error("Conversion already finalised");

    // PRE-FLIGHT: verify every input has sufficient stock
    for (const input of conv.inputs ?? []) {
        const { data: stock } = await serviceSupabase
            .from("stock_levels")
            .select("quantity")
            .eq("sku_id", input.sku_id)
            .eq("pack_type", input.pack_type)
            .single();

        const available = stock?.quantity ?? 0;
        if (available < input.quantity) {
            throw new Error(
                `Insufficient stock for "${input.sku?.name ?? input.sku_id}" (${input.pack_type}). ` +
                `Available: ${available}, Required: ${input.quantity}`
            );
        }
    }

    // DEDUCT inputs
    for (const input of conv.inputs ?? []) {
        const { data: stock } = await serviceSupabase
            .from("stock_levels")
            .select("quantity, id")
            .eq("sku_id", input.sku_id)
            .eq("pack_type", input.pack_type)
            .single();

        if (stock) {
            await serviceSupabase
                .from("stock_levels")
                .update({ quantity: stock.quantity - input.quantity, updated_at: new Date().toISOString() })
                .eq("id", stock.id);
        }
    }

    // ADD outputs (upsert)
    for (const output of conv.outputs ?? []) {
        const { data: stock } = await serviceSupabase
            .from("stock_levels")
            .select("quantity, id")
            .eq("sku_id", output.sku_id)
            .eq("pack_type", output.pack_type)
            .single();

        if (stock) {
            await serviceSupabase
                .from("stock_levels")
                .update({ quantity: stock.quantity + output.quantity, updated_at: new Date().toISOString() })
                .eq("id", stock.id);
        } else {
            await serviceSupabase
                .from("stock_levels")
                .insert({ sku_id: output.sku_id, pack_type: output.pack_type, quantity: output.quantity });
        }
    }

    // Mark completed
    await serviceSupabase
        .from("wip_conversions")
        .update({ status: "completed", approved_by: user.id, completed_at: new Date().toISOString() })
        .eq("id", conversionId);

    revalidatePath("/conversions");
    revalidatePath("/inventory");
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// rejectConversion (admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function rejectConversion(conversionId: string) {
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
        .from("wip_conversions")
        .update({ status: "rejected", approved_by: user.id, completed_at: new Date().toISOString() })
        .eq("id", conversionId);

    revalidatePath("/conversions");
    return { success: true };
}
