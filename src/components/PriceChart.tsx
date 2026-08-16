import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { API_BASE } from "../utils/portfolioUtils";

type Period = "1d" | "1w" | "1m" | "3m" | "ytd" | "1y" | "5y" | "max";

interface PricePoint {
  timestamp: number;
  price: number;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
  { key: "max", label: "MAX" },
];

function getWindowStart(period: Period): number {
  const now = Date.now();
  const d = new Date(now);
  switch (period) {
    case "1d": return now - 2 * 24 * 60 * 60 * 1000;
    case "1w": return now - 7 * 24 * 60 * 60 * 1000;
    case "1m": d.setMonth(d.getMonth() - 1); return d.getTime();
    case "3m": d.setMonth(d.getMonth() - 3); return d.getTime();
    case "ytd": return new Date(d.getFullYear(), 0, 1).getTime();
    case "1y": d.setFullYear(d.getFullYear() - 1); return d.getTime();
    case "5y": d.setFullYear(d.getFullYear() - 5); return d.getTime();
    case "max": return 0;
    default: d.setMonth(d.getMonth() - 3); return d.getTime();
  }
}

function formatXAxisTick(timestamp: number, period: Period): string {
  const date = new Date(timestamp);
  switch (period) {
    case "1d":
      return format(date, "HH:mm");
    case "1w":
      return format(date, "EEE");
    case "1m":
    case "3m":
      return format(date, "MMM d");
    case "ytd":
    case "1y":
      return format(date, "MMM");
    case "5y":
      return format(date, "MMM yy");
    case "max":
      return format(date, "yyyy");
    default:
      return format(date, "MMM d");
  }
}

function formatTooltipDate(timestamp: number, period: Period): string {
  const date = new Date(timestamp);
  if (period === "1d") return format(date, "MMM d, HH:mm");
  return format(date, "MMM d, yyyy");
}

export default function PriceChart({ ticker }: { ticker: string }) {
  const [period, setPeriod] = useState<Period>("ytd");
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (t: string, p: Period) => {
    setLoading(true);
    setError(null);
    setData([]);
    try {
      const res = await fetch(`${API_BASE}/api/price/chart/${t}?period=${p}`);
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json.data ?? []);
    } catch {
      setError("Unable to load price chart");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) fetchData(ticker, period);
  }, [ticker, period, fetchData]);

  const priceMin = data.length > 0 ? Math.min(...data.map((d) => d.price)) : 0;
  const priceMax = data.length > 0 ? Math.max(...data.map((d) => d.price)) : 0;
  const pad = (priceMax - priceMin) * 0.06;
  const yDomain: [number, number] = data.length > 0
    ? [priceMin - pad, priceMax + pad]
    : [0, 1];

  const isPositive =
    data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const lineColor = isPositive ? "var(--chart-1)" : "var(--danger)";

  const currentPrice = data.length > 0 ? data[data.length - 1].price : null;
  const pctChange = data.length >= 2
    ? ((data[data.length - 1].price - data[0].price) / data[0].price) * 100
    : null;

  const windowStart = useMemo(() => getWindowStart(period), [period]);
  const windowEnd = Date.now();

  // Split into two parallel series so the pre-data gap renders as a neutral
  // flat line (flatPrice) separate from the real data (price).
  // Both series share the first real data point as a junction so they connect.
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    const hasGap = period !== "max" && data[0].timestamp > windowStart;
    if (!hasGap) {
      return data.map(d => ({ timestamp: d.timestamp, price: d.price as number | null, flatPrice: null as number | null }));
    }
    const firstPrice = data[0].price;
    return [
      { timestamp: windowStart, price: null as number | null, flatPrice: firstPrice as number | null },
      { timestamp: data[0].timestamp, price: firstPrice as number | null, flatPrice: firstPrice as number | null },
      ...data.slice(1).map(d => ({ timestamp: d.timestamp, price: d.price as number | null, flatPrice: null as number | null })),
    ];
  }, [data, period, windowStart]);

  const xDomain: [number, number] | ["dataMin", "dataMax"] =
    period === "max" ? ["dataMin", "dataMax"] : [windowStart, windowEnd];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ height: 280, position: "relative" }}>
        {currentPrice !== null && (
          <div
            style={{
              position: "absolute",
              top: 30,
              left: 90,
              zIndex: 10,
              pointerEvents: "none",
              lineHeight: 1,
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#ffffff",
                fontFamily: "var(--font-heading, Outfit, sans-serif)",
                letterSpacing: "-0.02em",
                display: "block",
              }}
            >
              ${currentPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            {pctChange !== null && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: lineColor,
                  display: "block",
                  marginTop: 5,
                }}
              >
                {pctChange >= 0 ? "+" : ""}
                {pctChange.toFixed(2)}%
              </span>
            )}
          </div>
        )}
        {loading && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        )}
        {error && !loading && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="priceAreaGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={lineColor}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={lineColor}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={xDomain}
                tickFormatter={(ts) => formatXAxisTick(ts as number, period)}
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={55}
              />
              <YAxis
                domain={yDomain}
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  `$${Number(v).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                }
                width={72}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !label) return null;
                  const entry = payload.find(p => p.dataKey === "price" && p.value != null);
                  if (!entry) return null;
                  const price = entry.value as number;
                  return (
                    <div style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      padding: "8px 10px",
                    }}>
                      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
                        {formatTooltipDate(label as number, period)}
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {ticker}: ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="flatPrice"
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                strokeOpacity={0.5}
                fill="none"
                dot={false}
                activeDot={false}
                legendType="none"
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={2}
                fill="url(#priceAreaGradient)"
                dot={false}
                activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {!loading && !error && data.length === 0 && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No price data available
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "12px",
          paddingTop: "10px",
          borderTop: "1px solid var(--border)",
        }}
      >
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: period === key ? 600 : 400,
              color:
                period === key ? "var(--brand-primary)" : "var(--text-muted)",
              borderBottom:
                period === key
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
    </div>
  );
}
