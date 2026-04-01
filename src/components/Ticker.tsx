interface TickerProps {
    symbol: string;
    name?: string;
    price: number;
}

const Ticker = ({ symbol, name, price }: TickerProps) => {
    return (
        <div className="flex items-center justify-between glass-card p-6">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-accent-purple/20 rounded-full flex items-center justify-center">
                    <span className="text-accent-purple font-bold text-lg">{symbol?.[0] ?? '?'}</span>
                </div>
                <div>
                    <h1 className="text-2xl">{symbol}</h1>
                    <p className="text-text-secondary text-sm">{name ?? 'Stock Tracker'}</p>
                </div>
            </div>
            <div className="text-right">
                <div className="text-3xl font-bold font-outfit text-accent-green">${price.toLocaleString()}</div>
                <div className="text-xs text-text-secondary mt-1 flex items-center gap-1 justify-end">
                    <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse"></span>
                    Live Projection
                </div>
            </div>
        </div>
    );
};

export default Ticker;
