export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4 animate-pulse">
            <div className="h-6 w-24 bg-gray-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="card space-y-2">
                        <div className="h-4 w-20 bg-gray-200 rounded" />
                        <div className="h-8 w-16 bg-gray-200 rounded-lg" />
                    </div>
                ))}
            </div>
            <div className="card space-y-3">
                <div className="h-4 w-32 bg-gray-200 rounded" />
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <div className="h-3 w-24 bg-gray-100 rounded" />
                        <div className="flex-1 h-3 bg-gray-100 rounded-full" />
                        <div className="h-3 w-10 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
