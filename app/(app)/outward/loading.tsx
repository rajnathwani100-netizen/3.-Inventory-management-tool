export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-6 w-28 bg-gray-200 rounded-lg" />
                <div className="flex gap-2">
                    <div className="h-9 w-24 bg-gray-100 rounded-xl" />
                    <div className="h-9 w-28 bg-gray-200 rounded-xl" />
                </div>
            </div>
            <div>
                <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="card flex items-start gap-3">
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-48 bg-gray-200 rounded" />
                                <div className="h-3 w-32 bg-gray-100 rounded" />
                            </div>
                            <div className="h-6 w-16 bg-gray-100 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
