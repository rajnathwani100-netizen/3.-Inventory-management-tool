#!/usr/bin/env node
/**
 * Knacks Inventory — Seed Script
 * Run: npx ts-node scripts/seed.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SEED_PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "Knacks@Admin2025";

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const SKUS = [
    { code: "KN-CL-35", name: "Chilly Lemony", category: "Snacks", low_stock_threshold: 100 },
    { code: "KN-ML-35", name: "Methi-Licious", category: "Snacks", low_stock_threshold: 100 },
    { code: "KN-DO-35", name: "Dream Cream & Onion", category: "Snacks", low_stock_threshold: 100 },
    { code: "KN-PP-35", name: "2-Minute Masala Noodle", category: "Snacks", low_stock_threshold: 100 },
    { code: "KN-CP-35", name: "Cheesy Peasy", category: "Snacks", low_stock_threshold: 100 },
    { code: "KN-CT-35", name: "Cheesy Tomato", category: "Snacks", low_stock_threshold: 100 },
    { code: "KN-AS-35", name: "Assorted Pack", category: "Grocery Snacks", low_stock_threshold: 100 },
];

const PACK_TYPES = ["30g_individual", "pack_of_6", "sample_200g"] as const;

async function main() {
    console.log("🌱 Starting seed...\n");

    console.log("📦 Inserting SKUs...");
    const { data: insertedSkus, error: skuError } = await supabase
        .from("skus")
        .upsert(SKUS, { onConflict: "code" })
        .select();

    if (skuError) {
        console.error("❌ SKU insert failed:", skuError.message);
        process.exit(1);
    }
    console.log(`✅ ${insertedSkus?.length ?? 0} SKUs seeded`);

    console.log("📊 Creating stock levels...");
    const stockRows = (insertedSkus ?? []).flatMap((sku) =>
        PACK_TYPES.map((pt) => ({ sku_id: sku.id, pack_type: pt, quantity: 0 }))
    );

    const { error: stockError } = await supabase
        .from("stock_levels")
        .upsert(stockRows, { onConflict: "sku_id,pack_type" });

    if (stockError) {
        console.error("❌ Stock levels failed:", stockError.message);
    } else {
        console.log(`✅ ${stockRows.length} stock_level rows seeded`);
    }

    console.log("\n👤 Creating admin user (admin@knacks.com)...");
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email: "admin@knacks.com",
        password: ADMIN_PASSWORD,
        email_confirm: true,
    });

    if (authError) {
        if (authError.message.includes("already been registered")) {
            console.log("ℹ️  Admin user already exists");
        } else {
            console.error("❌ Auth user creation failed:", authError.message);
        }
    } else if (user) {
        console.log(`✅ Admin user created: ${user.email}`);
        await supabase
            .from("profiles")
            .upsert({ id: user.id, role: "admin", name: "Admin" }, { onConflict: "id" });
        console.log("✅ Profile set to admin role");
    }

    console.log("\n🎉 Seed complete!");
    console.log("   Admin login: admin@knacks.com / " + ADMIN_PASSWORD);
}

main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
});
