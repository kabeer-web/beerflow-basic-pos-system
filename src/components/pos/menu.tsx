import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { DealPicture, ProductPicture } from "@/components/pos/food-art";
import { formatPkr, rupeesToPaisa, uid } from "@/lib/pos/money";
import { usePos } from "@/lib/pos/store";
import type { Deal, DealSlot, Product, ProductType } from "@/lib/pos/types";
import { act, Button, controlClass, Field, Modal, paisaField } from "@/components/pos/ui";

type PriceRow = {
  id: string;
  name: string;
  price: string;
  ingredientId?: string;
  extraQty?: string;
};

type ProductDraft = Omit<Product, "basePricePaisa" | "costPricePaisa" | "sizes" | "flavours" | "addons"> & {
  basePrice: string;
  costPrice: string;
  sizes: PriceRow[];
  flavours: PriceRow[];
  addons: PriceRow[];
};

function blankProduct(categoryId: string, type: ProductType): ProductDraft {
  return {
    id: "",
    name: "",
    description: "",
    sku: "",
    categoryId,
    type,
    imageId: null,
    basePrice: "",
    costPrice: "",
    sizes: type === "pizza" ? [
      { id: uid(), name: "Small", price: "300" },
      { id: uid(), name: "Regular", price: "600" },
      { id: uid(), name: "Large", price: "850" },
      { id: uid(), name: "Jumbo", price: "1200" },
    ] : [],
    flavours: [],
    addons: [],
    halfAndHalf: type === "pizza",
    trackStock: false,
    stockQty: 0,
    minStock: 0,
    active: true,
    sort: 50,
  };
}

function fromProduct(product: Product): ProductDraft {
  return {
    ...product,
    basePrice: paisaField(product.basePricePaisa),
    costPrice: product.costPricePaisa === null ? "" : paisaField(product.costPricePaisa),
    sizes: product.sizes.map((row) => ({ id: row.id, name: row.name, price: paisaField(row.pricePaisa) })),
    flavours: product.flavours.map((row) => ({ id: row.id, name: row.name, price: paisaField(row.pricePaisa) })),
    addons: product.addons.map((row) => ({
      id: row.id,
      name: row.name,
      price: paisaField(row.pricePaisa),
      ingredientId: row.ingredientId ?? "",
      extraQty: row.extraQty != null ? String(row.extraQty) : "",
    })),
  };
}

export function MenuScreen() {
  const pos = usePos();
  const state = pos.state!;
  const [tab, setTab] = useState<"products" | "deals">("deals");
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [product, setProduct] = useState<ProductDraft | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const photo = (id: string | null) => (id ? pos.imageUrls[id] ?? null : null);
  const products = state.products.filter((item) => (!onlyActive || item.active) && item.name.toLowerCase().includes(query.toLowerCase()));
  const deals = state.deals.filter((item) => (!onlyActive || item.active) && `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="font-semibold">Menu & deals</p>
          <p className="text-sm text-muted">Edit items, prices and photos. Sample catalog is ready to customize.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`min-h-11 rounded-full px-4 text-sm font-semibold ${tab === "deals" ? "bg-accent text-accent-fg" : "bg-surface"}`} onClick={() => setTab("deals")}>Deals</button>
        <button className={`min-h-11 rounded-full px-4 text-sm font-semibold ${tab === "products" ? "bg-accent text-accent-fg" : "bg-surface"}`} onClick={() => setTab("products")}>Items</button>
        <input className={`${controlClass} max-w-xs`} placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} /> On menu only</label>
        <Button className="ml-auto" onClick={() => {
          if (tab === "products") setProduct(blankProduct(state.categories.find((category) => category.kind === "sides")?.id ?? state.categories[0]!.id, "side"));
          else setDeal({
            id: "",
            title: "",
            description: "",
            pricePaisa: 0,
            compareAtPaisa: null,
            imageId: null,
            slots: [],
            active: true,
            sort: state.deals.length + 1,
            validFrom: null,
            validTo: null,
            notes: "",
          });
        }}>Add {tab === "deals" ? "deal" : "item"}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tab === "deals" ? deals.map((item) => (
          <button key={item.id} className="rounded-2xl border border-border bg-surface p-3 text-left" onClick={() => setDeal(structuredClone(item))}>
            <DealPicture deal={item} products={state.products} url={photo(item.imageId)} className="h-24 w-full rounded-xl" imgClassName="h-24 w-full rounded-xl bg-surface-2 object-cover" />
            <span className="mt-2 block font-semibold">{item.title}{item.active ? "" : " · off"}</span>
            <span className="block text-sm text-muted">{item.description}</span>
            <span className="mt-1 block text-accent">{formatPkr(item.pricePaisa)}</span>
          </button>
        )) : products.map((item) => (
          <button key={item.id} className="rounded-2xl border border-border bg-surface p-3 text-left" onClick={() => setProduct(fromProduct(item))}>
            <ProductPicture product={item} url={photo(item.imageId)} className="h-24 w-full rounded-xl" imgClassName="h-24 w-full rounded-xl bg-surface-2 object-cover" />
            <span className="mt-2 block font-semibold">{item.name}{item.active ? "" : " · off"}</span>
            <span className="block text-sm text-muted">{item.sku}</span>
            <span className="mt-1 block text-accent">{formatPkr(item.sizes[0]?.pricePaisa ?? item.basePricePaisa)}</span>
          </button>
        ))}
      </div>
      <ProductForm draft={product} onClose={() => setProduct(null)} onChange={setProduct} />
      <DealForm deal={deal} onClose={() => setDeal(null)} onChange={setDeal} />
    </div>
  );
}

function rows(label: string, list: PriceRow[], onChange: (rows: PriceRow[]) => void) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Button variant="outline" onClick={() => onChange([...list, { id: uid(), name: "", price: "0" }])}>Add</Button>
      </div>
      {list.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_8rem_auto] gap-2">
          <input className={controlClass} value={row.name} placeholder="Name" onChange={(event) => onChange(list.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
          <input className={controlClass} value={row.price} inputMode="decimal" onChange={(event) => onChange(list.map((item) => item.id === row.id ? { ...item, price: event.target.value } : item))} />
          <Button variant="ghost" onClick={() => onChange(list.filter((item) => item.id !== row.id))}>Remove</Button>
        </div>
      ))}
    </div>
  );
}

/** Extras with optional ingredient consumption (e.g. Extra Cheese → +50g cheese). */
function addonRows(
  list: PriceRow[],
  onChange: (rows: PriceRow[]) => void,
  ingredients: { id: string; name: string; unit: string; active: boolean }[],
) {
  const active = ingredients.filter((item) => item.active);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Extras / toppings</p>
        <Button variant="outline" onClick={() => onChange([...list, { id: uid(), name: "", price: "0", ingredientId: "", extraQty: "" }])}>Add</Button>
      </div>
      <p className="text-xs text-muted">Link an ingredient and extra quantity so POS deducts stock when the customer adds this topping.</p>
      {list.map((row) => (
        <div key={row.id} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_6rem_1fr_5rem_auto]">
          <input className={controlClass} value={row.name} placeholder="Name e.g. Extra cheese" onChange={(event) => onChange(list.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
          <input className={controlClass} value={row.price} inputMode="decimal" placeholder="Rs" onChange={(event) => onChange(list.map((item) => item.id === row.id ? { ...item, price: event.target.value } : item))} />
          <select className={controlClass} value={row.ingredientId ?? ""} onChange={(event) => onChange(list.map((item) => item.id === row.id ? { ...item, ingredientId: event.target.value } : item))}>
            <option value="">No stock link</option>
            {active.map((ing) => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
          </select>
          <input className={controlClass} value={row.extraQty ?? ""} inputMode="decimal" placeholder="Qty" onChange={(event) => onChange(list.map((item) => item.id === row.id ? { ...item, extraQty: event.target.value } : item))} />
          <Button variant="ghost" onClick={() => onChange(list.filter((item) => item.id !== row.id))}>Remove</Button>
        </div>
      ))}
    </div>
  );
}

function ProductForm({ draft, onClose, onChange }: { draft: ProductDraft | null; onClose: () => void; onChange: (draft: ProductDraft) => void }) {
  const pos = usePos();
  const state = pos.state!;
  if (!draft) return null;
  const pizza = draft.type === "pizza";
  async function save() {
    const base = rupeesToPaisa(draft!.basePrice || "0");
    const cost = draft!.costPrice.trim() ? rupeesToPaisa(draft!.costPrice) : null;
    if (base === null || (draft!.costPrice.trim() && cost === null)) return;
    const mapRows = (list: PriceRow[], withIngredient = false) => {
      const mapped = [];
      for (const row of list) {
        const price = rupeesToPaisa(row.price || "0");
        if (price === null) return null;
        const base: { id: string; name: string; pricePaisa: number; ingredientId?: string | null; extraQty?: number } = {
          id: row.id,
          name: row.name.trim(),
          pricePaisa: price,
        };
        if (withIngredient) {
          base.ingredientId = row.ingredientId?.trim() || null;
          const eq = Number(row.extraQty);
          base.extraQty = Number.isFinite(eq) && eq > 0 ? eq : undefined;
        }
        mapped.push(base);
      }
      return mapped;
    };
    const sizes = mapRows(draft!.sizes);
    const flavours = mapRows(draft!.flavours);
    const addons = mapRows(draft!.addons, true);
    if (!sizes || !flavours || !addons) return;
    await act(() => pos.saveProduct({
      ...draft!,
      basePricePaisa: base,
      costPricePaisa: cost,
      sizes,
      flavours,
      addons,
    }), "Item saved");
    onClose();
  }
  return (
    <Modal open title={draft.id ? "Edit item" : "New item"} onClose={onClose} wide>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={controlClass} value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field>
          <Field label="Item code"><input className={controlClass} value={draft.sku} onChange={(event) => onChange({ ...draft, sku: event.target.value })} /></Field>
          <Field label="Category">
            <select className={controlClass} value={draft.categoryId} onChange={(event) => onChange({ ...draft, categoryId: event.target.value })}>
              {state.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className={controlClass} value={draft.type} onChange={(event) => onChange({ ...draft, type: event.target.value as ProductType })}>
              <option value="pizza">Pizza</option>
              <option value="drink">Drink</option>
              <option value="side">Side</option>
              <option value="extra">Extra</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Selling price (Rs)" hint={pizza ? "Used only if no size is chosen." : undefined}>
            <input className={controlClass} value={draft.basePrice} onChange={(event) => onChange({ ...draft, basePrice: event.target.value })} />
          </Field>
          <Field label="Cost price (Rs)" hint="Optional. Used for profit if there is no recipe.">
            <input className={controlClass} value={draft.costPrice} onChange={(event) => onChange({ ...draft, costPrice: event.target.value })} />
          </Field>
        </div>
        <Field label="Short description"><textarea className={controlClass} value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></Field>
        <ImagePick id={draft.imageId} onPick={(imageId) => onChange({ ...draft, imageId })} />
        {pizza ? rows("Sizes and prices", draft.sizes, (sizes) => onChange({ ...draft, sizes })) : null}
        {pizza ? rows("Flavours and upcharges", draft.flavours, (flavours) => onChange({ ...draft, flavours })) : null}
        {pizza ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.halfAndHalf} onChange={(event) => onChange({ ...draft, halfAndHalf: event.target.checked })} /> Allow half-and-half</label> : null}
        {pizza || draft.type === "extra" ? addonRows(draft.addons, (addons) => onChange({ ...draft, addons }), state.ingredients) : null}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.trackStock} onChange={(event) => onChange({ ...draft, trackStock: event.target.checked })} /> Track finished stock for this item</label>
        {draft.trackStock ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="On hand"><input className={controlClass} value={String(draft.stockQty)} onChange={(event) => onChange({ ...draft, stockQty: Number(event.target.value) || 0 })} /></Field>
            <Field label="Low-stock warning"><input className={controlClass} value={String(draft.minStock)} onChange={(event) => onChange({ ...draft, minStock: Number(event.target.value) || 0 })} /></Field>
          </div>
        ) : <p className="text-xs text-muted">No recipe and no stock tracking means sales will not deduct anything for this item.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(event) => onChange({ ...draft, active: event.target.checked })} /> On the menu</label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()}>Save item</Button>
          {draft.id ? <Button variant="outline" onClick={() => void act(async () => {
            const archived = await pos.removeProduct(draft.id);
            if (archived) return;
          }, "Item updated")}>Archive or delete</Button> : null}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function DealForm({ deal, onClose, onChange }: { deal: Deal | null; onClose: () => void; onChange: (deal: Deal) => void }) {
  const pos = usePos();
  const state = pos.state!;
  const [price, setPrice] = useState("");
  const [compare, setCompare] = useState("");
  const [synced, setSynced] = useState<string | null>(null);
  if (!deal) return null;
  if (synced !== deal.id) {
    setSynced(deal.id);
    setPrice(deal.pricePaisa ? paisaField(deal.pricePaisa) : "");
    setCompare(deal.compareAtPaisa ? paisaField(deal.compareAtPaisa) : "");
  }
  function patchSlot(id: string, patch: Partial<DealSlot>) {
    onChange({ ...deal!, slots: deal!.slots.map((slot) => slot.id === id ? { ...slot, ...patch } : slot) });
  }
  return (
    <Modal open title={deal.id ? "Edit deal" : "New deal"} onClose={onClose} wide>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><input className={controlClass} value={deal.title} onChange={(event) => onChange({ ...deal, title: event.target.value })} /></Field>
          <Field label="Deal price (Rs)"><input className={controlClass} value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
          <Field label="Separate price (optional)" hint="Only if you want to show the non-deal total.">
            <input className={controlClass} value={compare} onChange={(event) => setCompare(event.target.value)} />
          </Field>
          <Field label="Sort"><input className={controlClass} value={String(deal.sort)} onChange={(event) => onChange({ ...deal, sort: Number(event.target.value) || 0 })} /></Field>
        </div>
        <Field label="What the guest gets"><textarea className={controlClass} value={deal.description} onChange={(event) => onChange({ ...deal, description: event.target.value })} /></Field>
        <ImagePick id={deal.imageId} onPick={(imageId) => onChange({ ...deal, imageId })} />
        <div className="flex items-center justify-between">
          <p className="font-medium">Included items</p>
          <Button variant="outline" onClick={() => onChange({ ...deal, slots: [...deal.slots, { id: uid(), label: "Pizza", mode: "pizza", productId: "prod-pizza", choiceProductIds: [], sizeName: "Regular", flavourRequired: true, qty: 1 }] })}>Add row</Button>
        </div>
        {deal.slots.map((slot) => (
          <div key={slot.id} className="grid gap-2 rounded-xl bg-surface-2 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <input className={controlClass} value={slot.label} onChange={(event) => patchSlot(slot.id, { label: event.target.value })} />
              <select className={controlClass} value={slot.mode} onChange={(event) => patchSlot(slot.id, { mode: event.target.value as DealSlot["mode"] })}>
                <option value="pizza">Pizza choice</option>
                <option value="fixed">Fixed item</option>
                <option value="choice">Guest chooses</option>
              </select>
              <input className={controlClass} inputMode="numeric" value={String(slot.qty)} onChange={(event) => patchSlot(slot.id, { qty: Number(event.target.value) || 1 })} />
              <Button variant="ghost" onClick={() => onChange({ ...deal, slots: deal.slots.filter((item) => item.id !== slot.id) })}>Remove</Button>
            </div>
            {slot.mode === "pizza" ? <input className={controlClass} placeholder="Size name, e.g. Regular" value={slot.sizeName ?? ""} onChange={(event) => patchSlot(slot.id, { sizeName: event.target.value, flavourRequired: true, productId: "prod-pizza" })} /> : null}
            {slot.mode === "fixed" ? (
              <select className={controlClass} value={slot.productId ?? ""} onChange={(event) => patchSlot(slot.id, { productId: event.target.value })}>
                <option value="">Pick item</option>
                {state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            ) : null}
          </div>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Valid from"><input className={controlClass} type="date" value={deal.validFrom ?? ""} onChange={(event) => onChange({ ...deal, validFrom: event.target.value || null })} /></Field>
          <Field label="Valid to"><input className={controlClass} type="date" value={deal.validTo ?? ""} onChange={(event) => onChange({ ...deal, validTo: event.target.value || null })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deal.active} onChange={(event) => onChange({ ...deal, active: event.target.checked })} /> Available</label>
        <Field label="Internal note"><textarea className={controlClass} value={deal.notes} onChange={(event) => onChange({ ...deal, notes: event.target.value })} /></Field>
        <p className="text-xs text-muted">Review: {deal.title || "Untitled"} at the price above. Included rows are choices, not extra charges.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => {
            const pricePaisa = rupeesToPaisa(price || "0");
            const compareAt = compare.trim() ? rupeesToPaisa(compare) : null;
            if (pricePaisa === null || (compare.trim() && compareAt === null)) return;
            void act(() => pos.saveDeal({ ...deal, pricePaisa, compareAtPaisa: compareAt }), "Deal saved").then(() => onClose());
          }}>Save deal</Button>
          {deal.id ? <Button variant="outline" onClick={() => void act(() => pos.removeDeal(deal.id), "Deal updated").then(() => onClose())}>Archive or delete</Button> : null}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImagePick({ id, onPick }: { id: string | null; onPick: (id: string | null) => void }) {
  const pos = usePos();
  const url = id ? pos.imageUrls[id] : null;
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-surface-2">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="text-muted" />}
      </span>
      <label className="min-h-11 cursor-pointer rounded-xl border border-border px-3 py-2 text-sm">
        Choose image
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void act(async () => onPick(await pos.uploadImage(file)));
        }} />
      </label>
      {id ? <Button variant="ghost" onClick={() => onPick(null)}>Remove</Button> : null}
    </div>
  );
}
