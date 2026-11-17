import { useEffect, useState } from "react";
import {
  BookOpen,
  Boxes,
  ChartColumn,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { formatPkr, localDate } from "@/lib/pos/money";
import { summarize } from "@/lib/pos/logic";
import { STARTER_LOGINS } from "@/lib/pos/seed";
import { useLifecycle } from "@/lib/pos/lifecycle";
import { usePos } from "@/lib/pos/store";
import type { Order } from "@/lib/pos/types";
import { BeerflowIcon, BeerflowMark, BeerflowWordmark, Button, controlClass } from "@/components/pos/ui";
import { PosScreen } from "@/components/pos/pos";
import { DashboardScreen, OrdersScreen } from "@/components/pos/desk";
import { MenuScreen } from "@/components/pos/menu";
import { CustomersScreen, ExpensesScreen, InventoryScreen, PartiesScreen, ReportsScreen, SettingsScreen } from "@/components/pos/books";
import { ReceiptView } from "@/components/pos/receipt";
import { InstallScreen, UninstallFlow, UninstalledScreen } from "@/components/pos/lifecycle";

export type Page = "dashboard" | "pos" | "orders" | "menu" | "inventory" | "parties" | "customers" | "expenses" | "reports" | "settings";

const NAV: { group: string; owner?: boolean; items: { id: Page; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { group: "Sell", items: [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "pos", label: "New order", icon: ShoppingCart },
    { id: "orders", label: "Orders", icon: ReceiptText },
  ]},
  { group: "Catalog", owner: true, items: [
    { id: "menu", label: "Menu & deals", icon: UtensilsCrossed },
    { id: "inventory", label: "Inventory", icon: Boxes },
  ]},
  { group: "Books", items: [
    { id: "parties", label: "Parties & ledger", icon: BookOpen },
    { id: "customers", label: "Customers", icon: Users },
    { id: "expenses", label: "Expenses", icon: Wallet },
    { id: "reports", label: "Reports", icon: ChartColumn },
  ]},
  { group: "System", owner: true, items: [{ id: "settings", label: "Settings", icon: Settings }] },
];

export function PosApp() {
  const pos = usePos();
  const boot = usePos((store) => store.boot);
  const view = useLifecycle((store) => store.view);
  const detect = useLifecycle((store) => store.detect);
  useEffect(() => {
    void detect();
  }, [detect]);
  useEffect(() => {
    if (view === "app") void boot();
  }, [view, boot]);
  if (view === "install") return <InstallScreen />;
  if (view === "uninstalling") return <UninstallFlow />;
  if (view === "uninstalled") return <UninstalledScreen />;
  if (view === "checking" || !pos.ready || !pos.state) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg px-6 text-center text-fg">
        <div>
          <BeerflowIcon className="mx-auto size-14" />
          <p className="mt-4 font-display text-3xl tracking-tight">BeerFlow POS</p>
          <p className="mt-2 text-muted">{pos.error || "Opening the till…"}</p>
        </div>
      </main>
    );
  }
  if (!pos.session) return <LoginScreen />;
  return <Shell />;
}

function LoginScreen() {
  const login = usePos((store) => store.login);
  const [role, setRole] = useState<"owner" | "cashier">("owner");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-shell text-fg">
      <div className="tablecloth" />
      <div className="mx-auto grid min-h-[calc(100vh-3px)] max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-border/70 bg-surface/50 px-4 py-3 backdrop-blur">
            <BeerflowIcon className="size-11" />
            <div>
              <BeerflowWordmark className="text-2xl" />
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted">Restaurant &amp; Cafe POS</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-lg font-display text-5xl leading-[1.05] tracking-tight">
            Sell faster.
            <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Stay offline.</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-muted">
            Orders, stock, credit parties and day close — all on this till. Built for Pakistani restaurants and cafes by BeerFlow Technologies.
          </p>
          <ul className="mt-8 grid max-w-md gap-3 text-sm text-muted">
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" /> No internet required after install</li>
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" /> Your logo only on the customer bill</li>
            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" /> Stock, recipes, khata and reports</li>
          </ul>
        </div>
        <form
          className="card mx-auto w-full max-w-md p-6 sm:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            void login(role, password, role).catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : "Could not sign in.");
            }).finally(() => setBusy(false));
          }}
        >
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <BeerflowIcon className="size-10" />
            <BeerflowWordmark className="text-xl" />
          </div>
          <h2 className="font-display text-3xl tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Open the till with your owner or cashier password.</p>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-muted">Account</span>
              <select
                className={controlClass}
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as "owner" | "cashier");
                  setPassword("");
                }}
              >
                <option value="owner">Owner</option>
                <option value="cashier">Cashier</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-muted">Password</span>
              <input
                className={controlClass}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
              />
            </label>
            <Button type="submit" disabled={busy} className="mt-1 w-full">
              {busy ? "Opening…" : "Open the till"}
            </Button>
          </div>
          <div className="mt-5 rounded-xl border border-border/70 bg-surface-2/60 p-3 text-sm">
            <p className="font-semibold">Starter passwords</p>
            <p className="mt-1 text-xs text-muted">Only if you did not change them in the wizard.</p>
            <div className="mt-2 grid gap-2">
              {STARTER_LOGINS.map((item) => (
                <button
                  key={item.username}
                  type="button"
                  className="flex min-h-10 items-center justify-between rounded-lg bg-bg/80 px-3 text-left hover:bg-bg"
                  onClick={() => {
                    setRole(item.role);
                    setPassword(item.password);
                  }}
                >
                  <span>{item.role === "owner" ? "Owner" : "Cashier"}</span>
                  <span className="font-mono text-accent">{item.password}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="mt-4 text-left text-xs text-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => {
              if (!window.confirm("This clears all till data on this device and opens the setup wizard again. Continue?")) return;
              void (async () => {
                try {
                  const { wipeDatabase } = await import("@/lib/pos/db");
                  await wipeDatabase();
                  try {
                    localStorage.removeItem("beerflow-pos-install");
                    sessionStorage.clear();
                  } catch {
                    /* ignore */
                  }
                  window.location.reload();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not reset.");
                }
              })();
            }}
          >
            Forgot password? Reset this till…
          </button>
          <div className="mt-6 border-t border-border/60 pt-4">
            <BeerflowMark />
          </div>
        </form>
      </div>
      <Toaster theme="dark" />
    </main>
  );
}

function Shell() {
  const pos = usePos();
  const state = pos.state!;
  const session = pos.session!;
  const [page, setPage] = useState<Page>("pos");
  const [navOpen, setNavOpen] = useState(false);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [layout, setLayout] = useState<"58" | "80" | "a4">(state.settings.receiptWidth);
  const [done, setDone] = useState<{ order: Order; change: number } | null>(null);
  const owner = session.role === "owner";
  const today = summarize(state, { from: localDate(), to: localDate() });
  function go(next: Page) {
    const ownerOnly: Page[] = ["menu", "inventory", "parties", "expenses", "reports", "settings"];
    if (!owner && ownerOnly.includes(next)) {
      toast.error("Only the owner can open that.");
      return;
    }
    setPage(next);
    setNavOpen(false);
  }
  const title = NAV.flatMap((group) => group.items).find((item) => item.id === page)?.label ?? "Till";
  return (
    <div className="min-h-screen bg-bg text-fg md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className={`${navOpen ? "fixed inset-0 z-30 flex" : "hidden"} flex-col bg-surface md:static md:flex`}>
        <div className="flex items-center gap-3 border-b border-border/80 p-4">
          <BeerflowIcon className="size-11 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-none tracking-tight">{state.settings.shopName || "BeerFlow POS"}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{state.settings.branch || "BeerFlow Technologies"}</p>
          </div>
          <button className="ml-auto grid size-10 place-items-center rounded-xl hover:bg-surface-2 md:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}><X className="size-5" /></button>
        </div>
        <nav className="flex-1 overflow-auto p-3">
          {NAV.filter((group) => owner || !group.owner).map((group) => (
            <div key={group.group} className="mb-5">
              <p className="px-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{group.group}</p>
              <div className="mt-1.5 grid gap-1">
              {group.items.filter((item) => owner || !["parties", "expenses", "reports"].includes(item.id)).map((item) => {
                const Icon = item.icon;
                const active = page === item.id;
                return (
                  <button key={item.id} className={`nav-item ${active ? "is-active" : ""}`} onClick={() => go(item.id)}>
                    <Icon className="size-4 shrink-0 opacity-90" /> {item.label}
                  </button>
                );
              })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-border/80 p-4">
          <p className="text-sm font-semibold">Today {formatPkr(today.salesPaisa)}</p>
          <p className="text-xs text-muted">{session.displayName} · {session.role}</p>
          <button className="nav-item mt-2" onClick={() => pos.logout()}><LogOut className="size-4" /> Sign out</button>
          <div className="mt-4 opacity-90"><BeerflowMark /></div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/80 bg-bg/90 px-4 py-3 backdrop-blur-md">
          <button className="grid size-11 place-items-center rounded-xl border border-border/60 bg-surface md:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}><Menu className="size-5" /></button>
          <h1 className="font-display text-2xl tracking-tight">{title}</h1>
        </header>
        <div className="px-4 py-4 pb-24 md:pb-6">
          {page === "dashboard" ? <DashboardScreen onOpen={go} /> : null}
          {page === "pos" ? <PosScreen onDone={(orderId, change) => {
            const order = usePos.getState().state?.orders.find((item) => item.id === orderId);
            if (order) setDone({ order, change });
          }} /> : null}
          {page === "orders" ? <OrdersScreen onPrint={setPrintOrder} /> : null}
          {page === "menu" && owner ? <MenuScreen /> : null}
          {page === "inventory" && owner ? <InventoryScreen /> : null}
          {page === "parties" && owner ? <PartiesScreen /> : null}
          {page === "customers" ? <CustomersScreen /> : null}
          {page === "expenses" && owner ? <ExpensesScreen /> : null}
          {page === "reports" && owner ? <ReportsScreen /> : null}
          {page === "settings" && owner ? <SettingsScreen /> : null}
        </div>
      </div>
      {done ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-bg/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-display text-3xl">Sale saved</h2>
            <p className="mt-2">{done.order.number} · {formatPkr(done.order.totalPaisa)}</p>
            {done.change > 0 ? <p className="text-accent">Change {formatPkr(done.change)}</p> : null}
            <div className="mt-4 flex gap-2">
              <Button onClick={() => { setPrintOrder(done.order); setDone(null); }}>Print bill</Button>
              <Button variant="outline" onClick={() => setDone(null)}>New sale</Button>
            </div>
          </div>
        </div>
      ) : null}
      {printOrder ? (
        <div className="fixed inset-0 z-40 overflow-auto bg-bg/80 p-4">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {(["58", "80", "a4"] as const).map((item) => (
                <button key={item} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${layout === item ? "bg-accent text-accent-fg" : "bg-surface-2"}`} onClick={() => setLayout(item)}>{item === "a4" ? "A4" : `${item} mm`}</button>
              ))}
              <Button onClick={() => {
                try { window.print(); toast.message("Print dialog opened. The till cannot confirm the printer took the page."); }
                catch { toast.error("The print dialog could not open."); }
              }}>Print</Button>
              <Button variant="ghost" onClick={() => setPrintOrder(null)}>Close</Button>
            </div>
            <div className="print-area overflow-auto rounded-xl">
              <ReceiptView order={printOrder} settings={state.settings} logoUrl={state.settings.logoImageId ? pos.imageUrls[state.settings.logoImageId] : null} layout={layout} />
            </div>
          </div>
        </div>
      ) : null}
      <Toaster theme="dark" />
    </div>
  );
}
