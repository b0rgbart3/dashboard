import { useState, useRef } from 'react';
import { PlusCircle, Calendar, Upload } from 'lucide-react';
import { parse, parseISO, isValid, format } from 'date-fns';
import type { Purchase } from '../types';

interface PurchaseFormProps {
    onAdd: (purchase: Purchase) => void;
    onImport: (entries: Purchase[]) => void;
}

const PurchaseForm = ({ onAdd, onImport }: PurchaseFormProps) => {
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [dateInput, setDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
    const [price, setPrice] = useState<string>('');
    const [quantity, setQuantity] = useState<string>('');
    const datePickerRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const today = new Date().toISOString().split('T')[0];

    const parseFlexibleDate = (input: string): Date | null => {
        if (!input) return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return parseISO(input);

        const parsed = new Date(input);
        if (isValid(parsed) && !isNaN(parsed.getTime())) return parsed;

        const formats = [
            'MM/dd/yyyy',
            'M/d/yyyy',
            'MM/dd/yy',
            'M/d/yy',
            'yyyy/MM/dd',
            'MMM d, yyyy',
            'MMMM d, yyyy',
            'd MMM yyyy',
            'd MMMM yyyy'
        ];

        for (const fmt of formats) {
            try {
                const attempt = parse(input, fmt, new Date());
                if (isValid(attempt)) return attempt;
            } catch {
                // Continue to next format
            }
        }

        return null;
    };

    const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            const entries: Purchase[] = [];
            const errors: string[] = [];

            for (let i = 0; i < lines.length; i++) {
                const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
                if (cols.length < 3) continue;

                const [rawDate, rawQty, rawPrice] = cols;
                const parsed = parseFlexibleDate(rawDate);
                if (!parsed || !isValid(parsed)) {
                    if (i > 0) errors.push(`Row ${i + 1}: invalid date "${rawDate}"`);
                    continue;
                }

                const qty = parseFloat(rawQty);
                const entryPrice = parseFloat(rawPrice.replace(/[$,]/g, ''));
                if (isNaN(qty) || isNaN(entryPrice)) {
                    errors.push(`Row ${i + 1}: invalid quantity or price`);
                    continue;
                }

                entries.push({
                    date: format(parsed, 'yyyy-MM-dd'),
                    quantity: qty,
                    price: entryPrice,
                    id: Date.now() + i
                });
            }

            if (errors.length > 0) {
                alert(`Some rows were skipped:\n${errors.join('\n')}`);
            }

            if (entries.length > 0) {
                onImport(entries);
            }
        };
        reader.readAsText(file);
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setDateInput(value);

        const parsed = parseFlexibleDate(value);
        if (parsed && isValid(parsed)) {
            setDate(format(parsed, 'yyyy-MM-dd'));
        }
    };

    const handleCalendarClick = () => {
        if (datePickerRef.current?.showPicker) {
            datePickerRef.current.showPicker();
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!price || !quantity) return;

        const finalDate = parseFlexibleDate(dateInput);
        if (!finalDate || !isValid(finalDate)) {
            alert('Please enter a valid date (e.g. 2026-03-11 or 03/11/2026)');
            return;
        }

        if (finalDate > new Date()) {
            alert('Cannot enter a future date for an actual purchase.');
            return;
        }

        onAdd({
            date: format(finalDate, 'yyyy-MM-dd'),
            price: parseFloat(price),
            quantity: parseFloat(quantity),
            id: Date.now()
        });
        setPrice('');
        setQuantity('');
    };

    return (
        <form onSubmit={handleSubmit} className="purchase-form-grid">
            <div className="input-group">
                <label>Purchase Date</label>
                <div className="input-with-button">
                    <input
                        type="text"
                        value={dateInput}
                        onChange={handleDateChange}
                        placeholder="YYYY-MM-DD or MM/DD/YYYY"
                        required
                    />
                    <button
                        type="button"
                        onClick={handleCalendarClick}
                        className="input-adjunct-btn"
                        title="Open Calendar"
                    >
                        <Calendar size={18} />
                    </button>
                    <input
                        ref={datePickerRef}
                        type="date"
                        value={date}
                        max={today}
                        onChange={(e) => {
                            const newDate = e.target.value;
                            setDate(newDate);
                            setDateInput(newDate);
                        }}
                        style={{
                            position: 'absolute',
                            width: '1px',
                            height: '1px',
                            padding: '0',
                            margin: '-1px',
                            overflow: 'hidden',
                            clip: 'rect(0, 0, 0, 0)',
                            whiteSpace: 'nowrap',
                            border: '0',
                            top: '50%',
                            right: '40px'
                        }}
                        tabIndex={-1}
                    />
                </div>
            </div>
            <div className="input-group">
                <label>Price per Share ($)</label>
                <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
            </div>
            <div className="input-group">
                <label>Quantity</label>
                <input type="number" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" required />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                    <PlusCircle size={20} />
                    Add Entry
                </button>
                <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => csvInputRef.current?.click()}
                >
                    <Upload size={18} />
                    Import CSV
                </button>
                <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVImport}
                    style={{ display: 'none' }}
                />
            </div>
        </form>
    );
};

export default PurchaseForm;
