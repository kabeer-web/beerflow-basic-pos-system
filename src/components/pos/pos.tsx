import { useMemo, useState } from "react";
import { Banknote, Bike, CreditCard, Minus, Plus, Search, Smartphone, Store, Utensils } from "lucide-react";
import { toast } from "sonner";
import { DealPicture, ProductPicture } from "@/components/pos/food-art";
import { formatPkr, rupeesToPaisa, uid } from "@/lib/pos/money";
import { cartTotals, partyBalance } from "@/lib/pos/logic";
import { usePos } from "@/lib/pos/store";
import type { Cart, CartLine, Deal, LinePick, PayMethod, Product } from "@/lib/pos/types";
import { act, Button, controlClass, Field, Modal } from "@/components/pos/ui";

export function PosScreen({ onDone }: { onDone: (orderId: string, changePaisa: number) => void }) {
  const pos = usePos();
  const state = pos.state!;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState(state.categories[0]?.kind ?? "deals");
  const [cartOpen, setCartOpen] = useState(false);
  const [pizza, setPizza] = useState<Product | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const totals = cartTotals(state);
  const photo = (id: string | null) => (id ? pos.imageUrls[id] ?? null : null);

  const products = state.products
    .filter((product) => product.active && state.categories.find((category) => category.id === product.categoryId)?.kind === kind)
    .filter((product) => product.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const deals = state.deals
    .filter((item) => item.active && item.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.sort - b.sort);

  async function saveCart(cart: Cart) {
    await act(() => pos.setCart(cart));
  }

  async function addLine(line: CartLine) {
    await saveCart({ ...state.cart, lines: [...state.cart.lines, line] });
    setCartOpen(true);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {state.categories.filter((category) => category.active).map((category) => (
            <button
              key={category.id}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${kind === category.kind ? "bg-accent text-accent-fg" : "bg-surface text-fg"}`}
              onClick={() => setKind(category.kind)}
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
          <input className={`${controlClass} pl-10`} placeholder="Search the menu" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {kind === "deals" ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {deals.map((item) => (
              <button key={item.id} className="rounded-2xl border border-border bg-surface p-3 text-left" onClick={() => setDeal(item)}>
                <span className="grid h-28 place-items-center overflow-hidden rounded-xl bg-surface-2">
                  <DealPicture deal={item} products={state.products} url={photo(item.imageId)} className="h-24 w-full" imgClassName="h-24 w-full object-cover" />
                </span>
                <span className="mt-3 block text-xs font-bold uppercase text-primary">Deal</span>
                <span className="block font-semibold">{item.title}</span>
                <span className="block text-sm text-muted">{item.description}</span>
                <span className="mt-2 block font-display text-2xl text-accent">{formatPkr(item.pricePaisa)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const from = product.sizes.length ? Math.min(...product.sizes.map((size) => size.pricePaisa)) : product.basePricePaisa;
              return (
                <button
                  key={product.id}
                  className="rounded-2xl border border-border bg-surface p-3 text-left"
                  onClick={() => {
                    if (product.sizes.length > 0 || product.flavours.length > 0 || product.addons.length > 0) setPizza(product);
                    else void addLine({ key: uid(), kind: "product", refId: product.id, qty: 1, notes: "", config: {} });
                  }}
                >
                  <span className="grid h-28 place-items-center overflow-hidden rounded-xl bg-surface-2">
                    <ProductPicture product={product} url={photo(product.imageId)} className="h-24 w-24" imgClassName="h-24 w-full object-cover" />
                  </span>
                  <span className="mt-3 block font-semibold">{product.name}</span>
                  <span className="block text-sm text-muted">{product.description}</span>
                  <span className="mt-2 block font-display text-2xl text-accent">{from === 0 ? "Set price" : formatPkr(from)}</span>
                </button>
              );
            })}
          </div>
        )}
        {kind === "deals" && deals.length === 0 ? <p className="mt-6 text-muted">No deals match.</p> : null}
        {kind !== "deals" && products.length === 0 ? <p className="mt-6 text-muted">Nothing in this category yet.</p> : null}
      </section>
      <CartPanel
        open={cartOpen}
        onOpen={() => setCartOpen(true)}
        onClose={() => setCartOpen(false)}
        onPay={() => setPayOpen(true)}
        onSave={saveCart}
      />
      <PizzaDialog product={pizza} onClose={() => setPizza(null)} onAdd={addLine} />
      <DealDialog deal={deal} onClose={() => setDeal(null)} onAdd={addLine} />
      <PayDialog
        open={payOpen}
        totals={totals}
        onClose={() => setPayOpen(false)}
        onPaid={(orderId, change) => {
          setPayOpen(false);
          setCartOpen(false);
          onDone(orderId, change);
        }}
      />
    </div>
  );
}

function CartPanel({
  open,
  onOpen,
  onClose,
  onPay,
  onSave,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPay: () => void;
  onSave: (cart: Cart) => Promise<void>;
}) {
  const state = usePos((store) => store.state)!;
  const totals = cartTotals(state);
  const cart = state.cart;
  const panel = (
    <div className="flex h-full flex-col bg-surface lg:rounded-2xl lg:border lg:border-border">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="font-display text-2xl">Cart</h2>
        <button className="text-sm text-muted lg:hidden" onClick={onClose}>Close</button>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        {([
          ["takeaway", "Takeaway", Store],
          ["dine-in", "Dine-in", Utensils],
          ["delivery", "Delivery", Bike],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} className={`min-h-11 rounded-xl text-sm font-semibold ${cart.channel === id ? "bg-accent text-accent-fg" : "bg-surface-2"}`} onClick={() => void onSave({ ...cart, channel: id })}>
            <Icon className="mx-auto size-4" />
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 px-4">
        {cart.channel === "dine-in" ? <input className={controlClass} placeholder="Table number" value={cart.tableNo} onChange={(event) => void onSave({ ...cart, tableNo: event.target.value })} /> : null}
        <input className={controlClass} placeholder="Customer name (optional)" value={cart.customerName} onChange={(event) => void onSave({ ...cart, customerName: event.target.value, customerId: null })} />
        <input className={controlClass} placeholder="Phone" value={cart.phone} onChange={(event) => void onSave({ ...cart, phone: event.target.value })} />
        {cart.channel === "delivery" ? (
          <>
            <input className={controlClass} placeholder="Delivery address" value={cart.address} onChange={(event) => void onSave({ ...cart, address: event.target.value })} />
            <label className="text-sm text-muted">
              Delivery charge (Rs)
              <input
                className={`${controlClass} mt-1`}
                inputMode="decimal"
                value={cart.deliveryChargePaisa ? String(cart.deliveryChargePaisa / 100) : ""}
                placeholder="e.g. 100"
                onChange={(event) => {
                  const paisa = event.target.value.trim() === "" ? 0 : rupeesToPaisa(event.target.value);
                  if (paisa === null) return;
                  void onSave({ ...cart, deliveryChargePaisa: paisa });
                }}
              />
            </label>
          </>
        ) : null}
        <label className="text-sm text-muted">
          Credit party (khata)
          <select className={`${controlClass} mt-1`} value={cart.partyId ?? ""} onChange={(event) => void onSave({ ...cart, partyId: event.target.value || null })}>
            <option value="">Cash only (no khata)</option>
            {state.parties.filter((party) => party.kind === "sale" && party.active !== false).map((party) => (
              <option key={party.id} value={party.id}>{party.name} · due {formatPkr(partyBalance(state, party.id))}</option>
            ))}
          </select>
        </label>
        {cart.partyId ? (
          <p className="rounded-lg bg-accent/15 px-2 py-1 text-xs font-semibold text-accent">
            Credit party selected. Unpaid amount will go on their khata.
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex-1 space-y-3 overflow-auto px-4">
        {totals.lines.length === 0 ? <p className="text-sm text-muted">Tap a deal or menu item to start the bill.</p> : null}
        {totals.lines.map((priced) => (
          <div key={priced.line.key} className="rounded-xl bg-surface-2 p-3">
            <div className="flex justify-between gap-2">
              <p className="font-semibold">{priced.name}</p>
              <p>{formatPkr(priced.lineTotalPaisa)}</p>
            </div>
            {priced.detail ? <p className="text-xs text-muted">{priced.detail}</p> : null}
            <div className="mt-2 flex items-center gap-2">
              <button className="grid size-11 place-items-center rounded-xl bg-surface" aria-label="Decrease" onClick={() => {
                const qty = priced.line.qty - 1;
                void onSave({ ...cart, lines: qty < 1 ? cart.lines.filter((line) => line.key !== priced.line.key) : cart.lines.map((line) => line.key === priced.line.key ? { ...line, qty } : line) });
              }}><Minus className="size-4" /></button>
              <span className="w-6 text-center">{priced.line.qty}</span>
              <button className="grid size-11 place-items-center rounded-xl bg-surface" aria-label="Increase" onClick={() => void onSave({ ...cart, lines: cart.lines.map((line) => line.key === priced.line.key ? { ...line, qty: line.qty + 1 } : line) })}><Plus className="size-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-2 border-t border-border p-4">
        <label className="text-sm text-muted">
          Discount (Rs)
          <input className={`${controlClass} mt-1`} inputMode="decimal" value={cart.discountPaisa ? String(cart.discountPaisa / 100) : ""} placeholder="0" onChange={(event) => {
            const paisa = event.target.value.trim() === "" ? 0 : rupeesToPaisa(event.target.value);
            if (paisa === null) return;
            void onSave({ ...cart, discountPaisa: paisa });
          }} />
        </label>
        <p className="flex justify-between text-sm"><span>Subtotal</span><span>{formatPkr(totals.subtotalPaisa)}</span></p>
        <p className="flex justify-between text-sm"><span>Discount</span><span>{formatPkr(totals.discountPaisa)}</span></p>
        {totals.deliveryChargePaisa > 0 ? <p className="flex justify-between text-sm"><span>Delivery</span><span>{formatPkr(totals.deliveryChargePaisa)}</span></p> : null}
        {totals.taxPaisa > 0 ? <p className="flex justify-between text-sm"><span>Tax</span><span>{formatPkr(totals.taxPaisa)}</span></p> : null}
        <p className="flex justify-between font-display text-2xl"><span>Total</span><span className="text-accent">{formatPkr(totals.totalPaisa)}</span></p>
        {totals.error ? <p className="text-sm text-primary">{totals.error}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void onSave({ ...cart, lines: [], discountPaisa: 0, notes: "", idempotencyKey: "" })}>Clear</Button>
          <Button disabled={!!totals.error || totals.lines.length === 0} onClick={onPay}>Take payment</Button>
        </div>
      </div>
    </div>
  );
  return (
    <>
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)]">{panel}</aside>
      <button className="fixed inset-x-4 bottom-4 z-20 min-h-12 rounded-2xl bg-accent px-4 font-semibold text-accent-fg lg:hidden" onClick={onOpen}>
        Cart · {totals.lines.reduce((sum, line) => sum + line.line.qty, 0)} · {formatPkr(totals.totalPaisa)}
      </button>
      {open ? <div className="fixed inset-0 z-30 bg-bg lg:hidden">{panel}</div> : null}
    </>
  );
}

function PizzaDialog({ product, onClose, onAdd }: { product: Product | null; onClose: () => void; onAdd: (line: CartLine) => Promise<void> }) {
  const [size, setSize] = useState("");
  const [flavours, setFlavours] = useState<string[]>([]);
  const [addons, setAddons] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const price = useMemo(() => {
    if (!product) return 0;
    const needsSize = product.sizes.length > 0;
    if (needsSize && !size) return 0;
    const sizePrice = needsSize
      ? (product.sizes.find((item) => item.name === size)?.pricePaisa ?? 0)
      : product.basePricePaisa;
    const extra = flavours.reduce((sum, name) => sum + (product.flavours.find((item) => item.name === name)?.pricePaisa ?? 0), 0);
    const addon = addons.reduce((sum, id) => sum + (product.addons.find((item) => item.id === id)?.pricePaisa ?? 0), 0);
    return (sizePrice + extra + addon) * qty;
  }, [product, size, flavours, addons, qty]);
  return (
    <Modal open={!!product} title={product?.name ?? "Item"} onClose={onClose}>
      {product ? (
        <div className="grid gap-4">
          {product.sizes.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {product.sizes.map((item) => (
                <button key={item.id} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${size === item.name ? "bg-accent text-accent-fg" : "bg-surface-2"}`} onClick={() => setSize(item.name)}>
                  {item.name} · {formatPkr(item.pricePaisa)}
                </button>
              ))}
            </div>
          ) : null}
          {product.flavours.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {product.flavours.map((flavour) => {
                const on = flavours.includes(flavour.name);
                return (
                  <button key={flavour.id} className={`min-h-11 rounded-xl px-3 text-sm ${on ? "bg-primary text-primary-fg" : "bg-surface-2"}`} onClick={() => {
                    setFlavours((current) => {
                      if (current.includes(flavour.name)) return current.filter((name) => name !== flavour.name);
                      if (!product.halfAndHalf) return [flavour.name];
                      return [...current, flavour.name].slice(-2);
                    });
                  }}>{flavour.name}</button>
                );
              })}
            </div>
          ) : null}
          {product.halfAndHalf ? <p className="text-xs text-muted">Do options select kar sakte ho (half-and-half style).</p> : null}
          {product.addons.map((addon) => (
            <label key={addon.id} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 text-sm">
              <span>{addon.name} · {addon.pricePaisa ? formatPkr(addon.pricePaisa) : "No upcharge"}</span>
              <input type="checkbox" checked={addons.includes(addon.id)} onChange={() => setAddons((current) => current.includes(addon.id) ? current.filter((id) => id !== addon.id) : [...current, addon.id])} />
            </label>
          ))}
          <input className={controlClass} placeholder="Note for the kitchen" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="grid size-11 place-items-center rounded-xl bg-surface-2" onClick={() => setQty((value) => Math.max(1, value - 1))}><Minus /></button>
              <span>{qty}</span>
              <button className="grid size-11 place-items-center rounded-xl bg-surface-2" onClick={() => setQty((value) => value + 1)}><Plus /></button>
            </div>
            <Button onClick={() => {
              if (product.sizes.length > 0 && !size) return;
              if (product.flavours.length > 0 && flavours.length === 0) return;
              void onAdd({
                key: uid(),
                kind: "product",
                refId: product.id,
                qty,
                notes,
                config: {
                  sizeName: size || undefined,
                  flavours: flavours.length ? flavours : undefined,
                  addonIds: addons.length ? addons : undefined,
                },
              });
              setSize(""); setFlavours([]); setAddons([]); setQty(1); setNotes(""); onClose();
            }}>Add {formatPkr(price)}</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function DealDialog({ deal, onClose, onAdd }: { deal: Deal | null; onClose: () => void; onAdd: (line: CartLine) => Promise<void> }) {
  const state = usePos((store) => store.state)!;
  const [flavours, setFlavours] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  if (!deal) return <Modal open={false} title="Deal" onClose={onClose}><span /></Modal>;
  // Upcharges from options on sized slots (any product — not pizza-only).
  const flavourExtra = deal.slots.reduce((sum, slot) => {
    if (slot.mode !== "pizza") return sum;
    const product = state.products.find((p) => p.id === slot.productId);
    if (!product) return sum;
    let add = 0;
    for (let i = 0; i < slot.qty; i += 1) {
      const name = flavours[`${slot.id}-${i}`];
      if (name) add += product.flavours.find((f) => f.name === name)?.pricePaisa ?? 0;
    }
    return sum + add;
  }, 0);
  return (
    <Modal open title={deal.title} onClose={onClose} wide>
      <p className="text-sm text-muted">{deal.description}</p>
      <p className="mt-1 font-display text-3xl text-accent">{formatPkr(deal.pricePaisa + flavourExtra)}</p>
      <p className="mb-3 text-xs text-muted">Deal price includes the items below. Option upcharges add on top if set on the item.</p>
      <div className="grid gap-3">
        {deal.slots.map((slot) => {
          const slotProduct = state.products.find((p) => p.id === slot.productId);
          return (
          <div key={slot.id} className="rounded-xl bg-surface-2 p-3">
            <p className="font-semibold">{slot.qty > 1 ? `${slot.qty} × ` : ""}{slot.label}</p>
            {slot.mode === "pizza" ? (
              <div className="mt-2 grid gap-2">
                {slotProduct?.flavours.length ? Array.from({ length: slot.qty }, (_, index) => (
                  <select key={index} className={controlClass} value={flavours[`${slot.id}-${index}`] ?? ""} onChange={(event) => setFlavours((current) => ({ ...current, [`${slot.id}-${index}`]: event.target.value }))}>
                    <option value="">Choose option</option>
                    {slotProduct.flavours.map((flavour) => <option key={flavour.id} value={flavour.name}>{flavour.name}{slot.sizeName ? ` · ${slot.sizeName}` : ""}</option>)}
                  </select>
                )) : (
                  <p className="text-sm text-muted">{slotProduct?.name ?? "Item"}{slot.sizeName ? ` · ${slot.sizeName}` : ""}</p>
                )}
              </div>
            ) : null}
            {slot.mode === "choice" ? (
              <select className={`${controlClass} mt-2`} value={choices[slot.id] ?? ""} onChange={(event) => setChoices((current) => ({ ...current, [slot.id]: event.target.value }))}>
                <option value="">Choose</option>
                {slot.choiceProductIds.map((id) => {
                  const product = state.products.find((item) => item.id === id);
                  return <option key={id} value={id}>{product?.name ?? id}</option>;
                })}
              </select>
            ) : null}
            {slot.mode === "fixed" ? <p className="text-sm text-muted">{state.products.find((item) => item.id === slot.productId)?.name}</p> : null}
          </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="grid size-11 place-items-center rounded-xl bg-surface-2" onClick={() => setQty((value) => Math.max(1, value - 1))}><Minus /></button>
          <span>{qty}</span>
          <button className="grid size-11 place-items-center rounded-xl bg-surface-2" onClick={() => setQty((value) => value + 1)}><Plus /></button>
        </div>
        <Button onClick={() => {
          const picks: LinePick[] = [];
          for (const slot of deal.slots) {
            if (slot.mode === "pizza") {
              const product = state.products.find((p) => p.id === slot.productId);
              for (let index = 0; index < slot.qty; index += 1) {
                const flavour = flavours[`${slot.id}-${index}`] ?? null;
                if (product?.flavours.length && !flavour) return;
                picks.push({
                  slotId: slot.id,
                  label: slot.label,
                  productId: slot.productId ?? product?.id ?? "",
                  productName: product?.name ?? slot.label,
                  sizeName: slot.sizeName,
                  flavour,
                  qty: 1,
                });
              }
            } else if (slot.mode === "fixed" && slot.productId) {
              const product = state.products.find((item) => item.id === slot.productId);
              picks.push({ slotId: slot.id, label: slot.label, productId: slot.productId, productName: product?.name ?? slot.label, sizeName: null, flavour: null, qty: slot.qty });
            } else if (slot.mode === "choice") {
              const productId = choices[slot.id];
              if (!productId) return;
              const product = state.products.find((item) => item.id === productId);
              picks.push({ slotId: slot.id, label: slot.label, productId, productName: product?.name ?? slot.label, sizeName: null, flavour: null, qty: slot.qty });
            }
          }
          void onAdd({ key: uid(), kind: "deal", refId: deal.id, qty, notes: "", config: { picks } });
          setFlavours({}); setChoices({}); setQty(1); onClose();
        }}>Add deal {formatPkr((deal.pricePaisa + flavourExtra) * qty)}</Button>
      </div>
    </Modal>
  );
}

function PayDialog({
  open,
  onClose,
  onPaid,
}: {
  open: boolean;
  totals: ReturnType<typeof cartTotals>;
  onClose: () => void;
  onPaid: (orderId: string, changePaisa: number) => void;
}) {
  const pos = usePos();
  const state = pos.state!;
  const totals = cartTotals(state);
  const [amounts, setAmounts] = useState<Record<PayMethod, string>>({ cash: "", card: "", wallet: "" });
  const [busy, setBusy] = useState(false);
  const methods = state.settings.paymentMethods.filter((method) => method.enabled);
  const entered = methods.map((method) => ({ method: method.id, tenderedPaisa: amounts[method.id].trim() ? rupeesToPaisa(amounts[method.id]) : 0 }));
  const invalid = entered.some((item) => item.tenderedPaisa === null);
  const cash = entered.find((item) => item.method === "cash")?.tenderedPaisa ?? 0;
  const other = entered.filter((item) => item.method !== "cash").reduce((sum, item) => sum + (item.tenderedPaisa ?? 0), 0);
  const cashTender = cash ?? 0;
  // Rough on-account estimate for UI (mirrors checkout remaining after tenders)
  let remainingEstimate = totals.totalPaisa;
  for (const t of entered) {
    const v = t.tenderedPaisa ?? 0;
    if (v <= 0) continue;
    const applied = Math.min(v, remainingEstimate);
    remainingEstimate -= applied;
  }
  const dueAfterOther = Math.max(0, totals.totalPaisa - Math.min(other, totals.totalPaisa));
  const change = Math.max(0, cashTender - dueAfterOther);
  const party = state.cart.partyId
    ? state.parties.find((p) => p.id === state.cart.partyId && p.kind === "sale" && p.active !== false)
    : null;
  const icons = { cash: Banknote, card: CreditCard, wallet: Smartphone };

  async function complete(tenders: { method: PayMethod; tenderedPaisa: number }[]) {
    if (busy || invalid) return;
    setBusy(true);
    try {
      await act(async () => {
        const result = await pos.checkout(tenders);
        if (!result || result.duplicate) {
          if (result?.duplicate) toast.message("That sale was already saved.");
          return;
        }
        onPaid(result.orderId, result.changePaisa);
        setAmounts({ cash: "", card: "", wallet: "" });
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Take payment" onClose={onClose}>
      <p className="font-display text-4xl text-accent">{formatPkr(totals.totalPaisa)}</p>

      {party ? (
        <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          <p className="font-semibold">Credit party: {party.name}</p>
          <p className="text-muted">
            Jo amount yahan nahi bhara, woh is party ke khate mein plus hoga.
          </p>
          {remainingEstimate > 0 ? (
            <p className="mt-1 font-semibold text-accent">
              Party balance pe jayega: {formatPkr(remainingEstimate)}
            </p>
          ) : (
            <p className="mt-1 text-muted">Full paid — party balance nahi badhega (sahi hai).</p>
          )}
          <Button
            className="mt-3 w-full"
            variant="accent"
            disabled={busy || !!totals.error}
            onClick={() => void complete([{ method: "cash", tenderedPaisa: 0 }])}
          >
            Poori amount party pe daalo (credit)
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Credit sale ke liye cart mein party select karo. Warna unpaid ke liye customer name chahiye.
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {methods.map((method) => {
          const Icon = icons[method.id];
          return (
            <Field key={method.id} label={method.label}>
              <span className="relative">
                <Icon className="absolute left-3 top-3 size-5 text-muted" />
                <input className={`${controlClass} pl-10`} inputMode="decimal" placeholder="0" value={amounts[method.id]} onChange={(event) => setAmounts((current) => ({ ...current, [method.id]: event.target.value }))} />
              </span>
            </Field>
          );
        })}
        <Field label="Bill note">
          <input className={controlClass} value={state.cart.notes} onChange={(event) => void pos.setCart({ ...state.cart, notes: event.target.value })} />
        </Field>
      </div>
      <p className="mt-3 text-sm text-muted">
        Change {formatPkr(change)}
        {party && remainingEstimate > 0 ? ` · On credit ${formatPkr(remainingEstimate)}` : ""}
        {!party ? ". Unpaid amount needs a customer name or credit party in the cart." : "."}
      </p>
      <Button
        className="mt-4 w-full"
        disabled={busy || invalid || !!totals.error}
        onClick={() => void complete(entered.map((item) => ({ method: item.method, tenderedPaisa: item.tenderedPaisa ?? 0 })))}
      >
        Complete sale
      </Button>
    </Modal>
  );
}
