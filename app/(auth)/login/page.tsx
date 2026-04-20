"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            router.push("/inventory");
            router.refresh();
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            <div className="bg-brand-pink flex-1 flex flex-col items-center justify-center px-6 py-16 min-h-[45vh]">
                <div className="text-center mb-2">
                    <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-white text-sm font-medium mb-6">
                        📦 Inventory Portal
                    </div>
                    <h1 className="font-serif text-5xl text-white mb-3 leading-tight">Knacks</h1>
                    <p className="text-white/80 text-lg font-medium">Inventory Management</p>
                    <p className="text-white/60 text-sm mt-1">eatknacks.com</p>
                </div>
            </div>

            <div className="bg-brand-bg flex-1 flex items-start justify-center px-6 -mt-8">
                <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 mt-0 border border-brand-border">
                    <h2 className="font-serif text-2xl text-brand-heading mb-1">Welcome back</h2>
                    <p className="text-brand-text text-sm mb-6">Sign in to manage your inventory</p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="label">Email address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@knacks.com"
                                required
                                className="input"
                            />
                        </div>
                        <div>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="input"
                            />
                        </div>

                        {error && (
                            <div className="bg-pink-50 border border-brand-pink/20 rounded-xl p-3 text-brand-pink text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-brand-btnText/30 border-t-brand-btnText rounded-full animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                "Sign in →"
                            )}
                        </button>
                    </form>

                    <p className="text-center text-xs text-gray-400 mt-6">
                        Knacks Khakhra · Internal portal only
                    </p>
                </div>
            </div>
        </div>
    );
}
