import React, { useEffect, useMemo, useState } from "react";
import {
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
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

interface RealizedPnlPoint {
  month: string;
  realizedPnL: number;
}

interface BenchmarkPoint {
  month: string;
  portfolioAnn: number;
  spyAnn: number;
  nasdaqAnn: number;
}

interface YearlyGrowthRow {
  year: string;
  isPartial: boolean;
  startValue: number;
  endValue: number;
  netContributions: number;
  marketGain: number;
  growthPct: number | null;
}

type PgotPeriod = "3m" | "6m" | "ytd" | "1y" | "2y" | "5y" | "all";

const PGOT_PERIODS: { key: PgotPeriod; label: string }[] = [
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
  { key: "2y", label: "2Y" },
  { key: "5y", label: "5Y" },
  { key: "all", label: "ALL" },
];

function getPgotWindowStart(period: PgotPeriod): string | null {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (period) {
    case "3m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    case "6m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    case "ytd":
      return `${now.getFullYear()}-01`;
    case "1y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    case "2y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 2);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    case "5y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 5);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    }
    case "all":
      return null;
  }
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
];

interface Pie3DSlice {
  name: string;
  pct: number;
  marketValue: number;
  fill: string;
}

function darken(colorValue: string, factor = 0.55): string {
  let hex = colorValue;
  if (colorValue.startsWith("var(")) {
    const name = colorValue.slice(4, -1).trim();
    hex = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }
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
              stroke="var(--chart-shadow-deep)"
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
              stroke="var(--chart-shadow)"
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
                stroke="var(--chart-stroke-white)"
                strokeWidth={1.2}
              />
              <text
                x={lx}
                y={ly - 2}
                textAnchor={anchor}
                fill="var(--text-muted)"
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
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: "0.8rem",
            padding: "5px 10px",
            pointerEvents: "none",
            zIndex: 100,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--text)", fontWeight: 600 }}>
            {hovered.name}
          </span>
          <br />
          <span style={{ color: "var(--text-muted)" }}>
            {hovered.pct}% ·{" "}
            {`$${hovered.marketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          </span>
        </div>
      )}
    </div>
  );
}

// Bar shape for Realized P&L layer — literal green for profit months, red for loss
// months (an intentional exception to this dashboard's usual red-free palette, since
// green/red is the unambiguous market convention for gain/loss).
// (Cell is deprecated in recharts 3.x; shape is the replacement for per-datum styling).
function RealizedPnlBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { realizedPnL?: number };
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const value = payload?.realizedPnL ?? 0;
  const fill = value >= 0 ? "#22c55e" : "#ef4444";
  // Recharts' built-in Rectangle normalizes negative width/height during animation
  // frames (bars crossing the zero baseline); a bare <rect> must do the same or SVG
  // rejects the negative attribute and silently drops the element mid-animation.
  const safeWidth = Math.abs(width);
  const safeHeight = Math.abs(height);
  const safeX = width < 0 ? x + width : x;
  const safeY = height < 0 ? y + height : y;
  return <rect x={safeX} y={safeY} width={safeWidth} height={safeHeight} fill={fill} />;
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

function fmtUsd(v: number): string {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
  color: "var(--text)",
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
  const [realizedPnl, setRealizedPnl] = useState<RealizedPnlPoint[] | null>(
    null,
  );
  const [periodReturns, setPeriodReturns] = useState<Record<
    PgotPeriod,
    number
  > | null>(null);
  const [openModal, setOpenModal] = useState<
    "growth" | "dividends" | "holdings" | "annualized" | null
  >(null);
  const [pgotPeriod, setPgotPeriod] = useState<PgotPeriod>("all");
  const [yearlyBreakdownOpen, setYearlyBreakdownOpen] = useState(false);

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

    fetch(`${API_BASE}/api/portfolio/monthly-realized-pnl`)
      .then((r) => r.json())
      .then((pnl) => setRealizedPnl(pnl as RealizedPnlPoint[]))
      .catch(() => setRealizedPnl([]));

    fetch(`${API_BASE}/api/portfolio/period-returns`)
      .then((r) => r.json())
      .then((pr) => setPeriodReturns(pr as Record<PgotPeriod, number>))
      .catch(() => setPeriodReturns({} as Record<PgotPeriod, number>));
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
    fill:
      d.name === "Other"
        ? "var(--chart-other)"
        : i === 0
          ? "var(--data-supreme)"
          : PIE_COLORS[(i - 1) % PIE_COLORS.length],
  }));

  // --- Chart 2: thin history ---
  const displayHistory: MonthlyValue[] = history ?? [];

  const realizedByMonth = new Map(
    (realizedPnl ?? []).map((r) => [r.month, r.realizedPnL]),
  );
  let cumRealized = 0;
  const histWithPnl = displayHistory.map((row) => {
    const realizedPnL = realizedByMonth.get(row.month) ?? 0;
    cumRealized += realizedPnL;
    return {
      ...row,
      pnl: row.totalValue - row.totalInvested,
      realizedPnL,
      cumRealizedPnL: +cumRealized.toFixed(2),
    };
  });

  const histStride =
    histWithPnl.length > 48 ? Math.ceil(histWithPnl.length / 48) : 1;
  const thinHistory = histWithPnl.filter(
    (_, i) => i % histStride === 0 || i === histWithPnl.length - 1,
  );

  const pgotWindowStart = getPgotWindowStart(pgotPeriod);
  const pgotRawFiltered = pgotWindowStart
    ? histWithPnl.filter((r) => r.month >= pgotWindowStart)
    : histWithPnl;
  const pgotStride =
    pgotRawFiltered.length > 48 ? Math.ceil(pgotRawFiltered.length / 48) : 1;
  // Bucket (rather than sample) so months skipped for display still contribute
  // their realized P&L to the retained bar instead of vanishing from the chart.
  const filteredHistory =
    pgotStride <= 1
      ? pgotRawFiltered
      : Array.from(
          { length: Math.ceil(pgotRawFiltered.length / pgotStride) },
          (_, i) => {
            const bucket = pgotRawFiltered.slice(
              i * pgotStride,
              Math.min((i + 1) * pgotStride, pgotRawFiltered.length),
            );
            const last = bucket[bucket.length - 1];
            return {
              ...last,
              realizedPnL: bucket.reduce((s, r) => s + r.realizedPnL, 0),
            };
          },
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

  // Fixed legend/tooltip order for the MDI chart; anything outside this list keeps its
  // income-ranked position appended after the known tickers.
  const DIVIDEND_TICKER_ORDER = ["STRC", "SATA", "TSM", "RHHBY"];
  const orderedDividendTickers = [...top5Tickers].sort((a, b) => {
    const ai = DIVIDEND_TICKER_ORDER.indexOf(a);
    const bi = DIVIDEND_TICKER_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  // Recharts doesn't reliably order the Legend/Tooltip payload by JSX position, so both are
  // forced explicitly from this same key order (Mo. Total first, then the fixed ticker order).
  const dividendOrderKeys = ["total", ...orderedDividendTickers];

  const dividendData: DividendDataPoint[] = dividendsByTicker ?? [];

  const DIV_COLORS = [
    "var(--chart-1)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-7)",
  ];

  const loading =
    history === null || monthlyDivs === null || dividendsByTicker === null;

  // Since-inception stats (ROI/CAGR) are intentionally computed off the full, unwindowed
  // histWithPnl rather than filteredHistory — they're meant to stay stable as a fixed
  // reference point regardless of which period tab (YTD/1Y/etc.) is selected. Mixing a
  // period-scoped time span with the since-inception ROI figure previously produced
  // nonsensical annualized numbers (e.g. "+380%/yr") whenever a short period was selected.
  let pgotRoi: number | null = null;
  let pgotCagr: number | null = null;
  let pgotCurrentValue: number | null = null;
  let pgotYears: number | null = null;
  if (!loading && histWithPnl.length >= 2) {
    const last = histWithPnl[histWithPnl.length - 1];
    const first = histWithPnl.find((r) => r.totalValue > 0);
    if (first && last.totalInvested > 0) {
      const roi = (last.totalValue - last.totalInvested) / last.totalInvested;
      pgotRoi = roi * 100;
      const [fy, fm] = first.month.split("-").map(Number);
      const [ly, lm] = last.month.split("-").map(Number);
      const years = (ly * 12 + lm - (fy * 12 + fm)) / 12;
      if (years > 0) {
        pgotCagr = ((1 + roi) ** (1 / years) - 1) * 100;
        pgotCurrentValue = last.totalValue;
        pgotYears = years;
      }
    }
  }

  // Per-calendar-year growth breakdown — intentionally separate from pgotRoi/pgotCagr
  // above, which are since-inception figures using lifetime totalInvested. Here, each
  // year's "market gain" excludes that year's own net contributions, so adding/removing
  // money doesn't get misread as investment performance.
  const yearlyGrowth: YearlyGrowthRow[] = [];
  if (!loading && histWithPnl.length > 0) {
    const byYear = new Map<string, typeof histWithPnl>();
    for (const row of histWithPnl) {
      const year = row.month.slice(0, 4);
      const bucket = byYear.get(year);
      if (bucket) bucket.push(row);
      else byYear.set(year, [row]);
    }
    const years = Array.from(byYear.keys()).sort();
    years.forEach((year, idx) => {
      const rows = byYear.get(year)!;
      const endRow = rows[rows.length - 1];
      const prevRows = idx > 0 ? byYear.get(years[idx - 1])! : null;
      // First year in the dataset has no prior-year snapshot: use its own first
      // row as both the start value and the contribution baseline.
      const startRow = prevRows ? prevRows[prevRows.length - 1] : rows[0];
      const startInvestedRow = prevRows ? startRow : rows[0];

      const startValue = startRow.totalValue;
      const endValue = endRow.totalValue;
      const netContributions =
        endRow.totalInvested - startInvestedRow.totalInvested;
      const marketGain = endValue - startValue - netContributions;
      const growthPct = startValue > 0 ? (marketGain / startValue) * 100 : null;

      yearlyGrowth.push({
        year,
        isPartial: idx === years.length - 1 && !endRow.month.endsWith("-12"),
        startValue,
        endValue,
        netContributions,
        marketGain,
        growthPct,
      });
    });
  }

  // % change across the selected period (YTD/1Y/2Y/5Y/ALL) — a time-weighted return computed
  // server-side at daily granularity from the actual transaction dates (see
  // /api/portfolio/period-returns). A monthly-bucketed version of this used to live here, but for
  // an active, volatile portfolio like this one, approximating *when in the month* each
  // contribution landed swung the all-time figure from -64% to +499% to +6738% depending purely
  // on that guess — none of them trustworthy. Daily granularity removes the guess entirely.
  const pgotPeriodChangePct: number | null = periodReturns?.[pgotPeriod] ?? null;

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

  // Explicit left-axis domain (dollars: Portfolio Value / Net Invested / Mkt Gain), so
  // we know exactly where its zero baseline sits and can line up the right axis to match.
  const leftValues = filteredHistory.flatMap((r) => [
    r.totalValue,
    r.totalInvested,
    r.pnl,
    r.cumRealizedPnL,
  ]);
  const leftMin = leftValues.length > 0 ? Math.min(...leftValues, 0) : 0;
  const leftMax = leftValues.length > 0 ? Math.max(...leftValues, 0) : 1;
  const leftPad = Math.max(1, (leftMax - leftMin) * 0.08);
  const leftDomain: [number, number] = [leftMin - leftPad, leftMax + leftPad];
  const zeroFraction = Math.min(
    0.98,
    Math.max(0.02, (0 - leftDomain[0]) / (leftDomain[1] - leftDomain[0])),
  );

  // Realized P&L (right-axis bars) domain: sized to fit the data with padding, but
  // constrained so its zero baseline lands at the same fractional height as the left
  // axis's zero — otherwise the two axes' zero lines visually diverge.
  const realizedValues = filteredHistory.map((r) => r.realizedPnL);
  const realizedMaxRaw =
    realizedValues.length > 0 ? Math.max(0, ...realizedValues) : 0;
  const realizedMinRaw =
    realizedValues.length > 0 ? Math.min(0, ...realizedValues) : 0;
  const requiredMax = Math.max(1, realizedMaxRaw * 1.15);
  const requiredMin = Math.min(-1, realizedMinRaw * 1.15);
  let realizedMaxDomain = requiredMax;
  let realizedMinDomain =
    (-zeroFraction / (1 - zeroFraction)) * realizedMaxDomain;
  if (realizedMinDomain > requiredMin) {
    realizedMinDomain = requiredMin;
    realizedMaxDomain =
      (-realizedMinDomain * (1 - zeroFraction)) / zeroFraction;
  }
  const realizedDomain: [number, number] = [
    realizedMinDomain,
    realizedMaxDomain,
  ];

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
                ? "var(--success)"
                : "var(--brand-primary)";
            const spyColor =
              lastBench.spyAnn >= 0 ? "var(--chart-5)" : "var(--brand-primary)";
            const nasdaqColor =
              lastBench.nasdaqAnn >= 0
                ? "var(--success)"
                : "var(--brand-primary)";
            const diffColor =
              diff >= 0 ? "var(--success)" : "var(--brand-primary)";
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
            color: "var(--text-muted)",
            marginLeft: "auto",
          }}
        >
          Time-weighted, annualized · starts 1yr in
        </span>
      </div>
      {benchmarkLoading ? (
        <div style={spinnerWrapStyle}>
          <div className="spinner" />
        </div>
      ) : benchmarkPoints.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
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
              strokeDasharray="4 2"
              stroke="#add5ff"
              strokeWidth={5}
              strokeOpacity={1}
            />
            <XAxis
              dataKey="month"
              tickFormatter={fmtMonth}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}%`}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
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
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: "0.8rem",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
            <ReferenceLine
              y={0}
              stroke="var(--chart-stroke-mid)"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            <Line
              type="monotone"
              dataKey="portfolioAnn"
              name="Portfolio Ann%"
              stroke="var(--chart-8)"
              dot={false}
              strokeWidth={2.5}
            />
            <Line
              type="monotone"
              dataKey="spyAnn"
              name="SPY Ann%"
              stroke="var(--chart-5)"
              dot={false}
              strokeWidth={2}
              strokeDasharray="4 2"
            />
            <Line
              type="monotone"
              dataKey="nasdaqAnn"
              name="Nasdaq Ann%"
              stroke="var(--chart-2)"
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
          pgotRoi !== null &&
          (() => {
            const statStyle = (val: number): React.CSSProperties => ({
              fontSize: "0.78rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 6,
              color: val >= 0 ? "var(--success)" : "var(--brand-primary)",
              background:
                val >= 0 ? "rgba(0,119,149,0.12)" : "rgba(4,114,231,0.12)",
              border: `1px solid ${val >= 0 ? "rgba(0,119,149,0.3)" : "rgba(4,114,231,0.3)"}`,
            });
            return (
              <>
                <span
                  style={statStyle(pgotRoi)}
                  title="Total return since inception: (current value − total invested) ÷ total invested"
                >
                  {pgotRoi >= 0 ? "+" : ""}
                  {pgotRoi.toFixed(1)}% ROI
                </span>
                {pgotCagr !== null && pgotYears !== null && (
                  <span
                    style={statStyle(pgotCagr)}
                    title={`CAGR since inception, over ${pgotYears.toFixed(1)} years`}
                  >
                    {pgotCagr >= 0 ? "+" : ""}
                    {pgotCagr.toFixed(1)}%/yr
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
          const color =
            pgotCagr >= 0 ? "var(--success)" : "var(--brand-primary)";
          const periodLabel =
            PGOT_PERIODS.find((p) => p.key === pgotPeriod)?.label ?? "";
          const periodColor =
            pgotPeriodChangePct !== null && pgotPeriodChangePct >= 0
              ? "#22c55e"
              : "#ef4444";
          return (
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                marginBottom: "0.25rem",
              }}
            >
              <span style={{ fontWeight: 700, color }}>
                $
                {projectedAnnual.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                yr
              </span>
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projectedMonthly.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                mo
              </span>
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projectedDaily.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}{" "}
                day
              </span>
              {pgotPeriodChangePct !== null && (
                <span
                  style={{ fontWeight: 700, color: periodColor, marginLeft: "6px" }}
                  title={`Portfolio value change over ${periodLabel}`}
                >
                  {pgotPeriodChangePct >= 0 ? "+" : ""}
                  {pgotPeriodChangePct.toFixed(1)}% {periodLabel}
                </span>
              )}
            </div>
          );
        })()}
      {!loading && yearlyGrowth.length > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setYearlyBreakdownOpen((prev) => !prev);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 0",
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {yearlyBreakdownOpen ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
            Yearly Breakdown
          </button>
          {yearlyBreakdownOpen && (
            <div
              style={{
                overflowX: "auto",
                overflowY: "auto",
                maxHeight: 220,
                marginTop: "4px",
              }}
            >
              <table style={{ marginTop: 0 }}>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Net Added</th>
                    <th>Market Gain</th>
                    <th>Growth %</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyGrowth.map((row) => {
                    const gainColor =
                      row.marketGain >= 0
                        ? "var(--success)"
                        : "var(--brand-primary)";
                    return (
                      <tr key={row.year}>
                        <td>
                          {row.year}
                          {row.isPartial ? " YTD" : ""}
                        </td>
                        <td>{fmtUsd(row.startValue)}</td>
                        <td>{fmtUsd(row.endValue)}</td>
                        <td>
                          {row.netContributions >= 0 ? "+" : "-"}
                          {fmtUsd(Math.abs(row.netContributions))}
                        </td>
                        <td style={{ color: gainColor, fontWeight: 600 }}>
                          {row.marketGain >= 0 ? "+" : "-"}
                          {fmtUsd(Math.abs(row.marketGain))}
                        </td>
                        <td style={{ color: gainColor }}>
                          {row.growthPct === null
                            ? "—"
                            : `${row.growthPct >= 0 ? "+" : ""}${row.growthPct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {loading ? (
        <div style={spinnerWrapStyle}>
          <div className="spinner" />
        </div>
      ) : filteredHistory.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
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
              data={filteredHistory}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 2"
                stroke="#add5ff"
                strokeWidth={5}
                strokeOpacity={1}
                yAxisId="left"
              />
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                yAxisId="left"
                domain={leftDomain}
                tickFormatter={fmtDollar}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                width={52}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={realizedDomain}
                tickFormatter={fmtDollar}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                width={52}
                label={{
                  value: "Realized P&L",
                  angle: 90,
                  position: "insideRight",
                  fill: "var(--text-muted)",
                  fontSize: 10,
                  style: { textAnchor: "middle" },
                }}
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
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }} />
              <ReferenceLine
                yAxisId="left"
                y={0}
                stroke="var(--chart-stroke-bright)"
                strokeWidth={2}
              />
              <Bar
                yAxisId="right"
                dataKey="realizedPnL"
                name="Realized P&L"
                fill="#22c55e"
                shape={RealizedPnlBar}
                maxBarSize={18}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalValue"
                name="Portfolio Value"
                stroke="var(--chart-8)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="totalInvested"
                name="Net Invested"
                stroke="var(--chart-1)"
                dot={false}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="pnl"
                name="Mkt Gain"
                stroke="var(--chart-4)"
                dot={false}
                strokeWidth={2}
                strokeDasharray="2 2"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cumRealizedPnL"
                name="Realized P&L (cum.)"
                stroke="var(--chart-3)"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && filteredHistory.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "10px",
            paddingTop: "8px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {PGOT_PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={(e) => {
                e.stopPropagation();
                setPgotPeriod(key);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 6px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: pgotPeriod === key ? 600 : 400,
                color:
                  pgotPeriod === key
                    ? "var(--brand-primary)"
                    : "var(--text-muted)",
                borderBottom:
                  pgotPeriod === key
                    ? "2px solid var(--brand-primary)"
                    : "2px solid transparent",
                transition: "color 0.15s",
                letterSpacing: "0.02em",
              }}
            >
              {label}
            </button>
          ))}
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
          const color = "var(--success)";
          return (
            <div
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                marginBottom: "0.25rem",
              }}
            >
              <span style={{ fontWeight: 700, color }}>
                $
                {projAnnual.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </span>{" "}
              yr
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projMonthly.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </span>{" "}
              mo
              <span style={{ color: "var(--text-muted)", margin: "0 6px" }}>
                |
              </span>
              <span style={{ fontWeight: 700, color }}>
                $
                {projDaily.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </span>{" "}
              day
            </div>
          );
        })()}
      {loading ? (
        <div style={spinnerWrapStyle}>
          <div className="spinner" />
        </div>
      ) : dividendData.length === 0 ? (
        <div style={spinnerWrapStyle}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
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
                strokeDasharray="4 2"
                stroke="#add5ff"
                strokeWidth={5}
                strokeOpacity={1}
              />
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                itemSorter={(item: any) => {
                  const idx = dividendOrderKeys.indexOf(item.dataKey);
                  return idx === -1 ? dividendOrderKeys.length : idx;
                }}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "0.75rem", paddingTop: 4 }}
                itemSorter={(item) => {
                  const idx = dividendOrderKeys.indexOf(
                    String(item.dataKey ?? ""),
                  );
                  return idx === -1 ? dividendOrderKeys.length : idx;
                }}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Mo. Total"
                stroke="var(--chart-8)"
                dot={false}
                strokeWidth={2.5}
                strokeDasharray="4 2"
                connectNulls
              />
              {orderedDividendTickers.map((ticker, i) => (
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
              color: "var(--text-muted)",
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
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
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
                    color: "var(--text-muted)",
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
            background: "var(--bg-overlay)",
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
                "0 32px 96px var(--bg-overlay-deep), 0 0 40px var(--shadow-overlay)",
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
                background: "var(--bg-input-focus)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "50%",
                width: "2rem",
                height: "2rem",
                cursor: "pointer",
                color: "var(--text-muted)",
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
