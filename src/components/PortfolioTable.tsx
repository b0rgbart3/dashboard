import React from "react";
import { format } from "date-fns";
import FilterBar from "./FilterBar";
import type { FilterValue } from "../types";
import type { TableRow, SortKey } from "../utils/portfolioUtils";
import * as styles from "../homePageStyles";

interface PortfolioTableProps {
  tableRows: TableRow[];
  sortKey: SortKey;
  onSort: (key: SortKey, defaultDir: "asc" | "desc") => void;
  onNavigateToDashboard: (ticker: string) => void;
  filterStatus: "all" | "active" | "inactive";
  onFilterStatusChange: (v: "all" | "active" | "inactive") => void;
  filterValue: FilterValue;
  onFilterValueChange: (v: FilterValue) => void;
  filterDividends: "all" | "yes" | "no";
  onFilterDividendsChange: (v: "all" | "yes" | "no") => void;
  totalStockCount: number;
  portfolioLoaded: boolean;
}

const PortfolioTable = ({
  tableRows,
  sortKey,
  onSort,
  onNavigateToDashboard,
  filterStatus,
  onFilterStatusChange,
  filterValue,
  onFilterValueChange,
  filterDividends,
  onFilterDividendsChange,
  totalStockCount,
  portfolioLoaded,
}: PortfolioTableProps) => {
  const now = new Date();
  const monthsElapsed = now.getMonth() + 1 + now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - 1;

  const columns: { label: string; key: SortKey; align: "left" | "right"; defaultDir: "asc" | "desc" }[] = [
    { label: "Ticker",   key: "ticker",        align: "left",  defaultDir: "asc"  },
    { label: "Inv",      key: "totalInvested",  align: "right", defaultDir: "desc" },
    { label: "Value",    key: "totalValue",     align: "right", defaultDir: "desc" },
    { label: "G/L $",    key: "totalGain",      align: "right", defaultDir: "desc" },
    { label: "TOT%",     key: "gainPct",        align: "right", defaultDir: "desc" },
    { label: "YTD%",      key: "ytdGainPct",   align: "right", defaultDir: "desc" },
    { label: "Ann%",     key: "annualGainPct",  align: "right", defaultDir: "desc" },
    { label: "Shrs",     key: "totalShares",    align: "right", defaultDir: "desc" },
    { label: "Divs",     key: "dividends",      align: "right", defaultDir: "desc" },
    { label: "YTD DV",   key: "ytdDividends",   align: "right", defaultDir: "desc" },
    { label: "Cash",     key: "slipIncome",     align: "right", defaultDir: "desc" },
    { label: "Real P/L", key: "realizedPnL",    align: "right", defaultDir: "desc" },
    { label: "YTD P/L",  key: "ytdRealizedPnL", align: "right", defaultDir: "desc" },
    { label: "Held",     key: "held",           align: "right", defaultDir: "desc" },
    { label: "Score",    key: "rating",         align: "right", defaultDir: "desc" },
    { label: "ABS",      key: "absoluteRating", align: "right", defaultDir: "desc" },
  ];

  return (
    <div style={styles.portfolioSection}>
      <FilterBar
        filterStatus={filterStatus}
        onStatusChange={onFilterStatusChange}
        filterValue={filterValue}
        onValueChange={onFilterValueChange}
        filterDividends={filterDividends}
        onDividendsChange={onFilterDividendsChange}
        filteredCount={tableRows.length}
        totalCount={totalStockCount}
        summariesLoaded={portfolioLoaded}
      />
      {tableRows.length === 0 && (
        <div style={styles.emptyStateMessage}>No stocks match the current filters.</div>
      )}
      {tableRows.length > 0 && (
        <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={styles.summaryTable}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                {columns.map(({ label, key, align, defaultDir }) => {
                  const active = sortKey === key;
                  return (
                    <th
                      key={key}
                      onClick={() => onSort(key, defaultDir)}
                      style={styles.tableHeaderCell(align, active)}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const gainColor = row.totalGain > 5000 ? "#00ff88" : row.totalGain >= 0 ? "var(--success-green)" : "#ef4444";
                const ratingColor = row.rating === null ? "var(--text-secondary)"
                  : row.rating >= 7 ? "var(--success-green)"
                  : row.rating >= 4 ? "#f59e0b"
                  : "#ef4444";
                return (
                  <tr
                    key={row.ticker}
                    style={styles.tableDataRow(i === tableRows.length - 1)}
                    onClick={() => onNavigateToDashboard(row.ticker)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={styles.tickerCell} title={row.name}>{row.ticker}</td>
                    <td style={styles.secondaryValueCell}>
                      ${row.totalInvested.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td style={styles.primaryValueCell}>
                      ${row.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td style={styles.gainLossCell(gainColor)}>
                      {row.totalGain >= 0 ? "+" : "-"}${Math.abs(row.totalGain).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td style={styles.annualGainCell(gainColor)}>
                      {row.gainPct >= 0 ? "+" : ""}{row.gainPct.toFixed(1)}%
                    </td>
                    <td style={styles.annualGainCell(row.ytdGainPct >= 0 ? "var(--success-green)" : "#ef4444")}>
                      {row.ytdGainPct >= 0 ? "+" : ""}{row.ytdGainPct.toFixed(1)}%
                    </td>
                    <td style={styles.annualGainCell(row.annualGainPct == null ? "var(--text-secondary)" : row.annualGainPct >= 0 ? gainColor : "#ef4444")}>
                      {row.annualGainPct == null ? "—" : `${row.annualGainPct >= 0 ? "+" : ""}${row.annualGainPct.toFixed(1)}%`}
                    </td>
                    <td style={styles.secondaryValueCell}>
                      {row.totalShares <= 0 ? "—" : row.totalShares < 0.1 ? "< 0.1" : row.totalShares.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </td>
                    <td style={styles.incomeCell(row.dividends > 0)}>
                      {row.dividends > 0 ? `$${row.dividends.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                    </td>
                    <td style={styles.incomeCell(row.ytdDividends > 0)}>
                      {row.ytdDividends > 0
                        ? `$${row.ytdDividends.toLocaleString("en-US", { maximumFractionDigits: 0 })} / $${(row.ytdDividends / monthsElapsed).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                        : "—"}
                    </td>
                    <td style={styles.incomeCell(row.slipIncome > 0)}>
                      {row.slipIncome > 0 ? `$${row.slipIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                    </td>
                    <td style={styles.realizedPnLCell(row.realizedPnL)}>
                      {row.realizedPnL === 0 ? "—" : `${row.realizedPnL >= 0 ? "+" : "-"}$${Math.abs(row.realizedPnL).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    </td>
                    <td style={styles.realizedPnLCell(row.ytdRealizedPnL)}>
                      {row.ytdRealizedPnL === 0 ? "—" : `${row.ytdRealizedPnL >= 0 ? "+" : "-"}$${Math.abs(row.ytdRealizedPnL).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    </td>
                    <td style={styles.secondaryValueCell}>
                      <div>{row.lengthHeld}</div>
                      {row.closedDate && (
                        <div style={styles.closedDateLabel}>
                          {format(new Date(row.closedDate + "T12:00:00"), "MMM yyyy")}
                        </div>
                      )}
                    </td>
                    <td style={styles.ratingCell(ratingColor)}>
                      {row.rating !== null ? `${row.rating}` : "—"}
                    </td>
                    <td style={styles.absoluteRatingCell(
                      row.absoluteRating === null ? "var(--text-secondary)"
                        : row.absoluteRating >= 7 ? "var(--success-green)"
                        : row.absoluteRating >= 4 ? "#f59e0b"
                        : "#ef4444"
                    )}>
                      {row.absoluteRating !== null
                        ? <>{row.absoluteRating}{row.stockType ? <span style={styles.stockTypeChip}>-{row.stockType.charAt(0).toUpperCase()}</span> : null}</>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const totalValue       = tableRows.reduce((sum, r) => sum + r.totalValue, 0);
                const totalGain        = tableRows.reduce((sum, r) => sum + r.totalGain, 0);
                const totalInvested    = tableRows.reduce((sum, r) => sum + r.totalInvested, 0);
                const totalDividends   = tableRows.reduce((sum, r) => sum + r.dividends, 0);
                const totalYtdDividends = tableRows.reduce((sum, r) => sum + r.ytdDividends, 0);
                const ytdPerMonth      = monthsElapsed > 0 ? totalYtdDividends / monthsElapsed : 0;
                const totalSlip        = tableRows.reduce((sum, r) => sum + r.slipIncome, 0);
                const totalYtdSlip     = tableRows.reduce((sum, r) => sum + r.ytdSlipIncome, 0);
                const totalRealized    = tableRows.reduce((sum, r) => sum + r.realizedPnL, 0);
                const totalYtdRealized = tableRows.reduce((sum, r) => sum + r.ytdRealizedPnL, 0);
                const totalGainPct     = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
                const totalYtdGainPct  = totalInvested > 0
                  ? tableRows.reduce((sum, r) => sum + (r.ytdGainPct / 100) * r.totalInvested, 0) / totalInvested * 100
                  : 0;
                const glColor          = totalGain >= 0 ? "var(--success-green)" : "#ef4444";
                const rowsWithAnnual   = tableRows.filter(r => r.annualGainPct != null && r.yearsHeld != null);
                const wNum = rowsWithAnnual.reduce((sum, r) => sum + r.annualGainPct! * r.totalInvested * r.yearsHeld!, 0);
                const wDen = rowsWithAnnual.reduce((sum, r) => sum + r.totalInvested * r.yearsHeld!, 0);
                const weightedAnnualGainPct = wDen > 0 ? wNum / wDen : null;
                const simpleAnnualGainPct = rowsWithAnnual.length > 0
                  ? rowsWithAnnual.reduce((sum, r) => sum + r.annualGainPct!, 0) / rowsWithAnnual.length
                  : null;
                const longestHeld = tableRows.reduce<TableRow | null>((oldest, r) => {
                  if (!r.purchaseDate) return oldest;
                  if (!oldest?.purchaseDate) return r;
                  return r.purchaseDate < oldest.purchaseDate ? r : oldest;
                }, null);
                return (
                  <tr style={styles.totalRow}>
                    <td style={styles.totalLabelCell}>Total</td>
                    <td style={styles.totalSecondaryValueCell}>
                      ${totalInvested.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td style={styles.totalPrimaryValueCell}>
                      ${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td style={styles.totalGainLossCell(glColor)}>
                      {totalGain >= 0 ? "+" : "-"}${Math.abs(totalGain).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>
                    <td style={styles.totalGainLossCell(glColor)}>
                      {totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(1)}%
                    </td>
                    <td style={styles.totalGainLossCell(totalYtdGainPct >= 0 ? "var(--success-green)" : "#ef4444")}>
                      {totalYtdGainPct >= 0 ? "+" : ""}{totalYtdGainPct.toFixed(1)}%
                    </td>
                    <td style={styles.totalInnerCell}>
                      <div style={styles.totalAnnualGainCell(weightedAnnualGainPct == null ? "var(--text-secondary)" : weightedAnnualGainPct >= 0 ? glColor : "#ef4444")}>
                        {weightedAnnualGainPct == null ? "—" : `${weightedAnnualGainPct >= 0 ? "+" : ""}${weightedAnnualGainPct.toFixed(1)}%`}
                        <span style={styles.tableSubLabelWtd}>wtd</span>
                      </div>
                      <div style={styles.totalSimpleAnnualGainRow(simpleAnnualGainPct == null ? "var(--text-secondary)" : simpleAnnualGainPct >= 0 ? glColor : "#ef4444")}>
                        {simpleAnnualGainPct == null ? "—" : `${simpleAnnualGainPct >= 0 ? "+" : ""}${simpleAnnualGainPct.toFixed(1)}%`}
                        <span style={styles.tableSubLabel}>avg</span>
                      </div>
                    </td>
                    <td />
                    <td style={styles.totalInnerCell}>
                      <div style={styles.totalIncomeDiv(totalDividends > 0)}>
                        {totalDividends > 0 ? `$${totalDividends.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                      </div>
                    </td>
                    <td style={styles.totalInnerCell}>
                      <div style={styles.totalIncomeDiv(totalYtdDividends > 0)}>
                        {totalYtdDividends > 0 ? `$${totalYtdDividends.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                      </div>
                      {totalYtdDividends > 0 && (
                        <div style={styles.ytdPerMonthRow}>
                          {`$${ytdPerMonth.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                          <span style={styles.tableSubLabel}>/mo</span>
                        </div>
                      )}
                    </td>
                    <td style={styles.totalInnerCell}>
                      <div style={styles.totalIncomeDiv(totalSlip > 0)}>
                        {totalSlip > 0 ? `$${totalSlip.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
                      </div>
                      {totalYtdSlip > 0 && (
                        <div style={styles.ytdPerMonthRow}>
                          {`$${totalYtdSlip.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                          <span style={styles.tableSubLabel}>ytd</span>
                        </div>
                      )}
                    </td>
                    <td style={styles.totalRealizedCell(totalRealized)}>
                      {totalRealized === 0 ? "—" : `${totalRealized >= 0 ? "+" : "-"}$${Math.abs(totalRealized).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    </td>
                    <td style={styles.totalRealizedCell(totalYtdRealized)}>
                      {totalYtdRealized === 0 ? "—" : `${totalYtdRealized >= 0 ? "+" : "-"}$${Math.abs(totalYtdRealized).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                    </td>
                    <td style={styles.secondaryValueCell}>
                      {longestHeld ? longestHeld.lengthHeld : "—"}
                    </td>
                    <td />
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default PortfolioTable;
