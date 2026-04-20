export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import { Toaster } from "react-hot-toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    let pendingCount = 0;
    if (profile?.role === "admin") {
        const { count } = await supabase
            .from("entry_batches")
            .select("*", { count: "exact", head: true })
            .eq("status", "pending");
        pendingCount = count ?? 0;
    }

    return (
        <div className="min-h-screen flex flex-col bg-brand-bg">
            <TopBar role={profile?.role ?? "staff"} name={profile?.name} />
            <main className="flex-1 pb-nav overflow-y-auto">{children}</main>
            <BottomNav role={profile?.role ?? "staff"} pendingCount={pendingCount} />
            <Toaster
                position="top-center"
                toastOptions={{
                    style: {
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: "14px",
                        borderRadius: "12px",
                        background: "#fff",
                        color: "#3B1D06",
                        boxShadow: "0 4px 20px #3B1D0615",
                    },
                }}
            />
        </div>
    );
}
