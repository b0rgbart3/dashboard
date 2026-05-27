import React from "react";
import { SlidersHorizontal } from "lucide-react";
import type { FilterValue } from "../types";

interface FilterBarProps {
  filterStatus: "all" | "active" | "inactive";
  onStatusChange: (v: "all" | "active" | "inactive") => void;
  filterValue: FilterValue;
  onValueChange: (v: FilterValue) => void;
  filterDividends: "all" | "yes" | "no";
  onDividendsChange: (v: "all" | "yes" | "no") => void;
  filteredCount: number;
  totalCount: number;
  summariesLoaded?: boolean;
}

const VALUE_OPTIONS: { value: FilterValue; label: string; divider?: boolean }[] = [
  { value: "all",     label: "All" },
  { value: "exact0",  label: "$0" },
  { value: "lt100",   label: "< $100" },
  { value: "lt1000",  label: "< $1,000" },
  { value: "lt5000",  label: "< $5,000" },
  { value: "lt10000", label: "< $10,000" },
  { value: "gt500",   label: "> $500", divider: true },
  { value: "gt1000",  label: "> $1,000" },
  { value: "gt5000",  label: "> $5,000" },
  { value: "gt10000", label: "> $10,000" },
];

const FilterBar = ({
  filterStatus,
  onStatusChange,
  filterValue,
  onValueChange,
  filterDividends,
  onDividendsChange,
  filteredCount,
  totalCount,
  summariesLoaded = true,
}: FilterBarProps) => {
  const isFiltered =
    filterStatus !== "all" || filterValue !== "all" || filterDividends !== "all";

  return (
    <div
      className="glass-card"
      style={{ padding: "10px 16px", marginBottom: "8px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <SlidersHorizontal
            size={14}
            style={{ color: "var(--text-secondary)", flexShrink: 0 }}
          />
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            Status:
          </span>
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              style={{
                padding: "3px 10px",
                fontSize: "12px",
                borderRadius: "6px",
                border: "1px solid",
                cursor: "pointer",
                borderColor:
                  filterStatus === s
                    ? "var(--primary-purple)"
                    : "var(--card-border)",
                background:
                  filterStatus === s ? "rgba(123,63,228,0.2)" : "transparent",
                color:
                  filterStatus === s
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {s === "active" ? "Active" : s === "inactive" ? "Inactive" : "All"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            Value:
          </span>
          <select
            value={filterValue}
            onChange={(e) => onValueChange(e.target.value as FilterValue)}
            style={{
              fontSize: "12px",
              color:
                filterValue !== "all"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              background: "var(--card-bg)",
              border: `1px solid ${filterValue !== "all" ? "var(--primary-purple)" : "var(--card-border)"}`,
              borderRadius: "6px",
              padding: "3px 22px 3px 8px",
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 6px center",
            }}
          >
            {VALUE_OPTIONS.map(({ value, label, divider }) => (
              <React.Fragment key={value}>
                {divider && <option disabled>──────────</option>}
                <option value={value}>{label}</option>
              </React.Fragment>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            Dividends:
          </span>
          {(["all", "yes", "no"] as const).map((d) => (
            <button
              key={d}
              onClick={() => onDividendsChange(d)}
              style={{
                padding: "3px 10px",
                fontSize: "12px",
                borderRadius: "6px",
                border: "1px solid",
                cursor: "pointer",
                borderColor:
                  filterDividends === d
                    ? "var(--primary-blue)"
                    : "var(--card-border)",
                background:
                  filterDividends === d
                    ? "rgba(0,123,255,0.15)"
                    : "transparent",
                color:
                  filterDividends === d
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                transition: "all 0.15s",
              }}
            >
              {d === "yes" ? "With" : d === "no" ? "Without" : "All"}
            </button>
          ))}
        </div>

        <div
          style={{
            marginLeft: "auto",
            fontSize: "12px",
            color:
              summariesLoaded && isFiltered
                ? "var(--warning-orange)"
                : "var(--text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          Showing {filteredCount} / {totalCount} stocks
        </div>
      </div>
    </div>
  );
};

export default FilterBar;
