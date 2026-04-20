export default function Loading() {
    return (
        <div className="px-4 py-5 max-w-2xl mx-auto animate-pulse">
            <div className="h-6 w-36 bg-gray-200 rounded-lg mb-4" />
            <div className="grid grid-cols-2 gap-3 mb-5">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="card space-y-2">
                        <div className="h-5 w-5 bg-gray-200 rounded" />
                        <div className="h-7 w-16 bg-gray-200 rounded-lg" />
                        <div className="h-3 w-20 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-brand-border mb-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex-1 h-9 bg-gray-100 rounded-lg" />
                ))}
            </div>
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="card flex items-center gap-4">
                        <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 bg-gray-200 rounded" />
                            <div className="h-3 w-20 bg-gray-100 rounded" />
                            <div className="w-full bg-gray-100 rounded-full h-1.5" />
                        </div>
                        <div className="h-8 w-10 bg-gray-200 rounded-lg shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
}
