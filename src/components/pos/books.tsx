import { useEffect, useMemo, useState } from "react";
import { formatPkr, formatWhen, localDate, parseQty, rupeesToPaisa } from "@/lib/pos/money";
import { convertToIngredientUnit, customerStats, partyBalance, summarize } from "@/lib/pos/logic";
import { usePos } from "@/lib/pos/store";
import { readInstall, useLifecycle } from "@/lib/pos/lifecycle";
import type { Customer, Expense, Ingredient, LedgerEntry, Party, PayMethod, Recipe } from "@/lib/pos/types";
import { act, BeerflowMark, Button, controlClass, Empty, Field, Modal, Stat } from "@/components/pos/ui";
import { STARTER_LOGINS } from "@/lib/pos/seed";

export function InventoryScreen() {
  const pos = usePos();
  const state = pos.state!;
  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const value = state.ingredients.reduce((sum, item) => sum + Math.round(Math.max(0, item.stockQty) * item.avgCostPaisa), 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-muted">Stock value uses weighted average cost. Sales deduct a recipe once. A deal with its own recipe does not also deduct the pizzas inside it. Items without a recipe are manual.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIngredient({ id: "", name: "", unit: "g", kind: "ingredient", stockQty: 0, avgCostPaisa: 0, minQty: 0, active: true })}>Add ingredient</Button>
          <Button variant="outline" onClick={() => setMoveOpen(true)}>Stock movement</Button>
          <Button onClick={() => setRecipeOpen(true)}>Recipe</Button>
        </div>
      </div>
      <Stat label="Ingredient stock value" value={formatPkr(value)} note="Finished items use their cost price in the profit estimate, not this card." />
      {(() => {
        const low = state.ingredients.filter((item) => item.active && item.minQty > 0 && item.stockQty <= item.minQty);
        if (!low.length) return null;
        return (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <p className="font-semibold text-amber-200">Low stock</p>
            <ul className="mt-2 grid gap-1">
              {low.map((item) => (
                <li key={item.id}>{item.name}: {item.stockQty} {item.unit} (min {item.minQty})</li>
              ))}
            </ul>
          </div>
        );
      })()}
      <div className="overflow-auto rounded-2xl border border-border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-surface text-muted"><tr><th className="p-3">Ingredient</th><th className="p-3">Current Stock</th><th className="p-3">Avg cost</th><th className="p-3">Min stock</th><th className="p-3"></th></tr></thead>
          <tbody>
            {state.ingredients.filter((item) => item.active).map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="p-3 font-semibold">{item.name}<span className="block text-xs text-muted">{item.kind}</span></td>
                <td className="p-3">{item.stockQty} {item.unit}</td>
                <td className="p-3">{formatPkr(item.avgCostPaisa)}</td>
                <td className="p-3">{item.minQty || "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setIngredient(item)}>Edit</Button>
                    <Button variant="ghost" onClick={() => {
                      const hasHistory = state.stockMovements.some((move) => move.ingredientId === item.id);
                      const ask = hasHistory
                        ? `${item.name} has stock history, so it will be hidden (history is kept). Continue?`
                        : `Delete ${item.name}? It will also be removed from any recipe.`;
                      if (!window.confirm(ask)) return;
                      void act(() => pos.removeIngredient(item.id), hasHistory ? "Ingredient hidden" : "Ingredient deleted");
                    }}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section>
        <h2 className="font-display text-2xl">Movements</h2>
        {state.stockMovements.length === 0 ? <p className="mt-2 text-sm text-muted">No stock movements yet. Counts stay at zero until you receive stock.</p> : (
          <ul className="mt-2 grid gap-2">
            {[...state.stockMovements].reverse().slice(0, 20).map((move) => {
              const name = state.ingredients.find((item) => item.id === move.ingredientId)?.name
                ?? state.products.find((item) => item.id === move.productId)?.name
                ?? "Item";
              const label =
                move.type === "sale" ? "Used in Sales"
                : move.type === "purchase" ? "Purchased"
                : move.type === "wastage" ? "Wasted"
                : move.type === "reversal" ? "Reversed"
                : move.type === "adjustment" ? "Adjustment"
                : move.type === "out" ? "Taken out"
                : move.type;
              const unit = state.ingredients.find((item) => item.id === move.ingredientId)?.unit ?? "";
              return (
                <li key={move.id} className="flex justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
                  <span>{name} · {label} · {move.qty > 0 ? "+" : ""}{move.qty} {unit}</span>
                  <span className="text-muted">{move.reason}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <IngredientForm ingredient={ingredient} onClose={() => setIngredient(null)} />
      <MovementForm open={moveOpen} onClose={() => setMoveOpen(false)} />
      <RecipeForm open={recipeOpen} onClose={() => setRecipeOpen(false)} />
    </div>
  );
}

function IngredientForm({ ingredient, onClose }: { ingredient: Ingredient | null; onClose: () => void }) {
  const pos = usePos();
  const [draft, setDraft] = useState<Ingredient | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  if (ingredient && seen !== ingredient.id + ingredient.name) {
    setSeen(ingredient.id + ingredient.name);
    setDraft(ingredient);
  }
  if (!ingredient || !draft) return null;
  return (
    <Modal open title={draft.id ? "Edit ingredient" : "New ingredient"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Name"><input className={controlClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Unit">
          <select className={controlClass} value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })}>
            <option value="g">grams (g)</option>
            <option value="kg">kilograms (kg)</option>
            <option value="ml">millilitres (ml)</option>
            <option value="l">litres (l)</option>
            <option value="pcs">pieces (pcs)</option>
          </select>
        </Field>
        <p className="text-xs text-muted">Keep one base unit per ingredient. 1 kg = 1000 g, 1 l = 1000 ml — enter recipe quantities in the same unit you stock in.</p>
        <Field label="Low stock"><input className={controlClass} value={String(draft.minQty)} onChange={(event) => setDraft({ ...draft, minQty: Number(event.target.value) || 0 })} /></Field>
        <select className={controlClass} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Ingredient["kind"] })}>
          <option value="ingredient">Ingredient</option>
          <option value="packaging">Packaging</option>
        </select>
        <p className="text-xs text-muted">Opening quantity is not typed here. Use a stock movement so there is a record.</p>
        <Button onClick={() => void act(() => pos.saveIngredient(draft), "Saved").then(onClose)}>Save</Button>
      </div>
    </Modal>
  );
}

function MovementForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pos = usePos();
  const state = pos.state!;
  const [ingredientId, setIngredientId] = useState(state.ingredients.find((item) => item.active)?.id ?? "");
  const [type, setType] = useState<"purchase" | "out" | "wastage" | "adjustment">("purchase");
  const [qty, setQty] = useState("");
  const [entryUnit, setEntryUnit] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "credit" | "none">("cash");
  const [partyId, setPartyId] = useState("");
  const [day, setDay] = useState(localDate());
  const [adjustmentIn, setAdjustmentIn] = useState(true);
  const selected = state.ingredients.find((item) => item.id === ingredientId);
  const stockUnit = selected?.unit ?? "g";
  const effectiveEntryUnit = entryUnit || stockUnit;
  return (
    <Modal open={open} title="Stock movement" onClose={onClose}>
      <div className="grid gap-3">
        <select className={controlClass} value={ingredientId} onChange={(event) => { setIngredientId(event.target.value); setEntryUnit(""); }}>
          {state.ingredients.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}
        </select>
        <select className={controlClass} value={type} onChange={(event) => setType(event.target.value as typeof type)}>
          <option value="purchase">Purchase in</option>
          <option value="out">Used / out</option>
          <option value="wastage">Wastage</option>
          <option value="adjustment">Adjustment</option>
        </select>
        {type === "adjustment" ? <label className="text-sm"><input type="checkbox" checked={adjustmentIn} onChange={(event) => setAdjustmentIn(event.target.checked)} /> Add stock (uncheck to remove)</label> : null}
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Field label="Quantity"><input className={controlClass} value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
          <Field label="Unit">
            <select className={controlClass} value={effectiveEntryUnit} onChange={(event) => setEntryUnit(event.target.value)}>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
              <option value="pcs">pcs</option>
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted">Stock is kept in {stockUnit}. Example: 5 kg → saves 5,000 g when unit is g.</p>
        {type === "purchase" ? (
          <Field label="Total paid (Rs)" hint="Poori quantity ka bill — system khud per-unit cost nikalega">
            <input className={controlClass} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="e.g. 5000 for 5 kg" />
          </Field>
        ) : null}
        {type === "purchase" ? (
          <select className={controlClass} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="cash">Paid cash</option>
            <option value="card">Paid card</option>
            <option value="credit">On supplier account</option>
          </select>
        ) : null}
        {method === "credit" ? (
          <select className={controlClass} value={partyId} onChange={(event) => setPartyId(event.target.value)}>
            <option value="">Supplier</option>
            {state.parties.filter((party) => party.kind === "purchase").map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
        ) : null}
        <Field label="Reason"><input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        <input className={controlClass} type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        <Button onClick={() => {
          const parsed = parseQty(qty);
          if (parsed === null || !(parsed > 0)) {
            window.alert("Enter a valid quantity.");
            return;
          }
          const converted = convertToIngredientUnit(parsed, effectiveEntryUnit, stockUnit);
          if (converted.error) {
            window.alert(converted.error);
            return;
          }
          if (!(converted.qty > 0)) {
            window.alert("Converted quantity must be greater than zero.");
            return;
          }
          let unitCostPaisa = 0;
          if (type === "purchase") {
            const totalPaid = rupeesToPaisa(cost || "0");
            if (totalPaid === null || totalPaid <= 0) {
              window.alert("Enter total paid (Rs) for this whole quantity.");
              return;
            }
            // Total paid for the batch → cost per 1 stored unit (e.g. per gram)
            unitCostPaisa = Math.round(totalPaid / converted.qty);
            if (unitCostPaisa <= 0) {
              window.alert("Total paid is too small for this quantity.");
              return;
            }
          }
          void act(
            () =>
              pos.postStock({
                ingredientId,
                type,
                qty: converted.qty,
                adjustmentIn,
                unitCostPaisa,
                reason,
                partyId: partyId || null,
                method: type === "purchase" ? method : "none",
                day,
              }),
            "Stock updated",
          ).then(onClose);
        }}>Save movement</Button>
      </div>
    </Modal>
  );
}

function RecipeForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pos = usePos();
  const state = pos.state!;
  const firstIng = state.ingredients.find((item) => item.active)?.id ?? "";
  const [recipeId, setRecipeId] = useState("");
  const [target, setTarget] = useState(state.products[0]?.id ?? "");
  const [kind, setKind] = useState<"product" | "deal">("product");
  const [sizeName, setSizeName] = useState("");
  const [lines, setLines] = useState<{ ingredientId: string; qty: string }[]>([{ ingredientId: firstIng, qty: "1" }]);
  const [active, setActive] = useState(true);
  const product = kind === "product" ? state.products.find((item) => item.id === target) : null;
  const sizes = product?.sizes.map((s) => s.name) ?? [];

  function loadRecipe(id: string) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) {
      setRecipeId("");
      setLines([{ ingredientId: firstIng, qty: "1" }]);
      setActive(true);
      setSizeName("");
      return;
    }
    setRecipeId(recipe.id);
    setKind(recipe.productId ? "product" : "deal");
    setTarget(recipe.productId ?? recipe.dealId ?? "");
    setSizeName(recipe.sizeName ?? "");
    setActive(recipe.active);
    setLines(recipe.lines.map((line) => ({ ingredientId: line.ingredientId, qty: String(line.qty) })));
  }

  function labelFor(recipe: Recipe) {
    const name =
      (recipe.productId && state.products.find((p) => p.id === recipe.productId)?.name) ||
      (recipe.dealId && state.deals.find((d) => d.id === recipe.dealId)?.title) ||
      "Recipe";
    const size = recipe.sizeName ? ` · ${recipe.sizeName}` : "";
    return `${recipe.active ? "●" : "○"} ${name}${size} (${recipe.lines.length} lines)`;
  }

  return (
    <Modal open={open} title="Recipe" onClose={onClose} wide>
      <div className="grid gap-3">
        <p className="text-sm text-muted">Configure ingredient consumption per product size. Quantities use the ingredient unit (g, ml, pcs). Leave size blank for a default recipe.</p>
        {state.recipes.length > 0 ? (
          <Field label="Load existing recipe">
            <select className={controlClass} value={recipeId} onChange={(event) => loadRecipe(event.target.value)}>
              <option value="">— New recipe —</option>
              {state.recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>{labelFor(recipe)}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <select className={controlClass} value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setRecipeId(""); }}>
          <option value="product">Product</option>
          <option value="deal">Deal</option>
        </select>
        <select className={controlClass} value={target} onChange={(event) => { setTarget(event.target.value); setRecipeId(""); }}>
          {(kind === "product" ? state.products : state.deals).map((item) => (
            <option key={item.id} value={item.id}>{"name" in item ? item.name : item.title}</option>
          ))}
        </select>
        {kind === "product" ? (
          <Field label="Size">
            <select className={controlClass} value={sizeName} onChange={(event) => setSizeName(event.target.value)}>
              <option value="">Any / default</option>
              {sizes.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </Field>
        ) : null}
        <p className="text-xs font-medium text-muted">Ingredients consumed</p>
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[1fr_6rem_auto] gap-2">
            <select className={controlClass} value={line.ingredientId} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, ingredientId: event.target.value } : item))}>
              {state.ingredients.filter((item) => item.active).map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
              ))}
            </select>
            <input className={controlClass} value={line.qty} inputMode="decimal" onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, qty: event.target.value } : item))} />
            <Button variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== index))}>Remove</Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setLines([...lines, { ingredientId: firstIng, qty: "1" }])}>Add ingredient</Button>
        <label className="text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Recipe is active</label>
        <Button onClick={() => {
          const parsed = lines.map((line) => ({ ingredientId: line.ingredientId, qty: parseQty(line.qty) ?? 0 }));
          if (parsed.some((line) => !(line.qty > 0))) return;
          const recipe: Recipe = {
            id: recipeId || "",
            productId: kind === "product" ? target : null,
            dealId: kind === "deal" ? target : null,
            sizeName: sizeName.trim() || null,
            lines: parsed,
            active,
            note: "",
          };
          void act(() => pos.saveRecipe(recipe), "Recipe saved").then(onClose);
        }}>{recipeId ? "Update recipe" : "Save recipe"}</Button>
      </div>
    </Modal>
  );
}

export function PartiesScreen() {
  const pos = usePos();
  const state = pos.state!;
  const [kind, setKind] = useState<Party["kind"]>("sale");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const q = query.trim().toLowerCase();
  const parties = state.parties.filter((party) => {
    if (party.kind !== kind) return false;
    if (!showArchived && party.active === false) return false;
    if (showArchived && party.active !== false) return false;
    if (!q) return true;
    return party.name.toLowerCase().includes(q) || party.phone.toLowerCase().includes(q);
  });
  const party = state.parties.find((item) => item.id === selected) ?? null;
  const entries = state.ledger.filter((entry) => entry.partyId === party?.id && (!from || localDate(entry.at) >= from)).sort((a, b) => a.at.localeCompare(b.at));
  let running = 0;
  const rows = entries.map((entry) => {
    running += entry.direction === "increase" ? entry.amountPaisa : -entry.amountPaisa;
    return { entry, running };
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button className={`min-h-11 rounded-xl text-sm font-semibold ${kind === "sale" ? "bg-accent text-accent-fg" : "bg-surface"}`} onClick={() => { setKind("sale"); setSelected(null); }}>Customers on credit</button>
          <button className={`min-h-11 rounded-xl text-sm font-semibold ${kind === "purchase" ? "bg-accent text-accent-fg" : "bg-surface"}`} onClick={() => { setKind("purchase"); setSelected(null); }}>Suppliers</button>
        </div>
        <input className={`${controlClass} mb-2`} placeholder="Search name or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="mb-2 flex gap-2">
          <Button className="flex-1" onClick={() => setCreating(true)}>Add party</Button>
          <Button variant="outline" onClick={() => { setShowArchived((v) => !v); setSelected(null); }}>
            {showArchived ? "Active" : "Archived"}
          </Button>
        </div>
        <div className="grid gap-2">
          {parties.map((item) => (
            <button key={item.id} className="rounded-xl bg-surface px-3 py-3 text-left" onClick={() => setSelected(item.id)}>
              <span className="block font-semibold">{item.name}{item.active === false ? " (archived)" : ""}</span>
              <span className="text-sm text-accent">{formatPkr(partyBalance(state, item.id))}</span>
              {item.phone ? <span className="block text-xs text-muted">{item.phone}</span> : null}
            </button>
          ))}
          {parties.length === 0 ? <Empty title={showArchived ? "No archived parties" : "No parties yet"} body={kind === "sale" ? "Add a shop or family that buys on credit." : "Add a supplier you pay later."} /> : null}
        </div>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-4">
        {!party ? <p className="text-sm text-muted">Choose a party to see what is owed.</p> : (
          <PartyDetail party={party} rows={rows} from={from} setFrom={setFrom} />
        )}
      </section>
      <PartyCreate open={creating} kind={kind} onClose={() => setCreating(false)} />
    </div>
  );
}

function PartyDetail({ party, rows, from, setFrom }: { party: Party; rows: { entry: LedgerEntry; running: number }[]; from: string; setFrom: (value: string) => void }) {
  const pos = usePos();
  const state = pos.state!;
  const balance = partyBalance(state, party.id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(localDate());
  const [method, setMethod] = useState<LedgerEntry["method"]>("cash");
  const [editing, setEditing] = useState(false);
  const label = party.kind === "sale" ? "They owe you" : "You owe them";
  function post(type: "customer_payment" | "supplier_payment" | "purchase" | "credit_sale") {
    const paisa = rupeesToPaisa(amount);
    if (paisa === null) return;
    const description =
      note.trim().length >= 3
        ? note.trim()
        : type === "customer_payment"
          ? "Payment received"
          : type === "supplier_payment"
            ? "Supplier payment"
            : type === "credit_sale"
              ? "Manual credit sale"
              : "Purchase on account";
    void act(() => pos.postLedger({ partyId: party.id, type, amountPaisa: paisa, method, description, day }), "Saved");
    setAmount("");
    setNote("");
  }
  return (
    <div className="print-area">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl">{party.name}</h2>
          <p className="text-sm text-muted">{party.phone || "No phone"}{party.address ? ` · ${party.address}` : ""}</p>
          {party.notes ? <p className="text-sm text-muted">{party.notes}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="outline" onClick={() => setEditing(true)}>Edit party</Button>
          {party.active !== false ? (
            <Button
              variant="ghost"
              onClick={() => {
                const bal = partyBalance(state, party.id);
                if (bal !== 0) {
                  if (!window.confirm(`Balance is still ${formatPkr(Math.abs(bal))}. Archive (hide) anyway? History will be kept.`)) return;
                  void act(() => pos.archiveParty(party.id, true), "Party archived");
                } else {
                  if (!window.confirm(`Archive ${party.name}? History and balance stay safe. You can restore later.`)) return;
                  void act(() => pos.archiveParty(party.id, false), "Party archived");
                }
              }}
            >
              Delete / Archive
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void act(() => pos.restoreParty(party.id), "Party restored")}>
              Restore
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">{label}</p>
      <p className="font-display text-4xl text-accent">{formatPkr(balance)}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 no-print">
        <Field label="Amount (Rs)"><input className={controlClass} value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="Date"><input className={controlClass} type="date" value={day} onChange={(event) => setDay(event.target.value)} /></Field>
        <Field label="Note"><input className={controlClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></Field>
        <Field label="Cash or other">
          <select className={controlClass} value={method} onChange={(event) => setMethod(event.target.value as LedgerEntry["method"])}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="wallet">Wallet</option>
            <option value="none">Not cash</option>
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 no-print">
        {party.kind === "sale" ? <Button onClick={() => post("customer_payment")}>Receive payment</Button> : <Button onClick={() => post("supplier_payment")}>Pay supplier</Button>}
        {party.kind === "sale" ? <Button variant="outline" onClick={() => post("credit_sale")}>Record credit sale</Button> : <Button variant="outline" onClick={() => post("purchase")}>Record purchase</Button>}
        <Button variant="ghost" onClick={() => window.print()}>Print statement</Button>
        <Button variant="ghost" onClick={() => downloadCsv(`${party.name}-ledger.csv`, ["Date", "Type", "Note", "Amount", "Balance"], rows.map((row) => [localDate(row.entry.at), row.entry.type, row.entry.description, String(row.entry.amountPaisa / 100), String(row.running / 100)]))}>CSV</Button>
      </div>
      <PartyEdit open={editing} party={party} onClose={() => setEditing(false)} />
      <input className={`${controlClass} mt-3 max-w-xs`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      <ul className="mt-3 grid gap-2">
        {rows.map((row) => (
          <li key={row.entry.id} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
            <span>{formatWhen(row.entry.at, state.settings.dateFormat)} · {plainType(row.entry.type)}<span className="block text-muted">{row.entry.description}</span></span>
            <span>{row.entry.direction === "increase" ? "+" : "−"}{formatPkr(row.entry.amountPaisa)}</span>
            <span>{formatPkr(row.running)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function plainType(type: LedgerEntry["type"]) {
  const labels: Record<LedgerEntry["type"], string> = {
    opening: "Opening",
    credit_sale: "Credit sale",
    customer_payment: "Payment received",
    purchase: "Purchase",
    supplier_payment: "Supplier paid",
    refund: "Reversal",
    adjustment: "Adjustment",
  };
  return labels[type];
}

function PartyCreate({ open, kind, onClose }: { open: boolean; kind: Party["kind"]; onClose: () => void }) {
  const pos = usePos();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [opening, setOpening] = useState("");
  return (
    <Modal open={open} title={kind === "sale" ? "Credit customer" : "Supplier"} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Name"><input className={controlClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Phone"><input className={controlClass} value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
        <Field label="Address"><input className={controlClass} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
        <Field label="Opening balance (Rs)" hint={kind === "sale" ? "What they already owe you." : "What you already owe them."}>
          <input className={controlClass} value={opening} onChange={(event) => setOpening(event.target.value)} />
        </Field>
        <Button onClick={() => {
          const openingPaisa = opening.trim() ? rupeesToPaisa(opening) : 0;
          if (openingPaisa === null) return;
          void act(() => pos.saveParty({ name, kind, phone, address, notes: "", openingPaisa }), "Party saved").then(onClose);
        }}>Save</Button>
      </div>
    </Modal>
  );
}

function PartyEdit({ open, party, onClose }: { open: boolean; party: Party; onClose: () => void }) {
  const pos = usePos();
  const [name, setName] = useState(party.name);
  const [phone, setPhone] = useState(party.phone);
  const [address, setAddress] = useState(party.address);
  const [notes, setNotes] = useState(party.notes);
  useEffect(() => {
    if (!open) return;
    setName(party.name);
    setPhone(party.phone);
    setAddress(party.address);
    setNotes(party.notes);
  }, [open, party.id, party.name, party.phone, party.address, party.notes]);
  return (
    <Modal open={open} title="Edit party" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Name"><input className={controlClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Phone"><input className={controlClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Address"><input className={controlClass} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Notes"><input className={controlClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-muted">Opening balance is not changed here. Use ledger payments or adjustments for money.</p>
        <Button
          onClick={() => {
            void act(
              () =>
                pos.saveParty({
                  id: party.id,
                  name,
                  kind: party.kind,
                  phone,
                  address,
                  notes,
                  openingPaisa: 0,
                }),
              "Party updated",
            ).then(onClose);
          }}
        >
          Save changes
        </Button>
      </div>
    </Modal>
  );
}

export function CustomersScreen() {
  const pos = usePos();
  const state = pos.state!;
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Customer | null>(null);
  const now = useMemo(() => new Date(), []);
  const rows = state.customers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${controlClass} max-w-sm`} placeholder="Search name or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button onClick={() => setDraft({ id: "", name: "", phone: "", address: "", notes: "", manualTags: [], partyId: null, createdAt: "" })}>Add customer</Button>
      </div>
      {rows.length === 0 ? <Empty title="No saved customers" body="Walk-in cash sales do not need a phone. Add someone when you want their history." /> : (
        <div className="overflow-auto rounded-2xl border border-border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface text-muted"><tr><th className="p-3">Name</th><th className="p-3">Phone</th><th className="p-3">Visits</th><th className="p-3">Spent</th><th className="p-3">Tags</th></tr></thead>
            <tbody>
              {rows.map((customer) => {
                const stats = customerStats(state, customer.id, now);
                return (
                  <tr key={customer.id} className="cursor-pointer border-t border-border" onClick={() => setDraft(customer)}>
                    <td className="p-3 font-semibold">{customer.name}</td>
                    <td className="p-3">{customer.phone || "—"}</td>
                    <td className="p-3">{stats.visits}</td>
                    <td className="p-3">{formatPkr(stats.spendPaisa)}</td>
                    <td className="p-3">{stats.tags.join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!draft} title="Customer" onClose={() => setDraft(null)}>
        {draft ? (
          <div className="grid gap-3">
            <Field label="Name"><input className={controlClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Phone"><input className={controlClass} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></Field>
            <Field label="Address"><input className={controlClass} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></Field>
            <Field label="Notes"><textarea className={controlClass} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
            <Field label="Manual tags" hint="Comma separated. VIP can also be earned from settings.">
              <input className={controlClass} value={draft.manualTags.join(", ")} onChange={(event) => setDraft({ ...draft, manualTags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
            </Field>
            {draft.id ? <CustomerFacts id={draft.id} /> : null}
            <Button onClick={() => void act(() => pos.saveCustomer(draft), "Customer saved").then(() => setDraft(null))}>Save</Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function CustomerFacts({ id }: { id: string }) {
  const state = usePos((store) => store.state)!;
  const stats = customerStats(state, id);
  return <p className="text-sm text-muted">{stats.visits} completed orders · {stats.distinctDays} different days · favourite {stats.favourite || "—"} · last {stats.last ? formatWhen(stats.last, state.settings.dateFormat) : "—"}</p>;
}

export function ExpensesScreen() {
  const pos = usePos();
  const state = pos.state!;
  const today = localDate();
  const summary = summarize(state, { from: today, to: today });
  const [category, setCategory] = useState(state.settings.expenseCategories[0] ?? "Other");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Expense["method"]>("cash");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [day, setDay] = useState(today);
  const [opening, setOpening] = useState(state.settings.openingCashPaisa ? String(state.settings.openingCashPaisa / 100) : "");
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Opening cash" value={formatPkr(summary.cash.openingPaisa)} />
        <Stat label="Cash taken" value={formatPkr(summary.cash.salesPaisa)} note="Includes bills later cancelled, then refunds come off." />
        <Stat label="Cash expenses" value={formatPkr(summary.cash.expensePaisa)} />
        <Stat label="Cash that should be in drawer" value={formatPkr(summary.cash.expectedPaisa)} note="Opening cash + cash taken − cash spent" />
      </div>
      <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-2">
        <h2 className="font-display text-2xl md:col-span-2">New expense</h2>
        <select className={controlClass} value={category} onChange={(event) => setCategory(event.target.value)}>
          {state.settings.expenseCategories.map((item) => <option key={item}>{item}</option>)}
        </select>
        <input className={controlClass} placeholder="Amount (Rs)" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <select className={controlClass} value={method} onChange={(event) => setMethod(event.target.value as Expense["method"])}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        <input className={controlClass} type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        <input className={controlClass} placeholder="What was it for?" value={description} onChange={(event) => setDescription(event.target.value)} />
        <input className={controlClass} placeholder="Receipt number" value={reference} onChange={(event) => setReference(event.target.value)} />
        <Button onClick={() => {
          const paisa = rupeesToPaisa(amount);
          if (paisa === null) return;
          const at = new Date(`${day}T12:00:00`).toISOString();
          void act(() => pos.saveExpense({ id: "", at, category, amountPaisa: paisa, method, description, partyId: null, reference, voided: false, voidReason: "" }), "Expense saved");
          setAmount(""); setDescription("");
        }}>Save expense</Button>
        <div className="flex gap-2">
          <input className={controlClass} placeholder="Today's opening cash" value={opening} onChange={(event) => setOpening(event.target.value)} />
          <Button variant="outline" onClick={() => {
            const paisa = rupeesToPaisa(opening || "0");
            if (paisa === null) return;
            void act(() => pos.saveSettings({ ...state.settings, openingCashPaisa: paisa, openingCashDate: today }), "Opening cash saved");
          }}>Set</Button>
        </div>
      </section>
      <ul className="grid gap-2">
        {[...state.expenses].reverse().map((expense) => (
          <li key={expense.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-3 text-sm">
            <span>{expense.category} · {expense.description}{expense.voided ? " · void" : ""}</span>
            <span>{formatPkr(expense.amountPaisa)}</span>
            {!expense.voided ? <Button variant="ghost" onClick={() => void act(() => pos.voidExpense(expense.id, "Entered in error"), "Voided")}>Void</Button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReportsScreen() {
  const pos = usePos();
  const state = pos.state!;
  const session = pos.session;
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const summary = summarize(state, { from, to });
  const today = localDate();
  const todaySummary = summarize(state, { from: today, to: today });
  const todayClosed = (state.closedDays ?? []).find((d) => d.date === today && !d.reopened);
  const [actualCash, setActualCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const orders = state.orders.filter((order) => {
    const day = localDate(order.createdAt);
    return day >= from && day <= to;
  });
  return (
    <div className="grid gap-4 print-area">
      {/* ── SAVE TODAY & CLOSE DAY ── */}
      <section className="rounded-2xl border-2 border-accent/50 bg-accent/5 p-4">
        <h2 className="font-display text-2xl text-accent">Save Today & Close Day</h2>
        <p className="mt-1 text-sm text-muted">
          Close the business day after counting the cash drawer. This saves a permanent record.
          Stock, parties and old bills are never deleted.
        </p>
        {todayClosed ? (
          <div className="mt-3 rounded-xl bg-surface p-3 text-sm">
            <p className="font-semibold">Today ({today}) is already closed.</p>
            <p>Expected: {formatPkr(todayClosed.expectedCashPaisa)} · Counted: {formatPkr(todayClosed.actualCashPaisa)} · Difference: {formatPkr(todayClosed.differencePaisa)}</p>
            <p className="text-muted">Closed by {todayClosed.closedByName} at {formatWhen(todayClosed.closedAt, state.settings.dateFormat)}</p>
            {session?.role === "owner" ? (
              <Button
                className="mt-2"
                variant="outline"
                onClick={() => {
                  const reason = window.prompt("Why reopen this day?");
                  if (!reason || reason.trim().length < 5) return;
                  void act(() => pos.reopenDay(todayClosed.id, reason.trim()), "Day reopened");
                }}
              >
                Reopen day (owner)
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Orders today" value={String(todaySummary.orderCount)} />
              <Stat label="Sales today" value={formatPkr(todaySummary.salesPaisa)} />
              <Stat label="Cash that should be there" value={formatPkr(todaySummary.cash.expectedPaisa)} />
              <Stat label="Delivery charges" value={formatPkr(todaySummary.deliveryChargePaisa)} />
              <Stat label="Credit sales" value={formatPkr(todaySummary.creditSalesPaisa)} />
              <Stat label="Party payments received" value={formatPkr(todaySummary.partyPaymentsPaisa)} />
              <Stat label="Expenses" value={formatPkr(todaySummary.expensesPaisa)} />
              <Stat label="Refunds" value={formatPkr(todaySummary.refundPaisa)} />
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-sm">
                Actual cash counted (Rs)
                <input
                  className={`${controlClass} mt-1`}
                  inputMode="decimal"
                  placeholder="Count the drawer"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                />
              </label>
              <label className="text-sm flex-1 min-w-[12rem]">
                Notes (optional)
                <input className={`${controlClass} mt-1`} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Any shortage or surplus note" />
              </label>
              <Button
                onClick={() => {
                  const paisa = rupeesToPaisa(actualCash || "0");
                  if (paisa === null) return;
                  if (!window.confirm(`Close ${today}?\n\nExpected drawer: ${formatPkr(todaySummary.cash.expectedPaisa)}\nYou counted: ${formatPkr(paisa)}\nDifference: ${formatPkr(paisa - todaySummary.cash.expectedPaisa)}\n\nThis does NOT delete any bills or stock.`)) return;
                  void act(
                    () => pos.closeDay({ date: today, actualCashPaisa: paisa, notes: closeNotes }),
                    "Day closed & saved",
                  ).then(() => {
                    setActualCash("");
                    setCloseNotes("");
                    setCloseOpen(false);
                  });
                }}
              >
                SAVE TODAY & CLOSE DAY
              </Button>
            </div>
          </>
        )}
        {(state.closedDays ?? []).filter((d) => !d.reopened).length > 0 ? (
          <div className="mt-4">
            <h3 className="font-semibold text-sm text-muted">Previously closed days</h3>
            <ul className="mt-1 max-h-40 overflow-auto text-sm">
              {[...(state.closedDays ?? [])].filter((d) => !d.reopened).reverse().slice(0, 10).map((d) => (
                <li key={d.id} className="flex flex-wrap gap-2 border-t border-border py-1">
                  <span className="font-semibold">{d.date}</span>
                  <span>Sales {formatPkr(d.summary.salesPaisa)}</span>
                  <span>Diff {formatPkr(d.differencePaisa)}</span>
                  <span className="text-muted">{d.closedByName}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <input className={controlClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className={controlClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Button variant="outline" onClick={() => downloadCsv(`sales-${from}.csv`, ["Bill", "Status", "Total", "Discount", "Tax", "Channel"], orders.map((order) => [order.number, order.status, String(order.totalPaisa / 100), String(order.discountPaisa / 100), String(order.taxPaisa / 100), order.channel]))}>Sales CSV</Button>
        <Button variant="outline" onClick={() => void downloadPdf(state.settings.shopName, from, to, summary)}>PDF</Button>
        <Button variant="ghost" onClick={() => window.print()}>Print</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Sales" value={formatPkr(summary.salesPaisa)} note="Completed bills only" />
        <Stat label="Revenue before tax" value={formatPkr(summary.revenuePaisa)} />
        <Stat label="Food cost (approx)" value={formatPkr(summary.cogsPaisa)} note={summary.cogsPartial ? "Some items have no cost set" : "From recipes / cost price"} />
        <Stat label="Expenses" value={formatPkr(summary.expensesPaisa)} />
        <Stat label="Approx profit" value={formatPkr(summary.netPaisa)} note="Sales minus food cost and expenses" />
        <Stat label="Refunds" value={formatPkr(summary.refundPaisa)} note={`${summary.cancelledCount} cancelled`} />
        <Stat label="Delivery charges" value={formatPkr(summary.deliveryChargePaisa)} />
        <Stat label="Credit sales" value={formatPkr(summary.creditSalesPaisa)} />
        <Stat label="Receivables" value={formatPkr(summary.receivablesPaisa)} />
        <Stat label="Payables" value={formatPkr(summary.payablesPaisa)} />
      </div>
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-2xl">Payments on completed bills</h2>
        <p className="text-sm">Cash {formatPkr(summary.byMethod.cash)} · Card {formatPkr(summary.byMethod.card)} · Wallet {formatPkr(summary.byMethod.wallet)}</p>
        <h2 className="mt-4 font-display text-2xl">Low stock</h2>
        {summary.lowStock.length === 0 ? <p className="text-sm text-muted">Nothing is under its minimum. Set a minimum before this list fills.</p> : summary.lowStock.map((item) => <p key={item.id} className="text-sm">{item.name}: {item.qty} {item.unit} (min {item.min})</p>)}
      </section>
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-2xl">Ingredient stock & usage</h2>
        <p className="mb-3 text-sm text-muted">Current on-hand balances and movements in the selected date range.</p>
        <div className="overflow-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-muted"><tr><th className="p-2">Ingredient</th><th className="p-2">On hand</th><th className="p-2">Used (range)</th><th className="p-2">Purchased</th><th className="p-2">Wastage</th></tr></thead>
            <tbody>
              {state.ingredients.filter((item) => item.active).map((item) => {
                const moves = state.stockMovements.filter((m) => m.ingredientId === item.id && localDate(m.at) >= from && localDate(m.at) <= to);
                const used = moves.filter((m) => m.type === "sale" || m.type === "out").reduce((s, m) => s + Math.abs(Math.min(0, m.qty)), 0);
                const purchased = moves.filter((m) => m.type === "purchase").reduce((s, m) => s + Math.max(0, m.qty), 0);
                const wastage = moves.filter((m) => m.type === "wastage").reduce((s, m) => s + Math.abs(Math.min(0, m.qty)), 0);
                return (
                  <tr key={item.id} className="border-t border-border">
                    <td className="p-2 font-semibold">{item.name}</td>
                    <td className="p-2">{item.stockQty} {item.unit}</td>
                    <td className="p-2">{used} {item.unit}</td>
                    <td className="p-2">{purchased} {item.unit}</td>
                    <td className="p-2">{wastage} {item.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

async function downloadPdf(shop: string, from: string, to: string, summary: ReturnType<typeof summarize>) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const lines = [
    shop,
    `Sales report ${from} to ${to}`,
    `Completed sales: ${formatPkr(summary.salesPaisa)}`,
    `Orders: ${summary.orderCount}`,
    `Revenue before tax: ${formatPkr(summary.revenuePaisa)}`,
    `Food cost (approx): ${formatPkr(summary.cogsPaisa)}`,
    `Expenses: ${formatPkr(summary.expensesPaisa)}`,
    `Approx profit: ${formatPkr(summary.netPaisa)}`,
    `Cash: ${formatPkr(summary.byMethod.cash)}`,
    `Card: ${formatPkr(summary.byMethod.card)}`,
    `Wallet: ${formatPkr(summary.byMethod.wallet)}`,
    `Receivables: ${formatPkr(summary.receivablesPaisa)}`,
    `Payables: ${formatPkr(summary.payablesPaisa)}`,
    "Profit is revenue after discount, minus cost and expenses. It is not cash.",
    "Powered by BeerFlow Technologies",
  ];
  lines.forEach((line, index) => doc.text(line, 14, 20 + index * 8));
  doc.save(`beerflow-pos-${from}.pdf`);
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const body = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function SettingsScreen() {
  const pos = usePos();
  const state = pos.state!;
  const session = pos.session!;
  const [settings, setSettings] = useState(state.settings);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"cashier" | "owner">("cashier");
  const [oldPassword, setOldPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmReset, setConfirmReset] = useState("");
  return (
    <div className="grid max-w-3xl gap-6">
      <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-2xl">Shop</h2>
        <Field label="Name"><input className={controlClass} value={settings.shopName} onChange={(event) => setSettings({ ...settings, shopName: event.target.value })} /></Field>
        <Field label="Branch"><input className={controlClass} value={settings.branch} onChange={(event) => setSettings({ ...settings, branch: event.target.value })} /></Field>
        <Field label="Address"><textarea className={controlClass} value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} /></Field>
        <Field label="Phones" hint="Separate with commas."><input className={controlClass} value={settings.phones.join(", ")} onChange={(event) => setSettings({ ...settings, phones: event.target.value.split(",").map((phone) => phone.trim()).filter(Boolean) })} /></Field>
        <Field label="Hours"><input className={controlClass} value={settings.hours} onChange={(event) => setSettings({ ...settings, hours: event.target.value })} /></Field>
        <Field label="Receipt footer"><input className={controlClass} value={settings.receiptFooter} onChange={(event) => setSettings({ ...settings, receiptFooter: event.target.value })} /></Field>
        <Field label="Receipt width">
          <select className={controlClass} value={settings.receiptWidth} onChange={(event) => setSettings({ ...settings, receiptWidth: event.target.value as "58" | "80" })}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </select>
        </Field>
        <Field label="Date format">
          <select className={controlClass} value={settings.dateFormat} onChange={(event) => setSettings({ ...settings, dateFormat: event.target.value as "dmy" | "mdy" })}>
            <option value="dmy">30 Oct 2026</option>
            <option value="mdy">Oct 30, 2026</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.taxEnabled} onChange={(event) => setSettings({ ...settings, taxEnabled: event.target.checked })} /> Charge tax</label>
        <Field label="Tax percent"><input className={controlClass} value={String(settings.taxBps / 100)} onChange={(event) => setSettings({ ...settings, taxBps: Math.round(Number(event.target.value || 0) * 100) })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.blockNegativeStock} onChange={(event) => setSettings({ ...settings, blockNegativeStock: event.target.checked })} /> Block a sale if a recipe would take stock below zero</label>
        <Field label="Frequent: days window"><input className={controlClass} value={String(settings.tagFrequentDays)} onChange={(event) => setSettings({ ...settings, tagFrequentDays: Number(event.target.value) || 0 })} /></Field>
        <Field label="Frequent: minimum different days"><input className={controlClass} value={String(settings.tagFrequentMinDays)} onChange={(event) => setSettings({ ...settings, tagFrequentMinDays: Number(event.target.value) || 0 })} /></Field>
        <Field label="Inactive after days"><input className={controlClass} value={String(settings.tagInactiveDays)} onChange={(event) => setSettings({ ...settings, tagInactiveDays: Number(event.target.value) || 0 })} /></Field>
        <Field label="VIP spend (Rs)"><input className={controlClass} value={String(settings.tagVipSpendPaisa / 100)} onChange={(event) => setSettings({ ...settings, tagVipSpendPaisa: Math.round(Number(event.target.value || 0) * 100) })} /></Field>
        <Button onClick={() => void act(() => pos.saveSettings(settings), "Settings saved")}>Save settings</Button>
      </section>
      <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-2xl">Till logins</h2>
        <ul className="grid gap-2 text-sm">
          {state.staff.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-2">
              <span>{member.displayName} · {member.username} · {member.role}{member.active ? "" : " · off"}</span>
              <Button variant="ghost" onClick={() => void act(() => pos.setStaffActive(member.id, !member.active))}>{member.active ? "Turn off" : "Turn on"}</Button>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={controlClass} placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <input className={controlClass} placeholder="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <input className={controlClass} placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <select className={controlClass} value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="cashier">Cashier</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <Button variant="outline" onClick={() => void act(() => pos.addStaff({ username, displayName, password, role }), "Login added")}>Add login</Button>
        <Field label="Your current password"><input className={controlClass} type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} /></Field>
        <Field label="New password"><input className={controlClass} type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /></Field>
        <Button variant="outline" onClick={() => void act(() => pos.changePassword(session.userId, nextPassword, oldPassword), "Password changed")}>Change my password</Button>
      </section>
      <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-2xl">Backup</h2>
        <p className="text-sm text-muted">The backup file holds the till database and uploaded photos. Keep a copy before a big change. Restore replaces everything on this device.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void act(() => pos.backup(), "Backup downloaded")}>Download backup</Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border px-4 text-sm font-semibold">
            Restore backup
            <input className="sr-only" type="file" accept="application/json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => act(() => pos.restore(JSON.parse(text) as unknown), "Backup restored"));
            }} />
          </label>
        </div>
        <Field label="Type RESET to wipe this device and load the starter menu again">
          <input className={controlClass} value={confirmReset} onChange={(event) => setConfirmReset(event.target.value)} />
        </Field>
        <Button variant="outline" disabled={confirmReset !== "RESET"} onClick={() => void act(() => pos.resetAll())}>Reset till</Button>
      </section>
      <section className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-2xl">Uninstall</h2>
        <p className="text-sm text-muted">Remove BeerFlow POS and all of its data from this device. You will be guided through saving a backup first.</p>
        <div><Button variant="outline" onClick={() => useLifecycle.getState().setView("uninstalling")}>Uninstall BeerFlow POS…</Button></div>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <h2 className="font-display text-2xl">About</h2>
        <p className="mt-2">BeerFlow POS · by BeerFlow Technologies · v2.0.0</p>
        <p className="mt-2 text-muted">Currency is Pakistani rupees, stored as paisa so totals do not drift. Bills keep the names and prices from the moment they were saved.</p>
        {readInstall()?.mode !== "wizard" ? <p className="mt-2 text-muted">Starter logins are {STARTER_LOGINS.map((login) => `${login.username} / ${login.password}`).join(" and ")}. Change them before a real service.</p> : null}
        <div className="mt-4"><BeerflowMark /></div>
      </section>
    </div>
  );
}
