import { Fragment, useState, useEffect } from 'react';
import { format, parse } from 'date-fns';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { CombinedEntry } from '../types';

interface HistoryTableProps {
    purchases: CombinedEntry[];
    onSortToggle: () => void;
    sortOrder: 'asc' | 'desc';
    onDelete: (id: number, type: string) => void;
}

const HistoryTable = ({ purchases, onSortToggle, sortOrder, onDelete }: HistoryTableProps) => {
    const [isCompact, setIsCompact] = useState(window.innerWidth < 1024);
    useEffect(() => {
        const handleResize = () => setIsCompact(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const numFmt: Intl.NumberFormatOptions = { minimumFractionDigits: 2 };
    const accumulatedQtyMap: Record<number, number> = {};
    const totalSpentMap: Record<number, number> = {};
    const chronological = [...purchases].sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        return diff !== 0 ? diff : a.id - b.id;
    });
    let runningQty = 0;
    let runningSpent = 0;
    for (const p of chronological) {
        runningQty += p.quantity;
        accumulatedQtyMap[p.id] = runningQty;
        if (p.type !== 'dividend') {
            runningSpent += p.price * p.quantity;
        }
        totalSpentMap[p.id] = runningSpent;
    }
    const lastPrice = chronological.length > 0 ? chronological[chronological.length - 1].price : 0;

    // Monthly totals (purchases only, no dividends)
    const monthlyTotals: Record<string, number> = {};
    for (const p of purchases) {
        if (p.type !== 'dividend') {
            const month = p.date.slice(0, 7);
            monthlyTotals[month] = (monthlyTotals[month] || 0) + p.price * p.quantity;
        }
    }

    if (purchases.length === 0) {
        return (
            <div className="h-40 flex items-center justify-center text-text-secondary italic">
                No entries recorded yet.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table>
                <thead>
                    <tr>
                        <th
                            className="cursor-pointer hover:text-white transition-colors select-none"
                            style={{ cursor: 'pointer' }}
                            onClick={onSortToggle}
                        >
                            <div className="flex items-center gap-1 cursor-pointer">
                                Date
                                {sortOrder === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </div>
                        </th>
                        <th>Type</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Cost</th>
                        <th>Total Spent</th>
                        <th>Shares</th>
                        <th>Value</th>
                        <th className="text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {purchases.map((p, i) => {
                        const curMonth = p.date.slice(0, 7);
                        const prevMonth = i > 0 ? purchases[i - 1].date.slice(0, 7) : null;
                        const nextMonth = i < purchases.length - 1 ? purchases[i + 1].date.slice(0, 7) : null;
                        const isMonthStart = i > 0 && curMonth !== prevMonth;
                        const isMonthEnd = curMonth !== nextMonth;
                        const monthLabel = format(parse(curMonth + '-01', 'yyyy-MM-dd', new Date()), 'MMMM yyyy');
                        const monthTotal = monthlyTotals[curMonth] || 0;

                        return (
                            <Fragment key={p.id}>
                                <tr className={isMonthStart ? 'month-divider' : undefined}>
                                    <td>{format(parse(p.date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</td>
                                    <td>
                                        <span
                                            className={p.type === 'dividend' ? 'badge badge-success' : 'badge badge-warning'}
                                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                        >
                                            {p.type === 'dividend' ? (isCompact ? 'D' : 'Dividend') : (isCompact ? 'P' : 'Purchase')}
                                        </span>
                                    </td>
                                    <td className="font-medium text-accent-green">${isCompact ? Math.trunc(p.price).toLocaleString() : p.price.toFixed(2)}</td>
                                    <td>{isCompact ? Math.trunc(p.quantity).toLocaleString() : p.quantity.toLocaleString()}</td>
                                    <td className="font-bold text-white">${isCompact ? Math.trunc(p.price * p.quantity).toLocaleString() : (p.price * p.quantity).toLocaleString(undefined, numFmt)}</td>
                                    <td className="font-bold text-accent-purple">${isCompact ? Math.trunc(totalSpentMap[p.id]).toLocaleString() : totalSpentMap[p.id].toLocaleString(undefined, numFmt)}</td>
                                    <td className="font-mono">{isCompact ? Math.trunc(accumulatedQtyMap[p.id]).toLocaleString() : accumulatedQtyMap[p.id].toLocaleString(undefined, numFmt)}</td>
                                    <td className="font-bold text-accent-blue">${isCompact ? Math.trunc(accumulatedQtyMap[p.id] * lastPrice).toLocaleString() : (accumulatedQtyMap[p.id] * lastPrice).toLocaleString(undefined, numFmt)}</td>
                                    <td className="text-right">
                                        <button
                                            onClick={() => onDelete(p.id, p.type)}
                                            className="btn-delete"
                                            title="Delete Entry"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                                {isMonthEnd && (
                                    <tr className="month-total-row">
                                        <td colSpan={4} className="month-total-label">{monthLabel} Total</td>
                                        <td className="month-total-value">${monthTotal.toLocaleString(undefined, numFmt)}</td>
                                        <td colSpan={4} />
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default HistoryTable;
