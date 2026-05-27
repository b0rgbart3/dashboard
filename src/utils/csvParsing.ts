import { parse, parseISO, isValid } from "date-fns";

export const parseFlexibleDate = (input: string): Date | null => {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return parseISO(input);
  const formats = [
    "MM/dd/yyyy", "M/d/yyyy", "MM/dd/yy", "M/d/yy",
    "yyyy/MM/dd", "MMM d, yyyy", "MMMM d, yyyy",
    "d MMM yyyy", "d MMMM yyyy",
  ];
  for (const fmt of formats) {
    try {
      const attempt = parse(input, fmt, new Date());
      if (isValid(attempt)) {
        const year = attempt.getFullYear();
        if (year >= 1900 && year <= new Date().getFullYear()) return attempt;
      }
    } catch {
      // continue
    }
  }
  return null;
};

// Full-document CSV parser — handles multi-line quoted fields and escaped double-quotes.
export const parseCSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"'; // escaped quote: "" → "
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch; // newlines inside quotes are part of the field value
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = "";
      } else if (ch === '\r' && next === '\n') {
        row.push(current.trim());
        current = "";
        rows.push(row);
        row = [];
        i++; // consume the paired \n
      } else if (ch === '\n' || ch === '\r') {
        row.push(current.trim());
        current = "";
        rows.push(row);
        row = [];
      } else {
        current += ch;
      }
    }
  }

  // flush last field/row
  row.push(current.trim());
  if (row.some((c) => c !== "")) rows.push(row);

  // drop completely empty rows
  return rows.filter((r) => r.some((c) => c !== ""));
};

export const stripNumeric = (s: string) => s.replace(/[$,()\s]/g, "");
