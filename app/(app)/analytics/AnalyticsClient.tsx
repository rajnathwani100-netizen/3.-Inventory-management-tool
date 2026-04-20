"use client";

import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend,
} from "recharts";

interface AnalyticsData {
    outwardByReason: { reason: string; count: number }[];
    stockBySku: { name: string; qty: number; threshold: number }[];
    weeklyMovement: { date: string; inward: number; outward: number }[];
    stallSellThrough: { name: string; pct: number }[];
}

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
    const { outwardByReason, stockBySku, weeklyMovement, stallSellThrough } = data;

    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6">
            <h2 className="section-title">Analytics</h2>

            <div className="card">
                <h3 className="font-serif text-base text-brand-heading mb-4">Outward by Reason</h3>
                {outwardByReason.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={outwardByReason} margin={{ top: 4, right: 4, bottom: 40, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3B1D0610" />
                            <XAxis dataKey="reason" tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} angle={-30} textAnchor="end" />
                            <YAxis tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} />
                            <Tooltip contentStyle={{ fontFamily: "DM Sans", fontSize: 12, borderRadius: 8 }} />
                            <Bar dataKey="count" fill="#EB2676" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="card">
                <h3 className="font-serif text-base text-brand-heading mb-4">Current Stock by SKU (30g)</h3>
                {stockBySku.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height={230}>
                        <BarChart layout="vertical" data={stockBySku} margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3B1D0610" />
                            <XAxis type="number" tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} width={90} />
                            <Tooltip contentStyle={{ fontFamily: "DM Sans", fontSize: 12, borderRadius: 8 }} />
                            <Bar dataKey="qty" radius={[0, 4, 4, 0]} fill="#3B1D06" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="card">
                <h3 className="font-serif text-base text-brand-heading mb-4">Weekly Stock Movement</h3>
                {weeklyMovement.length === 0 ? <EmptyChart /> : (
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={weeklyMovement} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3B1D0610" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} />
                            <YAxis tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} />
                            <Tooltip contentStyle={{ fontFamily: "DM Sans", fontSize: 12, borderRadius: 8 }} />
                            <Legend wrapperStyle={{ fontFamily: "DM Sans", fontSize: 11 }} />
                            <Line type="monotone" dataKey="inward" stroke="#3B1D06" strokeWidth={2} dot={false} name="Inward" />
                            <Line type="monotone" dataKey="outward" stroke="#EB2676" strokeWidth={2} dot={false} name="Outward" />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="card">
                <h3 className="font-serif text-base text-brand-heading mb-4">Stall Sell-Through Rate (%)</h3>
                {stallSellThrough.length === 0 ? <EmptyChart label="No closed stall sessions yet" /> : (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={stallSellThrough} margin={{ top: 4, right: 4, bottom: 40, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3B1D0610" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} angle={-30} textAnchor="end" />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontFamily: "DM Sans", fill: "#3B1D06" }} />
                            <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontFamily: "DM Sans", fontSize: 12, borderRadius: 8 }} />
                            <Bar dataKey="pct" fill="#EB2676" radius={[4, 4, 0, 0]} name="Sell-through %" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

function EmptyChart({ label = "No data yet" }: { label?: string }) {
    return <div className="h-32 flex items-center justify-center text-brand-text/40 text-sm">{label}</div>;
}
