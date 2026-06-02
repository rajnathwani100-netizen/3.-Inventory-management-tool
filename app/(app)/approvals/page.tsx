import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ApprovalsClient from "./ApprovalsClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

    if (profile?.role !== "admin") {
        return (
            <div className="px-4 py-10 max-w-md mx-auto text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h2 className="font-serif text-2xl text-brand-heading mb-2">Admin Access Required</h2>
                <p className="text-brand-text/60 text-sm">Only admins can access the approvals queue.</p>
            </div>
        );
    }

    const batchSelect = "*, batch_items(*, sku:skus(*)), submitter:profiles!submitted_by(name), approver:profiles!approved_by(name)";

    const [{ data: pending }, { data: history }] = await Promise.all([
        supabase
            .from("entry_batches")
            .select(batchSelect)
            .eq("status", "pending")
            .order("created_at", { ascending: true }),
        supabase
            .from("entry_batches")
            .select(batchSelect)
            .in("status", ["approved", "rejected"])
            .order("approved_at", { ascending: false })
            .limit(100),
    ]);

    return (
        <ApprovalsClient
            initialPending={pending ?? []}
            initialHistory={history ?? []}
            role={profile?.role ?? "staff"}
        />
    );
}
