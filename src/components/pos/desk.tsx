import { useState } from "react";
import { formatDay, formatPkr, formatWhen, localDate, rupeesToPaisa } from "@/lib/pos/money";
import { orderDue, orderPaid, summarize } from "@/lib/pos/logic";
import { usePos } from "@/lib/pos/store";
import type { Order, PayMethod } from "@/lib/pos/types";
import { act, Button, controlClass, Empty, Field, Stat } from "@/components/pos/ui";

export function DashboardScreen({ onOpen }: { onOpen: (page: "orders" | "inventory" | "pos") => void }) {
  const state = usePos((store) => store.state)!;
  const owner = usePos((store) => store.session)?.role === "owner";
  const today = localDate();
  const summary = summarize(state, { from: today, to: today });
  const closed = (state.closedDays ?? []).some((d) => d.date === today && !d.reopened);
  const cashIn = summary.byMethod.cash;
  const otherPay = summary.byMethod.card + summary.byMethod.wallet;

  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-muted">Today · {formatDay(today, state.settings.dateFormat)}</p>
          <p className="font-display text-2xl tracking-tight">{state.settings.shopName || "BeerFlow POS"}</p>
          {closed ? (
            <p className="mt-1 text-sm font-semibold text-accent">Day is closed. Open day from Reports to take new bills.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Day is open</p>
          )}
        </div>
        <Button onClick={() => onOpen("pos")} className="min-h-12 px-6 text-base">New order</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today's sales" value={formatPkr(summary.salesPaisa)} note={`${summary.orderCount} bill${summary.orderCount === 1 ? "" : "s"}`} />
        <Stat label="Cash collected" value={formatPkr(cashIn)} note={otherPay > 0 ? `Card/wallet ${formatPkr(otherPay)}` : "Cash only so far"} />
        <Stat label="Credit still due" value={formatPkr(summary.receivablesPaisa)} note="Customers who owe you" />
        {owner ? (
          <Stat label="Expenses today" value={formatPkr(summary.expensesPaisa)} note="Shop costs" />
        ) : (
          <Stat label="Cancelled bills" value={String(summary.cancelledCount)} note="Today" />
        )}
      </div>

      {owner && summary.lowStock.length > 0 ? (
        <button
          type="button"
          className="card flex w-full items-center justify-between gap-3 border-primary/40 bg-primary/10 p-4 text-left"
          onClick={() => onOpen("inventory")}
        >
          <div>
            <p className="font-semibold">Low stock</p>
            <p className="text-sm text-muted">{summary.lowStock.length} item{summary.lowStock.length === 1 ? "" : "s"} need attention</p>
          </div>
          <span className="text-sm font-semibold text-primary">Open inventory →</span>
        </button>
      ) : null}

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl tracking-tight">Recent bills</h2>
          <Button variant="ghost" onClick={() => onOpen("orders")}>See all</Button>
        </div>
        {summary.recent.length === 0 ? (
          <Empty title="No bills yet today" body="Tap New order to start selling." action={<Button onClick={() => onOpen("pos")}>New order</Button>} />
        ) : (
          <ul className="grid gap-2">
            {summary.recent.slice(0, 8).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <span>
                  <span className="block font-semibold">{order.number}</span>
                  <span className="text-xs text-muted">
                    {order.status === "cancelled" ? "Cancelled" : order.channel}
                    {order.customerName ? ` · ${order.customerName}` : ""}
                  </span>
                </span>
                <span className="font-semibold">{formatPkr(order.totalPaisa)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {owner && summary.best.length > 0 ? (
        <section className="card p-4">
          <h2 className="font-display text-xl tracking-tight">Top items today</h2>
          <ul className="mt-3 grid gap-2">
            {summary.best.slice(0, 5).map((item) => (
              <li key={item.name} className="flex justify-between gap-3 text-sm">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-muted">{item.qty} sold · {formatPkr(item.revenuePaisa)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function OrdersScreen({ onPrint }: { onPrint: (order: Order) => void }) {
  const pos = usePos();
  const state = pos.state!;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">("all");
  const [from, setFrom] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const orders = [...state.orders].reverse().filter((order) => {
    if (status !== "all" && order.status !== status) return false;
    if (from && localDate(order.createdAt) < from) return false;
    const hay = `${order.number} ${order.customerName} ${order.phone}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const order = state.orders.find((item) => item.id === selected) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={controlClass} placeholder="Search bill, name, phone" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className={controlClass} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input className={controlClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="mt-3 overflow-auto rounded-2xl border border-border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="p-3 font-medium">Bill</th>
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Total</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((item) => (
                <tr key={item.id} className="cursor-pointer border-t border-border" onClick={() => setSelected(item.id)}>
                  <td className="p-3 font-semibold">{item.number}</td>
                  <td className="p-3">{formatWhen(item.createdAt, state.settings.dateFormat)}</td>
                  <td className="p-3">{item.customerName || "Walk-in"}</td>
                  <td className="p-3">{formatPkr(item.totalPaisa)}</td>
                  <td className="p-3">{item.status === "cancelled" ? "Cancelled" : orderDue(item) > 0 ? "Balance due" : "Paid"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 ? <p className="p-6 text-sm text-muted">No bills match.</p> : null}
        </div>
      </section>
      <aside className="card p-4">
        {!order ? <p className="text-sm text-muted">Select a bill to reprint, collect, or cancel.</p> : (
          <div className="grid gap-3">
            <h2 className="font-display text-3xl">{order.number}</h2>
            <p className="text-sm text-muted">{formatWhen(order.createdAt, state.settings.dateFormat)} · {order.cashierName}</p>
            <ul className="grid gap-2 text-sm">
              {order.items.map((item) => (
                <li key={item.id}>
                  <span className="flex justify-between gap-2"><span>{item.qty} × {item.name}</span><span>{formatPkr(item.lineTotalPaisa)}</span></span>
                  {item.detail ? <span className="block text-muted">{item.detail}</span> : null}
                </li>
              ))}
            </ul>
            <p className="flex justify-between font-semibold"><span>Total</span><span>{formatPkr(order.totalPaisa)}</span></p>
            <p className="flex justify-between text-sm"><span>Paid</span><span>{formatPkr(orderPaid(order))}</span></p>
            <Button variant="outline" onClick={() => onPrint(order)}>Print / preview</Button>
            {order.status === "completed" && order.onAccountPaisa === 0 && orderDue(order) > 0 ? (
              <div className="grid gap-2">
                <Field label="Collect balance">
                  <input className={controlClass} inputMode="decimal" value={pay} onChange={(event) => setPay(event.target.value)} placeholder={String(orderDue(order) / 100)} />
                </Field>
                <select className={controlClass} value={method} onChange={(event) => setMethod(event.target.value as PayMethod)}>
                  {state.settings.paymentMethods.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <Button onClick={() => {
                  const amount = rupeesToPaisa(pay || String(orderDue(order) / 100));
                  if (amount === null) return;
                  void act(() => pos.collect(order.id, method, amount), "Payment saved");
                  setPay("");
                }}>Record payment</Button>
              </div>
            ) : null}
            {order.onAccountPaisa > 0 ? <p className="text-sm text-muted">The unpaid part is on the party ledger. Receive it there so it is not counted twice.</p> : null}
            {order.status === "completed" ? (
              <div className="grid gap-2">
                <Field label="Cancel reason">
                  <input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Wrong order, customer changed mind…" />
                </Field>
                <Button variant="outline" onClick={() => {
                  if (reason.trim().length < 3) {
                    window.alert("Write a short reason before cancelling (e.g. wrong order).");
                    return;
                  }
                  void act(() => pos.cancel(order.id, reason), "Bill cancelled");
                  setReason("");
                }}>Cancel bill</Button>
              </div>
            ) : <p className="text-sm text-primary">Cancelled: {order.cancelReason}</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
