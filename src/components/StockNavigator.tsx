import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Stock } from '../types';

interface StockNavigatorProps {
    stocks: Stock[];
    currentIndex: number;
    onPrev: () => void;
    onNext: () => void;
    onNavigate: (index: number) => void;
    onAddStock: () => void;
    onRemoveStock: () => void;
    onBack: () => void;
}

const StockNavigator = ({ stocks, currentIndex, onPrev, onNext, onNavigate, onAddStock, onRemoveStock, onBack }: StockNavigatorProps) => {
    const current = stocks[currentIndex];
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === stocks.length - 1;

    return (
        <div className="glass-card mb-4" style={{ padding: '12px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                    onClick={onBack}
                    className="btn btn-secondary"
                    title="Back to home"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', marginRight: '4px', fontSize: '14px' }}
                >
                    <ArrowLeft size={16} />
                    Home
                </button>
                <button
                    onClick={onPrev}
                    disabled={isFirst}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', opacity: isFirst ? 0.35 : 1 }}
                >
                    <ChevronLeft size={16} />
                </button>

                <div style={{ flex: 1, textAlign: 'center' }}>
                    <select
                        value={currentIndex}
                        onChange={e => onNavigate(Number(e.target.value))}
                        style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--card-border)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            appearance: 'none',
                            WebkitAppearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 8px center',
                            paddingRight: '28px',
                        }}
                    >
                        {stocks.map((s, i) => (
                            <option key={s.ticker} value={i} style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }}>
                                {s.name === s.ticker ? s.ticker : `${s.name} (${s.ticker})`}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={onNext}
                    disabled={isLast}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', opacity: isLast ? 0.35 : 1 }}
                >
                    <ChevronRight size={16} />
                </button>

                <button
                    onClick={onAddStock}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', marginLeft: '8px' }}
                >
                    <Plus size={14} />
                    Add Stock
                </button>

                <button
                    onClick={onRemoveStock}
                    className="btn-delete"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}
                >
                    <Trash2 size={14} />
                    Remove Stock
                </button>
            </div>
        </div>
    );
};

export default StockNavigator;
