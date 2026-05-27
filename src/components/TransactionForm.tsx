import { useState, useRef } from 'react';
import { PlusCircle, Calendar, Upload } from 'lucide-react';
import { parse, parseISO, isValid, format } from 'date-fns';
import type { Transaction, EntryType } from '../types';

interface TransactionFormProps {
    onAdd: (t: Omit<Transaction, 'id'>) => void;
    onImport: (entries: Omit<Transaction, 'id'>[]) => void;
}

const TransactionForm = ({ onAdd, onImport }: TransactionFormProps) => {
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [dateInput, setDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
    const [price, setPrice] = useState<string>('');
    const [quantity, setQuantity] = useState<string>('');
    const [type, setType] = useState<EntryType>('purchase');
    const datePickerRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const today = new Date().toISOString().split('T')[0];

    const parseFlexibleDate = (input: string): Date | null => {
        if (!input) return null;

        if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return parseISO(input);

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
                if (isValid(attempt)) {
                    const year = attempt.getFullYear();
                    if (year >= 1900 && year <= new Date().getFullYear()) return attempt;
                }
            } catch {
                // Continue to next format
            }
        }

        return null;
    };

    const parseCSVLine = (line: string): string[] => {
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
            const ch = line[j];
            if ((ch === '"' || ch === "'") && (current === '' || inQuotes)) {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                cols.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        cols.push(current.trim());
        return cols;
    };

    const parseTransactionType = (raw: string): EntryType | null => {
        const val = raw.toLowerCase().trim();
        if (val === 'purchase' || val === 'p') return 'purchase';
        if (val === 'dividend' || val === 'd') return 'dividend';
        if (val === 'buy') return 'BUY';
        if (val === 'sell') return 'SELL';
        if (val === 'slip') return 'SLIP';
        if (val === 'mdiv') return 'MDIV';
        if (val === 'cdiv') return 'CDIV';
        if (val === 'split' || val === 'spl') return 'SPLIT';
        if (val === 'rec') return 'REC';
        if (val === 'dfee') return 'DFEE';
        if (val === 'afee') return 'AFEE';
        if (val === 'dtax') return 'DTAX';
        if (val === 'mrgs') return 'MRGS';
        if (val === 'mrgc') return 'MRGC';
        if (val === 'mrgs_merger') return 'MRGS_MERGER';
        if (val === 'mrgc_merger') return 'MRGC_MERGER';
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
            const entries: Omit<Transaction, 'id'>[] = [];
            const errors: string[] = [];

            for (let i = 1; i < lines.length; i++) {
                const cols = parseCSVLine(lines[i]);
                if (cols.length < 4) {
                    errors.push(`Row ${i + 1}: expected 4 columns (Date, Transaction_Type, Quantity, Price)`);
                    continue;
                }

                const [rawDate, rawType, rawQty, rawPrice] = cols;

                const parsed = parseFlexibleDate(rawDate);
                if (!parsed || !isValid(parsed)) {
                    errors.push(`Row ${i + 1}: invalid date "${rawDate}"`);
                    continue;
                }

                if (rawType.trim().toUpperCase() === 'BCXL') continue;

                const entryType = parseTransactionType(rawType);
                if (!entryType) {
                    errors.push(`Row ${i + 1}: unrecognized type "${rawType}" (use purchase, dividend, BUY, SELL, SLIP, MDIV, CDIV, DTAX, DFEE, AFEE, MRGS, MRGC, MRGS_MERGER, MRGC_MERGER, SPLIT, REC, SPINOFF, SHARE_EXCHANGE, SHARE_EXCHANGE_OUT, RETURN_OF_CAPITAL)`);
                    continue;
                }

                let qty = parseFloat(rawQty);
                let entryPrice = parseFloat(rawPrice.replace(/[$,]/g, ''));

                // MRGS/MRGC are overloaded Robinhood codes. Disambiguate by quantity:
                //   shares present (qty > 0) → merger corporate action
                //   cash only (qty = 0/blank)  → margin interest
                let resolvedType = entryType;
                if (entryType === 'MRGS' && !isNaN(qty) && qty > 0) resolvedType = 'MRGS_MERGER';
                if (entryType === 'MRGC' && !isNaN(qty) && qty > 0) resolvedType = 'MRGC_MERGER';

                // Fee/margin rows often have blank Qty in Robinhood exports.
                // Normalize to qty=1 and use the absolute amount from whatever column has it.
                const isFeeEntry = resolvedType === 'DFEE' || resolvedType === 'AFEE' || resolvedType === 'DTAX' || resolvedType === 'MRGS' || resolvedType === 'MRGC';
                if (isFeeEntry && (isNaN(qty) || qty === 0)) {
                    qty = 1;
                    if (isNaN(entryPrice)) {
                        // Try a 5th "Amount" column present in some export formats
                        const amountRaw = cols[4] ?? cols[8] ?? '';
                        entryPrice = Math.abs(parseFloat(amountRaw.replace(/[$,]/g, '')));
                    } else {
                        entryPrice = Math.abs(entryPrice);
                    }
                }

                if (isNaN(qty) || isNaN(entryPrice)) {
                    errors.push(`Row ${i + 1}: invalid quantity or price`);
                    continue;
                }

                entries.push({
                    date: format(parsed, 'yyyy-MM-dd'),
                    type: resolvedType,
                    quantity: qty,
                    price: entryPrice,
                    ticker: '',
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
            alert('Cannot enter a future date for a transaction.');
            return;
        }

        onAdd({
            date: format(finalDate, 'yyyy-MM-dd'),
            type,
            price: parseFloat(price),
            quantity: parseFloat(quantity),
            ticker: '',
        });
        setPrice('');
        setQuantity('');
    };

    return (
        <form onSubmit={handleSubmit} className="purchase-form-grid">
            <div className="input-group">
                <label>Transaction Type</label>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value as EntryType)}
                    style={{ width: '100%' }}
                >
                    <option value="purchase">Purchase</option>
                    <option value="dividend">Dividend</option>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                    <option value="SLIP">SLIP</option>
                    <option value="MDIV">MDIV</option>
                    <option value="CDIV">CDIV</option>
                    <option value="SPLIT">SPLIT (qty = ratio, e.g. 2.0)</option>
                    <option value="DTAX">DTAX (Dividend Tax Withheld)</option>
                    <option value="DFEE">DFEE (ADR Depositary Fee)</option>
                    <option value="AFEE">AFEE (Account / Admin Fee)</option>
                    <option value="MRGS">MRGS (Margin Interest Charged)</option>
                    <option value="MRGC">MRGC (Margin Interest Credit)</option>
                    <option value="MRGS_MERGER">MRGS_MERGER (Merger Share Conversion)</option>
                    <option value="MRGC_MERGER">MRGC_MERGER (Merger Cash Component)</option>
                    <option value="REC">REC (Transfer In / Received)</option>
                </select>
            </div>
            <div className="input-group">
                <label>Date</label>
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
                <label>Quantity</label>
                <input type="number" step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" required />
            </div>
            <div className="input-group">
                <label>Price per Share ($)</label>
                <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
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

export default TransactionForm;
