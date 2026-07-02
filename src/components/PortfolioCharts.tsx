import React, { useEffect, useMemo, useState } from "react";
import {
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceLine,
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
  nasdaqAnn: number;
}

const PIE_COLORS = [
  "#0472e7",
  "#007795",
  "#2a36d4",
  "#006b98",
  "#004f89",
  "#10217a",
  "#0472e7",
  "#007795",
  "#2a36d4",
  "#006b98",
  "#004f89",
  "#10217a",
  "#0472e7",
  "#007795",
  "#2a36d4",
];

interface Pie3DSlice {
  name: string;
  pct: number;
  marketValue: number;
  fill: string;
}

function darken(hex: string, factor = 0.55): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function Pie3D({
  data,
  height,
  depth = 20,
  fontScale = 1,
}: {
  data: Pie3DSlice[];
  height: number;
  depth?: number;
  fontScale?: number;
}) {
  const [hovered, setHovered] = useState<Pie3DSlice | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, containerWidth: 400 });

  const VW = 400;
  const rx = Math.min(146, height * 0.55);
  const ry = rx * 0.4;
  const cx = VW / 2;
  const vertMargin = ry * 1.3 + 10;
  const svgHeight = Math.round(vertMargin * 2 + depth);
  const cy = vertMargin;

  const slices = useMemo(() => {
    let angle = -Math.PI / 2;
    return data.map((d) => {
      const span = (d.pct / 100) * 2 * Math.PI;
      const a1 = angle;
      const a2 = angle + span;
      angle = a2;
      return { ...d, a1, a2, midAngle: (a1 + a2) / 2 };
    });
  }, [data]);

  // Painter's algorithm: draw back slices first (lowest sin = highest on screen = furthest back)
  const sorted = useMemo(
    () =>
      [...slices].sort((a, b) => Math.sin(a.midAngle) - Math.sin(b.midAngle)),
    [slices],
  );

  const pt = (a: number, dy = 0) => ({
    x: cx + rx * Math.cos(a),
    y: cy + ry * Math.sin(a) + dy,
  });

  const arcPath = (a1: number, a2: number, dy: number, sweep: 0 | 1) => {
    const p1 = pt(a1, dy);
    const p2 = pt(a2, dy);
    const largeArc = a2 - a1 > Math.PI ? 1 : 0;
    return {
      p1,
      p2,
      largeArc,
      d: `A ${rx} ${ry} 0 ${largeArc} ${sweep} ${p2.x} ${p2.y}`,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      containerWidth: rect.width,
    });
  };

  return (
    <div
      style={{ position: "relative", width: "100%" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(null)}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${VW} ${svgHeight}`}
        style={{ overflow: "visible", display: "block" }}
      >
        {/* Side faces — back to front */}
        {sorted.map((slice) => {
          const { p1, largeArc } = arcPath(slice.a1, slice.a2, 0, 1);
          const top2 = pt(slice.a2, 0);
          const bot1 = pt(slice.a1, depth);
          const bot2 = pt(slice.a2, depth);
          const d = [
            `M ${p1.x} ${p1.y}`,
            `A ${rx} ${ry} 0 ${largeArc} 1 ${top2.x} ${top2.y}`,
            `L ${bot2.x} ${bot2.y}`,
            `A ${rx} ${ry} 0 ${largeArc} 0 ${bot1.x} ${bot1.y}`,
            "Z",
          ].join(" ");
          return (
            <path
              key={`side-${slice.name}`}
              d={d}
              fill={darken(slice.fill)}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Top faces — back to front */}
        {sorted.map((slice) => {
          const p1 = pt(slice.a1);
          const p2 = pt(slice.a2);
          const largeArc = slice.a2 - slice.a1 > Math.PI ? 1 : 0;
          const d = [
            `M ${cx} ${cy}`,
            `L ${p1.x} ${p1.y}`,
            `A ${rx} ${ry} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
            "Z",
          ].join(" ");
          return (
            <path
              key={`top-${slice.name}`}
              d={d}
              fill={slice.fill}
              stroke="rgba(0,0,0,0.15)"
              strokeWidth={0.5}
              onMouseEnter={() => setHovered(slice)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "default" }}
            />
          );
        })}

        {/* Slice labels — ticker + % outside the arc */}
        {slices.map((slice) => {
          if (slice.pct < 5) return null;
          const mid = slice.midAngle;
          const mult = Math.min(1.3, (VW / 2 - 40) / rx);
          const ex = cx + rx * Math.cos(mid);
          const ey = cy + ry * Math.sin(mid);
          const lx = cx + rx * mult * Math.cos(mid);
          const ly = cy + ry * mult * Math.sin(mid);
          const cosM = Math.cos(mid);
          const anchor =
            cosM > 0.15 ? "start" : cosM < -0.15 ? "end" : "middle";
          const fontSize = Math.max(10, Math.min(14, rx * 0.09)) * fontScale;
          return (
            <g key={`label-${slice.name}`} style={{ pointerEvents: "none" }}>
              <line
                x1={ex}
                y1={ey}
                x2={lx}
                y2={ly}
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={1.2}
              />
              <text
                x={lx}
                y={ly - 2}
                textAnchor={anchor}
                fill="var(--text-secondary)"
                fontSize={fontSize}
                fontWeight={700}
                fontFamily="inherit"
              >
                {slice.name}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          style={{
            position: "absolute",
            left: Math.min(mousePos.x + 12, mousePos.containerWidth - 160),
            top: Math.max(mousePos.y - 44, 4),
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 8,
            fontSize: "0.8rem",
            padding: "5px 10px",
            pointerEvents: "none",
            zIndex: 100,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {hovered.name}
          </span>
          <br />
          <span style={{ color: "var(--text-secondary)" }}>
            {hovered.pct}% ·{" "}
            {`$${hovered.marketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          </span>
        </div>
      )}
    </div>
  );
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[parseInt(mo, 10) - 1]} '${y.slice(2)}`;
}

function fmtDollar(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

const cardStyle: React.CSSProperties = {
  flex: 2,
  minWidth: 0,
  padding: "1rem 8px 1rem 20px",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const pieCardStyle: React.CSSProperties = {
  ...cardStyle,
  flex: "0 0 20%",
};

const chartTitleStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: "0.25rem",
};

const spinnerWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 220,
};

export default function PortfolioCharts({ summaries }: PortfolioChartsProps) {
  const [history, setHistory] = useState<MonthlyValue[] | null>(null);
  const [monthlyDivs, setMonthlyDivs] = useState<Array<{
    month: string;
    dividends: number;
  }> | null>(null);
  const [dividendsByTicker, setDividendsByTicker] = useState<
    DividendDataPoint[] | null
  >(null);
  const [benchmark, setBenchmark] = useState<BenchmarkPoint[] | null>(null);
  const [openModal, setOpenModal] = useState<
    "growth" | "dividends" | "holdings" | "annualized" | null
  >(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/portfolio/monthly-value`).then((r) => r.json()),
      fetch(`${API_BASE}/api/portfolio/monthly-dividends`).then((r) =>
        r.json(),
      ),
      fetch(`${API_BASE}/api/portfolio/monthly-dividends-by-ticker`).then((r) =>
        r.json(),
      ),
    ])
      .then(([hist, divs, divsByTicker]) => {
        setHistory(hist as MonthlyValue[]);
        setMonthlyDivs(divs as Array<{ month: string; dividends: number }>);
        setDividendsByTicker(divsByTicker as DividendDataPoint[]);
      })
      .catch(() => {
        setHistory([]);
        setMonthlyDivs([]);
        setDividendsByTicker([]);
      });

    fetch(`${API_BASE}/api/portfolio/benchmark`)
      .then((r) => r.json())
      .then((bench) => setBenchmark(bench as BenchmarkPoint[]))
      .catch(() => setBenchmark([]));
  }, []);

  useEffect(() => {
    if (!openModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenModal(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openModal]);

  // --- Chart 1: Pie data ---
  const TOP_N = 7;
  const allPieData = Object.entries(summaries)
    .filter(([, s]) => s.marketValue > 0)
    .map(([ticker, s]) => ({ name: ticker, value: s.marketValue }))
    .sort((a, b) => b.value - a.value);
  const pieData = allPieData.slice(0, TOP_N);
  const otherPieValue = allPieData
    .slice(TOP_N)
    .reduce((s, d) => s + d.value, 0);
  if (otherPieValue > 0) pieData.push({ name: "Other", value: otherPieValue });

  const totalPieValue = pieData.reduce((s, d) => s + d.value, 0);

  const radialData = pieData.map((d, i) => ({
    name: d.name,
    pct: Math.round((d.value / totalPieValue) * 1000) / 10,
    marketValue: d.value,
    fill: d.name === "Other" ? "#1a2a5e" : i === 0 ? "#6f46d4" : PIE_COLORS[(i - 1) % PIE_COLORS.length],
  }));

  // --- Chart 2: thin history ---
  const displayHistory: MonthlyValue[] = history ?? [];

  const histWithPnl = displayHistory.map((row) => ({
    ...row,
    pnl: row.totalValue - row.totalInvested,
  }));

  const histStride =
    histWithPnl.length > 48 ? Math.ceil(histWithPnl.length / 48) : 1;
  const thinHistory = histWithPnl.filter(
    (_, i) => i % histStride === 0 || i === histWithPnl.length - 1,
  );

  // --- Chart 3: Dividend lines data ---
  const MINOR_DIV_TICKERS = new Set(["AAPL", "GOOG", "GOOGL", "LLY"]);
  const top5Tickers = Object.entries(summaries)
    .filter(
      ([ticker, s]) =>
        s.hasDividends &&
        s.dividendIncome > 0 &&
        s.totalShares > 0 &&
        !MINOR_DIV_TICKERS.has(ticker),
    )
    .sort((a, b) => b[1].dividendIncome - a[1].dividendIncome)
    .slice(0, 4)
    .map(([ticker]) => ticker);

  const dividendData: DividendDataPoint[] = dividendsByTicker ?? [];

  const DIV_COLORS = ["#0472e7", "#006b98", "#004f89", "#00a8c8"];

  const loading =
    history === null || monthlyDivs === null || dividendsByTicker === null;

  let pgotCagr: number | null = null;
  let pgotCurrentValue: number | null = null;
  if (!loading && thinHistory.length >= 2) {
    const last = thinHistory[thinHistory.length - 1];
    const first = thinHistory.find((r) => r.totalValue > 0);
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
  const annMin =
    benchmarkPoints.length > 0
      ? Math.min(
          ...benchmarkPoints.map((d) =>
            Math.min(d.portfolioAnn, d.spyAnn, d.nasdaqAnn),
          ),
        )
      : 0;
  const annMax =
    benchmarkPoints.length > 0
      ? Math.max(
          ...benchmarkPoints.map((d) =>
            Math.max(d.portfolioAnn, d.spyAnn, d.nasdaqAnn),
          ),
        )
      : 20;
  const annPad = Math.max(3, (annMax - annMin) * 0.15);
  const annDomain: [number, number] = [
    Math.floor(annMin - annPad),
    Math.ceil(annMax + annPad),
  ];

  const lastBench =
    benchmarkPoints.length > 0
      ? benchmarkPoints[benchmarkPoints.length - 1]
      : null;

  // --- Render helpers for expandable charts ---

  const renderAnnualizedContent = (chartHeight: number) => (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <div style={chartTitleStyle}>Annualized Return vs SPY &amp; Nasdaq</div>
        {lastBench &&
          (() => {
            const diff = lastBench.portfolioAnn - lastBench.spyAnn;
            const portColor =
              lastBench.portfolioAnn >= 0
                ? "var(--success-green)"
                : "var(--primary-blue)";
            const spyColor =
              lastBench.spyAnn >= 0 ? "#004f89" : "var(--primary-blue)";
            const nasdaqColor =
              lastBench.nasdaqAnn >= 0 ? "#007795" : "var(--primary-blue)";
            const diffColor =
              diff >= 0 ? "var(--success-green)" : "var(--primary-blue)";
            const badge = (val: number, color: string, label: string) => (
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 6,
                  color,
                  background: `${color}1a`,
                  border: `1px solid ${color}4d`,
                }}
              >
                {val >= 0 ? "+" : ""}
                {val.toFixed(1)}% {label}
              </span>
            );
            return (
              <>
                {badge(lastBench.portfolioAnn, portColor, "Portfolio")}
                {badge(lastBench.spyAnn, spyColor, "SPY")}
                {badge(lastBench.nasdaqAnn, nasdaqColor, "Nasdaq")}
                {badge(diff, diffColor, diff >= 0 ? "ahead" : "behind")}
              </>
            );
          })()}
        <span
          style={{
            fontSize: "0.72rem",
            color: "var(--text-secondary)",
            marginLeft: "auto",
          }}
        >
          Lump-sum from portfolio start · starts 1yr in
        </span>
      </div>
      {benchmarkLoading ? (
        <div style={spinnerWrapStyle}>
          <div className="spinner" />
        </div>
      ) : benchmarkPoints.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            No benchmark data available — try refreshing the page.
          </span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            data={benchmarkPoints}
            margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonth}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}%`}
              tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
              width={52}
              domain={annDomain}
            />
            <ReTooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(m: any) => fmtMonth(String(m))}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [
                `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`,
                name,
              ]}
              contentStyle={{
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: 8,
                fontSize: "0.8rem",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
            <ReferenceLine
              y={0}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <Line
              type="monotone"
              dataKey="portfolioAnn"
              name="Portfolio Ann%"
              stroke="#6f46d4"
              dot={false}
              strokeWidth={2.5}
            />
            <Line
              type="monotone"
              dataKey="spyAnn"
              name="SPY Ann%"
              stroke="#004f89"
              dot={false}
              strokeWidth={2}
              strokeDasharray="4 2"
            />
            <Line
              type="monotone"
              dataKey="nasdaqAnn"
              name="Nasdaq Ann%"
              stroke="#007795"
              dot={false}
              strokeWidth={2}
              strokeDasharray="6 3"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </>
  );

  const renderGrowthContent = (chartHeight: number, fillChart = false) => (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.25rem",
        }}
      >
        <div style={chartTitleStyle}>Portfolio Growth Over Time</div>
        {!loading &&
          thinHistory.length >= 2 &&
          (() => {
            const last = thinHistory[thinHistory.length - 1];
            const first = thinHistory.find((r) => r.totalValue > 0);
            if (!first || last.totalInvested === 0) return null;
            const roi =
              (last.totalValue - last.totalInvested) / last.totalInvested;
            const [fy, fm] = first.month.split("-").map(Number);
            const [ly, lm] = last.month.split("-").map(Number);
            const years = (ly * 12 + lm - (fy * 12 + fm)) / 12;
            const cagr =
              years > 0 ? ((1 + roi) ** (1 / years) - 1) * 100 : null;
            const statStyle = (val: number): React.CSSProperties => ({
              fontSize: "0.78rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 6,
              color: val >= 0 ? "#007795" : "#0472e7",
              background:
                val >= 0 ? "rgba(0,119,149,0.12)" : "rgba(4,114,231,0.12)",
              border: `1px solid ${val >= 0 ? "rgba(0,119,149,0.3)" : "rgba(4,114,231,0.3)"}`,
            });
            return (
              <>
                <span
                  style={statStyle(roi * 100)}
                  title="Total return: (current value − total invested) ÷ total invested"
                >
                  {roi >= 0 ? "+" : ""}
                  {(roi * 100).toFixed(1)}% ROI
                </span>
                {cagr !== null && (
                  <span
                    style={statStyle(cagr)}
                    title={`CAGR over ${years.toFixed(1)} years`}
                  >
                    {cagr >= 0 ? "+" : ""}
                    {cagr.toFixed(1)}%/yr
                  </span>
                )}
              </>
            );
          })()}
      </div>
      {pgotCagr !== null &&
        pgotCurrentValue !== null &&
        (() => {
          const projectedAnnual = pgotCurrentValue * (pgotCagr / 100);
          const projectedMonthly = projectedAnnual / 12;
          const projectedDaily = projectedAnnual / 365;
          const color = pgotCagr >= 0 ? "#007795" : "#0472e7";
          return (
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                marginBottom: "0.25rem",
              }}
            >
              <span style={{ fontWeight: 700, color }}>
                $
                {projectedAnnual.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                / yr
              </span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projectedMonthly.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
                / mo
              </span>
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projectedDaily.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
                / day
              </span>
            </div>
          );
        })()}
      {loading ? (
        <div style={spinnerWrapStyle}>
          <div className="spinner" />
        </div>
      ) : thinHistory.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            No history data
          </span>
        </div>
      ) : (
        <div style={fillChart ? { flex: 1, minHeight: 0 } : {}}>
          <ResponsiveContainer
            width="100%"
            height={fillChart ? "100%" : chartHeight}
          >
            <ComposedChart
              data={thinHistory}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
              />
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
              <ReTooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(m: any) => fmtMonth(String(m))}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  `$${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
                  name,
                ]}
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
              <ReferenceLine
                yAxisId="left"
                y={0}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={2}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalValue"
                name="Portfolio Value"
                stroke="#6f46d4"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalInvested"
                name="Net Invested"
                stroke="#0472e7"
                dot={false}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="pnl"
                name="Mkt Gain"
                stroke="#006b98"
                dot={false}
                strokeWidth={2}
                strokeDasharray="2 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );

  const renderDividendContent = (chartHeight: number, fillChart = false) => (
    <>
      <div style={chartTitleStyle}>Monthly Dividend Income</div>
      {!loading &&
        dividendData.length > 0 &&
        (() => {
          const currentMonth = new Date().toISOString().substring(0, 7);
          const filteredDivs = dividendData.filter(
            (d) =>
              typeof d.total === "number" &&
              (d.total as number) > 0 &&
              (d.month as string) < currentMonth,
          );
          const lastTotal = filteredDivs[filteredDivs.length - 1]?.total;
          if (!lastTotal || typeof lastTotal !== "number") return null;
          const projAnnual = lastTotal * 12;
          const projMonthly = lastTotal;
          const projDaily = projAnnual / 365;
          const color = "#007795";
          return (
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                marginBottom: "0.25rem",
              }}
            >
              <span style={{ fontWeight: 700, color }}>
                $
                {projAnnual.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </span>{" "}
              / yr
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projMonthly.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </span>{" "}
              / mo
              <span style={{ color: "var(--text-secondary)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projDaily.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </span>{" "}
              / day
            </div>
          );
        })()}
      {loading ? (
        <div style={spinnerWrapStyle}>
          <div className="spinner" />
        </div>
      ) : dividendData.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            No dividend data
          </span>
        </div>
      ) : (
        <div style={fillChart ? { flex: 1, minHeight: 0 } : {}}>
          <ResponsiveContainer
            width="100%"
            height={fillChart ? "100%" : chartHeight}
          >
            <LineChart
              data={dividendData}
              margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
              />
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                width={44}
              />
              <ReTooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(m: any) => fmtMonth(String(m))}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  `$${Number(value).toFixed(2)}`,
                  name,
                ]}
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
              {top5Tickers.map((ticker, i) => (
                <Line
                  key={ticker}
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
                type="monotone"
                dataKey="total"
                name="Mo. Total"
                stroke="#6f46d4"
                dot={false}
                strokeWidth={2.5}
                strokeDasharray="4 2"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );

  const renderHoldingsContent = (chartHeight: number, fontScale = 1) => {
    return (
      <>
        <div style={chartTitleStyle}>Holdings Breakdown</div>
        {totalPieValue > 0 && (
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "#327390",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            $
            {totalPieValue.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}
          </div>
        )}
        {radialData.length === 0 ? (
          <div style={spinnerWrapStyle}>
            <span
              style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}
            >
              No holdings data
            </span>
          </div>
        ) : (
          <>
            <Pie3D
              data={radialData}
              height={chartHeight}
              fontScale={fontScale}
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "3px 10px",
                fontSize: "0.72rem",
                paddingTop: "4px",
              }}
            >
              {radialData.map((d) => (
                <span
                  key={d.name}
                  style={{
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: d.fill,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {d.name}
                </span>
              ))}
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        width: "100%",
      }}
    >
      {/* Row 1 — Holdings Breakdown (25%) + Portfolio Growth (75%) */}
      <div
        className="charts-row"
        style={{
          display: "flex",
          gap: "1.5rem",
          width: "100%",
          alignItems: "stretch",
        }}
      >
        <div
          className="glass-card"
          style={{ ...pieCardStyle, flex: "3.5 1 0", cursor: "pointer" }}
          onClick={() => setOpenModal("holdings")}
          title="Click to expand"
        >
          {renderHoldingsContent(260)}
        </div>
        <div
          className="glass-card"
          style={{ ...cardStyle, flex: "6.5 1 0", cursor: "pointer" }}
          onClick={() => setOpenModal("growth")}
          title="Click to expand"
        >
          {renderGrowthContent(260, true)}
        </div>
      </div>

      {/* Row 2 — Annualized Return (50%) + Monthly Dividend (50%) */}
      <div
        className="charts-row"
        style={{
          display: "flex",
          gap: "1.5rem",
          width: "100%",
          alignItems: "stretch",
        }}
      >
        {/* Chart 3 — Annualized Return vs SPY */}
        <div
          className="glass-card"
          style={{ flex: 1, padding: "1rem 8px 1rem 20px", cursor: "pointer" }}
          onClick={() => setOpenModal("annualized")}
          title="Click to expand"
        >
          {renderAnnualizedContent(220)}
        </div>

        {/* Chart 4 — Line: Monthly Dividend Payout */}
        <div
          className="glass-card"
          style={{ ...cardStyle, flex: 1, minHeight: 0, cursor: "pointer" }}
          onClick={() => setOpenModal("dividends")}
          title="Click to expand"
        >
          {renderDividendContent(220, true)}
        </div>
      </div>

      {/* Expand modal */}
      {openModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
          onClick={() => setOpenModal(null)}
        >
          <div
            className="glass-card"
            style={{
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              padding: "1.5rem 1.5rem 1rem",
              boxShadow:
                "0 32px 96px rgba(0,0,0,0.85), 0 0 40px rgba(4, 114, 231, 0.26)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpenModal(null)}
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%",
                width: "2rem",
                height: "2rem",
                cursor: "pointer",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
            {openModal === "holdings"
              ? renderHoldingsContent(500, 0.7)
              : openModal === "growth"
                ? renderGrowthContent(500)
                : openModal === "annualized"
                  ? renderAnnualizedContent(500)
                  : renderDividendContent(500)}
          </div>
        </div>
      )}
    </div>
  );
}
