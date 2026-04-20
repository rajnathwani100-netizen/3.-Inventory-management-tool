"use server";

import { createClient } from "@/lib/supabase/server";
import { PackTypeRecord } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function getPackTypes(): Promise<PackTypeRecord[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("pack_types")
        .select("*")
        .order("sort_order");
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function createPackType(params: {
    name: string;
    label: string;
}): Promise<void> {
    const supabase = await createClient();
    const { data: existing } = await supabase
        .from("pack_types")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();
    const nextOrder = (existing?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("pack_types").insert({
        name: params.name,
        label: params.label,
        is_active: true,
        sort_order: nextOrder,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/skus");
}

export async function togglePackType(id: string, isActive: boolean): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
        .from("pack_types")
        .update({ is_active: !isActive })
        .eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/skus");
}
