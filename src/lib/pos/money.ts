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

export function formatPkrPlain(paisa: number): string {
  return formatPkr(paisa).replace("Rs. ", "");
}

export function localDate(isoOrDate: string | Date = new Date()): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inDateRange(iso: string, from: string, to: string): boolean {
  const day = localDate(iso);
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
