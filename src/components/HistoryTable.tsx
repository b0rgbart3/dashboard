import { Fragment } from 'react';
import { format, parse } from 'date-fns';
import { Trash2 } from 'lucide-react';
import type { Transaction } from '../types';

interface HistoryTableProps {
    purchases: Transaction[];
    onSortToggle: () => void;
    sortOrder: 'asc' | 'desc';
    onDelete: (id: number) => void;
    onDeleteAll?: () => void;
}

const HistoryTable = ({ purchases, onSortToggle, onDelete, onDeleteAll }: HistoryTableProps) => {
    const numFmt: Intl.NumberFormatOptions = { maximumFractionDigits: 2 };

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

    const lastChronEntry = [...chronological].reverse().find(p => p.type !== 'SLIP' && p.type !== 'SPLIT');
    let grandTotalValue = 0;
    let grandTotalGainLoss = 0;
    if (lastChronEntry) {
        const adjLast = forwardAdjustment(lastChronEntry.date);
        const adjSharesLast = accumulatedQtyMap[lastChronEntry.id] * adjLast;
        grandTotalValue = adjSharesLast * lastPrice;
        grandTotalGainLoss = grandTotalValue - totalSpentMap[lastChronEntry.id];
    }
    const grandGlColor = grandTotalGainLoss >= 0 ? 'var(--success-green)' : '#ef4444';

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

    const formatDate = (dateStr: string) => {
        const d = parse(dateStr, 'yyyy-MM-dd', new Date());
        const monthDay = format(d, 'MMM d,');
        const year = format(d, 'yyyy');
        return (
            <>
                {monthDay}{' '}
                <span style={{ fontSize: '0.7rem' }}>{year}</span>
            </>
        );
    };

    return (
        <div className="overflow-x-auto">
            <table>
                <thead>
                    <tr>
                        <th
                            className="cursor-pointer hover:text-white transition-colors select-none"
                            style={{ cursor: 'pointer', width: '95px' }}
                            onClick={onSortToggle}
                        >
                            Date
                        </th>
                        <th style={{ width: '70px' }}>Type</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Cost</th>
                        <th>Spent</th>
                        <th>Shares</th>
                        <th>Value</th>
                        <th>Gain/Loss</th>
                        <th>G/L %</th>
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
                            const ratioLabel = p.quantity >= 1
                                ? `×${+p.quantity.toFixed(4).replace(/\.?0+$/, '')} Split`
                                : `÷${+(1 / p.quantity).toFixed(4).replace(/\.?0+$/, '')} Rev Split`;
                            return (
                                <Fragment key={p.id}>
                                    <tr className={isMonthStart ? 'month-divider' : undefined} style={{ opacity: 0.75 }}>
                                        <td>{formatDate(p.date)}</td>
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
                                            <td colSpan={6} />
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
                        const currentValue = adjShares * lastPrice;
                        const gainLoss     = currentValue - totalSpentMap[p.id];
                        const gainLossPct  = totalSpentMap[p.id] > 0 ? (gainLoss / totalSpentMap[p.id]) * 100 : 0;
                        const glColor      = gainLoss >= 0 ? 'var(--success-green)' : '#ef4444';

                        return (
                            <Fragment key={p.id}>
                                <tr className={isMonthStart ? 'month-divider' : undefined}>
                                    <td>{formatDate(p.date)}</td>
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
                                                ? (p.type === 'dividend' ? 'Dividend' : p.type)
                                                : p.type === 'SELL'
                                                ? 'Sell'
                                                : isPurchaseType(p.type)
                                                ? (p.type === 'purchase' ? 'Purchase' : p.type)
                                                : p.type}
                                        </span>
                                    </td>
                                    <td className="font-medium text-accent-green">
                                        ${displayPrice.toLocaleString(undefined, numFmt)}
                                        {isAdjusted && isPurchaseType(p.type) && adjTag}
                                    </td>
                                    <td>
                                        {displayQty.toLocaleString(undefined, numFmt)}
                                        {isAdjusted && (isPurchaseType(p.type) || p.type === 'SELL') && adjTag}
                                    </td>
                                    <td className="font-bold text-white">
                                        ${(p.price * p.quantity).toLocaleString(undefined, numFmt)}
                                    </td>
                                    <td className="font-bold text-accent-purple">
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : `$${totalSpentMap[p.id].toLocaleString(undefined, numFmt)}`}
                                    </td>
                                    <td className="font-mono">
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : <>
                                                {adjShares.toLocaleString(undefined, numFmt)}
                                                {isAdjusted && adjTag}
                                              </>}
                                    </td>
                                    <td className="font-bold text-accent-blue">
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : `$${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                    </td>
                                    <td className="font-bold" style={{ color: p.type === 'SLIP' ? undefined : glColor }}>
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : `${gainLoss >= 0 ? '+' : '-'}$${Math.abs(gainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                    </td>
                                    <td style={{ color: p.type === 'SLIP' ? undefined : glColor }}>
                                        {p.type === 'SLIP'
                                            ? <span style={{ color: 'var(--text-secondary)' }}>—</span>
                                            : `${gainLoss >= 0 ? '+' : ''}${gainLossPct.toFixed(1)}%`}
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
                                        <td colSpan={6} />
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                        <td colSpan={7} style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                            Grand Total
                        </td>
                        <td className="font-bold text-accent-blue" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                            ${grandTotalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="font-bold" style={{ color: grandGlColor, paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
                            {grandTotalGainLoss >= 0 ? '+' : '-'}${Math.abs(grandTotalGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td colSpan={2} />
                    </tr>
                    {onDeleteAll && (
                        <tr>
                            <td colSpan={10} />
                            <td className="text-right" style={{ paddingTop: '8px' }}>
                                <button
                                    onClick={onDeleteAll}
                                    className="btn-delete"
                                    title="Clear all transactions"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.75rem' }}
                                >
                                    <Trash2 size={14} />
                                    Clear All
                                </button>
                            </td>
                        </tr>
                    )}
                </tfoot>
            </table>
        </div>
    );
};

export default HistoryTable;
