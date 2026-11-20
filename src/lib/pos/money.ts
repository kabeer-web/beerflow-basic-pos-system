/** Pakistani rupees are stored as integer paisa (Rs 1 = 100 paisa). */

const MAX_PAISA = 1_000_000_000; // Rs 10,000,000

export function rupeesToPaisa(input: string): number | null {
  const trimmed = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const paisa = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paisa) || paisa > MAX_PAISA) return null;
  return paisa;
}

export function assertPaisa(value: number, label: string): string | null {
  if (!Number.isInteger(value)) return `${label} must be a whole-paisa amount.`;
  if (value < 0) return `${label} can't be negative.`;
  if (value > MAX_PAISA) return `${label} is too large.`;
  return null;
}

function groupRupees(rupees: number): string {
  const digits = String(rupees);
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, digits.length - 3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** Rs. 1,200 or Rs. 1,200.50 — always from integer paisa. */
export function formatPkr(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(paisa));
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = groupRupees(rupees);
  if (rem === 0) return `${sign}Rs. ${body}`;
  return `${sign}Rs. ${body}.${String(rem).padStart(2, "0")}`;
}

/**
 * Per-unit cost for display (e.g. cost of 1 g). Unit costs can be fractional paisa
 * (4.5 paisa/g), which formatPkr() would truncate. Under Rs 1 per unit we show paisa
 * with up to 2 decimals; otherwise rupees rounded to the nearest paisa.
 */
export function formatUnitCost(paisa: number): string {
  if (!Number.isFinite(paisa) || paisa <= 0) return "Rs. 0";
  if (paisa < 100) {
    const text = (Math.round(paisa * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
    return `${text} paisa`;
  }
  return formatPkr(Math.round(paisa));
}

export function formatPkrPlain(paisa: number): string {
  return formatPkr(paisa).replace("Rs. ", "");
}

/**
 * Business timezone and day boundary (Asia/Karachi).
 * Business day starts at 05:00 Asia/Karachi and ends at 04:59:59 the next calendar day.
 * Orders placed between midnight and 04:59:59 belong to the previous business day.
 */
export const BUSINESS_TZ = "Asia/Karachi";
export const BUSINESS_DAY_START_HOUR = 5;

/** Calendar date (YYYY-MM-DD) in the given timezone — no business-day shift. */
export function calendarDateInTz(isoOrDate: string | Date = new Date(), timeZone = BUSINESS_TZ): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return "1970-01-01";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Business date (YYYY-MM-DD) for the restaurant.
 * Uses Asia/Karachi. If local time is before 05:00, returns the previous calendar day.
 * This is the single source of truth for dashboard, reports, day-close, and daily figures.
 */
export function businessDate(isoOrDate: string | Date = new Date()): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return "1970-01-01";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  let year = Number(get("year"));
  let month = Number(get("month"));
  let day = Number(get("day"));
  const hour = Number(get("hour")); // 0–23 in Asia/Karachi

  if (hour < BUSINESS_DAY_START_HOUR) {
    // Still the previous business day — step back one calendar day in that timezone.
    const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0);
    const prev = new Date(noonUtc - 24 * 60 * 60 * 1000);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * @deprecated Prefer businessDate(). Kept as an alias so existing call sites
 * automatically respect the 5 AM Asia/Karachi business-day boundary.
 */
export function localDate(isoOrDate: string | Date = new Date()): string {
  return businessDate(isoOrDate);
}

export function inDateRange(iso: string, from: string, to: string): boolean {
  const day = businessDate(iso);
  return day >= from && day <= to;
}

export function formatWhen(iso: string, format: "dmy" | "mdy" = "dmy"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const datePart = format === "mdy" ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
  return `${datePart} · ${time}`;
}

export function formatDay(isoDate: string, format: "dmy" | "mdy" = "dmy"): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const monthName = date.toLocaleString("en-GB", { month: "short" });
  return format === "mdy" ? `${monthName} ${day}, ${year}` : `${day} ${monthName} ${year}`;
}

export function uid(): string {
  return crypto.randomUUID();
}

export function parseQty(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;
  const value = Math.round(Number(trimmed) * 1000) / 1000;
  if (!(value > 0)) return null;
  return value;
}

export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function dateAtNoon(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
