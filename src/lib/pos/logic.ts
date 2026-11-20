import { assertPaisa, businessDate, dateAtNoon, inDateRange, localDate, roundQty, uid } from "./money.ts";
import { emptyCart } from "./seed.ts";
import type {
  AppState,
  Cart,
  CartLine,
  CartTotals,
  Customer,
  Deal,
  Expense,
  Ingredient,
  LedgerEntry,
  LineConfig,
  Order,
  Party,
  PayMethod,
  PricedLine,
  Product,
  Recipe,
  Result,
  StockMovement,
} from "./types.ts";

/** Completed orders required for automatic VIP status. */
export const VIP_ORDER_THRESHOLD = 4;

/**
 * Normalize a Pakistani / local phone for matching.
 * Strips spaces, dashes, parentheses; maps +92 / 0092 / 92 prefixes to leading 0.
 * Returns empty string if nothing useful remains.
 */
export function normalizePhone(raw: string): string {
  let s = (raw ?? "").trim().replace(/[\s\-().]/g, "");
  if (!s) return "";
  if (s.startsWith("+92")) s = "0" + s.slice(3);
  else if (s.startsWith("0092")) s = "0" + s.slice(4);
  else if (s.startsWith("92") && s.length >= 12) s = "0" + s.slice(2);
  // Keep only digits
  s = s.replace(/\D/g, "");
  return s;
}

/** Case-fold and collapse internal whitespace for name matching. */
export function normalizeName(raw: string): string {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Exact customer identity = normalized name + normalized phone.
 * Both must match. Phone-only or name-only is never enough.
 */
/**
 * Exact customer identity = normalized name + normalized phone.
 * Both must be non-empty and equal. Name-only (empty phones) never merges.
 */
export function findCustomerByIdentity(
  customers: Customer[],
  name: string,
  phone: string,
): Customer | undefined {
  const nName = normalizeName(name);
  const nPhone = normalizePhone(phone);
  // Require BOTH name and phone — empty phone must not merge walk-ins by name alone.
  if (!nName || !nPhone) return undefined;
  return customers.find(
    (c) => normalizeName(c.name) === nName && normalizePhone(c.phone) === nPhone,
  );
}

/**
 * Accounting rules (shop point of view):
 * - Sale party balance = what they owe us. Credit sale increases it. Their payment decreases it.
 * - Purchase party balance = what we owe them. A credit purchase increases it. Our payment decreases it.
 * - A POS credit sale posts one ledger line. Collecting it later is only a party payment, never a second sale.
 * - Cancelled orders are not sales. Cash refunds are drawer movements, not negative sales.
 * - Estimated profit = (subtotal − discount) − snapshotted cost − operating expenses.
 *   Inventory purchases hit the drawer and stock value, not the expense list.
 * - Deal price is the deal's own price. Included items are not added again.
 *   A deal with its own recipe does not also deduct component recipes.
 */

function fail(error: string): Result<never> {
  return { ok: false, error };
}

/** Normalize common unit spellings to a short canonical key. */
function canonicalUnit(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/\./g, "");
  const aliases: Record<string, string> = {
    g: "g",
    gram: "g",
    grams: "g",
    kg: "kg",
    kilo: "kg",
    kilogram: "kg",
    kilograms: "kg",
    ml: "ml",
    millilitre: "ml",
    millilitres: "ml",
    milliliter: "ml",
    milliliters: "ml",
    l: "l",
    lt: "l",
    litre: "l",
    liters: "l",
    liter: "l",
    litres: "l",
    pcs: "pcs",
    pc: "pcs",
    piece: "pcs",
    pieces: "pcs",
    dozen: "dozen",
    doz: "dozen",
    packet: "packet",
    pkt: "packet",
    pack: "packet",
    box: "box",
  };
  return aliases[u] ?? u;
}

/**
 * Convert a quantity entered in entryUnit into the ingredient's stored unit.
 * Allowed cross-unit families only:
 *   Mass: g ↔ kg (1 kg = 1000 g)
 *   Volume: ml ↔ l (1 l = 1000 ml)
 *   Count: pcs ↔ dozen (1 dozen = 12 pcs)
 * packet and box only match themselves — never convert to/from pcs or each other.
 */
export function convertToIngredientUnit(qty: number, entryUnit: string, ingredientUnit: string): { qty: number; error?: string } {
  const from = canonicalUnit(entryUnit);
  const to = canonicalUnit(ingredientUnit);
  if (!(qty > 0)) return { qty: 0, error: "Quantity must be greater than zero." };
  if (from === to) return { qty: roundQty(qty) };
  // packet / box: only same-unit allowed (already handled above)
  if (from === "packet" || to === "packet" || from === "box" || to === "box") {
    return {
      qty: 0,
      error: "Packet/box ka conversion nahi ho sakta, stock unit wahi select karo.",
    };
  }
  const mass: Record<string, number> = { g: 1, kg: 1000 };
  const volume: Record<string, number> = { ml: 1, l: 1000 };
  const piece: Record<string, number> = { pcs: 1, dozen: 12 };
  const families = [mass, volume, piece];
  for (const family of families) {
    if (from in family && to in family) {
      return { qty: roundQty((qty * family[from]) / family[to]) };
    }
  }
  return {
    qty: 0,
    error: `Cannot convert ${entryUnit} → ${ingredientUnit}. Use matching families only: kg/g, litre/ml, or pcs/dozen.`,
  };
}

function audit(state: AppState, actor: string, action: string, detail: string) {
  state.audit.unshift({ id: uid(), at: new Date().toISOString(), actor, action, detail });
  if (state.audit.length > 400) state.audit.length = 400;
}

export function partyBalance(state: AppState, partyId: string): number {
  return state.ledger
    .filter((entry) => entry.partyId === partyId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .reduce((sum, entry) => sum + (entry.direction === "increase" ? entry.amountPaisa : -entry.amountPaisa), 0);
}

export function orderPaid(order: Order): number {
  return order.payments.reduce((sum, payment) => sum + payment.amountPaisa, 0);
}

export function orderDue(order: Order): number {
  if (order.status !== "completed") return 0;
  return Math.max(0, order.totalPaisa - orderPaid(order));
}

/** Anonymous dues only. Party credit lives on the ledger so it is not counted twice. */
export function orderReceivable(order: Order): number {
  if (order.status !== "completed" || order.onAccountPaisa > 0) return 0;
  return orderDue(order);
}

function productById(state: AppState, id: string): Product | undefined {
  return state.products.find((product) => product.id === id);
}

function dealById(state: AppState, id: string): Deal | undefined {
  return state.deals.find((deal) => deal.id === id);
}

function addonLookup(state: AppState, id: string): { name: string; pricePaisa: number } | null {
  for (const product of state.products) {
    const addon = product.addons.find((item) => item.id === id);
    if (addon) return { name: addon.name, pricePaisa: addon.pricePaisa };
  }
  return null;
}

function flavourExtra(product: Product, name: string): number | null {
  const flavour = product.flavours.find((item) => item.name === name);
  return flavour ? flavour.pricePaisa : null;
}

export function priceConfig(state: AppState, kind: CartLine["kind"], refId: string, config: LineConfig): { price: number } | { error: string } {
  if (kind === "deal") {
    const deal = dealById(state, refId);
    if (!deal) return { error: "That deal is no longer on the menu." };
    if (!deal.active) return { error: `${deal.title} is off the menu.` };
    const today = localDate();
    if (deal.validFrom && today < deal.validFrom) return { error: `${deal.title} is not valid yet.` };
    if (deal.validTo && today > deal.validTo) return { error: `${deal.title} has expired.` };
    for (const slot of deal.slots) {
      const picks = (config.picks ?? []).filter((pick) => pick.slotId === slot.id);
      const covered = picks.reduce((sum, pick) => sum + pick.qty, 0);
      if (covered !== slot.qty) return { error: `Finish the choices for ${slot.label}.` };
      if (slot.flavourRequired && picks.some((pick) => !pick.flavour)) {
        return { error: `Choose a flavour for ${slot.label}.` };
      }
    }
    let extra = 0;
    for (const pick of config.picks ?? []) {
      const product = productById(state, pick.productId);
      if (pick.flavour && product) {
        const upcharge = flavourExtra(product, pick.flavour);
        if (upcharge === null) return { error: `Flavour “${pick.flavour}” is not on the menu.` };
        extra += upcharge * Math.max(1, pick.qty);
      }
    }
    for (const addonId of config.addonIds ?? []) {
      const addon = addonLookup(state, addonId);
      if (!addon) return { error: "An extra on this deal was removed from the menu." };
      extra += addon.pricePaisa;
    }
    return { price: deal.pricePaisa + extra };
  }

  const product = productById(state, refId);
  if (!product) return { error: "That item is no longer on the menu." };
  if (!product.active) return { error: `${product.name} is off the menu.` };
  let price = product.basePricePaisa;
  // Sizes/variants apply to any product that has them — not pizza-only.
  if (product.sizes.length > 0) {
    if (!config.sizeName) return { error: `Choose a size for ${product.name}.` };
    const size = product.sizes.find((item) => item.name === config.sizeName);
    if (!size) return { error: `${config.sizeName} is not a size of ${product.name}.` };
    price = size.pricePaisa;
  }
  if (product.basePricePaisa === 0 && product.sizes.length === 0) {
    return { error: `Set a selling price for ${product.name} before selling it on its own.` };
  }
  const flavours = config.flavours ?? [];
  // Options required only when the product actually lists them.
  if (product.flavours.length > 0 && flavours.length === 0) {
    return { error: `Choose an option for ${product.name}.` };
  }
  if (flavours.length > 1 && !product.halfAndHalf) return { error: `${product.name} does not allow two options.` };
  if (flavours.length > 2) return { error: "Pick at most two options." };
  for (const name of flavours) {
    const upcharge = flavourExtra(product, name);
    if (upcharge === null) return { error: `Option “${name}” is not on the menu.` };
    price += upcharge;
  }
  for (const addonId of config.addonIds ?? []) {
    const addon = product.addons.find((item) => item.id === addonId);
    if (!addon) return { error: "An extra was removed from this item." };
    price += addon.pricePaisa;
  }
  for (const sel of config.modifierSelections ?? []) {
    const group = (product.modifierGroups ?? []).find((g) => g.id === sel.groupId);
    if (!group || !group.active) return { error: "A customization group is no longer available." };
    if (group.required && sel.optionIds.length < group.minSelections) {
      return { error: `Select at least ${group.minSelections} option(s) for ${group.name}.` };
    }
    if (sel.optionIds.length > group.maxSelections) {
      return { error: `Select at most ${group.maxSelections} option(s) for ${group.name}.` };
    }
    for (const optId of sel.optionIds) {
      const opt = group.options.find((o) => o.id === optId && o.active);
      if (!opt) return { error: `An option in "${group.name}" is no longer available.` };
      price += opt.pricePaisa;
    }
  }
  for (const group of product.modifierGroups ?? []) {
    if (!group.active || !group.required) continue;
    const sel = (config.modifierSelections ?? []).find((s) => s.groupId === group.id);
    if (!sel || sel.optionIds.length < group.minSelections) {
      return { error: `Choose required options for ${group.name}.` };
    }
  }
  return { price };
}

export function describeLine(state: AppState, line: CartLine): string {
  const bits: string[] = [];
  if (line.config.sizeName) bits.push(line.config.sizeName);
  if (line.config.flavours?.length) bits.push(line.config.flavours.join(" / "));
  for (const pick of line.config.picks ?? []) {
    const flavour = pick.flavour ? ` · ${pick.flavour}` : "";
    const size = pick.sizeName ? ` ${pick.sizeName}` : "";
    const qty = pick.qty > 1 ? `${pick.qty}× ` : "";
    bits.push(`${qty}${pick.label}${size}${flavour}`.trim());
  }
  for (const addonId of line.config.addonIds ?? []) {
    const addon = addonLookup(state, addonId);
    if (addon) bits.push(addon.name);
  }
  if (line.kind === "product") {
    const product = productById(state, line.refId);
    for (const sel of line.config.modifierSelections ?? []) {
      const group = (product?.modifierGroups ?? []).find((g) => g.id === sel.groupId);
      if (!group) continue;
      for (const optId of sel.optionIds) {
        const opt = group.options.find((o) => o.id === optId);
        if (opt) bits.push(opt.name);
      }
    }
  }
  if (line.notes.trim()) bits.push(line.notes.trim());
  return bits.join(" · ");
}

export function lineName(state: AppState, line: CartLine): string {
  if (line.kind === "deal") return dealById(state, line.refId)?.title ?? "Deal";
  const product = productById(state, line.refId);
  if (!product) return "Item";
  if (line.config.sizeName) return `${product.name} · ${line.config.sizeName}`;
  return product.name;
}

export function cartTotals(state: AppState, cart: Cart = state.cart): CartTotals {
  const lines: PricedLine[] = [];
  let error: string | null = null;
  let subtotal = 0;
  for (const line of cart.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      error = "Quantity must be at least 1.";
      continue;
    }
    const priced = priceConfig(state, line.kind, line.refId, line.config);
    if ("error" in priced) {
      error = priced.error;
      continue;
    }
    const lineTotal = priced.price * line.qty;
    subtotal += lineTotal;
    lines.push({
      line,
      name: lineName(state, line),
      detail: describeLine(state, line),
      unitPricePaisa: priced.price,
      lineTotalPaisa: lineTotal,
    });
  }
  const discount = Math.min(Math.max(0, cart.discountPaisa), subtotal);
  const delivery =
    cart.channel === "delivery" ? Math.max(0, cart.deliveryChargePaisa || 0) : 0;
  const taxable = subtotal - discount;
  const tax = state.settings.taxEnabled ? Math.round((taxable * state.settings.taxBps) / 10_000) : 0;
  return {
    lines,
    subtotalPaisa: subtotal,
    discountPaisa: discount,
    deliveryChargePaisa: delivery,
    taxPaisa: tax,
    totalPaisa: taxable + tax + delivery,
    error,
  };
}

export function patchCart(state: AppState, cart: Cart): Result<Cart> {
  if (!Number.isInteger(cart.discountPaisa) || cart.discountPaisa < 0) {
    return fail("Discount can't be negative.");
  }
  if (!Number.isInteger(cart.deliveryChargePaisa) || cart.deliveryChargePaisa < 0) {
    return fail("Delivery charge can't be negative.");
  }
  const next = structuredClone(state);
  next.cart = cart;
  // Clear delivery charge when not a delivery order to avoid accidental carry-over
  if (next.cart.channel !== "delivery") next.cart.deliveryChargePaisa = 0;
  if (next.cart.lines.length > 0 && !next.cart.idempotencyKey) next.cart.idempotencyKey = uid();
  if (next.cart.lines.length === 0) next.cart.idempotencyKey = "";
  const totals = cartTotals(next);
  if (next.cart.discountPaisa > totals.subtotalPaisa && totals.subtotalPaisa > 0) {
    return fail("Discount is larger than the subtotal.");
  }
  return { ok: true, state: next, value: next.cart };
}

interface CheckoutInput {
  actorId: string;
  actorName: string;
  tenders: { method: PayMethod; tenderedPaisa: number }[];
  at?: string;
}

/**
 * Resolve the recipe for a product + size.
 * Prefer an exact size match. Fall back to a size-less recipe only when no size-specific
 * recipes exist for the product at all. If size-specific recipes exist but the chosen size
 * is missing, return undefined so the caller can surface a validation warning.
 */
/**
 * Resolve the best recipe for a product configuration.
 * Priority: product+size+flavour > product+size > product+flavour > product only.
 */
function recipeForProduct(
  state: AppState,
  productId: string,
  sizeName: string | null,
  flavourName?: string | null,
): Recipe | undefined {
  const matches = state.recipes.filter(
    (r) => r.active && r.productId === productId && !r.isAdjustment && !r.dealId,
  );
  if (matches.length === 0) return undefined;
  if (sizeName && flavourName) {
    const exact = matches.find(
      (r) => r.sizeName === sizeName && (r.flavourName ?? null) === flavourName,
    );
    if (exact) return exact;
  }
  if (sizeName) {
    const sizeOnly = matches.find((r) => r.sizeName === sizeName && !(r.flavourName));
    if (sizeOnly) return sizeOnly;
    const hasAnySized = matches.some((r) => !!r.sizeName);
    if (hasAnySized) return undefined;
  }
  if (flavourName) {
    const flavOnly = matches.find(
      (r) => !(r.sizeName) && (r.flavourName ?? null) === flavourName,
    );
    if (flavOnly) return flavOnly;
  }
  return matches.find((r) => !r.sizeName && !r.flavourName) ?? matches[0];
}

/** Collect adjustment recipes that match selected modifier option IDs. */
function adjustmentRecipesFor(
  state: AppState,
  productId: string,
  selectedOptionIds: string[],
): Recipe[] {
  if (!selectedOptionIds.length) return [];
  return state.recipes.filter((r) => {
    if (!r.active || !r.isAdjustment || r.productId !== productId) return false;
    const required = r.requiredModifierOptionIds ?? [];
    if (!required.length) return false;
    return required.every((id) => selectedOptionIds.includes(id));
  });
}

interface PlannedMove {
  ingredientId: string | null;
  productId: string | null;
  qty: number;
  unitCostPaisa: number;
  totalCostPaisa: number;
}

function pushRecipeMoves(state: AppState, recipe: Recipe, times: number, into: PlannedMove[]) {
  for (const line of recipe.lines) {
    const ingredient = state.ingredients.find((item) => item.id === line.ingredientId);
    if (!ingredient) continue;
    const qty = -roundQty(line.qty * times);
    const unit = ingredient.avgCostPaisa;
    into.push({
      ingredientId: ingredient.id,
      productId: null,
      qty,
      unitCostPaisa: unit,
      totalCostPaisa: Math.round(Math.abs(qty) * unit),
    });
  }
}

/** Deduct extra ingredient quantities linked to selected add-ons (e.g. Extra Cheese +50g). */
function pushAddonMoves(state: AppState, product: Product | undefined, addonIds: string[] | undefined, times: number, into: PlannedMove[]) {
  if (!product || !addonIds?.length) return;
  for (const addonId of addonIds) {
    const addon = product.addons.find((item) => item.id === addonId);
    if (!addon?.ingredientId || !(addon.extraQty && addon.extraQty > 0)) continue;
    const ingredient = state.ingredients.find((item) => item.id === addon.ingredientId);
    if (!ingredient) continue;
    const qty = -roundQty(addon.extraQty * times);
    const unit = ingredient.avgCostPaisa;
    into.push({
      ingredientId: ingredient.id,
      productId: null,
      qty,
      unitCostPaisa: unit,
      totalCostPaisa: Math.round(Math.abs(qty) * unit),
    });
  }
}

/** Collect selected modifier option IDs from a line config. */
function selectedModifierOptionIds(config: LineConfig): string[] {
  const ids: string[] = [];
  for (const sel of config.modifierSelections ?? []) {
    ids.push(...sel.optionIds);
  }
  return ids;
}

/**
 * Apply ingredient additions / removals coming from selected modifier options
 * and from legacy addons that carry ingredientId + extraQty.
 */
function pushModifierAndAddonMoves(
  state: AppState,
  product: Product | undefined,
  config: LineConfig,
  times: number,
  into: PlannedMove[],
) {
  if (!product) return;
  pushAddonMoves(state, product, config.addonIds, times, into);
  const optionIds = selectedModifierOptionIds(config);
  if (!optionIds.length) return;
  for (const group of product.modifierGroups ?? []) {
    for (const opt of group.options) {
      if (!optionIds.includes(opt.id)) continue;
      if (opt.ingredientId && opt.ingredientQty) {
        const ingredient = state.ingredients.find((i) => i.id === opt.ingredientId);
        if (!ingredient) continue;
        const qty = -roundQty(opt.ingredientQty * times);
        const unit = ingredient.avgCostPaisa;
        into.push({
          ingredientId: ingredient.id,
          productId: null,
          qty,
          unitCostPaisa: unit,
          totalCostPaisa: Math.round(Math.abs(qty) * unit),
        });
      }
    }
  }
  for (const adj of adjustmentRecipesFor(state, product.id, optionIds)) {
    pushRecipeMoves(state, adj, times, into);
  }
}

/**
 * Resolve and apply recipes for a single product line, correctly handling
 * half-and-half flavour splitting and size / flavour specificity.
 */
function consumeProductLine(
  state: AppState,
  product: Product | undefined,
  config: LineConfig,
  times: number,
  into: PlannedMove[],
): boolean {
  if (!product) return false;
  const sizeName = config.sizeName ?? null;
  const flavours = config.flavours ?? [];
  let covered = false;

  if (flavours.length === 2 && product.halfAndHalf) {
    const base = recipeForProduct(state, product.id, sizeName, null);
    if (base) {
      pushRecipeMoves(state, base, times, into);
      covered = true;
    }
    for (const flavour of flavours) {
      const flavRecipe = recipeForProduct(state, product.id, sizeName, flavour);
      if (flavRecipe && flavRecipe !== base) {
        pushRecipeMoves(state, flavRecipe, times * 0.5, into);
        covered = true;
      }
    }
  } else if (flavours.length === 1) {
    const recipe = recipeForProduct(state, product.id, sizeName, flavours[0]);
    if (recipe) {
      pushRecipeMoves(state, recipe, times, into);
      covered = true;
    }
  } else {
    const recipe = recipeForProduct(state, product.id, sizeName, null);
    if (recipe) {
      pushRecipeMoves(state, recipe, times, into);
      covered = true;
    }
  }

  pushModifierAndAddonMoves(state, product, config, times, into);

  if (!covered && product.trackStock) {
    const unit = product.costPricePaisa ?? 0;
    into.push({
      ingredientId: null,
      productId: product.id,
      qty: -times,
      unitCostPaisa: unit,
      totalCostPaisa: unit * times,
    });
    covered = true;
  }
  return covered;
}

function planConsumption(state: AppState, lines: PricedLine[]): { moves: PlannedMove[]; cogs: number; partial: boolean } {
  const moves: PlannedMove[] = [];
  let cogs = 0;
  let partial = false;
  for (const priced of lines) {
    const times = priced.line.qty;
    if (priced.line.kind === "deal") {
      const recipe = state.recipes.find((item) => item.active && item.dealId === priced.line.refId && !item.isAdjustment);
      if (recipe) {
        pushRecipeMoves(state, recipe, times, moves);
        for (const addonId of priced.line.config.addonIds ?? []) {
          for (const product of state.products) {
            if (product.addons.some((a) => a.id === addonId && a.ingredientId && a.extraQty)) {
              pushAddonMoves(state, product, [addonId], times, moves);
              break;
            }
          }
        }
        continue;
      }
      let covered = false;
      for (const pick of priced.line.config.picks ?? []) {
        const product = productById(state, pick.productId);
        const portion = times * Math.max(1, pick.qty);
        const pickConfig: LineConfig = {
          sizeName: pick.sizeName ?? undefined,
          flavours: pick.flavour ? [pick.flavour] : undefined,
          addonIds: priced.line.config.addonIds,
          modifierSelections: priced.line.config.modifierSelections,
        };
        if (consumeProductLine(state, product, pickConfig, portion, moves)) covered = true;
      }
      if (!covered) partial = true;
      continue;
    }
    const product = productById(state, priced.line.refId);
    const covered = consumeProductLine(state, product, priced.line.config, times, moves);
    if (!covered) partial = true;
  }
  const aggregated = new Map<string, PlannedMove>();
  for (const move of moves) {
    const key = `${move.ingredientId ?? ""}|${move.productId ?? ""}|${move.unitCostPaisa}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.qty = roundQty(existing.qty + move.qty);
      existing.totalCostPaisa += move.totalCostPaisa;
    } else {
      aggregated.set(key, { ...move });
    }
  }
  const finalMoves = [...aggregated.values()];
  for (const move of finalMoves) cogs += move.totalCostPaisa;
  return { moves: finalMoves, cogs, partial };
}
function applyMove(state: AppState, move: Omit<StockMovement, "id">) {
  state.stockMovements.push({ ...move, id: uid() });
  if (move.ingredientId) {
    const ingredient = state.ingredients.find((item) => item.id === move.ingredientId);
    if (!ingredient) return;
    if (move.type === "purchase" && move.qty > 0) {
      // Weighted average costing — keep fractional precision (e.g. 4.5 paisa/g).
      // newAvg = (max(existingQty,0) * avgCost + purchaseValue) / (max(existingQty,0) + purchaseQty)
      // Negative stock treated as zero quantity for the value pool.
      // Old integer avgCostPaisa values remain valid (backward compatible).
      const baseQty = Math.max(ingredient.stockQty, 0);
      const purchaseQty = move.qty;
      const nextQty = roundQty(ingredient.stockQty + purchaseQty);
      const valuePool = baseQty * ingredient.avgCostPaisa + move.totalCostPaisa;
      const denom = baseQty + purchaseQty;
      if (denom > 0) {
        ingredient.avgCostPaisa = valuePool / denom;
      }
      ingredient.stockQty = nextQty;
      return;
    }
    // Wastage, sale, adjustment, return: quantity changes, average cost is preserved.
    ingredient.stockQty = roundQty(ingredient.stockQty + move.qty);
  }
  if (move.productId) {
    const product = productById(state, move.productId);
    if (product) product.stockQty = roundQty(product.stockQty + move.qty);
  }
}

function stockWouldGoNegative(state: AppState, moves: PlannedMove[]): string | null {
  const ingredientQty = new Map(state.ingredients.map((item) => [item.id, item.stockQty]));
  const productQty = new Map(state.products.map((item) => [item.id, item.stockQty]));
  for (const move of moves) {
    if (move.ingredientId) {
      const next = roundQty((ingredientQty.get(move.ingredientId) ?? 0) + move.qty);
      ingredientQty.set(move.ingredientId, next);
      if (next < -0.0001) {
        const name = state.ingredients.find((item) => item.id === move.ingredientId)?.name ?? "An ingredient";
        return `${name} would go below zero. Turn off “block negative stock” or receive stock first.`;
      }
    }
    if (move.productId) {
      const next = roundQty((productQty.get(move.productId) ?? 0) + move.qty);
      productQty.set(move.productId, next);
      if (next < -0.0001) {
        const name = productById(state, move.productId)?.name ?? "An item";
        return `${name} would go below zero.`;
      }
    }
  }
  return null;
}

export function checkout(state: AppState, input: CheckoutInput): Result<{ orderId: string; changePaisa: number; duplicate: boolean }> {
  const key = state.cart.idempotencyKey;
  if (key) {
    const existing = state.orders.find((order) => order.idempotencyKey === key);
    if (existing) {
      const next = structuredClone(state);
      next.cart = emptyCart();
      return { ok: true, state: next, value: { orderId: existing.id, changePaisa: 0, duplicate: true } };
    }
  }
  const totals = cartTotals(state);
  if (totals.error) return fail(totals.error);
  if (totals.lines.length === 0) return fail("The cart is empty.");
  if (state.cart.discountPaisa > totals.subtotalPaisa) return fail("Discount is larger than the subtotal.");
  const discountError = assertPaisa(state.cart.discountPaisa, "Discount");
  if (discountError) return fail(discountError);
  if (state.cart.channel === "delivery" && !state.cart.phone.trim()) {
    return fail("Delivery needs a phone number.");
  }

  const enabled = new Set(state.settings.paymentMethods.filter((method) => method.enabled).map((method) => method.id));
  let remaining = totals.totalPaisa;
  let change = 0;
  const payments: Order["payments"] = [];
  const at = input.at ?? new Date().toISOString();
  const tenders = [...input.tenders].sort((a, b) => Number(a.method === "cash") - Number(b.method === "cash"));
  for (const tender of tenders) {
    const error = assertPaisa(tender.tenderedPaisa, "Payment");
    if (error) return fail(error);
    if (tender.tenderedPaisa === 0) continue;
    if (!enabled.has(tender.method)) return fail("That payment method is turned off.");
    const applied = Math.min(tender.tenderedPaisa, remaining);
    if (tender.method === "cash") change += tender.tenderedPaisa - applied;
    else if (tender.tenderedPaisa > remaining) return fail("Card and wallet can't be more than the amount due.");
    if (applied > 0) {
      payments.push({ id: uid(), method: tender.method, amountPaisa: applied, at });
      remaining -= applied;
    }
  }
  if (remaining > 0 && !state.cart.partyId && !state.cart.customerName.trim()) {
    return fail("Add a customer name, or choose a credit party, for the unpaid balance.");
  }
  if (remaining > 0 && state.cart.partyId) {
    const party = state.parties.find((item) => item.id === state.cart.partyId);
    if (!party || party.kind !== "sale") return fail("Put unpaid bills on a customer credit party, not a supplier.");
  }

  const planned = planConsumption(state, totals.lines);
  if (state.settings.blockNegativeStock) {
    const blocked = stockWouldGoNegative(state, planned.moves);
    if (blocked) return fail(blocked);
  }

  const next = structuredClone(state);
  const orderId = uid();
  const number = `PP-${String(next.meta.nextOrder).padStart(4, "0")}`;
  next.meta.nextOrder += 1;
  let customerId = next.cart.customerId;
  if (!customerId && next.cart.customerName.trim()) {
    const name = next.cart.customerName.trim();
    const phone = next.cart.phone.trim();
    // Exact identity: normalized name + normalized phone. Never merge on phone alone.
    const found = findCustomerByIdentity(next.customers, name, phone);
    if (found) {
      customerId = found.id;
      // Optionally refresh address if the cart has a newer one and existing is empty
      if (next.cart.address.trim() && !found.address.trim()) {
        const idx = next.customers.findIndex((c) => c.id === found.id);
        if (idx >= 0) next.customers[idx] = { ...found, address: next.cart.address.trim() };
      }
    } else {
      customerId = uid();
      next.customers.push({
        id: customerId,
        name,
        phone,
        address: next.cart.address.trim(),
        notes: "",
        manualTags: [],
        partyId: next.cart.partyId,
        createdAt: at,
      });
    }
  }

  const order: Order = {
    id: orderId,
    number,
    createdAt: at,
    status: "completed",
    channel: next.cart.channel,
    tableNo: next.cart.tableNo.trim(),
    customerId,
    customerName: next.cart.customerName.trim(),
    phone: next.cart.phone.trim(),
    address: next.cart.address.trim(),
    notes: next.cart.notes.trim(),
    partyId: remaining > 0 ? next.cart.partyId : null,
    onAccountPaisa: remaining > 0 && next.cart.partyId ? remaining : 0,
    subtotalPaisa: totals.subtotalPaisa,
    discountPaisa: totals.discountPaisa,
    deliveryChargePaisa: totals.deliveryChargePaisa,
    taxPaisa: totals.taxPaisa,
    totalPaisa: totals.totalPaisa,
    cogsPaisa: planned.cogs,
    cogsPartial: planned.partial,
    items: totals.lines.map((priced) => ({
      id: uid(),
      kind: priced.line.kind,
      refId: priced.line.refId,
      name: priced.name,
      qty: priced.line.qty,
      unitPricePaisa: priced.unitPricePaisa,
      lineTotalPaisa: priced.lineTotalPaisa,
      notes: priced.line.notes,
      detail: priced.detail,
      config: priced.line.config,
    })),
    payments,
    refunds: [],
    cashierId: input.actorId,
    cashierName: input.actorName,
    idempotencyKey: key || uid(),
    cancelReason: "",
    cancelledAt: null,
  };
  next.orders.push(order);
  for (const move of planned.moves) {
    applyMove(next, {
      at,
      ingredientId: move.ingredientId,
      productId: move.productId,
      type: "sale",
      qty: move.qty,
      unitCostPaisa: move.unitCostPaisa,
      totalCostPaisa: move.totalCostPaisa,
      method: "none",
      partyId: null,
      orderId,
      reason: `Sale ${number}`,
    });
  }
  if (order.onAccountPaisa > 0 && order.partyId) {
    next.ledger.push({
      id: uid(),
      partyId: order.partyId,
      at,
      type: "credit_sale",
      direction: "increase",
      amountPaisa: order.onAccountPaisa,
      method: "none",
      description: `Credit sale ${number}`,
      orderId,
      reversalOf: null,
      reversed: false,
    });
  }
  audit(next, input.actorName, "sale", `${number} · ${order.totalPaisa}`);
  next.cart = emptyCart();
  return { ok: true, state: next, value: { orderId, changePaisa: change, duplicate: false } };
}

export function collectOrderPayment(
  state: AppState,
  orderId: string,
  method: PayMethod,
  amountPaisa: number,
  actor: string,
): Result<string> {
  const error = assertPaisa(amountPaisa, "Payment");
  if (error) return fail(error);
  if (amountPaisa === 0) return fail("Enter an amount.");
  const next = structuredClone(state);
  const order = next.orders.find((item) => item.id === orderId);
  if (!order || order.status !== "completed") return fail("That bill can't take a payment.");
  if (order.onAccountPaisa > 0) return fail("This balance is on the party ledger. Receive it there so it isn't counted twice.");
  const due = orderDue(order);
  if (amountPaisa > due) return fail("That is more than the balance due.");
  order.payments.push({ id: uid(), method, amountPaisa, at: new Date().toISOString() });
  audit(next, actor, "payment", `${order.number} · ${amountPaisa}`);
  return { ok: true, state: next, value: order.id };
}

export function cancelOrder(state: AppState, orderId: string, reason: string, actor: string): Result<string> {
  const clean = reason.trim();
  if (clean.length < 3) return fail("Say why this bill is being cancelled.");
  const next = structuredClone(state);
  const order = next.orders.find((item) => item.id === orderId);
  if (!order) return fail("Bill not found.");
  if (order.status === "cancelled") return fail("This bill is already cancelled.");
  const orderDay = localDate(order.createdAt);
  if (isDayClosed(state, orderDay)) {
    return fail(`Day ${orderDay} is closed. Reopen the day first (owner) before cancelling this bill.`);
  }
  const at = new Date().toISOString();
  order.status = "cancelled";
  order.cancelReason = clean;
  order.cancelledAt = at;
  for (const payment of order.payments) {
    order.refunds.push({ id: uid(), method: payment.method, amountPaisa: payment.amountPaisa, at });
  }
  const sales = next.stockMovements.filter((move) => move.orderId === order.id && move.type === "sale");
  for (const move of sales) {
    applyMove(next, {
      at,
      ingredientId: move.ingredientId,
      productId: move.productId,
      type: "reversal",
      qty: -move.qty,
      unitCostPaisa: move.unitCostPaisa,
      totalCostPaisa: move.totalCostPaisa,
      method: "none",
      partyId: null,
      orderId: order.id,
      reason: `Cancel ${order.number}: ${clean}`,
    });
  }
  for (const entry of next.ledger.filter((item) => item.orderId === order.id && !item.reversed)) {
    entry.reversed = true;
    next.ledger.push({
      id: uid(),
      partyId: entry.partyId,
      at,
      type: "refund",
      direction: entry.direction === "increase" ? "decrease" : "increase",
      amountPaisa: entry.amountPaisa,
      method: "none",
      description: `Reversal of ${order.number}`,
      orderId: order.id,
      reversalOf: entry.id,
      reversed: false,
    });
  }
  audit(next, actor, "cancel", `${order.number}: ${clean}`);
  return { ok: true, state: next, value: order.id };
}

function skuTaken(state: AppState, sku: string, exceptId: string): boolean {
  return state.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase() && product.id !== exceptId);
}

export function saveProduct(state: AppState, product: Product, actor: string): Result<string> {
  const name = product.name.trim();
  if (name.length < 2) return fail("Give the item a name.");
  if (!state.categories.some((category) => category.id === product.categoryId)) return fail("Pick a category.");
  const priceError = assertPaisa(product.basePricePaisa, "Price");
  if (priceError) return fail(priceError);
  if (product.costPricePaisa !== null) {
    const costError = assertPaisa(product.costPricePaisa, "Cost");
    if (costError) return fail(costError);
  }
  for (const size of product.sizes) {
    if (!size.name.trim()) return fail("Every size needs a name.");
    const error = assertPaisa(size.pricePaisa, size.name);
    if (error) return fail(error);
  }
  for (const flavour of product.flavours) {
    if (!flavour.name.trim()) return fail("Every flavour needs a name.");
    const error = assertPaisa(flavour.pricePaisa, flavour.name);
    if (error) return fail(error);
  }
  for (const addon of product.addons) {
    if (!addon.name.trim()) return fail("Every extra needs a name.");
    const error = assertPaisa(addon.pricePaisa, addon.name);
    if (error) return fail(error);
  }
  // Any product may have sizes / options / addons — not pizza-only.
  // If sizes are listed, at least one is required; otherwise a plain selling price is fine.
  if (product.sizes.length === 0 && product.basePricePaisa === 0) {
    return fail("Set a selling price, or add at least one size/variant with a price.");
  }
  const next = structuredClone(state);
  const id = product.id || uid();
  const sku = product.sku.trim() || `IT-${id.slice(0, 6).toUpperCase()}`;
  if (skuTaken(next, sku, id)) return fail("That item code is already used.");
  const duplicate = next.products.find(
    (item) => item.id !== id && item.categoryId === product.categoryId && item.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) return fail("An item in this category already uses that name.");
  for (const group of product.modifierGroups ?? []) {
    if (!group.name.trim()) return fail("Every customization group needs a name.");
    if (group.minSelections < 0 || group.maxSelections < group.minSelections) {
      return fail(`Invalid selection limits on group "${group.name}".`);
    }
    for (const opt of group.options) {
      if (!opt.name.trim()) return fail(`Every option in "${group.name}" needs a name.`);
      const err = assertPaisa(opt.pricePaisa, opt.name);
      if (err) return fail(err);
    }
  }
  const saved: Product = {
    ...product,
    id,
    name,
    sku,
    description: product.description.trim(),
    sizes: product.sizes,
    flavours: product.flavours,
    halfAndHalf: product.halfAndHalf && product.flavours.length > 0,
    addons: product.addons,
    modifierGroups: product.modifierGroups ?? [],
    stockQty: product.trackStock ? product.stockQty : 0,
    prepNotes: product.prepNotes?.trim() || undefined,
  };
  const index = next.products.findIndex((item) => item.id === id);
  if (index >= 0) {
    const previous = next.products[index]!;
    if (saved.trackStock && saved.stockQty !== previous.stockQty) {
      next.stockMovements.push({
        id: uid(),
        at: new Date().toISOString(),
        ingredientId: null,
        productId: id,
        type: "adjustment",
        qty: roundQty(saved.stockQty - previous.stockQty),
        unitCostPaisa: saved.costPricePaisa ?? 0,
        totalCostPaisa: 0,
        method: "none",
        partyId: null,
        orderId: null,
        reason: "Count updated on the item form",
      });
    }
    next.products[index] = saved;
  } else {
    if (saved.trackStock && saved.stockQty !== 0) {
      next.stockMovements.push({
        id: uid(),
        at: new Date().toISOString(),
        ingredientId: null,
        productId: id,
        type: "adjustment",
        qty: saved.stockQty,
        unitCostPaisa: saved.costPricePaisa ?? 0,
        totalCostPaisa: 0,
        method: "none",
        partyId: null,
        orderId: null,
        reason: "Opening count on the item form",
      });
    }
    next.products.push(saved);
  }
  audit(next, actor, index >= 0 ? "edit-item" : "add-item", name);
  return { ok: true, state: next, value: id };
}

function productReferenced(state: AppState, id: string): boolean {
  if (state.orders.some((order) => order.items.some((item) => item.refId === id))) return true;
  if (state.deals.some((deal) => deal.slots.some((slot) => slot.productId === id || slot.choiceProductIds.includes(id)))) {
    return true;
  }
  return state.recipes.some((recipe) => recipe.productId === id);
}

export function removeProduct(state: AppState, id: string, actor: string): Result<{ archived: boolean }> {
  const next = structuredClone(state);
  const product = next.products.find((item) => item.id === id);
  if (!product) return fail("Item not found.");
  if (productReferenced(next, id)) {
    product.active = false;
    audit(next, actor, "archive-item", product.name);
    return { ok: true, state: next, value: { archived: true } };
  }
  next.products = next.products.filter((item) => item.id !== id);
  audit(next, actor, "delete-item", product.name);
  return { ok: true, state: next, value: { archived: false } };
}

/** Create or update a menu category. Kind drives POS tab grouping. */
export function saveCategory(
  state: AppState,
  input: { id?: string; name: string; kind: import("./types.ts").CategoryKind; sort?: number; active?: boolean },
  actor: string,
): Result<string> {
  const name = (input.name ?? "").trim();
  if (name.length < 2) return fail("Category name must be at least 2 characters.");
  const kind = input.kind || "other";
  const next = structuredClone(state);
  const id = input.id?.trim() || uid();
  const existing = next.categories.find((c) => c.id === id);
  if (existing) {
    existing.name = name;
    existing.kind = kind;
    if (input.sort !== undefined) existing.sort = input.sort;
    if (input.active !== undefined) existing.active = input.active;
    audit(next, actor, "edit-category", name);
  } else {
    if (next.categories.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      return fail("A category with that name already exists.");
    }
    next.categories.push({
      id,
      name,
      kind,
      sort: input.sort ?? next.categories.length + 1,
      active: input.active ?? true,
    });
    audit(next, actor, "add-category", name);
  }
  return { ok: true, state: next, value: id };
}

/** Soft-hide a category (does not delete products). */
export function archiveCategory(state: AppState, id: string, actor: string): Result<string> {
  const next = structuredClone(state);
  const cat = next.categories.find((c) => c.id === id);
  if (!cat) return fail("Category not found.");
  cat.active = false;
  audit(next, actor, "archive-category", cat.name);
  return { ok: true, state: next, value: id };
}

export function saveDeal(state: AppState, deal: Deal, actor: string): Result<string> {
  const title = deal.title.trim();
  if (title.length < 2) return fail("Give the deal a title.");
  const priceError = assertPaisa(deal.pricePaisa, "Deal price");
  if (priceError) return fail(priceError);
  if (deal.compareAtPaisa !== null) {
    const compareError = assertPaisa(deal.compareAtPaisa, "Compare price");
    if (compareError) return fail(compareError);
  }
  if (deal.slots.length === 0) return fail("Add what the deal includes.");
  for (const slot of deal.slots) {
    if (!slot.label.trim()) return fail("Each included row needs a label.");
    if (!Number.isInteger(slot.qty) || slot.qty < 1) return fail("Included quantity must be at least 1.");
    if (slot.mode === "fixed" && !slot.productId) return fail(`Pick the item for “${slot.label}”.`);
    if (slot.mode === "pizza" && !slot.sizeName) return fail(`Pick a size for “${slot.label}”.`);
    if (slot.mode === "choice" && slot.choiceProductIds.length === 0) return fail(`Add choices for “${slot.label}”.`);
  }
  if (deal.validFrom && deal.validTo && deal.validFrom > deal.validTo) return fail("The end date is before the start date.");
  const next = structuredClone(state);
  const id = deal.id || uid();
  const duplicate = next.deals.find((item) => item.id !== id && item.title.trim().toLowerCase() === title.toLowerCase());
  if (duplicate) return fail("A deal with that title already exists.");
  const saved: Deal = { ...deal, id, title, description: deal.description.trim(), notes: deal.notes.trim() };
  const index = next.deals.findIndex((item) => item.id === id);
  if (index >= 0) next.deals[index] = saved;
  else next.deals.push(saved);
  audit(next, actor, index >= 0 ? "edit-deal" : "add-deal", title);
  return { ok: true, state: next, value: id };
}

export function removeDeal(state: AppState, id: string, actor: string): Result<{ archived: boolean }> {
  const next = structuredClone(state);
  const deal = next.deals.find((item) => item.id === id);
  if (!deal) return fail("Deal not found.");
  const used = next.orders.some((order) => order.items.some((item) => item.refId === id));
  if (used) {
    deal.active = false;
    audit(next, actor, "archive-deal", deal.title);
    return { ok: true, state: next, value: { archived: true } };
  }
  next.deals = next.deals.filter((item) => item.id !== id);
  next.recipes = next.recipes.filter((recipe) => recipe.dealId !== id);
  audit(next, actor, "delete-deal", deal.title);
  return { ok: true, state: next, value: { archived: false } };
}

export function saveCustomer(state: AppState, customer: Customer, actor: string): Result<string> {
  const name = customer.name.trim();
  if (name.length < 2) return fail("Customer name is required.");
  const next = structuredClone(state);
  const id = customer.id || uid();
  const nName = normalizeName(name);
  const nPhone = normalizePhone(customer.phone);
  // Conflict only when both name and phone match another record (exact identity).
  // Same phone with a different name is allowed — they are different people.
  if (nName && nPhone) {
    const clash = next.customers.find(
      (item) =>
        item.id !== id &&
        normalizeName(item.name) === nName &&
        normalizePhone(item.phone) === nPhone,
    );
    if (clash) return fail("A customer with that exact name and phone already exists.");
  }
  // Strip any manually forced VIP tag — VIP is derived from completed order count only.
  const manualTags = (customer.manualTags ?? []).filter((t) => t.toUpperCase() !== "VIP");
  const saved: Customer = {
    ...customer,
    id,
    name,
    phone: customer.phone.trim(),
    address: customer.address.trim(),
    notes: customer.notes.trim(),
    manualTags,
    createdAt: customer.createdAt || new Date().toISOString(),
  };
  const index = next.customers.findIndex((item) => item.id === id);
  if (index >= 0) next.customers[index] = saved;
  else next.customers.push(saved);
  audit(next, actor, "customer", name);
  return { ok: true, state: next, value: id };
}

/** True when the customer has at least VIP_ORDER_THRESHOLD completed (non-cancelled) orders. */
export function isVipCustomer(state: AppState, customerId: string | null | undefined): boolean {
  if (!customerId) return false;
  const completed = state.orders.filter(
    (order) => order.status === "completed" && order.customerId === customerId,
  ).length;
  return completed >= VIP_ORDER_THRESHOLD;
}

export function customerStats(state: AppState, customerId: string, now = new Date()) {
  const settings = state.settings;
  const orders = state.orders.filter((order) => order.status === "completed" && order.customerId === customerId);
  const days = new Set(orders.map((order) => businessDate(order.createdAt)));
  const spend = orders.reduce((sum, order) => sum + order.subtotalPaisa - order.discountPaisa, 0);
  const sorted = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = sorted[0]?.createdAt ?? null;
  const last = sorted[sorted.length - 1]?.createdAt ?? null;
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - settings.tagFrequentDays);
  const recentDays = new Set(
    orders.filter((order) => new Date(order.createdAt) >= windowStart).map((order) => businessDate(order.createdAt)),
  );
  const counts = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) counts.set(item.name, (counts.get(item.name) ?? 0) + item.qty);
  }
  const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const customer = state.customers.find((item) => item.id === customerId);
  const tags = new Set((customer?.manualTags ?? []).filter((t) => t.toUpperCase() !== "VIP"));
  // VIP is strictly derived from completed order count (4+). Not spend, not manual tags.
  if (orders.length >= VIP_ORDER_THRESHOLD) tags.add("VIP");
  if (recentDays.size >= settings.tagFrequentMinDays) tags.add("Frequent");
  const inactiveCutoff = new Date(now);
  inactiveCutoff.setDate(inactiveCutoff.getDate() - settings.tagInactiveDays);
  if (last && new Date(last) < inactiveCutoff) tags.add("Inactive");
  const newCutoff = new Date(now);
  newCutoff.setDate(newCutoff.getDate() - settings.tagNewDays);
  if (!first || new Date(first) >= newCutoff) tags.add("New");
  return {
    visits: orders.length,
    distinctDays: days.size,
    recentDays: recentDays.size,
    spendPaisa: spend,
    first,
    last,
    favourite,
    tags: [...tags],
  };
}

export function saveParty(
  state: AppState,
  input: { id?: string; name: string; kind: Party["kind"]; phone: string; address: string; notes: string; openingPaisa: number },
  actor: string,
): Result<string> {
  const name = input.name.trim();
  if (name.length < 2) return fail("Party name is required.");
  const openingError = assertPaisa(Math.abs(input.openingPaisa), "Opening balance");
  if (!Number.isInteger(input.openingPaisa) || openingError) return fail(openingError ?? "Opening balance is invalid.");
  const next = structuredClone(state);
  const existing = input.id ? next.parties.find((party) => party.id === input.id) : undefined;
  if (existing) {
    if (existing.kind !== input.kind && next.ledger.some((entry) => entry.partyId === existing.id)) {
      return fail("This party already has ledger history, so its type can't change.");
    }
    existing.name = name;
    existing.kind = input.kind;
    existing.phone = input.phone.trim();
    existing.address = input.address.trim();
    existing.notes = input.notes.trim();
    audit(next, actor, "edit-party", name);
    return { ok: true, state: next, value: existing.id };
  }
  const id = uid();
  const party: Party = {
    id,
    name,
    kind: input.kind,
    phone: input.phone.trim(),
    address: input.address.trim(),
    notes: input.notes.trim(),
    createdAt: new Date().toISOString(),
    active: true,
  };
  next.parties.push(party);
  if (input.openingPaisa !== 0) {
    next.ledger.push({
      id: uid(),
      partyId: id,
      at: party.createdAt,
      type: "opening",
      direction: input.openingPaisa > 0 ? "increase" : "decrease",
      amountPaisa: Math.abs(input.openingPaisa),
      method: "none",
      description: "Opening balance",
      orderId: null,
      reversalOf: null,
      reversed: false,
    });
  }
  audit(next, actor, "add-party", name);
  return { ok: true, state: next, value: id };
}

/** Archive a party. Ledger history and balance are kept. Cannot archive if balance is non-zero unless forced by owner note. */
export function archiveParty(state: AppState, partyId: string, actor: string, force = false): Result<string> {
  const next = structuredClone(state);
  const party = next.parties.find((p) => p.id === partyId);
  if (!party) return fail("Party not found.");
  if (party.active === false) return fail("Already archived.");
  const balance = partyBalance(next, partyId);
  if (balance !== 0 && !force) {
    return fail(
      `Balance is still ${balance > 0 ? "outstanding" : "in credit"} (${Math.abs(balance) / 100} Rs). Clear the balance first, or force-archive as owner.`,
    );
  }
  party.active = false;
  audit(next, actor, "archive-party", party.name);
  return { ok: true, state: next, value: partyId };
}

export function restoreParty(state: AppState, partyId: string, actor: string): Result<string> {
  const next = structuredClone(state);
  const party = next.parties.find((p) => p.id === partyId);
  if (!party) return fail("Party not found.");
  if (party.active !== false) return fail("Party is already active.");
  party.active = true;
  audit(next, actor, "restore-party", party.name);
  return { ok: true, state: next, value: partyId };
}

export function postLedger(
  state: AppState,
  input: {
    partyId: string;
    type: "customer_payment" | "supplier_payment" | "purchase" | "credit_sale" | "adjustment";
    amountPaisa: number;
    method: LedgerEntry["method"];
    description: string;
    day: string;
    direction?: "increase" | "decrease";
  },
  actor: string,
): Result<string> {
  const amountError = assertPaisa(input.amountPaisa, "Amount");
  if (amountError) return fail(amountError);
  if (input.amountPaisa === 0) return fail("Enter an amount.");
  if (input.description.trim().length < 3) return fail("Add a short note so this entry can be traced.");
  const at = dateAtNoon(input.day);
  if (!at) return fail("That date is not valid.");
  const next = structuredClone(state);
  const party = next.parties.find((item) => item.id === input.partyId);
  if (!party) return fail("Party not found.");
  let direction: LedgerEntry["direction"];
  if (input.type === "customer_payment") {
    if (party.kind !== "sale") return fail("Customer payments belong on a sale party.");
    direction = "decrease";
  } else if (input.type === "supplier_payment") {
    if (party.kind !== "purchase") return fail("Supplier payments belong on a purchase party.");
    direction = "decrease";
  } else if (input.type === "purchase" || input.type === "credit_sale") {
    if (input.type === "purchase" && party.kind !== "purchase") return fail("Purchases belong on a supplier.");
    if (input.type === "credit_sale" && party.kind !== "sale") return fail("Credit sales belong on a customer party.");
    direction = "increase";
  } else {
    if (!input.direction) return fail("Choose whether this adjustment increases or decreases the balance.");
    direction = input.direction;
  }
  if (direction === "decrease" && (input.type === "customer_payment" || input.type === "supplier_payment")) {
    const balance = partyBalance(next, party.id);
    if (input.amountPaisa > balance) return fail("That payment is more than the current balance. Use an adjustment if you mean to go past zero.");
  }
  const id = uid();
  next.ledger.push({
    id,
    partyId: party.id,
    at,
    type: input.type,
    direction,
    amountPaisa: input.amountPaisa,
    method: input.method,
    description: input.description.trim(),
    orderId: null,
    reversalOf: null,
    reversed: false,
  });
  audit(next, actor, input.type, `${party.name} · ${input.amountPaisa}`);
  return { ok: true, state: next, value: id };
}

export function saveIngredient(state: AppState, ingredient: Ingredient, actor: string): Result<string> {
  const name = ingredient.name.trim();
  if (name.length < 2) return fail("Ingredient name is required.");
  if (!ingredient.unit.trim()) return fail("Add a unit, such as g or pcs.");
  if (ingredient.conversionFactor !== undefined && ingredient.conversionFactor <= 0) {
    return fail("Conversion factor must be greater than zero.");
  }
  const next = structuredClone(state);
  const id = ingredient.id || uid();
  const saved: Ingredient = {
    ...ingredient,
    id,
    name,
    unit: ingredient.unit.trim(),
    purchaseUnit: ingredient.purchaseUnit?.trim() || undefined,
    conversionFactor: ingredient.conversionFactor,
    category: ingredient.category,
    kind: ingredient.kind || "ingredient",
    sku: ingredient.sku?.trim() || undefined,
    notes: ingredient.notes?.trim() || undefined,
    stockQty: roundQty(ingredient.stockQty),
    reorderLevel: ingredient.reorderLevel,
    productionRecipeId: ingredient.productionRecipeId ?? null,
  };
  const index = next.ingredients.findIndex((item) => item.id === id);
  if (index >= 0) {
    saved.stockQty = next.ingredients[index]!.stockQty;
    saved.avgCostPaisa = next.ingredients[index]!.avgCostPaisa;
    next.ingredients[index] = saved;
  } else {
    saved.stockQty = 0;
    saved.avgCostPaisa = 0;
    next.ingredients.push(saved);
  }
  audit(next, actor, "ingredient", name);
  return { ok: true, state: next, value: id };
}

export function removeIngredient(state: AppState, id: string, actor: string): Result<{ archived: boolean }> {
  const next = structuredClone(state);
  const ingredient = next.ingredients.find((item) => item.id === id);
  if (!ingredient) return fail("Ingredient not found.");
  const hasHistory = next.stockMovements.some((move) => move.ingredientId === id);
  if (hasHistory) {
    // Past stock records point at this ingredient, so hide it instead of erasing history.
    ingredient.active = false;
    audit(next, actor, "archive-ingredient", ingredient.name);
    return { ok: true, state: next, value: { archived: true } };
  }
  next.ingredients = next.ingredients.filter((item) => item.id !== id);
  for (const recipe of next.recipes) {
    recipe.lines = recipe.lines.filter((line) => line.ingredientId !== id);
  }
  audit(next, actor, "delete-ingredient", ingredient.name);
  return { ok: true, state: next, value: { archived: false } };
}

export function postStock(
  state: AppState,
  input: {
    ingredientId: string;
    type: "purchase" | "out" | "wastage" | "adjustment";
    qty: number;
    adjustmentIn: boolean;
    unitCostPaisa: number;
    /** Exact total paid for this purchase (paisa). Preferred over qty * unitCost to avoid rounding drift. */
    totalCostPaisa?: number;
    reason: string;
    partyId: string | null;
    method: StockMovement["method"];
    day: string;
  },
  actor: string,
): Result<string> {
  if (!(input.qty > 0)) return fail("Quantity must be greater than zero.");
  if (input.reason.trim().length < 3) return fail("A reason is required for every stock change.");
  const at = dateAtNoon(input.day);
  if (!at) return fail("That date is not valid.");

  const next = structuredClone(state);
  if (!input.ingredientId || !input.ingredientId.trim()) {
    return fail("Select an ingredient before saving stock.");
  }
  const ingredient = next.ingredients.find((item) => item.id === input.ingredientId);
  if (!ingredient) {
    return fail("Ingredient not found. It may have been removed — refresh the list and pick an active ingredient.");
  }
  if (!ingredient.active) {
    return fail(`${ingredient.name} is archived. Restore it before adding stock.`);
  }
  let qty = roundQty(input.qty);
  let type: StockMovement["type"] = input.type;
  if (input.type === "out" || input.type === "wastage") qty = -qty;
  if (input.type === "adjustment") qty = input.adjustmentIn ? qty : -qty;

  // Purchase total: prefer exact totalCostPaisa from the UI (what was actually paid).
  // Never recompute total as round(unitCost) * qty — that drifts (e.g. Rs 225 → Rs 250).
  let total: number;
  let unitCost: number;
  if (input.type === "purchase") {
    if (input.totalCostPaisa !== undefined && input.totalCostPaisa !== null) {
      const totalError = assertPaisa(input.totalCostPaisa, "Total paid");
      if (totalError) return fail(totalError);
      if (input.totalCostPaisa <= 0) return fail("Enter the total amount paid.");
      total = input.totalCostPaisa;
      unitCost = total / Math.abs(qty);
    } else {
      const costError = assertPaisa(input.unitCostPaisa, "Unit cost");
      if (costError || input.unitCostPaisa === 0) return fail(costError ?? "Enter the unit cost.");
      unitCost = input.unitCostPaisa;
      total = Math.round(Math.abs(qty) * unitCost);
    }
    if (unitCost > 10_000_000) {
      return fail("Unit cost looks too high. Enter total paid for the whole quantity, not a per-gram price in the wrong unit.");
    }
    if (total > 500_000_000) {
      return fail("Purchase total exceeds Rs 50,00,000 — check quantity units (kg vs g) and amount.");
    }
  } else {
    unitCost = ingredient.avgCostPaisa;
    total = Math.round(Math.abs(qty) * unitCost);
  }
  if (qty < 0 && next.settings.blockNegativeStock && ingredient.stockQty + qty < -0.0001) {
    return fail(`${ingredient.name} would go below zero.`);
  }
  if (input.method === "credit") {
    if (!input.partyId) return fail("Choose the supplier this credit purchase is from.");
    const party = next.parties.find((item) => item.id === input.partyId);
    if (!party || party.kind !== "purchase") return fail("Credit purchases must use a supplier party.");
    next.ledger.push({
      id: uid(),
      partyId: party.id,
      at,
      type: "purchase",
      direction: "increase",
      amountPaisa: total,
      method: "none",
      description: input.reason.trim(),
      orderId: null,
      reversalOf: null,
      reversed: false,
    });
  }
  applyMove(next, {
    at,
    ingredientId: ingredient.id,
    productId: null,
    type,
    qty,
    unitCostPaisa: unitCost,
    totalCostPaisa: input.type === "purchase" ? total : 0,
    method: input.method,
    partyId: input.partyId,
    orderId: null,
    reason: input.reason.trim(),
  });
  audit(next, actor, "stock", `${ingredient.name} ${qty}`);
  return { ok: true, state: next, value: ingredient.id };
}

export function saveRecipe(state: AppState, recipe: Recipe, actor: string): Result<string> {
  if (!recipe.productId && !recipe.dealId) return fail("Attach the recipe to a product or a deal.");
  if (recipe.productId && recipe.dealId) return fail("A recipe is for a product or a deal, not both.");
  if (recipe.lines.length === 0) return fail("Add at least one ingredient.");
  for (const line of recipe.lines) {
    if (!state.ingredients.some((item) => item.id === line.ingredientId)) return fail("An ingredient on this recipe was removed.");
    if (!recipe.isAdjustment && !(line.qty > 0)) return fail("Recipe quantities must be greater than zero.");
    if (recipe.isAdjustment && line.qty === 0) return fail("Adjustment quantity cannot be zero.");
  }
  const next = structuredClone(state);
  const id = recipe.id || uid();
  const saved: Recipe = {
    ...recipe,
    id,
    flavourName: recipe.flavourName ?? null,
    requiredModifierOptionIds: recipe.requiredModifierOptionIds ?? [],
    isAdjustment: !!recipe.isAdjustment,
    lines: recipe.lines.map((line) => ({ ...line, qty: roundQty(line.qty) })),
    note: recipe.note.trim(),
  };
  const index = next.recipes.findIndex((item) => item.id === id);
  if (index >= 0) next.recipes[index] = saved;
  else next.recipes.push(saved);
  audit(next, actor, "recipe", id);
  return { ok: true, state: next, value: id };
}

/* ------------------------------------------------------------------ */
/*  PREPARED INGREDIENT PRODUCTION BATCHES                             */
/* ------------------------------------------------------------------ */

/**
 * Preview what a production batch would consume and cost.
 * Does not mutate state.
 */
export function previewProduction(
  state: AppState,
  preparedIngredientId: string,
  quantity: number,
): { ok: true; lines: { ingredientId: string; name: string; qty: number; unit: string; costPaisa: number }[]; totalCostPaisa: number; missing: string[] } | { ok: false; error: string } {
  if (!(quantity > 0)) return { ok: false, error: "Production quantity must be greater than zero." };
  const prepared = state.ingredients.find((i) => i.id === preparedIngredientId);
  if (!prepared) return { ok: false, error: "Prepared ingredient not found." };
  if (prepared.kind !== "prepared") return { ok: false, error: "Only prepared ingredients can be produced in batches." };
  const recipeId = prepared.productionRecipeId;
  if (!recipeId) return { ok: false, error: "This prepared item has no production recipe assigned." };
  const recipe = state.recipes.find((r) => r.id === recipeId && r.active);
  if (!recipe) return { ok: false, error: "Production recipe is missing or inactive." };
  // Detect circular dependency: prepared item appears in its own recipe
  if (recipe.lines.some((l) => l.ingredientId === preparedIngredientId)) {
    return { ok: false, error: "Circular recipe: prepared item cannot consume itself." };
  }
  const lines: { ingredientId: string; name: string; qty: number; unit: string; costPaisa: number }[] = [];
  const missing: string[] = [];
  let totalCost = 0;
  for (const line of recipe.lines) {
    const ing = state.ingredients.find((i) => i.id === line.ingredientId);
    if (!ing) {
      missing.push(line.ingredientId);
      continue;
    }
    const qty = roundQty(line.qty * quantity);
    const cost = Math.round(qty * ing.avgCostPaisa);
    lines.push({ ingredientId: ing.id, name: ing.name, qty, unit: ing.unit, costPaisa: cost });
    totalCost += cost;
    if (ing.stockQty + 0.0001 < qty) {
      missing.push(`${ing.name} (need ${qty} ${ing.unit}, have ${ing.stockQty})`);
    }
  }
  return { ok: true, lines, totalCostPaisa: totalCost, missing };
}

/**
 * Execute a production batch: deduct raw ingredients, increase prepared stock,
 * record movements and a ProductionBatch record.
 */
export function produceBatch(
  state: AppState,
  preparedIngredientId: string,
  quantity: number,
  notes: string,
  actor: string,
): Result<string> {
  const preview = previewProduction(state, preparedIngredientId, quantity);
  if (!preview.ok) return fail(preview.error);
  if (preview.missing.length > 0 && state.settings.blockNegativeStock) {
    return fail(`Insufficient stock: ${preview.missing.join("; ")}`);
  }
  const next = structuredClone(state);
  if (!Array.isArray(next.productionBatches)) next.productionBatches = [];
  const prepared = next.ingredients.find((i) => i.id === preparedIngredientId)!;
  const batchId = uid();
  const at = new Date().toISOString();
  const movementIds: string[] = [];

  // Deduct raw ingredients
  for (const line of preview.lines) {
    const moveId = uid();
    movementIds.push(moveId);
    next.stockMovements.push({
      id: moveId,
      at,
      ingredientId: line.ingredientId,
      productId: null,
      type: "production",
      qty: -line.qty,
      unitCostPaisa: line.costPaisa / (line.qty || 1),
      totalCostPaisa: line.costPaisa,
      method: "none",
      partyId: null,
      orderId: null,
      reason: `Production batch → ${prepared.name}`,
      productionBatchId: batchId,
    });
    const ing = next.ingredients.find((i) => i.id === line.ingredientId)!;
    ing.stockQty = roundQty(ing.stockQty - line.qty);
  }

  // Increase prepared stock with weighted average cost
  const baseQty = Math.max(prepared.stockQty, 0);
  const addQty = quantity;
  const valuePool = baseQty * prepared.avgCostPaisa + preview.totalCostPaisa;
  const denom = baseQty + addQty;
  if (denom > 0) prepared.avgCostPaisa = valuePool / denom;
  prepared.stockQty = roundQty(prepared.stockQty + addQty);

  const producedMoveId = uid();
  movementIds.push(producedMoveId);
  next.stockMovements.push({
    id: producedMoveId,
    at,
    ingredientId: prepared.id,
    productId: null,
    type: "production",
    qty: addQty,
    unitCostPaisa: preview.totalCostPaisa / (addQty || 1),
    totalCostPaisa: preview.totalCostPaisa,
    method: "none",
    partyId: null,
    orderId: null,
    reason: `Produced ${addQty} ${prepared.unit} of ${prepared.name}`,
    productionBatchId: batchId,
  });

  next.productionBatches.push({
    id: batchId,
    preparedIngredientId,
    quantity: addQty,
    unit: prepared.unit,
    producedAt: at,
    producedBy: actor,
    rawCostPaisa: preview.totalCostPaisa,
    notes: notes.trim(),
    movementIds,
    reversed: false,
    reversedAt: null,
    reversedBy: null,
  });
  audit(next, actor, "production", `${prepared.name} × ${addQty}`);
  return { ok: true, state: next, value: batchId };
}

/**
 * Reverse a production batch (restore raw ingredients, reduce prepared stock).
 */
export function reverseProductionBatch(
  state: AppState,
  batchId: string,
  actor: string,
): Result<string> {
  const next = structuredClone(state);
  if (!Array.isArray(next.productionBatches)) next.productionBatches = [];
  const batch = next.productionBatches.find((b) => b.id === batchId);
  if (!batch) return fail("Production batch not found.");
  if (batch.reversed) return fail("This batch has already been reversed.");
  const prepared = next.ingredients.find((i) => i.id === batch.preparedIngredientId);
  if (!prepared) return fail("Prepared ingredient no longer exists.");
  if (prepared.stockQty + 0.0001 < batch.quantity) {
    return fail(`Cannot reverse: only ${prepared.stockQty} ${prepared.unit} of ${prepared.name} remains.`);
  }
  const at = new Date().toISOString();
  // Reverse each movement
  for (const mid of batch.movementIds ?? []) {
    const orig = next.stockMovements.find((m) => m.id === mid);
    if (!orig || !orig.ingredientId) continue;
    const ing = next.ingredients.find((i) => i.id === orig.ingredientId);
    if (!ing) continue;
    const revQty = -orig.qty; // opposite of original
    next.stockMovements.push({
      id: uid(),
      at,
      ingredientId: orig.ingredientId,
      productId: null,
      type: "reversal",
      qty: revQty,
      unitCostPaisa: orig.unitCostPaisa,
      totalCostPaisa: orig.totalCostPaisa,
      method: "none",
      partyId: null,
      orderId: null,
      reason: `Reversal of production batch ${batchId}`,
      productionBatchId: batchId,
    });
    ing.stockQty = roundQty(ing.stockQty + revQty);
  }
  batch.reversed = true;
  batch.reversedAt = at;
  batch.reversedBy = actor;
  audit(next, actor, "reverse-production", batchId);
  return { ok: true, state: next, value: batchId };
}

export function saveExpense(state: AppState, expense: Expense, actor: string): Result<string> {
  const amountError = assertPaisa(expense.amountPaisa, "Amount");
  if (amountError) return fail(amountError);
  if (expense.amountPaisa === 0) return fail("Enter an amount.");
  if (!expense.category.trim()) return fail("Pick a category.");
  if (expense.description.trim().length < 3) return fail("Add a short description.");
  const next = structuredClone(state);
  const id = expense.id || uid();
  const saved: Expense = {
    ...expense,
    id,
    category: expense.category.trim(),
    description: expense.description.trim(),
    reference: expense.reference.trim(),
    at: expense.at || new Date().toISOString(),
  };
  const index = next.expenses.findIndex((item) => item.id === id);
  if (index >= 0) next.expenses[index] = saved;
  else next.expenses.push(saved);
  audit(next, actor, "expense", `${saved.category} · ${saved.amountPaisa}`);
  return { ok: true, state: next, value: id };
}

export function voidExpense(state: AppState, id: string, reason: string, actor: string): Result<string> {
  if (reason.trim().length < 3) return fail("Say why this expense is being voided.");
  const next = structuredClone(state);
  const expense = next.expenses.find((item) => item.id === id);
  if (!expense) return fail("Expense not found.");
  expense.voided = true;
  expense.voidReason = reason.trim();
  audit(next, actor, "void-expense", expense.description);
  return { ok: true, state: next, value: id };
}

export interface Summary {
  salesPaisa: number;
  revenuePaisa: number;
  orderCount: number;
  cancelledCount: number;
  refundPaisa: number;
  byMethod: Record<PayMethod, number>;
  receivablesPaisa: number;
  payablesPaisa: number;
  expensesPaisa: number;
  cogsPaisa: number;
  grossProfitPaisa: number;
  netPaisa: number;
  cogsPartial: boolean;
  deliveryChargePaisa: number;
  creditSalesPaisa: number;
  partyPaymentsPaisa: number;
  lowStock: { id: string; name: string; qty: number; min: number; unit: string }[];
  recent: Order[];
  best: { name: string; qty: number; revenuePaisa: number }[];
  cash: {
    openingPaisa: number;
    salesPaisa: number;
    accountInPaisa: number;
    purchasePaisa: number;
    expensePaisa: number;
    refundPaisa: number;
    supplierPaidPaisa: number;
    expectedPaisa: number;
  };
}

export function summarize(state: AppState, range: { from: string; to: string }): Summary {
  const orders = state.orders.filter((order) => inDateRange(order.createdAt, range.from, range.to));
  const completed = orders.filter((order) => order.status === "completed");
  const cancelled = orders.filter((order) => order.status === "cancelled");
  const byMethod: Record<PayMethod, number> = { cash: 0, card: 0, wallet: 0 };
  for (const order of completed) {
    for (const payment of order.payments) {
      if (inDateRange(payment.at, range.from, range.to)) byMethod[payment.method] += payment.amountPaisa;
    }
  }
  const salesPaisa = completed.reduce((sum, order) => sum + order.totalPaisa, 0);
  const revenuePaisa = completed.reduce((sum, order) => sum + order.subtotalPaisa - order.discountPaisa, 0);
  const cogsPaisa = completed.reduce((sum, order) => sum + order.cogsPaisa, 0);
  const deliveryChargePaisa = completed.reduce((sum, order) => sum + (order.deliveryChargePaisa ?? 0), 0);
  const creditSalesPaisa = completed.reduce((sum, order) => sum + (order.onAccountPaisa || 0), 0);
  const partyPaymentsPaisa = state.ledger
    .filter(
      (entry) =>
        entry.type === "customer_payment" &&
        entry.direction === "decrease" &&
        inDateRange(entry.at, range.from, range.to),
    )
    .reduce((sum, entry) => sum + entry.amountPaisa, 0);
  const expenses = state.expenses.filter((expense) => !expense.voided && inDateRange(expense.at, range.from, range.to));
  const expensesPaisa = expenses.reduce((sum, expense) => sum + expense.amountPaisa, 0);
  const receivablesPaisa =
    state.parties
      .filter((party) => party.kind === "sale")
      .reduce((sum, party) => sum + partyBalance(state, party.id), 0) +
    state.orders.reduce((sum, order) => sum + orderReceivable(order), 0);
  const payablesPaisa = state.parties
    .filter((party) => party.kind === "purchase")
    .reduce((sum, party) => sum + partyBalance(state, party.id), 0);
  const counts = new Map<string, { qty: number; revenuePaisa: number }>();
  for (const order of completed) {
    for (const item of order.items) {
      const current = counts.get(item.name) ?? { qty: 0, revenuePaisa: 0 };
      current.qty += item.qty;
      current.revenuePaisa += item.lineTotalPaisa;
      counts.set(item.name, current);
    }
  }
  const lowStock = [
    ...state.ingredients
      .filter((item) => item.active && item.minQty > 0 && item.stockQty <= item.minQty)
      .map((item) => ({ id: item.id, name: item.name, qty: item.stockQty, min: item.minQty, unit: item.unit })),
    ...state.products
      .filter((item) => item.trackStock && item.active && item.minStock > 0 && item.stockQty <= item.minStock)
      .map((item) => ({ id: item.id, name: item.name, qty: item.stockQty, min: item.minStock, unit: "pcs" })),
  ];
  const refunds = state.orders.flatMap((order) => order.refunds.map((refund) => ({ refund, order })));
  const refundPaisa = refunds
    .filter((item) => inDateRange(item.refund.at, range.from, range.to))
    .reduce((sum, item) => sum + item.refund.amountPaisa, 0);
  const cashSales = state.orders
    .flatMap((order) => order.payments.filter((payment) => payment.method === "cash").map((payment) => payment))
    .filter((payment) => inDateRange(payment.at, range.from, range.to))
    .reduce((sum, payment) => sum + payment.amountPaisa, 0);
  const cashRefund = refunds
    .filter((item) => item.refund.method === "cash" && inDateRange(item.refund.at, range.from, range.to))
    .reduce((sum, item) => sum + item.refund.amountPaisa, 0);
  const accountIn = state.ledger
    .filter(
      (entry) =>
        entry.type === "customer_payment" &&
        entry.method === "cash" &&
        entry.direction === "decrease" &&
        inDateRange(entry.at, range.from, range.to),
    )
    .reduce((sum, entry) => sum + entry.amountPaisa, 0);
  const supplierPaid = state.ledger
    .filter(
      (entry) =>
        entry.type === "supplier_payment" &&
        entry.method === "cash" &&
        entry.direction === "decrease" &&
        inDateRange(entry.at, range.from, range.to),
    )
    .reduce((sum, entry) => sum + entry.amountPaisa, 0);
  const purchaseCash = state.stockMovements
    .filter((move) => move.type === "purchase" && move.method === "cash" && inDateRange(move.at, range.from, range.to))
    .reduce((sum, move) => sum + move.totalCostPaisa, 0);
  const expenseCash = expenses.filter((expense) => expense.method === "cash").reduce((sum, expense) => sum + expense.amountPaisa, 0);
  const opening = state.settings.openingCashDate >= range.from && state.settings.openingCashDate <= range.to ? state.settings.openingCashPaisa : 0;
  return {
    salesPaisa,
    revenuePaisa,
    orderCount: completed.length,
    cancelledCount: cancelled.length,
    refundPaisa,
    byMethod,
    receivablesPaisa,
    payablesPaisa,
    expensesPaisa,
    cogsPaisa,
    grossProfitPaisa: revenuePaisa - cogsPaisa,
    netPaisa: revenuePaisa - cogsPaisa - expensesPaisa,
    cogsPartial: completed.some((order) => order.cogsPartial),
    deliveryChargePaisa,
    creditSalesPaisa,
    partyPaymentsPaisa,
    lowStock,
    recent: [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    best: [...counts.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5),
    cash: {
      openingPaisa: opening,
      salesPaisa: cashSales,
      accountInPaisa: accountIn,
      purchasePaisa: purchaseCash,
      expensePaisa: expenseCash,
      refundPaisa: cashRefund,
      supplierPaidPaisa: supplierPaid,
      expectedPaisa: opening + cashSales + accountIn - purchaseCash - expenseCash - cashRefund - supplierPaid,
    },
  };
}

export function dailySeries(state: AppState, range: { from: string; to: string }): { day: string; totalPaisa: number }[] {
  const days: string[] = [];
  const cursor = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return [];
  while (cursor <= end && days.length < 62) {
    days.push(localDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.map((day) => ({
    day,
    totalPaisa: state.orders
      .filter((order) => order.status === "completed" && localDate(order.createdAt) === day)
      .reduce((sum, order) => sum + order.totalPaisa, 0),
  }));
}

export function updateSettings(state: AppState, settings: AppState["settings"], actor: string): Result<true> {
  if (!settings.shopName.trim()) return fail("Shop name is required.");
  if (settings.taxEnabled && (!Number.isInteger(settings.taxBps) || settings.taxBps < 0 || settings.taxBps > 10_000)) {
    return fail("Tax percent looks wrong.");
  }
  const openingError = assertPaisa(settings.openingCashPaisa, "Opening cash");
  if (openingError) return fail(openingError);
  const next = structuredClone(state);
  next.settings = { ...settings, shopName: settings.shopName.trim(), currency: "PKR" };
  audit(next, actor, "settings", "Shop settings saved");
  return { ok: true, state: next, value: true };
}

/** Close a business day. Does NOT delete orders, stock, parties or balances. */
export function closeDay(
  state: AppState,
  input: {
    date: string;
    actualCashPaisa: number;
    notes: string;
    actorId: string;
    actorName: string;
  },
): Result<string> {
  const date = input.date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Pick a valid day.");
  const cashError = assertPaisa(input.actualCashPaisa, "Actual cash");
  if (cashError) return fail(cashError);

  const already = state.closedDays.find((d) => d.date === date && !d.reopened);
  if (already) return fail(`Day ${date} is already closed. Reopen it first if you need to change it.`);

  const summary = summarize(state, { from: date, to: date });
  const expected = summary.cash.expectedPaisa;
  const difference = input.actualCashPaisa - expected;

  const next = structuredClone(state);
  if (!next.closedDays) next.closedDays = [];
  const id = uid();
  next.closedDays.push({
    id,
    date,
    closedAt: new Date().toISOString(),
    closedBy: input.actorId,
    closedByName: input.actorName,
    actualCashPaisa: input.actualCashPaisa,
    expectedCashPaisa: expected,
    differencePaisa: difference,
    notes: input.notes.trim(),
    summary: {
      orderCount: summary.orderCount,
      salesPaisa: summary.salesPaisa,
      cashSalesPaisa: summary.cash.salesPaisa,
      cardWalletPaisa: summary.byMethod.card + summary.byMethod.wallet,
      creditSalesPaisa: summary.creditSalesPaisa,
      partyPaymentsPaisa: summary.partyPaymentsPaisa,
      expensesPaisa: summary.expensesPaisa,
      refundPaisa: summary.refundPaisa,
      deliveryChargePaisa: summary.deliveryChargePaisa,
      revenuePaisa: summary.revenuePaisa,
      cogsPaisa: summary.cogsPaisa,
    },
    reopened: false,
    reopenedAt: null,
    reopenedBy: null,
    reopenReason: "",
  });
  audit(
    next,
    input.actorName,
    "close-day",
    `${date} · expected ${expected} · actual ${input.actualCashPaisa} · diff ${difference}`,
  );
  return { ok: true, state: next, value: id };
}

/** Owner can reopen a closed day with a reason (audit trail kept). */
export function reopenDay(
  state: AppState,
  closedDayId: string,
  reason: string,
  actorId: string,
  actorName: string,
): Result<string> {
  if (reason.trim().length < 5) return fail("Write a short reason (at least 5 characters).");
  const next = structuredClone(state);
  if (!next.closedDays) next.closedDays = [];
  const day = next.closedDays.find((d) => d.id === closedDayId);
  if (!day) return fail("Closed day not found.");
  if (day.reopened) return fail("This day is already open again.");
  day.reopened = true;
  day.reopenedAt = new Date().toISOString();
  day.reopenedBy = actorId;
  day.reopenReason = reason.trim();
  audit(next, actorName, "reopen-day", `${day.date} · ${reason.trim()}`);
  return { ok: true, state: next, value: closedDayId };
}

export function isDayClosed(state: AppState, date: string): boolean {
  return (state.closedDays ?? []).some((d) => d.date === date && !d.reopened);
}
