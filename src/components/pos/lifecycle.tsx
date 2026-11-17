import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  ImageIcon,
  KeyRound,
  Mail,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Store,
  Trash2,
  UtensilsCrossed,
  WifiOff,
} from "lucide-react";
import { usePos } from "@/lib/pos/store";
import { useLifecycle, writeInstall } from "@/lib/pos/lifecycle";
import { BeerflowIcon, BeerflowWordmark } from "@/components/pos/ui";

const PRODUCT = "BeerFlow POS";
const VERSION = "2.0.0";

function delay(seconds: number): CSSProperties {
  return { "--d": `${seconds}s` } as CSSProperties;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Smoothly counts toward a target so the percentage never jumps. */
function useEased(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setValue((current) => {
        const next = current + (target - current) * 0.14;
        return Math.abs(target - next) < 0.5 ? target : next;
      });
    }, 40);
    return () => clearInterval(id);
  }, [target]);
  return Math.round(value);
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return event;
}

function Stage({ tone, children }: { tone?: "danger"; children: ReactNode }) {
  const sparks = useMemo(
    () => Array.from({ length: 14 }, (_, index) => ({ left: (index * 37 + 8) % 96, d: (index * 0.85) % 6, x: ((index % 5) - 2) * 34 })),
    [],
  );
  return (
    <main className="bf-stage" data-tone={tone}>
      <div className="bf-blob one" />
      <div className="bf-blob two" />
      <div className="bf-grid" />
      {sparks.map((spark, index) => (
        <span key={index} className="bf-spark" style={{ left: `${spark.left}%`, "--d": `${spark.d}s`, "--x": `${spark.x}px` } as CSSProperties} />
      ))}
      {children}
    </main>
  );
}

function Hero({ size = 104, words = true }: { size?: number; words?: boolean }) {
  return (
    <div className="grid justify-items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <span className="bf-logo-ring" />
        <span className="bf-logo-glow absolute inset-0 rounded-[28%]" />
        <BeerflowIcon className="bf-pop relative size-full" />
      </div>
      {words ? (
        <div className="bf-rise text-center" style={delay(0.35)}>
          <BeerflowWordmark className="text-4xl" />
          <p className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-400">Custom POS &amp; Software</p>
        </div>
      ) : null}
    </div>
  );
}

function Frame({
  tone,
  title,
  steps,
  current,
  children,
}: {
  tone?: "danger";
  title: string;
  steps: string[];
  current: number;
  children: ReactNode;
}) {
  return (
    <Stage tone={tone}>
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-6 px-4 py-8 lg:grid-cols-[19rem_1fr] lg:gap-8">
        <aside className="bf-card bf-rise p-6">
          <div className="flex items-center gap-3">
            <BeerflowIcon className="size-11 shrink-0" />
            <div className="leading-tight">
              <BeerflowWordmark className="text-2xl" />
              <p className="text-[0.55rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Custom POS &amp; Software</p>
            </div>
          </div>
          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-sm font-semibold text-white">{PRODUCT}</p>
            <p className="text-xs text-slate-400">{title} · Version {VERSION}</p>
          </div>
          <ol className="mt-6 hidden gap-0 lg:grid">
            {steps.map((label, index) => {
              const done = index < current;
              const active = index === current;
              return (
                <li key={label} className="relative flex items-center gap-3 pb-6 last:pb-0">
                  {index < steps.length - 1 ? (
                    <span className="absolute left-[0.95rem] top-8 h-[calc(100%-1.5rem)] w-px bg-white/10">
                      <span className="block w-full bg-gradient-to-b from-[var(--bf-a)] to-[var(--bf-b)] transition-all duration-700" style={{ height: done ? "100%" : "0%" }} />
                    </span>
                  ) : null}
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all duration-500 ${
                      done ? "bg-gradient-to-br from-[var(--bf-a)] to-[var(--bf-b)] text-white" : active ? "border border-[var(--bf-b)] bg-white/5 text-white bf-logo-glow" : "border border-white/15 text-slate-500"
                    }`}
                  >
                    {done ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span className={`text-sm transition-colors ${active ? "font-semibold text-white" : done ? "text-slate-300" : "text-slate-500"}`}>{label}</span>
                </li>
              );
            })}
          </ol>
          <p className="mt-5 text-xs text-slate-500 lg:hidden">
            Step {Math.min(current + 1, steps.length)} of {steps.length} · {steps[Math.min(current, steps.length - 1)]}
          </p>
        </aside>
        <section className="bf-card min-h-[31rem] p-6 sm:p-10">
          <div key={current} className="bf-slide h-full">
            {children}
          </div>
        </section>
      </div>
      <p className="pb-5 text-center text-xs text-slate-500">Powered by BeerFlow Technologies</p>
    </Stage>
  );
}

function CheckBadge({ danger }: { danger?: boolean }) {
  return (
    <svg viewBox="0 0 80 80" className="size-24" aria-hidden="true">
      <circle className="bf-check-circle" cx="40" cy="40" r="30" fill="none" stroke={danger ? "#fb923c" : "url(#bfg)"} strokeWidth="4" strokeLinecap="round" transform="rotate(-90 40 40)" />
      <path className="bf-check-mark" d="M28 41l8 8 17-18" fill="none" stroke={danger ? "#fb923c" : "#22d3ee"} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="bfg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface Task {
  label: string;
  ms: number;
  icon: typeof Database;
}

function TaskList({ tasks, done, active, failed }: { tasks: Task[]; done: number; active: number; failed?: boolean }) {
  return (
    <ul className="grid gap-2.5">
      {tasks.map((task, index) => {
        const finished = index < done;
        const running = index === active && !finished && !failed;
        const Icon = task.icon;
        return (
          <li
            key={task.label}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-500 ${
              finished ? "border-white/10 bg-white/[0.04] text-slate-200" : running ? "border-[var(--bf-b)]/40 bg-white/[0.07] text-white" : "border-transparent text-slate-500"
            }`}
          >
            <span className="grid size-8 place-items-center rounded-lg bg-white/5">
              <Icon className="size-4" />
            </span>
            <span className="flex-1">{task.label}</span>
            {finished ? <Check className="bf-pop size-4 text-[var(--bf-b)]" /> : running ? <span className="bf-spinner" /> : null}
          </li>
        );
      })}
    </ul>
  );
}

function strength(password: string): number {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

function PasswordField({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className="relative block">
        <input className="bf-input pr-11" type={shown ? "text" : "password"} value={value} autoComplete="new-password" onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:text-white" onClick={() => setShown((current) => !current)} aria-label={shown ? "Hide password" : "Show password"}>
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
      {hint}
    </label>
  );
}

const INSTALL_STEPS = ["Welcome", "Shop setup", "Installing", "Finish"];

const INSTALL_TASKS: Task[] = [
  { label: "Creating the secure local database", ms: 1200, icon: Database },
  { label: "Loading your menu and deals", ms: 1400, icon: UtensilsCrossed },
  { label: "Setting up party khata and ledgers", ms: 1200, icon: BookOpen },
  { label: "Locking your logins with encryption", ms: 1100, icon: KeyRound },
  { label: "Preparing receipts, reports and backup", ms: 1200, icon: ReceiptText },
];

export function InstallScreen() {
  const install = usePos((store) => store.install);
  const boot = usePos((store) => store.boot);
  const setView = useLifecycle((store) => store.setView);
  const promptEvent = useInstallPrompt();
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState("My Restaurant");
  const [ownerUsername, setOwnerUsername] = useState("owner");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [cashierPassword, setCashierPassword] = useState("");
  const [done, setDone] = useState(0);
  const [active, setActive] = useState(0);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);

  const problem = useMemo(() => {
    if (!shopName.trim()) return "Enter the shop name.";
    if (!/^[a-z0-9._-]{3,}$/i.test(ownerUsername.trim())) return "Owner login needs 3 or more letters or numbers, no spaces.";
    if (ownerPassword.length < 6) return "Owner password needs at least 6 characters.";
    if (ownerPassword !== confirm) return "The two owner passwords don't match.";
    if (cashierPassword.length < 4) return "Cashier password needs at least 4 characters.";
    if (cashierPassword === ownerPassword) return "Use a different password for the cashier.";
    return "";
  }, [shopName, ownerUsername, ownerPassword, confirm, cashierPassword]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setFailure("");
    setDone(0);
    setActive(0);
    const work = install({ shopName, ownerUsername, ownerPassword, cashierPassword }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error : new Error("The install could not finish.")),
    );
    void (async () => {
      for (let index = 0; index < INSTALL_TASKS.length; index += 1) {
        if (cancelled) return;
        setActive(index);
        await sleep(INSTALL_TASKS[index].ms);
        if (cancelled) return;
        setDone(index + 1);
      }
      const error = await work;
      if (cancelled) return;
      if (error) {
        setFailure(error.message);
        return;
      }
      writeInstall("wizard");
      await sleep(700);
      if (!cancelled) setStep(3);
    })();
    return () => {
      cancelled = true;
    };
    // The form values are frozen once the install starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, attempt]);

  const target = done >= INSTALL_TASKS.length ? 100 : Math.round(((done + (failure ? 0 : 0.6)) / INSTALL_TASKS.length) * 100);
  const percent = useEased(step === 3 ? 100 : target);
  const strong = strength(ownerPassword);

  return (
    <Frame title="Setup" steps={INSTALL_STEPS} current={step}>
      {step === 0 ? (
        <div className="grid h-full content-center gap-7">
          <Hero />
          <div className="bf-rise text-center" style={delay(0.55)}>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">Welcome to {PRODUCT}</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">This quick setup prepares your till on this computer. It takes about a minute, and everything stays private on this device.</p>
          </div>
          <div className="bf-rise mx-auto grid w-full max-w-xl gap-3 sm:grid-cols-3" style={delay(0.75)}>
            {[
              { icon: WifiOff, text: "Works fully offline" },
              { icon: BookOpen, text: "Party khata & ledgers" },
              { icon: ShieldCheck, text: "Encrypted logins" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-slate-300">
                <item.icon className="size-4 shrink-0 text-[var(--bf-b)]" />
                {item.text}
              </div>
            ))}
          </div>
          <div className="bf-rise flex justify-center" style={delay(0.95)}>
            <button type="button" className="bf-btn px-8" onClick={() => setStep(1)}>
              Install <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) setStep(2);
          }}
        >
          <div>
            <h2 className="text-2xl font-bold text-white">Set up your shop</h2>
            <p className="mt-1 text-sm text-slate-400">These are the first logins for your till. You can change them later in Settings.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="text-slate-300">Shop name</span>
              <span className="relative block">
                <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input className="bf-input pl-10" value={shopName} onChange={(event) => setShopName(event.target.value)} />
              </span>
            </label>
            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="text-slate-300">Owner login name</span>
              <input className="bf-input" autoComplete="username" value={ownerUsername} onChange={(event) => setOwnerUsername(event.target.value)} />
            </label>
            <PasswordField
              label="Owner password"
              value={ownerPassword}
              onChange={setOwnerPassword}
              hint={
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((bar) => (
                    <span key={bar} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${ownerPassword && bar < Math.max(strong, 1) ? ["bg-red-400", "bg-amber-400", "bg-lime-400", "bg-emerald-400"][Math.max(strong, 1) - 1] : "bg-white/10"}`} />
                  ))}
                </span>
              }
            />
            <PasswordField label="Confirm owner password" value={confirm} onChange={setConfirm} />
            <div className="sm:col-span-2">
              <PasswordField label="Cashier password (for the counter)" value={cashierPassword} onChange={setCashierPassword} />
            </div>
          </div>
          <p className={`min-h-5 text-sm ${problem && (ownerPassword || confirm || cashierPassword) ? "text-amber-300" : "text-transparent"}`}>{problem || "Looks good."}</p>
          <div className="flex items-center justify-between">
            <button type="button" className="bf-btn-ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="size-4" /> Back
            </button>
            <button type="submit" className="bf-btn px-7" disabled={Boolean(problem)}>
              Install now <ArrowRight className="size-4" />
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Installing {PRODUCT}</h2>
            <p className="mt-1 text-sm text-slate-400">Please keep this window open. Nothing leaves this computer.</p>
          </div>
          <div>
            <div className="mb-2 flex items-end justify-between">
              <span className="text-sm text-slate-400">{failure ? "Stopped" : percent >= 100 ? "Complete" : "Working…"}</span>
              <span className="bf-gradient-text text-3xl font-bold tabular-nums">{percent}%</span>
            </div>
            <div className="bf-progress">
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
          <TaskList tasks={INSTALL_TASKS} done={done} active={active} failed={Boolean(failure)} />
          {failure ? (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-semibold">The install could not finish.</p>
              <p className="mt-1">{failure}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="bf-btn-ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" /> Back
                </button>
                <button type="button" className="bf-btn" onClick={() => setAttempt((current) => current + 1)}>
                  Try again
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid h-full content-center justify-items-center gap-6 text-center">
          <CheckBadge />
          <div className="bf-rise" style={delay(0.9)}>
            <h2 className="text-3xl font-bold text-white">You're all set</h2>
            <p className="mx-auto mt-2 max-w-md text-slate-400">{PRODUCT} is installed and ready for {shopName.trim() || "your shop"}.</p>
          </div>
          <dl className="bf-rise grid w-full max-w-md gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm" style={delay(1.05)}>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Owner login</dt>
              <dd className="font-semibold text-white">{ownerUsername.trim()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Cashier login</dt>
              <dd className="font-semibold text-white">cashier</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Data is stored</dt>
              <dd className="flex items-center gap-1.5 font-semibold text-white">
                <HardDrive className="size-4" /> On this computer only
              </dd>
            </div>
          </dl>
          <p className="bf-rise max-w-md text-xs text-slate-500" style={delay(1.15)}>
            Tip: open Settings and download a backup every week. Your data lives in this browser, so a backup is your safety net.
          </p>
          <div className="bf-rise flex flex-wrap justify-center gap-3" style={delay(1.25)}>
            {promptEvent ? (
              <button type="button" className="bf-btn-ghost" onClick={() => void promptEvent.prompt()}>
                <Download className="size-4" /> Add to desktop
              </button>
            ) : null}
            <button
              type="button"
              className="bf-btn px-8"
              onClick={() => {
                void boot();
                setView("app");
              }}
            >
              Launch {PRODUCT} <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

const WILL_REMOVE = [
  { icon: ReceiptText, text: "All sales, bills and receipts" },
  { icon: BookOpen, text: "Party khata, ledgers and customers" },
  { icon: Database, text: "Stock, recipes and expenses" },
  { icon: ImageIcon, text: "Menu, deals and uploaded pictures" },
  { icon: KeyRound, text: "Owner and cashier logins" },
  { icon: HardDrive, text: "Cached app files on this device" },
];

const UNINSTALL_STEPS = ["Review", "Confirm", "Removing", "Done"];

const UNINSTALL_TASKS: Task[] = [
  { label: "Signing out of the till", ms: 900, icon: KeyRound },
  { label: "Erasing sales, bills and ledgers", ms: 1300, icon: BookOpen },
  { label: "Removing stock, menu and pictures", ms: 1200, icon: ImageIcon },
  { label: "Clearing cached app files", ms: 1100, icon: HardDrive },
  { label: "Finishing up", ms: 800, icon: Trash2 },
];

export function UninstallFlow() {
  const backup = usePos((store) => store.backup);
  const uninstall = usePos((store) => store.uninstall);
  const setView = useLifecycle((store) => store.setView);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [skip, setSkip] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(0);
  const [active, setActive] = useState(0);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);

  const ready = (saved || skip) && typed.trim() === "UNINSTALL";

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    setFailure("");
    setDone(0);
    setActive(0);
    const work = uninstall().then(
      () => null,
      (error: unknown) => (error instanceof Error ? error : new Error("The uninstall could not finish.")),
    );
    void (async () => {
      for (let index = 0; index < UNINSTALL_TASKS.length; index += 1) {
        if (cancelled) return;
        setActive(index);
        await sleep(UNINSTALL_TASKS[index].ms);
        if (cancelled) return;
        setDone(index + 1);
      }
      const error = await work;
      if (cancelled) return;
      if (error) {
        setFailure(error.message);
        return;
      }
      await sleep(600);
      if (!cancelled) setView("uninstalled");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, attempt]);

  const target = done >= UNINSTALL_TASKS.length ? 100 : Math.round(((done + (failure ? 0 : 0.6)) / UNINSTALL_TASKS.length) * 100);
  const percent = useEased(target);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#070a14]">
      <Stage tone="danger">
        <div className="mx-auto grid min-h-screen max-w-3xl items-center px-4 py-8">
          <section className="bf-card p-6 sm:p-10">
            <div key={step} className="bf-slide grid gap-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <BeerflowIcon className="size-10" />
                  <div className="leading-tight">
                    <BeerflowWordmark className="text-xl" />
                    <p className="text-xs text-slate-400">Uninstall {PRODUCT}</p>
                  </div>
                </div>
                <ol className="flex items-center gap-1.5" aria-label="Progress">
                  {UNINSTALL_STEPS.slice(0, 3).map((label, index) => (
                    <li key={label} title={label} className={`h-1.5 w-8 rounded-full transition-colors duration-500 ${index <= step ? "bg-gradient-to-r from-[var(--bf-a)] to-[var(--bf-b)]" : "bg-white/10"}`} />
                  ))}
                </ol>
              </div>

              {step === 0 ? (
                <>
                  <div className="flex items-start gap-4">
                    <span className="bf-pop grid size-12 shrink-0 place-items-center rounded-2xl bg-orange-500/15 text-orange-300">
                      <AlertTriangle className="size-6" />
                    </span>
                    <div>
                      <h1 className="text-2xl font-bold text-white sm:text-3xl">Uninstall {PRODUCT}?</h1>
                      <p className="mt-1 text-sm text-slate-400">This removes the till and everything inside it from this computer. It cannot be undone.</p>
                    </div>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {WILL_REMOVE.map((item, index) => (
                      <li key={item.text} className="bf-rise flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-slate-200" style={delay(0.1 + index * 0.08)}>
                        <item.icon className="size-4 shrink-0 text-orange-300" />
                        {item.text}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button type="button" className="bf-btn-ghost" onClick={() => setView("app")}>
                      <ArrowLeft className="size-4" /> Keep using the till
                    </button>
                    <button type="button" className="bf-btn px-7" onClick={() => setStep(1)}>
                      Continue <ArrowRight className="size-4" />
                    </button>
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Save a backup first</h2>
                    <p className="mt-1 text-sm text-slate-400">A backup file keeps your sales, ledgers and menu. You can restore it after installing again.</p>
                  </div>
                  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors ${saved ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.04]"}`}>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={`grid size-10 place-items-center rounded-xl ${saved ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-slate-300"}`}>{saved ? <Check className="bf-pop size-5" /> : <Download className="size-5" />}</span>
                      <span className="text-slate-200">{saved ? "Backup downloaded" : "No backup saved yet"}</span>
                    </div>
                    <button
                      type="button"
                      className="bf-btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        setNote("");
                        backup().then(
                          () => setSaved(true),
                          (error: unknown) => setNote(error instanceof Error ? error.message : "The backup could not be saved."),
                        ).finally(() => setBusy(false));
                      }}
                    >
                      {busy ? <span className="bf-spinner" /> : <Download className="size-4" />} {saved ? "Download again" : "Download backup"}
                    </button>
                  </div>
                  {note ? <p className="text-sm text-amber-300">{note}</p> : null}
                  {!saved ? (
                    <label className="flex items-start gap-3 text-sm text-slate-300">
                      <input type="checkbox" className="mt-1 size-4 accent-orange-500" checked={skip} onChange={(event) => setSkip(event.target.checked)} />
                      <span>I understand everything will be lost for good because I am not saving a backup.</span>
                    </label>
                  ) : null}
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-slate-300">
                      Type <b className="text-white">UNINSTALL</b> to confirm
                    </span>
                    <input className="bf-input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" className="bf-btn-ghost" onClick={() => setStep(0)}>
                      <ArrowLeft className="size-4" /> Back
                    </button>
                    <button type="button" className="bf-btn px-7" disabled={!ready} onClick={() => setStep(2)}>
                      <Trash2 className="size-4" /> Uninstall now
                    </button>
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Uninstalling {PRODUCT}</h2>
                    <p className="mt-1 text-sm text-slate-400">Please keep this window open until it finishes.</p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-end justify-between">
                      <span className="text-sm text-slate-400">{failure ? "Stopped" : percent >= 100 ? "Complete" : "Removing…"}</span>
                      <span className="bf-gradient-text text-3xl font-bold tabular-nums">{percent}%</span>
                    </div>
                    <div className="bf-progress">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  <TaskList tasks={UNINSTALL_TASKS} done={done} active={active} failed={Boolean(failure)} />
                  {failure ? (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                      <p className="font-semibold">The uninstall could not finish.</p>
                      <p className="mt-1">{failure}</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" className="bf-btn-ghost" onClick={() => setView("app")}>
                          Back to the till
                        </button>
                        <button type="button" className="bf-btn" onClick={() => setAttempt((current) => current + 1)}>
                          Try again
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      </Stage>
    </div>
  );
}

export function UninstalledScreen() {
  const setView = useLifecycle((store) => store.setView);
  return (
    <Stage>
      <div className="mx-auto grid min-h-screen max-w-2xl content-center justify-items-center gap-8 px-5 py-10 text-center">
        <div className="bf-fade-away">
          <Hero size={96} />
        </div>
        <div className="bf-rise" style={delay(0.8)}>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{PRODUCT} has been uninstalled</h1>
          <p className="mx-auto mt-3 max-w-md text-slate-400">Your data and cached files were removed from this device. Thank you for choosing software by BeerFlow Technologies.</p>
        </div>
        <ul className="bf-rise grid gap-2 text-sm text-slate-300" style={delay(1)}>
          {["Sales, ledgers and stock erased", "Pictures and settings erased", "App cache cleared"].map((line) => (
            <li key={line} className="flex items-center justify-center gap-2">
              <Check className="size-4 text-[var(--bf-b)]" /> {line}
            </li>
          ))}
        </ul>
        <div className="bf-rise flex flex-wrap justify-center gap-3" style={delay(1.2)}>
          <button type="button" className="bf-btn px-8" onClick={() => setView("install")}>
            Install again <ArrowRight className="size-4" />
          </button>
        </div>
        <div className="bf-rise grid gap-1.5 text-xs text-slate-500" style={delay(1.4)}>
          <p>Tell us how we can improve</p>
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" /> beerflowtechnologies@gmail.com
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-3.5" /> WhatsApp +92 322 2301920
            </span>
          </p>
          <p className="mt-2">Powered by BeerFlow Technologies</p>
        </div>
      </div>
    </Stage>
  );
}
