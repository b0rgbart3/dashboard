import { ReactNode, useState } from "react";

interface TickerProps {
  symbol: string;
  name?: string;
  description?: string;
  price: number;
  isLive?: boolean;
  totalShares?: number;
  marketValue?: number;
  totalInvested?: number;
  sellProceeds?: number;
  cashIncome?: number;
  dividendIncome?: number;
  withheldTax?: number;
  lastDividendPayment?: number | null;
  avgPurchasePrice?: number | null;
  earliestPurchaseDate?: string | null;
  closedDate?: string | null;
  activeInvestmentYears?: number | null;
  realizedPnL?: number;
  rating?: number | null;
  absoluteRating?: number | null;
  stockType?: 'income' | 'growth' | 'balanced' | null;
}

// Round to 2 dp first, then add 0 to flush -0 and tiny negatives that display as -0.00
const fmt$ = (val: number) =>
  (+val.toFixed(2) + 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (val: number) =>
  `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;

const fmtGain$ = (val: number) =>
  `${val >= 0 ? "+" : "-"}$${fmt$(Math.abs(val))}`;

const gainColor = (val: number) =>
  val >= 0 ? "var(--success)" : "var(--brand-primary)";

const COL_STYLE: React.CSSProperties = {
  width: "25%",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
};

const HEADER_STYLE: React.CSSProperties = {
  fontSize: "0.625rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "rgba(148, 163, 184, 0.55)",
  paddingBottom: "6px",
  borderBottom: "1px solid var(--border-divider)",
  marginBottom: "2px",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "var(--text-muted)",
  whiteSpace: "nowrap",
};

const VALUE_STYLE: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--text)",
  textAlign: "right",
};

const DIVIDER_STYLE: React.CSSProperties = {
  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  marginTop: "6px",
  paddingTop: "8px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
};

function ColHeader({ title }: { title: string }) {
  return <div style={HEADER_STYLE}>{title}</div>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "16px" }}>
      <span style={LABEL_STYLE}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

const Ticker = ({
  symbol,
  name,
  description,
  price,
  isLive = false,
  totalShares = 0,
  marketValue = 0,
  totalInvested = 0,
  sellProceeds = 0,
  cashIncome = 0,
  dividendIncome = 0,
  withheldTax = 0,
  lastDividendPayment = null,
  avgPurchasePrice = null,
  earliestPurchaseDate = null,
  closedDate = null,
  activeInvestmentYears = null,
  realizedPnL = undefined,
  rating = null,
  absoluteRating = null,
  stockType = null,
}: TickerProps) => {
  const [showDesc, setShowDesc] = useState(false);
  const netInvested = totalInvested - sellProceeds;
  const totalGainDollars = marketValue + cashIncome - withheldTax - netInvested;
  const totalReturn =
    totalInvested > 0 ? (totalGainDollars / totalInvested) * 100 : null;

  const yearsHeld = earliestPurchaseDate
    ? (Date.now() - new Date(earliestPurchaseDate).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25)
    : null;

  const heldDuration = (() => {
    if (!earliestPurchaseDate) return null;
    const start = new Date(earliestPurchaseDate);
    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} year${years !== 1 ? "s" : ""}`);
    if (months > 0) parts.push(`${months} month${months !== 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(", ") : "< 1 month";
  })();

  const dividendReturnPct =
    totalInvested > 0 && dividendIncome > 0
      ? (dividendIncome / totalInvested) * 100
      : null;

  const effectiveYears =
    yearsHeld !== null && yearsHeld < 1 ? yearsHeld : activeInvestmentYears;

  const avgAnnualReturn =
    totalReturn !== null && effectiveYears !== null && effectiveYears > 0
      ? totalReturn / effectiveYears
      : null;

  const effectiveAnnualReturn =
    dividendReturnPct !== null && yearsHeld !== null && yearsHeld > 0
      ? dividendReturnPct / yearsHeld
      : null;

  const hasAnnualized = avgAnnualReturn !== null && effectiveYears !== null;

  const monthsHeld = earliestPurchaseDate
    ? (() => {
        const start = new Date(earliestPurchaseDate);
        const end = closedDate ? new Date(closedDate + "T12:00:00") : new Date();
        return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
      })()
    : null;

  const avgMonthlyCashIncome = monthsHeld !== null && cashIncome > 0 ? cashIncome / monthsHeld : null;
  const avgMonthlyDividendIncome = monthsHeld !== null && dividendIncome > 0 ? dividendIncome / monthsHeld : null;

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "row" }}>

      {/* ── Column 1: Identity ── */}
      <div style={{ ...COL_STYLE, paddingRight: "1.5rem", borderRight: "1px solid var(--border-divider)" }}>
        <div style={{ marginBottom: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{ position: "relative", display: "inline-block" }}
              onMouseEnter={() => description && setShowDesc(true)}
              onMouseLeave={() => setShowDesc(false)}
            >
              <h1 style={{ lineHeight: 1.1, cursor: description ? "help" : undefined }}>{symbol}</h1>
              {showDesc && description && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  zIndex: 100,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  width: "340px",
                  maxHeight: "180px",
                  overflowY: "auto",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  boxShadow: "0 8px 24px var(--shadow-mid)",
                  pointerEvents: "none",
                }}>
                  {description}
                </div>
              )}
            </div>
            {isLive && (
              <span
                style={{
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "var(--success)",
                  border: "1px solid var(--success)",
                  borderRadius: "4px",
                  padding: "0 4px",
                  lineHeight: "1.4",
                }}
              >
                LIVE
              </span>
            )}
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "2px" }}>
            {name ?? "Stock Tracker"}
          </p>
        </div>
        <ColHeader title="Market" />
        <Row label="Current Price">
          <span style={VALUE_STYLE}>${fmt$(price)}</span>
        </Row>
        {avgPurchasePrice !== null && (
          <Row label="Avg Purchase Price">
            <span style={VALUE_STYLE}>${fmt$(avgPurchasePrice)}</span>
          </Row>
        )}
        {rating !== null && (
          <Row label="Rating">
            <span style={{
              ...VALUE_STYLE,
              color: rating >= 7 ? "var(--success)" : rating >= 4 ? "var(--warning)" : "var(--brand-primary)",
            }}>
              {rating.toFixed(1)} / 10
            </span>
          </Row>
        )}
        {absoluteRating !== null && (
          <Row label={`Abs. Score${stockType ? ` (${stockType})` : ""}`}>
            <span style={{
              ...VALUE_STYLE,
              color: absoluteRating >= 7 ? "var(--success)" : absoluteRating >= 4 ? "var(--warning)" : "var(--brand-primary)",
            }}>
              {absoluteRating.toFixed(1)} / 10
            </span>
          </Row>
        )}
        {closedDate && (
          <Row label="Closed">
            <span style={{ ...VALUE_STYLE, color: "var(--text-muted)" }}>
              {new Date(closedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </Row>
        )}
      </div>

      {/* ── Column 2: Position ── */}
      <div style={{ ...COL_STYLE, padding: "0 1.5rem", borderRight: "1px solid var(--border-divider)" }}>
        <ColHeader title="Position" />
        <Row label="Shares Held">
          <span style={VALUE_STYLE}>{totalShares > 0 ? totalShares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}</span>
        </Row>
        <Row label="Market Value">
          <span style={{ ...VALUE_STYLE, color: "var(--brand-primary)" }}>${fmt$(marketValue)}</span>
        </Row>
        {heldDuration !== null && (
          <Row label="Held">
            <span style={VALUE_STYLE}>{heldDuration}</span>
          </Row>
        )}
      </div>

      {/* ── Column 3: Performance ── */}
      <div style={{ ...COL_STYLE, padding: "0 1.5rem", borderRight: "1px solid var(--border-divider)" }}>
        <ColHeader title="Performance" />
        <Row label="Total Invested">
          <span style={VALUE_STYLE}>${fmt$(totalInvested)}</span>
        </Row>
        {totalReturn !== null && (
          <>
            <Row label="Total Gain">
              <span style={{ ...VALUE_STYLE, color: gainColor(totalGainDollars) }}>
                {fmtGain$(totalGainDollars)}
              </span>
            </Row>
            {realizedPnL !== undefined && realizedPnL !== 0 && (
              <Row label="Realized P/L">
                <span style={{ ...VALUE_STYLE, color: gainColor(realizedPnL) }}>
                  {fmtGain$(realizedPnL)}
                </span>
              </Row>
            )}
            <Row label="Total Return">
              <span style={{ ...VALUE_STYLE, color: gainColor(totalReturn) }}>
                {fmtPct(totalReturn)}
              </span>
            </Row>
            {hasAnnualized && (
              <div style={DIVIDER_STYLE}>
                <Row label="Avg Annual Return">
                  <span style={{ ...VALUE_STYLE, color: gainColor(avgAnnualReturn!) }}>
                    {fmtPct(avgAnnualReturn!)}
                  </span>
                </Row>
                {effectiveAnnualReturn !== null && (
                  <Row label="Effective Annual Return">
                    <span style={{ ...VALUE_STYLE, color: gainColor(effectiveAnnualReturn) }}>
                      {fmtPct(effectiveAnnualReturn)}
                    </span>
                  </Row>
                )}
                <Row label="Avg Annual Gain">
                  <span style={{ ...VALUE_STYLE, color: gainColor(totalGainDollars) }}>
                    {fmtGain$(totalGainDollars / effectiveYears!)}
                  </span>
                </Row>
                <Row label="Avg Monthly Gain">
                  <span style={{ ...VALUE_STYLE, color: gainColor(totalGainDollars) }}>
                    {fmtGain$(totalGainDollars / effectiveYears! / 12)}
                  </span>
                </Row>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Column 4: Income ── */}
      <div style={{ ...COL_STYLE, paddingLeft: "1.5rem" }}>
        <ColHeader title="Income" />
        {cashIncome > 0 || dividendIncome > 0 || withheldTax > 0 ? (
          <>
            {cashIncome > 0 && (
              <>
                <Row label="SLIP Income (Total)">
                  <span style={{ ...VALUE_STYLE, color: "var(--success)" }}>${fmt$(cashIncome)}</span>
                </Row>
                {avgMonthlyCashIncome !== null && (
                  <Row label="SLIP Income (Avg/mo)">
                    <span style={{ ...VALUE_STYLE, color: "var(--success)" }}>${fmt$(avgMonthlyCashIncome)}</span>
                  </Row>
                )}
              </>
            )}
            {dividendIncome > 0 && (
              <>
                <Row label={withheldTax > 0 ? "Gross Div. Income (Total)" : "Dividend Income (Total)"}>
                  <span style={{ ...VALUE_STYLE, color: "var(--success)" }}>${fmt$(dividendIncome)}</span>
                </Row>
                {avgMonthlyDividendIncome !== null && (
                  <Row label="Dividend Income (Avg/mo)">
                    <span style={{ ...VALUE_STYLE, color: "var(--success)" }}>${fmt$(avgMonthlyDividendIncome)}</span>
                  </Row>
                )}
                {lastDividendPayment !== null && lastDividendPayment > 0 && (
                  <Row label="Last Dividend Payment">
                    <span style={{ ...VALUE_STYLE, color: "var(--success)" }}>${fmt$(lastDividendPayment)}</span>
                  </Row>
                )}
              </>
            )}
            {withheldTax > 0 && (
              <Row label="Tax Withheld (DTAX)">
                <span style={{ ...VALUE_STYLE, color: "var(--brand-primary)" }}>-${fmt$(withheldTax)}</span>
              </Row>
            )}
            {withheldTax > 0 && dividendIncome > 0 && (
              <Row label="Net Dividend Income">
                <span style={{ ...VALUE_STYLE, color: "var(--success)" }}>${fmt$(dividendIncome - withheldTax)}</span>
              </Row>
            )}
            {dividendReturnPct !== null && (
              <Row label="Dividend % Gain">
                <span style={{ ...VALUE_STYLE, color: gainColor(dividendReturnPct) }}>
                  {fmtPct(dividendReturnPct)}
                </span>
              </Row>
            )}
          </>
        ) : (
          <p style={{ fontSize: "0.75rem", color: "rgba(148, 163, 184, 0.4)", fontStyle: "italic" }}>
            No income data
          </p>
        )}
      </div>

    </div>
  );
};

export default Ticker;
