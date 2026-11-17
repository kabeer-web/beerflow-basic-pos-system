import { formatPkr, formatWhen } from "@/lib/pos/money";
import type { Order, Settings } from "@/lib/pos/types";
import { orderDue, orderPaid } from "@/lib/pos/logic";
import { cn } from "@/lib/cn";

export function ReceiptView({
  order,
  settings,
  logoUrl,
  layout,
}: {
  order: Order;
  settings: Settings;
  logoUrl?: string | null;
  layout: "58" | "80" | "a4";
}) {
  const paid = orderPaid(order);
  const due = orderDue(order);
  return (
    <article className={cn("receipt-paper mx-auto p-4 text-sm", layout === "58" ? "print-58" : layout === "a4" ? "print-a4" : "print-80")}>
      {logoUrl ? (
        <img src={logoUrl} alt={settings.shopName} className="mx-auto h-16 w-16 object-contain" />
      ) : null}
      <h2 className="mt-2 text-center font-display text-2xl">{settings.shopName}</h2>
      <p className="text-center text-xs">{settings.branch}</p>
      <p className="text-center text-xs ink-muted">{settings.address}</p>
      <p className="text-center text-xs">{settings.phones.join(" · ")}</p>
      <p className="mt-2 text-center text-xs">{settings.tagline}</p>
      <hr className="my-3 border-dashed" />
      <p className="flex justify-between gap-3 font-semibold">
        <span>{order.number}</span>
        <span>{order.status === "cancelled" ? "CANCELLED" : order.channel}</span>
      </p>
      <p className="ink-muted">{formatWhen(order.createdAt, settings.dateFormat)}</p>
      {order.tableNo ? <p>Table {order.tableNo}</p> : null}
      {order.customerName ? <p>{order.customerName}</p> : null}
      {order.phone ? <p>{order.phone}</p> : null}
      {order.address ? <p>{order.address}</p> : null}
      <hr className="my-3 border-dashed" />
      <ul className="grid gap-2">
        {order.items.map((item) => (
          <li key={item.id}>
            <p className="flex justify-between gap-3">
              <span>
                {item.qty} × {item.name}
              </span>
              <span>{formatPkr(item.lineTotalPaisa)}</span>
            </p>
            {item.detail ? <p className="ink-muted">{item.detail}</p> : null}
          </li>
        ))}
      </ul>
      <hr className="my-3 border-dashed" />
      <p className="flex justify-between"><span>Subtotal</span><span>{formatPkr(order.subtotalPaisa)}</span></p>
      {order.discountPaisa > 0 ? <p className="flex justify-between"><span>Discount</span><span>-{formatPkr(order.discountPaisa)}</span></p> : null}
      {(order.deliveryChargePaisa ?? 0) > 0 ? <p className="flex justify-between"><span>Delivery</span><span>{formatPkr(order.deliveryChargePaisa)}</span></p> : null}
      {order.taxPaisa > 0 ? <p className="flex justify-between"><span>Tax</span><span>{formatPkr(order.taxPaisa)}</span></p> : null}
      <p className="mt-1 flex justify-between text-base font-bold"><span>Total</span><span>{formatPkr(order.totalPaisa)}</span></p>
      {order.payments.map((payment) => (
        <p key={payment.id} className="flex justify-between">
          <span>{payment.method}</span>
          <span>{formatPkr(payment.amountPaisa)}</span>
        </p>
      ))}
      {order.onAccountPaisa > 0 ? <p className="flex justify-between"><span>On account</span><span>{formatPkr(order.onAccountPaisa)}</span></p> : null}
      {due > 0 && order.onAccountPaisa === 0 ? <p className="flex justify-between"><span>Balance due</span><span>{formatPkr(due)}</span></p> : null}
      {order.refunds.length > 0 ? <p className="flex justify-between"><span>Refunded</span><span>{formatPkr(order.refunds.reduce((sum, refund) => sum + refund.amountPaisa, 0))}</span></p> : null}
      <p className="ink-muted">Paid {formatPkr(paid)}</p>
      {order.notes ? <p className="mt-2">Note: {order.notes}</p> : null}
      {order.cancelReason ? <p>Cancelled: {order.cancelReason}</p> : null}
      <p className="mt-3 text-center text-xs">{settings.receiptFooter}</p>
      <p className="mt-2 text-center text-xs ink-muted">Powered by BeerFlow Technologies</p>
    </article>
  );
}
