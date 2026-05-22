import { Fragment, useState, useEffect } from 'react';
import { format, parse } from 'date-fns';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { Transaction } from '../types';

interface HistoryTableProps {
    purchases: Transaction[];
    onSortToggle: () => void;
    sortOrder: 'asc' | 'desc';
    onDelete: (id: number) => void;
}

const HistoryTable = ({ purchases, onSortToggle, sortOrder, onDelete }: HistoryTableProps) => {
    const [isCompact, setIsCompact] = useState(window.innerWidth < 1024);
    useEffect(() => {
        const handleResize = () => setIsCompact(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const numFmt: Intl.NumberFormatOptions = { minimumFractionDigits: 2 };

    const chronological = [...purchases].sort((a, b) => {
        const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
        return diff !== 0 ? diff : a.id - b.id;
    });

    const isPurchaseType = (type: string) => type === 'purchase' || type === 'BUY';
    const isDividendType = (type: string) =>
        type === 'dividend' || type === 'MDIV' || type === 'CDIV' || type === 'SLIP';

    // Build running totals chronologically, applying splits as multipliers
    const accumulatedQtyMap: Record<number, number> = {};
    const totalSpentMap: Record<number, number> = {};
    let runningQty = 0;
    let runningSpent = 0;
    for (const p of chronological) {
        if (isPurchaseType(p.type)) runningQty += p.quantity;
        else if (p.type === 'SELL') runningQty -= p.quantity;
        else if (p.type === 'SPLIT') runningQty *= p.quantity;
        accumulatedQtyMap[p.id] = runningQty;
        if (isPurchaseType(p.type)) runningSpent += p.price * p.quantity;
        totalSpentMap[p.id] = runningSpent;
    }

    // Use last BUY price for the Value column (avoid SPLIT rows which have price=0)
    const buyTxs = chronological.filter(p => isPurchaseType(p.type));
    const lastPrice = buyTxs.length > 0 ? buyTxs[buyTxs.length - 1].price : 0;

    // Collect splits to compute retroactive forward-adjustment factors
    const splits = chronological.filter(p => p.type === 'SPLIT');
    const forwardAdjustment = (rowDate: string): number =>
        splits
            .filter(s => s.date > rowDate)
            .reduce((factor, s) => factor * s.quantity, 1);

    // Monthly totals (purchases only)
    const monthlyTotals: Record<string, number> = {};
    for (const p of purchases) {
        if (isPurchaseType(p.type)) {
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

    const adjTag = (
        <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', marginLeft: '3px', verticalAlign: 'middle' }}>
            adj
        </span>
    );

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

                        // ── SPLIT row ──────────────────────────────────────────────────
                        if (p.type === 'SPLIT') {
                            const adjShares = accumulatedQtyMap[p.id];
                            const ratioLabel = p.quantity >= 1
                                ? `×${+p.quantity.toFixed(4).replace(/\.?0+$/, '')} Split`
                                : `÷${+(1 / p.quantity).toFixed(4).replace(/\.?0+$/, '')} Rev Split`;
                            return (
                                <Fragment key={p.id}>
                                    <tr className={isMonthStart ? 'month-divider' : undefined} style={{ opacity: 0.75 }}>
                                        <td>{format(parse(p.date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</td>
                                        <td>
                                            <span
                                                className="badge"
                                                style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)', fontSize: '0.7rem', padding: '2px 8px' }}
                                            >
                                                {ratioLabel}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>—</td>
                                        <td className="text-right">
                                            <button onClick={() => onDelete(p.id)} className="btn-delete" title="Delete Entry">
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
                        }

                        // ── Normal rows (BUY, SELL, dividend types) ───────────────────
                        const adj = forwardAdjustment(p.date);
                        const isAdjusted = Math.abs(adj - 1) > 1e-9;
                        const displayPrice = isAdjusted && isPurchaseType(p.type) ? p.price / adj : p.price;
                        const displayQty   = isAdjusted && (isPurchaseType(p.type) || p.type === 'SELL') ? p.quantity * adj : p.quantity;
                        const adjShares    = accumulatedQtyMap[p.id] * adj;

                        return (
                            <Fragment key={p.id}>
                                <tr className={isMonthStart ? 'month-divider' : undefined}>
                                    <td>{format(parse(p.date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</td>
                                    <td>
                                        <span
                                            className={
                                                isDividendType(p.type) ? 'badge badge-success' :
                                                p.type === 'SELL' ? 'badge badge-danger' :
                                                isPurchaseType(p.type) ? 'badge badge-warning' :
                                                'badge badge-secondary'
                                            }
                                            style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                        >
                                            {isDividendType(p.type)
                                                ? (isCompact ? 'D' : p.type === 'dividend' ? 'Dividend' : p.type)
                                                : p.type === 'SELL'
                                                ? (isCompact ? 'S' : 'Sell')
                                                : isPurchaseType(p.type)
                                                ? (isCompact ? 'B' : p.type === 'purchase' ? 'Purchase' : p.type)
                                                : p.type}
                                        </span>
                                    </td>
                                    <td className="font-medium text-accent-green">
                                        ${isCompact ? Math.trunc(displayPrice).toLocaleString() : displayPrice.toLocaleString(undefined, numFmt)}
                                        {isAdjusted && isPurchaseType(p.type) && adjTag}
                                    </td>
                                    <td>
                                        {isCompact ? Math.trunc(displayQty).toLocaleString() : displayQty.toLocaleString()}
                                        {isAdjusted && (isPurchaseType(p.type) || p.type === 'SELL') && adjTag}
                                    </td>
                                    <td className="font-bold text-white">
                                        ${isCompact ? Math.trunc(p.price * p.quantity).toLocaleString() : (p.price * p.quantity).toLocaleString(undefined, numFmt)}
                                    </td>
                                    <td className="font-bold text-accent-purple">
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : `$${isCompact ? Math.trunc(totalSpentMap[p.id]).toLocaleString() : totalSpentMap[p.id].toLocaleString(undefined, numFmt)}`}
                                    </td>
                                    <td className="font-mono">
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : <>
                                                {isCompact ? Math.trunc(adjShares).toLocaleString() : adjShares.toLocaleString(undefined, numFmt)}
                                                {isAdjusted && adjTag}
                                              </>}
                                    </td>
                                    <td className="font-bold text-accent-blue">
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : `$${isCompact ? Math.trunc(adjShares * lastPrice).toLocaleString() : (adjShares * lastPrice).toLocaleString(undefined, numFmt)}`}
                                    </td>
                                    <td className="text-right">
                                        <button onClick={() => onDelete(p.id)} className="btn-delete" title="Delete Entry">
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
