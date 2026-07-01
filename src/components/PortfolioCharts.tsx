import React, { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
  type PieLabelRenderProps,
} from "recharts";
import type { StockSummary } from "../types";
import { API_BASE } from "../utils/portfolioUtils";

interface PortfolioChartsProps {
  summaries: Record<string, StockSummary>;
}

interface MonthlyValue {
  month: string;
  totalValue: number;
  totalInvested: number;
  totalDividends: number;
}

interface DividendDataPoint {
  month: string;
  [ticker: string]: number | string;
}

interface BenchmarkPoint {
  month: string;
  portfolioAnn: number;
  spyAnn: number;
}

const PIE_COLORS = [
  "#7b3fe4", "#007bff", "#24ad64", "#f2a900", "#eb4d4b",
  "#a855f7", "#38bdf8", "#34d399", "#fb923c", "#f472b6",
  "#818cf8", "#22d3ee", "#4ade80", "#fbbf24", "#f87171",
];

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
}

function fmtDollar(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

const cardStyle: React.CSSProperties = {
  flex: 2, minWidth: 0, padding: "1rem 8px",
  display: "flex", flexDirection: "column", gap: "0.75rem",
};

const pieCardStyle: React.CSSProperties = {
  ...cardStyle,
  flex: "0 0 20%",
};

const chartTitleStyle: React.CSSProperties = {
  fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)",
  marginBottom: "0.25rem",
};

const spinnerWrapStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: 220,
};

export default function PortfolioCharts({ summaries }: PortfolioChartsProps) {
  const [history, setHistory] = useState<MonthlyValue[] | null>(null);
  const [monthlyDivs, setMonthlyDivs] = useState<Array<{ month: string; dividends: number }> | null>(null);
  const [dividendsByTicker, setDividendsByTicker] = useState<DividendDataPoint[] | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/portfolio/monthly-value`).then(r => r.json()),
      fetch(`${API_BASE}/api/portfolio/monthly-dividends`).then(r => r.json()),
      fetch(`${API_BASE}/api/portfolio/monthly-dividends-by-ticker`).then(r => r.json()),
      fetch(`${API_BASE}/api/portfolio/benchmark`).then(r => r.json()),
    ]).then(([hist, divs, divsByTicker, bench]) => {
      setHistory(hist as MonthlyValue[]);
      setMonthlyDivs(divs as Array<{ month: string; dividends: number }>);
      setDividendsByTicker(divsByTicker as DividendDataPoint[]);
      setBenchmark(bench as BenchmarkPoint[]);
    }).catch(() => {
      setHistory([]);
      setMonthlyDivs([]);
      setDividendsByTicker([]);
      setBenchmark([]);
    });
  }, []);

  // --- Chart 1: Pie data ---
  const pieData: Array<{ name: string; value: number }> = [];
  let otherValue = 0;
  for (const [ticker, s] of Object.entries(summaries)) {
    if (s.totalShares > 10) {
      pieData.push({ name: ticker, value: s.marketValue });
    } else {
      otherValue += s.marketValue;
    }
  }
  pieData.sort((a, b) => b.value - a.value);
  if (otherValue > 0) pieData.push({ name: "Other", value: otherValue });

  const totalPieValue = pieData.reduce((s, d) => s + d.value, 0);

  // --- Chart 2: thin history, joined with dedicated monthly-dividends data ---
  const displayHistory: MonthlyValue[] = history ?? [];
  const divByMonth: Record<string, number> = Object.fromEntries(
    (monthlyDivs ?? []).map(d => [d.month, d.dividends])
  );

  const histWithMonthlyDiv = displayHistory.map(row => ({
    ...row,
    monthlyDividends: divByMonth[row.month] ?? 0,
    pnl: row.totalValue - row.totalInvested,
  }));

  const histStride = histWithMonthlyDiv.length > 48 ? Math.ceil(histWithMonthlyDiv.length / 48) : 1;
  const thinHistory = histWithMonthlyDiv.filter((_, i) => i % histStride === 0 || i === histWithMonthlyDiv.length - 1);

  const maxMonthlyDiv = Math.max(...histWithMonthlyDiv.map(r => r.monthlyDividends), 0);
  const divAxisMax = Math.ceil(maxMonthlyDiv * 1.15);

  // --- Chart 3: Dividend lines data ---
  const MINOR_DIV_TICKERS = new Set(['AAPL', 'GOOG', 'GOOGL', 'LLY']);
  // Top 4 active dividend payers (by all-time income), excluding closed positions and minor payers
  const top5Tickers = Object.entries(summaries)
    .filter(([ticker, s]) => s.hasDividends && s.dividendIncome > 0 && s.totalShares > 0 && !MINOR_DIV_TICKERS.has(ticker))
    .sort((a, b) => b[1].dividendIncome - a[1].dividendIncome)
    .slice(0, 4)
    .map(([ticker]) => ticker);

  // Build per-ticker lookup so we can join onto thinHistory's time points.
  // Using thinHistory as the base guarantees the Total line has identical data points and
  // values to PGOT's Dividends line — same stride, same monthlyDividends value.
  const divsByTickerLookup: Record<string, DividendDataPoint> = Object.fromEntries(
    (dividendsByTicker ?? []).map(row => [row.month as string, row])
  );
  const dividendData: DividendDataPoint[] = thinHistory.map(r => ({
    ...(divsByTickerLookup[r.month] ?? {}),
    month: r.month,
    total: r.monthlyDividends,
  }));

  const DIV_COLORS = ["#7b3fe4", "#007bff", "#f2a900", "#eb4d4b"];

  const loading = history === null || monthlyDivs === null || dividendsByTicker === null;

  let pgotCagr: number | null = null;
  let pgotCurrentValue: number | null = null;
  if (!loading && thinHistory.length >= 2) {
    const last = thinHistory[thinHistory.length - 1];
    const first = thinHistory.find(r => r.totalValue > 0);
    if (first && last.totalInvested > 0) {
      const roi = (last.totalValue - last.totalInvested) / last.totalInvested;
      const [fy, fm] = first.month.split("-").map(Number);
      const [ly, lm] = last.month.split("-").map(Number);
      const years = (ly * 12 + lm - (fy * 12 + fm)) / 12;
      if (years > 0) {
        pgotCagr = ((1 + roi) ** (1 / years) - 1) * 100;
        pgotCurrentValue = last.totalValue;
      }
    }
  }

  const benchmarkLoading = benchmark === null;
  const benchmarkPoints = benchmark ?? [];
  const annMin = benchmarkPoints.length > 0 ? Math.min(...benchmarkPoints.map(d => Math.min(d.portfolioAnn, d.spyAnn))) : 0;
  const annMax = benchmarkPoints.length > 0 ? Math.max(...benchmarkPoints.map(d => Math.max(d.portfolioAnn, d.spyAnn))) : 20;
  const annPad = Math.max(3, (annMax - annMin) * 0.15);
  const annDomain: [number, number] = [Math.floor(annMin - annPad), Math.ceil(annMax + annPad)];

  // Last point for headline stats
  const lastBench = benchmarkPoints.length > 0 ? benchmarkPoints[benchmarkPoints.length - 1] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", width: "100%" }}>
    <div style={{ display: "flex", gap: "1.5rem", width: "100%", alignItems: "stretch" }}>

      {/* Chart 1 — Pie: Holdings Breakdown */}
      <div className="glass-card" style={pieCardStyle}>
        <div style={chartTitleStyle}>Holdings Breakdown</div>
        {totalPieValue > 0 && (
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
            ${totalPieValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
        )}
        {pieData.length === 0 ? (
          <div style={spinnerWrapStyle}><span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No holdings data</span></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={88}
                dataKey="value"
                labelLine={false}
                label={(props: PieLabelRenderProps) => {
                  const { cx, cy, midAngle, innerRadius, outerRadius, index } = props;
                  if (cx == null || cy == null || midAngle == null || innerRadius == null || outerRadius == null || index == null) return null;
                  const cxN = Number(cx), cyN = Number(cy), irN = Number(innerRadius), orN = Number(outerRadius);
                  const RADIAN = Math.PI / 180;
                  const radius = irN + (orN - irN) * 0.55;
                  const x = cxN + radius * Math.cos(-midAngle * RADIAN);
                  const y = cyN + radius * Math.sin(-midAngle * RADIAN);
                  const pct = totalPieValue > 0 ? (pieData[index].value / totalPieValue * 100) : 0;
                  if (pct < 4) return null;
                  return (
                    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                      {pieData[index].name}
                    </text>
                  );
                }}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                ))}
              </Pie>
              <ReTooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [`$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, name]}
                contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, fontSize: "0.8rem" }}
                labelStyle={{ color: "var(--text-secondary)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 2 — Line: Portfolio Growth */}
      <div className="glass-card" style={cardStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
          <div style={chartTitleStyle}>Portfolio Growth Over Time</div>
          {!loading && thinHistory.length >= 2 && (() => {
            const last = thinHistory[thinHistory.length - 1];
            const first = thinHistory.find(r => r.totalValue > 0);
            if (!first || last.totalInvested === 0) return null;

            const roi = (last.totalValue - last.totalInvested) / last.totalInvested;

            const [fy, fm] = first.month.split("-").map(Number);
            const [ly, lm] = last.month.split("-").map(Number);
            const years = (ly * 12 + lm - (fy * 12 + fm)) / 12;
            const cagr = years > 0 ? ((1 + roi) ** (1 / years) - 1) * 100 : null;

            const statStyle = (val: number): React.CSSProperties => ({
              fontSize: "0.78rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              color: val >= 0 ? "#24ad64" : "#eb4d4b",
              background: val >= 0 ? "rgba(36,173,100,0.12)" : "rgba(235,77,75,0.12)",
              border: `1px solid ${val >= 0 ? "rgba(36,173,100,0.3)" : "rgba(235,77,75,0.3)"}`,
            });
            return (
              <>
                <span style={statStyle(roi * 100)} title="Total return: (current value − total invested) ÷ total invested">
                  {roi >= 0 ? "+" : ""}{(roi * 100).toFixed(1)}% ROI
                </span>
                {cagr !== null && (
                  <span style={statStyle(cagr)} title={`CAGR over ${years.toFixed(1)} years`}>
                    {cagr >= 0 ? "+" : ""}{cagr.toFixed(1)}%/yr
                  </span>
                )}
              </>
            );
          })()}
        </div>
        {pgotCagr !== null && pgotCurrentValue !== null && (() => {
          const projectedAnnual = pgotCurrentValue * (pgotCagr / 100);
          const projectedMonthly = projectedAnnual / 12;
          const projectedDaily = projectedAnnual / 365;
          const color = pgotCagr >= 0 ? "#24ad64" : "#eb4d4b";
          return (
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
              Projected Growth:{" "}
              <span style={{ fontWeight: 700, color }}>
                ${projectedAnnual.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>|</span>
              <span style={{ fontWeight: 700, color }}>
                ${projectedMonthly.toLocaleString("en-US", { maximumFractionDigits: 0 })}/ mo
              </span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>|</span>
              <span style={{ fontWeight: 700, color }}>
                ${projectedDaily.toLocaleString("en-US", { maximumFractionDigits: 0 })}/ day
              </span>
            </div>
          );
        })()}
        {loading ? (
          <div style={spinnerWrapStyle}><div className="spinner" /></div>
        ) : thinHistory.length === 0 ? (
          <div style={spinnerWrapStyle}><span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No history data</span></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={thinHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={fmtDollar}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                width={52}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={fmtDollar}
                tick={{ fill: "#24ad64", fontSize: 10 }}
                width={52}
                domain={[0, divAxisMax]}
              />
              <ReTooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(m: any) => fmtMonth(String(m))}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [`$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, name]}
                contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, fontSize: "0.8rem" }}
              />
              <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
              <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey="totalValue" name="Portfolio Value" stroke="#7b3fe4" dot={false} strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey="totalInvested" name="Net Invested" stroke="#007bff" dot={false} strokeWidth={2} strokeDasharray="4 2" />
              <Line yAxisId="left" type="monotone" dataKey="pnl" name="Mkt Gain" stroke="#f2a900" dot={false} strokeWidth={2} strokeDasharray="2 2" />
              <Line yAxisId="right" type="monotone" dataKey="monthlyDividends" name="Dividends" stroke="#24ad64" dot={false} strokeWidth={2} strokeDasharray="2 3" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 3 — Line: Monthly Dividend Payout */}
      <div className="glass-card" style={{ ...cardStyle, minHeight: 0 }}>
        <div style={chartTitleStyle}>Monthly Dividend Income</div>
        {!loading && dividendData.length > 0 && (() => {
          const lastTotal = dividendData.filter(d => typeof d.total === 'number' && (d.total as number) > 0).at(-1)?.total;
          if (!lastTotal || typeof lastTotal !== 'number') return null;
          const projAnnual = lastTotal * 12;
          const projMonthly = lastTotal;
          const projDaily = projAnnual / 365;
          const color = "#24ad64";
          return (
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
              Projected Growth:{" "}
              <span style={{ fontWeight: 700, color }}>
                ${projAnnual.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>|</span>
              <span style={{ fontWeight: 700, color }}>
                ${projMonthly.toLocaleString("en-US", { maximumFractionDigits: 0 })}/ mo
              </span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>|</span>
              <span style={{ fontWeight: 700, color }}>
                ${projDaily.toLocaleString("en-US", { maximumFractionDigits: 0 })}/ day
              </span>
            </div>
          );
        })()}
        {loading ? (
          <div style={spinnerWrapStyle}><div className="spinner" /></div>
        ) : dividendData.length === 0 ? (
          <div style={spinnerWrapStyle}><span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>No dividend data</span></div>
        ) : (
          <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dividendData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={v => `$${v}`}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                width={44}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={v => `$${v}`}
                tick={{ fill: "#24ad64", fontSize: 10 }}
                width={52}
              />
              <ReTooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(m: any) => fmtMonth(String(m))}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
                contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, fontSize: "0.8rem" }}
              />
              <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
              {top5Tickers.map((ticker, i) => (
                <Line
                  key={ticker}
                  yAxisId="left"
                  type="monotone"
                  dataKey={ticker}
                  name={ticker}
                  stroke={DIV_COLORS[i % DIV_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              ))}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="total"
                name="Mo. Total"
                stroke="#24ad64"
                dot={false}
                strokeWidth={2.5}
                strokeDasharray="4 2"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>

    {/* Chart 4 — Annualized Return vs SPY */}
    <div className="glass-card" style={{ padding: "1rem 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <div style={chartTitleStyle}>Annualized Return vs SPY</div>
        {lastBench && (() => {
          const diff = lastBench.portfolioAnn - lastBench.spyAnn;
          const portColor = lastBench.portfolioAnn >= 0 ? "var(--success-green)" : "#ef4444";
          const spyColor  = lastBench.spyAnn >= 0 ? "#007bff" : "#ef4444";
          const diffColor = diff >= 0 ? "var(--success-green)" : "#ef4444";
          const badge = (val: number, color: string, label: string) => (
            <span style={{ fontSize: "0.78rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              color, background: `${color}1a`, border: `1px solid ${color}4d` }}>
              {val >= 0 ? "+" : ""}{val.toFixed(1)}% {label}
            </span>
          );
          return (
            <>
              {badge(lastBench.portfolioAnn, portColor, "Portfolio")}
              {badge(lastBench.spyAnn, spyColor, "SPY")}
              {badge(diff, diffColor, diff >= 0 ? "ahead" : "behind")}
            </>
          );
        })()}
        <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: "auto" }}>
          SPY lump-sum from portfolio start · starts 1yr in
        </span>
      </div>
      {benchmarkLoading ? (
        <div style={spinnerWrapStyle}><div className="spinner" /></div>
      ) : benchmarkPoints.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Load the portfolio history chart first, then refresh to see benchmark data.
          </span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={benchmarkPoints} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonth}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={v => `${v >= 0 ? "+" : ""}${v}%`}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              width={52}
              domain={annDomain}
            />
            <ReTooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(m: any) => fmtMonth(String(m))}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [`${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`, name]}
              contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 8, fontSize: "0.8rem" }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="portfolioAnn" name="Portfolio Ann%" stroke="#7b3fe4" dot={false} strokeWidth={2.5} />
            <Line type="monotone" dataKey="spyAnn"       name="SPY Ann%"       stroke="#38bdf8" dot={false} strokeWidth={2} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>

    </div>
  );
}
