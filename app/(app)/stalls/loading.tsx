export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-6 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-6 w-36 bg-gray-200 rounded-lg" />
                <div className="h-9 w-28 bg-gray-200 rounded-xl" />
            </div>
            <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="card space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-14 bg-gray-100 rounded-full" />
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                        </div>
                        <div className="h-3 w-full bg-gray-100 rounded-full" />
                        <div className="flex gap-2">
                            <div className="h-9 flex-1 bg-gray-100 rounded-xl" />
                            <div className="h-9 w-24 bg-gray-100 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between">
                <div className="h-6 w-40 bg-gray-200 rounded-lg" />
                <div className="h-9 w-24 bg-gray-100 rounded-xl" />
            </div>
            <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="card flex items-center gap-3">
                        <div className="flex-1 space-y-1">
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                            <div className="h-3 w-40 bg-gray-100 rounded" />
                        </div>
                        <div className="h-8 w-20 bg-gray-100 rounded-xl" />
                    </div>
                ))}
            </div>
        </div>
    );
}
