"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────────────────────────────────────────
// createConversion — no more is_assorted; uses only DB ingredients
// ─────────────────────────────────────────────────────────────────────────────
export async function createConversion(params: {
    recipeId: string;
    selectedSkuId: string | null;
    quantity: number;
    notes?: string;
    date: string;
}) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    if (params.quantity <= 0) throw new Error("Quantity must be > 0");

    // Load recipe + its saved ingredients
    const { data: recipe, error: recipeErr } = await serviceSupabase
        .from("conversion_recipes")
        .select("*, ingredients:conversion_recipe_ingredients(*, sku:skus(*))")
        .eq("id", params.recipeId)
        .single();

    if (recipeErr) throw new Error("Recipe load error: " + recipeErr.message);
    if (!recipe) throw new Error("Recipe not found");

    const ingredients = recipe.ingredients ?? [];
    if (ingredients.length === 0)
        throw new Error("This recipe has no ingredients yet. Ask admin to configure it in the Recipes tab.");

    // For single-flavour: validate selectedSkuId
    const needsSkuPick = ingredients.some((i: any) => i.input_sku_id === null);
    if (needsSkuPick && !params.selectedSkuId)
        throw new Error("Please select a flavour");

    // Resolve output SKU
    const outputSkuId = recipe.output_sku_id ?? params.selectedSkuId;
    if (!outputSkuId)
        throw new Error("Output SKU not configured — set it in the Recipes tab");

    // Create conversion header
    const { data: conv, error: convErr } = await serviceSupabase
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

    if (convErr || !conv) throw new Error("DB insert failed: " + (convErr?.message ?? "unknown"));

    // Insert resolved input lines
    const inputLines = ingredients.map((ing: any) => ({
        conversion_id: conv.id,
        sku_id: ing.input_sku_id ?? params.selectedSkuId,
        pack_type: ing.input_pack_type,
        quantity: ing.qty_per_output_unit * params.quantity,
    }));

    const { error: inputErr } = await serviceSupabase
        .from("wip_conversion_inputs")
        .insert(inputLines);
    if (inputErr) throw new Error("Input insert failed: " + inputErr.message);

    // Insert output line
    const { error: outputErr } = await serviceSupabase
        .from("wip_conversion_outputs")
        .insert({
            conversion_id: conv.id,
            sku_id: outputSkuId,
            pack_type: recipe.output_pack_type,
            quantity: params.quantity,
        });
    if (outputErr) throw new Error("Output insert failed: " + outputErr.message);

    revalidatePath("/conversions");
    return { success: true, conversionId: conv.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// completeConversion (admin only) — deduct inputs, add outputs
// ─────────────────────────────────────────────────────────────────────────────
export async function completeConversion(conversionId: string) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    const { data: conv, error: loadErr } = await serviceSupabase
        .from("wip_conversions")
        .select("*, inputs:wip_conversion_inputs(*, sku:skus(*)), outputs:wip_conversion_outputs(*, sku:skus(*))")
        .eq("id", conversionId)
        .single();

    if (loadErr) throw new Error("Load error: " + loadErr.message);
    if (!conv) throw new Error("Conversion not found");
    if (conv.status !== "in_progress") throw new Error("Already finalised");

    // PRE-FLIGHT stock check
    for (const input of conv.inputs ?? []) {
        const { data: stock } = await serviceSupabase
            .from("stock_levels").select("quantity")
            .eq("sku_id", input.sku_id).eq("pack_type", input.pack_type).single();
        const available = stock?.quantity ?? 0;
        if (available < input.quantity)
            throw new Error(`Insufficient stock: "${input.sku?.name}" needs ${input.quantity} but only ${available} available`);
    }

    // DEDUCT inputs
    for (const input of conv.inputs ?? []) {
        const { data: stock } = await serviceSupabase
            .from("stock_levels").select("quantity, id")
            .eq("sku_id", input.sku_id).eq("pack_type", input.pack_type).single();
        if (stock) {
            await serviceSupabase.from("stock_levels")
                .update({ quantity: stock.quantity - input.quantity, updated_at: new Date().toISOString() })
                .eq("id", stock.id);
        }
    }

    // ADD outputs
    for (const output of conv.outputs ?? []) {
        const { data: stock } = await serviceSupabase
            .from("stock_levels").select("quantity, id")
            .eq("sku_id", output.sku_id).eq("pack_type", output.pack_type).single();
        if (stock) {
            await serviceSupabase.from("stock_levels")
                .update({ quantity: stock.quantity + output.quantity, updated_at: new Date().toISOString() })
                .eq("id", stock.id);
        } else {
            await serviceSupabase.from("stock_levels")
                .insert({ sku_id: output.sku_id, pack_type: output.pack_type, quantity: output.quantity });
        }
    }

    await serviceSupabase.from("wip_conversions")
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
        .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    await serviceSupabase.from("wip_conversions")
        .update({ status: "rejected", approved_by: user.id, completed_at: new Date().toISOString() })
        .eq("id", conversionId);

    revalidatePath("/conversions");
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// deleteConversion (admin only) — only allowed if still in_progress
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteConversion(conversionId: string) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    const { data: conv } = await serviceSupabase
        .from("wip_conversions").select("status").eq("id", conversionId).single();
    if (conv?.status === "completed")
        throw new Error("Cannot delete a completed conversion — stock has already been adjusted");

    // Cascade deletes inputs/outputs automatically (on delete cascade)
    await serviceSupabase.from("wip_conversions").delete().eq("id", conversionId);

    revalidatePath("/conversions");
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// updateRecipeIngredients (admin only)
// Replaces all ingredient rows for a recipe.
// For assorted/trio: skuIngredients = [{ skuId, qtyPerUnit }]
// For single-flavour: skuIngredients = [{ skuId: null, qtyPerUnit: 6 }]
// ─────────────────────────────────────────────────────────────────────────────
export async function updateRecipeIngredients(
    recipeId: string,
    ingredients: { skuId: string | null; packType: string; qtyPerUnit: number }[],
    outputSkuId: string | null
) {
    const supabase = await createClient();
    const serviceSupabase = await createServiceClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    // Delete all existing ingredients for this recipe
    await serviceSupabase
        .from("conversion_recipe_ingredients")
        .delete()
        .eq("recipe_id", recipeId);

    // Insert new ones
    if (ingredients.length > 0) {
        const { error } = await serviceSupabase
            .from("conversion_recipe_ingredients")
            .insert(ingredients.map((ing) => ({
                recipe_id: recipeId,
                input_sku_id: ing.skuId,
                input_pack_type: ing.packType,
                qty_per_output_unit: ing.qtyPerUnit,
            })));
        if (error) throw new Error("Ingredient update failed: " + error.message);
    }

    // Update output SKU if provided
    if (outputSkuId !== undefined) {
        await serviceSupabase
            .from("conversion_recipes")
            .update({ output_sku_id: outputSkuId })
            .eq("id", recipeId);
    }

    revalidatePath("/conversions");
    return { success: true };
}
