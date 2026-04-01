import { useState } from 'react';
import { X } from 'lucide-react';

interface AddStockModalProps {
    onAdd: (name: string, ticker: string) => void;
    onClose: () => void;
}

const AddStockModal = ({ onAdd, onClose }: AddStockModalProps) => {
    const [name, setName] = useState<string>('');
    const [ticker, setTicker] = useState<string>('');
    const [error, setError] = useState<string>('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        const trimmedTicker = ticker.trim().toUpperCase();

        if (!trimmedName) {
            setError('Stock name is required.');
            return;
        }
        if (!trimmedTicker) {
            setError('Ticker symbol is required.');
            return;
        }
        if (trimmedTicker.length > 6) {
            setError('Ticker symbol must be 6 characters or fewer.');
            return;
        }

        setError('');
        onAdd(trimmedName, trimmedTicker);
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                backgroundColor: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="glass-card" style={{ width: '100%', maxWidth: '420px', margin: '16px', position: 'relative' }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '16px', right: '16px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: '4px',
                    }}
                >
                    <X size={18} />
                </button>

                <h2 style={{ marginBottom: '24px' }}>Add New Stock</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                            Stock Name
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g. Apple Inc"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                            Ticker Symbol
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g. AAPL"
                            value={ticker}
                            onChange={e => setTicker(e.target.value.toUpperCase())}
                            maxLength={6}
                            style={{ textTransform: 'uppercase' }}
                        />
                    </div>

                    {error && (
                        <p style={{ color: 'var(--danger-red)', fontSize: '13px', margin: 0 }}>{error}</p>
                    )}

                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                            Add Stock
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddStockModal;
