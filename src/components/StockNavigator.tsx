import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Stock } from '../types';

interface StockNavigatorProps {
    stocks: Stock[];
    currentIndex: number;
    onPrev: () => void;
    onNext: () => void;
    onAddStock: () => void;
    onRemoveStock: () => void;
    onBack: () => void;
}

const StockNavigator = ({ stocks, currentIndex, onPrev, onNext, onAddStock, onRemoveStock, onBack }: StockNavigatorProps) => {
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
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', marginRight: '4px' }}
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
                    {current && (
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {current.name}{' '}
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                                ({current.ticker})
                            </span>
                        </span>
                    )}
                    {stocks.length > 1 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                            {currentIndex + 1} / {stocks.length}
                        </span>
                    )}
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
