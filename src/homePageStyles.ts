import type { CSSProperties } from "react";

// ---------------------------------------------------------------------------
// Static style objects
// ---------------------------------------------------------------------------

export const pageContainer: CSSProperties = {
  display: "flex", flexDirection: "column",
  minHeight: "100vh",
};

export const navbar: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "1rem 2rem",
  borderBottom: "1px solid rgba(4, 114, 231, 0.14)",
  position: "sticky",
  top: 0,
  zIndex: 100,
  background: "rgba(2, 8, 16, 0.92)",
  backdropFilter: "blur(12px)",
};

export const logo: CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 700,
  color: "var(--text-primary)",
  margin: 0,
  letterSpacing: "-0.02em",
};

export const hamburgerBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 10px",
  borderRadius: "8px",
  cursor: "pointer",
  lineHeight: 0,
};

export const dropdownMenu: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  minWidth: "210px",
  background: "var(--card-bg)",
  border: "1px solid rgba(4, 114, 231, 0.2)",
  borderRadius: "12px",
  padding: "6px",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  zIndex: 200,
};

export const dropdownItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px 14px",
  borderRadius: "8px",
  fontSize: "0.95rem",
  cursor: "pointer",
  background: "transparent",
  border: "none",
  color: "var(--text-primary)",
  width: "100%",
  textAlign: "left",
};

export const dropdownItemDanger: CSSProperties = {
  color: "#9b7fd4",
};

export const modalOverlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 500,
};

export const modalBox: CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid rgba(4, 114, 231, 0.2)",
  borderRadius: "16px",
  padding: "2rem",
  maxWidth: "420px",
  width: "90%",
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  alignItems: "center",
  boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
};

export const modalText: CSSProperties = {
  fontSize: "1rem",
  color: "var(--text-primary)",
  textAlign: "center",
  margin: 0,
};

export const modalButtons: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  justifyContent: "center",
};

export const contentArea: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center",
  gap: "2rem", padding: "2rem", flex: 1,
};

export const warningBanner: CSSProperties = {
  maxWidth: "480px", padding: "0.85rem 1.25rem", borderRadius: "10px",
  background: "rgba(245, 158, 11, 0.1)",
  border: "1px solid rgba(245, 158, 11, 0.4)",
  color: "var(--text-primary)", fontSize: "0.95rem", textAlign: "center",
};

// Shared by "Yes, clear first" and "Yes, delete everything"
export const destructiveConfirmButton: CSSProperties = {
  padding: "10px 20px", fontSize: "0.95rem", borderRadius: "10px",
  background: "#6f46d4", borderColor: "#3008a0",
};

// Shared by Cancel and "No, keep existing" buttons
export const cancelButton: CSSProperties = {
  padding: "10px 20px", fontSize: "0.95rem", borderRadius: "10px",
};

export const hiddenFileInput: CSSProperties = { display: "none" };

export const loadingContainer: CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem",
};

export const loadingStatusText: CSSProperties = {
  color: "var(--text-secondary)", fontSize: "0.85rem",
};

export const importProgressLog: CSSProperties = {
  color: "var(--text-secondary)", fontSize: "0.78rem",
  fontFamily: "monospace", opacity: 0.7, maxWidth: "480px", textAlign: "center",
};

export const portfolioSection: CSSProperties = { width: "100%" };

export const sectionHeading: CSSProperties = {
  fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "0.75rem",
  textAlign: "center", letterSpacing: "0.05em", textTransform: "uppercase",
};

export const emptyStateMessage: CSSProperties = {
  textAlign: "center", color: "var(--text-secondary)",
  padding: "2rem", fontSize: "0.9rem",
};

export const summaryTable: CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  fontSize: "0.9rem", tableLayout: "auto",
};

export const tableHeaderRow: CSSProperties = { borderBottom: "1px solid var(--border)" };

export const tickerCell: CSSProperties = {
  padding: "4px 4px", fontWeight: 700, color: "var(--text-primary)",
};

// Reused across invested, shares, held, and other muted right-aligned columns
export const secondaryValueCell: CSSProperties = {
  padding: "4px 4px", textAlign: "right", color: "var(--text-secondary)",
};

export const primaryValueCell: CSSProperties = {
  padding: "4px 4px", textAlign: "right", color: "var(--text-primary)",
};

export const totalRow: CSSProperties = { borderTop: "2px solid rgba(255,255,255,0.2)" };

export const totalLabelCell: CSSProperties = {
  padding: "4px 4px", fontWeight: 700, fontSize: "0.78rem",
  textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-primary)",
};

export const totalPrimaryValueCell: CSSProperties = {
  padding: "4px 4px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)",
};

export const totalSecondaryValueCell: CSSProperties = {
  padding: "4px 4px", textAlign: "right", fontWeight: 700, color: "var(--text-secondary)",
};

// td wrapper for footer cells whose content is an inner div (Ann%, Divs, YTD DV, Cash)
export const totalInnerCell: CSSProperties = { padding: "4px 4px", textAlign: "right" };

// Shared by "avg", "/mo", "ytd" footnote spans
export const tableSubLabel: CSSProperties = {
  fontSize: "0.65rem", color: "var(--text-secondary)", marginLeft: "3px",
};

// "wtd" variant carries explicit fontWeight: 400 reset
export const tableSubLabelWtd: CSSProperties = {
  fontSize: "0.65rem", fontWeight: 400,
  color: "var(--text-secondary)", marginLeft: "3px",
};

export const closedDateLabel: CSSProperties = { fontSize: "0.72rem", opacity: 0.55 };

export const stockTypeChip: CSSProperties = {
  fontSize: "0.65rem", opacity: 0.6, marginLeft: 4,
};

export const importStatusBox: CSSProperties = {
  maxWidth: "560px", padding: "1rem 1.25rem", borderRadius: "10px",
  background: "var(--surface)", border: "1px solid var(--border)",
  color: "var(--text-primary)", fontSize: "0.9rem",
  whiteSpace: "pre-wrap", textAlign: "left", lineHeight: "1.5",
};

export const spinningIcon: CSSProperties = { animation: "spin 1s linear infinite" };

// Always-green small row (ytd dividends per-month, ytd slip)
export const ytdPerMonthRow: CSSProperties = {
  fontSize: "0.78rem", color: "var(--success-green)",
};

// ---------------------------------------------------------------------------
// Dynamic helpers — called with runtime values, return CSSProperties
// ---------------------------------------------------------------------------

export function tableHeaderCell(align: "left" | "right", isActive: boolean): CSSProperties {
  return {
    padding: "4px 4px", textAlign: align,
    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: isActive ? 700 : 500,
    fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em",
    whiteSpace: "nowrap", cursor: "pointer", userSelect: "none",
  };
}

export function tableDataRow(isLastRow: boolean): CSSProperties {
  return {
    borderBottom: isLastRow ? undefined : "1px solid var(--border)",
    cursor: "pointer", transition: "background 0.15s",
  };
}

// G/L $ cell — bold + dynamic gain color
export function gainLossCell(gainColor: string): CSSProperties {
  return { padding: "4px 4px", textAlign: "right", color: gainColor, fontWeight: 600 };
}

// TOT% and Ann% cells — dynamic color, no extra weight
export function annualGainCell(color: string): CSSProperties {
  return { padding: "4px 4px", textAlign: "right", color };
}

// Dividends, YTD dividends, slip income cells
export function incomeCell(isPositive: boolean): CSSProperties {
  return {
    padding: "4px 4px", textAlign: "right",
    color: isPositive ? "var(--success-green)" : "var(--text-secondary)",
  };
}

// Realized P&L body cells: 0=muted, pos=teal, neg=blue
export function realizedPnLCell(value: number): CSSProperties {
  return {
    padding: "4px 4px", textAlign: "right", fontWeight: 600,
    color: value === 0 ? "var(--text-secondary)" : value > 0 ? "var(--success-green)" : "var(--primary-blue)",
  };
}

export function ratingCell(ratingColor: string): CSSProperties {
  return { padding: "4px 4px", textAlign: "right", color: ratingColor, fontWeight: 700 };
}

export function absoluteRatingCell(color: string): CSSProperties {
  return { padding: "4px 4px", textAlign: "right", fontWeight: 700, color };
}

// Footer G/L $ and G/L % cells
export function totalGainLossCell(glColor: string): CSSProperties {
  return { padding: "4px 4px", textAlign: "right", fontWeight: 700, color: glColor };
}

// Inner div inside total dividend / slip footer cells
export function totalIncomeDiv(isPositive: boolean): CSSProperties {
  return {
    fontWeight: 700,
    color: isPositive ? "var(--success-green)" : "var(--text-secondary)",
  };
}

// Footer realized P&L cells (same 0/pos/neg logic)
export function totalRealizedCell(value: number): CSSProperties {
  return {
    padding: "4px 4px", textAlign: "right", fontWeight: 700,
    color: value === 0 ? "var(--text-secondary)" : value > 0 ? "var(--success-green)" : "var(--primary-blue)",
  };
}

// Inner div for weighted annual gain in footer
export function totalAnnualGainCell(color: string): CSSProperties {
  return { fontWeight: 700, color };
}

// Inner div for simple avg annual gain row in footer
export function totalSimpleAnnualGainRow(color: string): CSSProperties {
  return { fontSize: "0.78rem", color };
}
