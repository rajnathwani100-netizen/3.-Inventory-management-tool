export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 animate-pulse">
            <div className="h-6 w-32 bg-gray-200 rounded-lg" />
            <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="card space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-48 bg-gray-200 rounded" />
                                <div className="h-3 w-36 bg-gray-100 rounded" />
                                <div className="h-3 w-28 bg-gray-100 rounded" />
                            </div>
                            <div className="h-6 w-16 bg-gray-100 rounded-full" />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <div className="h-9 flex-1 bg-green-100 rounded-xl" />
                            <div className="h-9 flex-1 bg-red-100 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
