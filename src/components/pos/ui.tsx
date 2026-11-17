import { useEffect, useId, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

export async function act(work: () => Promise<unknown>, success?: string) {
  try {
    const value = await work();
    if (success) toast.success(success);
    return value;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Something went wrong.");
    return null;
  }
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "ghost" | "outline" | "success" }) {
  const look = {
    primary: "bg-gradient-to-r from-primary to-[#4F46E5] text-primary-fg shadow-[0_8px_24px_-10px_rgba(99,102,241,0.75)] hover:brightness-110",
    accent: "bg-accent text-accent-fg shadow-[0_8px_20px_-10px_rgba(34,211,238,0.5)] hover:brightness-110",
    ghost: "bg-transparent text-fg hover:bg-surface-2",
    outline: "border border-border bg-surface/80 text-fg hover:bg-surface-2 hover:border-primary/40",
    success: "bg-success text-success-fg shadow-[0_8px_20px_-10px_rgba(52,211,153,0.45)]",
  }[variant];
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        look,
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const controlClass =
  "min-h-11 w-full rounded-xl border border-border bg-bg/80 px-3 text-fg outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/20";

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop: div, not button — so it never steals keyboard focus from inputs */}
      <div className="absolute inset-0 bg-bg/80" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          "relative z-10 max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-border bg-surface p-5 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.7)] sm:rounded-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl leading-tight tracking-tight">{title}</h2>
          <Button variant="ghost" className="px-3" onClick={onClose} aria-label="Close dialog">
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl tracking-tight text-accent">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </article>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-surface/60 px-4 py-12 text-center">
      <p className="font-display text-2xl tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

const BEERFLOW_GRADIENT = "linear-gradient(90deg, #6366f1, #22d3ee)";

/** BeerFlow's icon: dark rounded square with an indigo-to-cyan "B". */
export function BeerflowIcon({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="#0b0f1a" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="9.25" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" />
      <path
        d="M13 9h9.2c4.4 0 7 2.2 7 5.7 0 2.3-1.2 3.9-3.2 4.7 2.6.7 4.2 2.5 4.2 5.2 0 3.9-3 6.4-7.8 6.4H13zm5.2 8.2h3.4c1.6 0 2.5-.7 2.5-1.9s-.9-1.9-2.5-1.9h-3.4zm0 9.6h4c1.8 0 2.8-.8 2.8-2.1s-1-2.1-2.8-2.1h-4z"
        fill={`url(#${id})`}
        fillRule="evenodd"
      />
    </svg>
  );
}

/** Lowercase "beerflow" wordmark: plain "beer" + gradient "flow". Use tone="light" on white paper. */
export function BeerflowWordmark({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <span className={cn("font-extrabold tracking-tight", className)}>
      <span style={{ color: tone === "dark" ? "#f7f1e6" : "#0b0f1a" }}>beer</span>
      <span style={{ backgroundImage: BEERFLOW_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>flow</span>
    </span>
  );
}

export function BeerflowMark() {
  return (
    <span className="inline-flex items-center gap-3">
      <BeerflowIcon className="size-9 shrink-0" />
      <span className="grid leading-tight">
        <BeerflowWordmark className="text-lg" />
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted">Custom POS &amp; Software</span>
        <span className="text-[0.65rem] text-muted">Powered by BeerFlow Technologies</span>
      </span>
    </span>
  );
}

export function paisaField(paisa: number): string {
  const whole = Math.trunc(Math.abs(paisa) / 100);
  const rem = Math.abs(paisa) % 100;
  const body = rem ? `${whole}.${String(rem).padStart(2, "0")}` : String(whole);
  return paisa < 0 ? `-${body}` : body;
}
