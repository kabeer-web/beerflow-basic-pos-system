import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveParty, cartTotals, cancelOrder, checkout, closeDay, convertToIngredientUnit, customerStats, partyBalance, postLedger, postStock, removeIngredient, removeProduct, restoreParty, saveExpense, saveParty, saveProduct, summarize } from "./logic.ts";
import { formatPkr, localDate, rupeesToPaisa } from "./money.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { createSeedState } from "./seed.ts";
import type { AppState, CartLine, LinePick } from "./types.ts";

function dealLine(state: AppState, dealId: string, flavour = "Tikka"): CartLine {
  const deal = state.deals.find((item) => item.id === dealId);
  if (!deal) throw new Error(dealId);
  const picks: LinePick[] = [];
  for (const slot of deal.slots) {
    if (slot.mode === "pizza") {
      for (let index = 0; index < slot.qty; index += 1) {
        picks.push({
          slotId: slot.id,
          label: slot.label,
          productId: "prod-pizza",
          productName: "Pizza",
          sizeName: slot.sizeName,
          flavour,
          qty: 1,
        });
      }
    } else if (slot.productId) {
      const product = state.products.find((item) => item.id === slot.productId);
      picks.push({
        slotId: slot.id,
        label: slot.label,
        productId: slot.productId,
        productName: product?.name ?? slot.label,
        sizeName: null,
        flavour: null,
        qty: slot.qty,
      });
    }
  }
  return { key: crypto.randomUUID(), kind: "deal", refId: dealId, qty: 1, notes: "", config: { picks } };
}

function pizzaLine(sizeName: string, flavours: string[]): CartLine {
  return {
    key: crypto.randomUUID(),
    kind: "product",
    refId: "prod-pizza",
    qty: 1,
    notes: "",
    config: { sizeName, flavours },
  };
}

function sell(state: AppState, line: CartLine, tenders?: { method: "cash" | "card" | "wallet"; tenderedPaisa: number }[], at?: string) {
  const next = structuredClone(state);
  next.cart.lines = [line];
  next.cart.idempotencyKey = line.key;
  const totals = cartTotals(next);
  const result = checkout(next, {
    actorId: "owner",
    actorName: "Owner",
    at,
    tenders: tenders ?? [{ method: "cash", tenderedPaisa: totals.totalPaisa }],
  });
  return result;
}

test("money stays in paisa", () => {
  assert.equal(rupeesToPaisa("1,200"), 120000);
  assert.equal(rupeesToPaisa("10.5"), 1050);
  assert.equal(rupeesToPaisa("0.01"), 1);
  assert.equal(rupeesToPaisa("-5"), null);
  assert.equal(formatPkr(50000), "Rs. 500");
  assert.equal(formatPkr(120000), "Rs. 1,200");
  assert.equal(formatPkr(123456), "Rs. 1,234.56");
  assert.equal(formatPkr(-30000), "-Rs. 300");
});

test("deal price is not the sum of the pizzas", () => {
  const state = createSeedState();
  state.cart.lines = [dealLine(state, "deal-01")];
  const totals = cartTotals(state);
  assert.equal(totals.error, null);
  assert.equal(totals.totalPaisa, 50000);
  assert.notEqual(totals.totalPaisa, 60000);
});

test("pizza size, half-and-half, and unset drink price", () => {
  const state = createSeedState();
  state.cart.lines = [pizzaLine("Regular", ["Tikka", "Fajita"])];
  assert.equal(cartTotals(state).totalPaisa, 60000);
  state.products[0]!.flavours[0]!.pricePaisa = 5000;
  assert.equal(cartTotals(state).totalPaisa, 65000);
  state.cart.lines = [
    { key: "d", kind: "product", refId: "prod-drink-500", qty: 1, notes: "", config: {} },
  ];
  assert.match(cartTotals(state).error ?? "", /selling price/);
});

test("discount, partial cash, and party credit are not double counted", () => {
  let state = createSeedState();
  const party = saveParty(state, { name: "Ali Traders", kind: "sale", phone: "03001112222", address: "", notes: "", openingPaisa: 0 }, "Owner");
  assert.equal(party.ok, true);
  if (!party.ok) return;
  state = party.state;
  state.cart.lines = [pizzaLine("Regular", ["Tikka"])];
  state.cart.idempotencyKey = "partial-1";
  state.cart.discountPaisa = 10000;
  state.cart.partyId = party.value;
  state.cart.customerName = "Ali";
  const result = checkout(state, {
    actorId: "owner",
    actorName: "Owner",
    tenders: [{ method: "cash", tenderedPaisa: 20000 }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const order = result.state.orders[0]!;
  assert.equal(order.totalPaisa, 50000);
  assert.equal(order.payments[0]!.amountPaisa, 20000);
  assert.equal(order.onAccountPaisa, 30000);
  assert.equal(partyBalance(result.state, party.value), 30000);
  const day = localDate(order.createdAt);
  const summary = summarize(result.state, { from: day, to: day });
  assert.equal(summary.receivablesPaisa, 30000);
  assert.equal(summary.byMethod.cash, 20000);
  assert.equal(summary.salesPaisa, 50000);
  const paid = postLedger(
    result.state,
    {
      partyId: party.value,
      type: "customer_payment",
      amountPaisa: 30000,
      method: "cash",
      description: "Collected balance",
      day,
    },
    "Owner",
  );
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  assert.equal(partyBalance(paid.state, party.value), 0);
  const after = summarize(paid.state, { from: day, to: day });
  assert.equal(after.receivablesPaisa, 0);
  assert.equal(after.salesPaisa, 50000);
  assert.equal(after.byMethod.cash, 20000);
  assert.equal(after.cash.accountInPaisa, 30000);
  assert.equal(after.cash.salesPaisa, 20000);
});

test("duplicate checkout key does not create a second bill", () => {
  const state = createSeedState();
  const line = pizzaLine("Small", ["Tikka"]);
  const first = sell(state, line);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const again = structuredClone(first.state);
  again.cart.lines = [line];
  again.cart.idempotencyKey = line.key;
  const second = checkout(again, { actorId: "owner", actorName: "Owner", tenders: [{ method: "cash", tenderedPaisa: 30000 }] });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.duplicate, true);
  assert.equal(second.state.orders.length, 1);
});

test("cancel reverses stock, cash, and a credit sale", () => {
  let state = createSeedState();
  const lasagna = state.products.find((item) => item.id === "prod-lasagna")!;
  lasagna.trackStock = true;
  lasagna.stockQty = 5;
  lasagna.costPricePaisa = 20000;
  const party = saveParty(state, { name: "Shop", kind: "sale", phone: "", address: "", notes: "", openingPaisa: 0 }, "Owner");
  assert.equal(party.ok, true);
  if (!party.ok) return;
  state = party.state;
  state.products.find((item) => item.id === "prod-lasagna")!.trackStock = true;
  state.products.find((item) => item.id === "prod-lasagna")!.stockQty = 5;
  state.cart.partyId = party.value;
  state.cart.customerName = "Shop";
  const line: CartLine = { key: "las", kind: "product", refId: "prod-lasagna", qty: 1, notes: "", config: {} };
  state.cart.lines = [line];
  state.cart.idempotencyKey = "las";
  const sold = checkout(state, { actorId: "owner", actorName: "Owner", tenders: [{ method: "cash", tenderedPaisa: 0 }] });
  assert.equal(sold.ok, true);
  if (!sold.ok) return;
  assert.equal(sold.state.products.find((item) => item.id === "prod-lasagna")!.stockQty, 4);
  assert.equal(partyBalance(sold.state, party.value), 60000);
  const cancelled = cancelOrder(sold.state, sold.value.orderId, "Wrong order", "Owner");
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) return;
  const order = cancelled.state.orders[0]!;
  assert.equal(order.status, "cancelled");
  assert.equal(cancelled.state.products.find((item) => item.id === "prod-lasagna")!.stockQty, 5);
  assert.equal(partyBalance(cancelled.state, party.value), 0);
  const day = localDate(order.createdAt);
  const summary = summarize(cancelled.state, { from: day, to: day });
  assert.equal(summary.salesPaisa, 0);
  assert.equal(summary.cancelledCount, 1);
});

test("a deal recipe is deducted once, not per pizza inside it", () => {
  const state = createSeedState();
  const dough = state.ingredients.find((item) => item.id === "ing-dough")!;
  dough.stockQty = 10;
  dough.avgCostPaisa = 8000;
  state.recipes.push({
    id: "rec-pizza",
    productId: "prod-pizza",
    dealId: null,
    sizeName: null,
    lines: [{ ingredientId: "ing-dough", qty: 1 }],
    active: true,
    note: "",
  });
  state.recipes.push({
    id: "rec-deal",
    productId: null,
    dealId: "deal-01",
    sizeName: null,
    lines: [{ ingredientId: "ing-dough", qty: 1 }],
    active: true,
    note: "",
  });
  const sold = sell(state, dealLine(state, "deal-01"));
  assert.equal(sold.ok, true);
  if (!sold.ok) return;
  assert.equal(sold.state.ingredients.find((item) => item.id === "ing-dough")!.stockQty, 9);
  assert.equal(sold.state.orders[0]!.cogsPaisa, 8000);
  const bare = createSeedState();
  bare.ingredients.find((item) => item.id === "ing-dough")!.stockQty = 10;
  bare.recipes.push({
    id: "rec-pizza",
    productId: "prod-pizza",
    dealId: null,
    sizeName: "Small",
    lines: [{ ingredientId: "ing-dough", qty: 1 }],
    active: true,
    note: "",
  });
  const soldBare = sell(bare, dealLine(bare, "deal-01"));
  assert.equal(soldBare.ok, true);
  if (!soldBare.ok) return;
  assert.equal(soldBare.state.ingredients.find((item) => item.id === "ing-dough")!.stockQty, 8);
});

test("supplier purchase is payable, not a second expense", () => {
  let state = createSeedState();
  const party = saveParty(state, { name: "Flour Mill", kind: "purchase", phone: "", address: "", notes: "", openingPaisa: 50000 }, "Owner");
  assert.equal(party.ok, true);
  if (!party.ok) return;
  state = party.state;
  assert.equal(partyBalance(state, party.value), 50000);
  const day = localDate();
  const stock = postStock(
    state,
    {
      ingredientId: "ing-cheese",
      type: "purchase",
      qty: 2,
      adjustmentIn: true,
      unitCostPaisa: 10000,
      reason: "Cheese tin",
      partyId: party.value,
      method: "credit",
      day,
    },
    "Owner",
  );
  assert.equal(stock.ok, true);
  if (!stock.ok) return;
  assert.equal(partyBalance(stock.state, party.value), 70000);
  assert.equal(stock.state.expenses.length, 0);
  assert.equal(stock.state.ingredients.find((item) => item.id === "ing-cheese")!.stockQty, 2);
  const expense = saveExpense(
    stock.state,
    {
      id: "",
      at: new Date().toISOString(),
      category: "Utilities",
      amountPaisa: 15000,
      method: "cash",
      description: "Electricity bill",
      partyId: null,
      reference: "U-1",
      voided: false,
      voidReason: "",
    },
    "Owner",
  );
  assert.equal(expense.ok, true);
  if (!expense.ok) return;
  const summary = summarize(expense.state, { from: day, to: day });
  assert.equal(summary.payablesPaisa, 70000);
  assert.equal(summary.expensesPaisa, 15000);
  assert.equal(summary.cash.expensePaisa, 15000);
  assert.equal(summary.cash.purchasePaisa, 0);
  const paid = postLedger(
    expense.state,
    { partyId: party.value, type: "supplier_payment", amountPaisa: 20000, method: "cash", description: "Part payment", day },
    "Owner",
  );
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  assert.equal(partyBalance(paid.state, party.value), 50000);
  assert.equal(summarize(paid.state, { from: day, to: day }).cash.supplierPaidPaisa, 20000);
});

test("profit is not revenue, and archive keeps the old bill", () => {
  const state = createSeedState();
  const sold = sell(state, pizzaLine("Small", ["Tikka"]));
  assert.equal(sold.ok, true);
  if (!sold.ok) return;
  const name = sold.state.orders[0]!.items[0]!.name;
  const expensed = saveExpense(
    sold.state,
    {
      id: "",
      at: sold.state.orders[0]!.createdAt,
      category: "Wages",
      amountPaisa: 5000,
      method: "cash",
      description: "Helper wage",
      partyId: null,
      reference: "",
      voided: false,
      voidReason: "",
    },
    "Owner",
  );
  assert.equal(expensed.ok, true);
  if (!expensed.ok) return;
  const day = localDate(sold.state.orders[0]!.createdAt);
  const summary = summarize(expensed.state, { from: day, to: day });
  assert.equal(summary.revenuePaisa, 30000);
  assert.equal(summary.netPaisa, 25000);
  assert.notEqual(summary.netPaisa, summary.salesPaisa);
  const archived = removeProduct(expensed.state, "prod-pizza", "Owner");
  assert.equal(archived.ok, true);
  if (!archived.ok) return;
  assert.equal(archived.value.archived, true);
  assert.equal(archived.state.orders[0]!.items[0]!.name, name);
  assert.equal(archived.state.products.find((item) => item.id === "prod-pizza")!.active, false);
  const fresh = createSeedState();
  const removed = removeProduct(fresh, "prod-lasagna", "Owner");
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.value.archived, false);
  assert.equal(removed.state.products.some((item) => item.id === "prod-lasagna"), false);
});

test("customer frequency uses completed days, not cancelled bills", () => {
  let state = createSeedState();
  state.customers.push({
    id: "c1",
    name: "Sana",
    phone: "03121234567",
    address: "",
    notes: "",
    manualTags: [],
    partyId: null,
    createdAt: new Date().toISOString(),
  });
  const now = new Date();
  for (const daysAgo of [0, 1, 2]) {
    const at = new Date(now);
    at.setDate(now.getDate() - daysAgo);
    at.setHours(15, 0, 0, 0);
    state.cart.customerId = "c1";
    state.cart.customerName = "Sana";
    const sold = sell(state, pizzaLine("Small", ["Fajita"]), undefined, at.toISOString());
    assert.equal(sold.ok, true);
    if (!sold.ok) return;
    state = sold.state;
    state.cart.customerId = "c1";
  }
  const stats = customerStats(state, "c1", now);
  assert.equal(stats.visits, 3);
  assert.equal(stats.distinctDays, 3);
  assert.ok(stats.tags.includes("Frequent"));
  assert.equal(stats.favourite.includes("Small"), true);
  const cancelled = cancelOrder(state, state.orders[0]!.id, "Test cancel", "Owner");
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) return;
  assert.equal(customerStats(cancelled.state, "c1", now).visits, 2);
});

test("cashier-facing totals reconcile with stored bills", () => {
  let state = createSeedState();
  const first = sell(state, dealLine(state, "deal-02"));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  state = first.state;
  const second = sell(state, pizzaLine("Large", ["Malai Boti"]), [{ method: "card", tenderedPaisa: 85000 }]);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const day = localDate(second.state.orders[0]!.createdAt);
  const summary = summarize(second.state, { from: day, to: day });
  const manual = second.state.orders.filter((order) => order.status === "completed").reduce((sum, order) => sum + order.totalPaisa, 0);
  assert.equal(summary.salesPaisa, manual);
  assert.equal(summary.orderCount, 2);
  assert.equal(summary.byMethod.card, 85000);
  assert.equal(summary.byMethod.cash, 100000);
});

test("new product can be edited without touching another record", () => {
  const state = createSeedState();
  const saved = saveProduct(
    state,
    {
      ...state.products[1]!,
      id: "",
      name: "Garlic Bread",
      sku: "SD-GAR",
      basePricePaisa: 25000,
      categoryId: "cat-sides",
      type: "side",
    },
    "Owner",
  );
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  const edited = saveProduct(saved.state, { ...saved.state.products.find((item) => item.id === saved.value)!, basePricePaisa: 28000 }, "Owner");
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.state.products.find((item) => item.id === saved.value)!.basePricePaisa, 28000);
  assert.equal(edited.state.products.find((item) => item.id === "prod-pasta")!.basePricePaisa, 60000);
});

test("passwords are not stored as plain text", async () => {
  const hash = await hashPassword("owner");
  assert.equal(hash.includes("owner"), false);
  assert.equal(await verifyPassword("owner", hash), true);
  assert.equal(await verifyPassword("counter", hash), false);
});

test("deleting an ingredient with no history removes it and its recipe lines", () => {
  const state = createSeedState();
  const recipeUses = state.recipes.some((recipe) => recipe.lines.some((line) => line.ingredientId === "ing-cheese"));
  const result = removeIngredient(state, "ing-cheese", "Owner");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.archived, false);
  assert.equal(result.state.ingredients.some((item) => item.id === "ing-cheese"), false);
  assert.equal(result.state.recipes.some((recipe) => recipe.lines.some((line) => line.ingredientId === "ing-cheese")), false);
  assert.equal(typeof recipeUses, "boolean");
});

test("an ingredient with stock history is hidden, not erased", () => {
  const state = createSeedState();
  const stock = postStock(
    state,
    { ingredientId: "ing-cheese", type: "purchase", qty: 2, adjustmentIn: true, unitCostPaisa: 10000, reason: "Cheese tin", partyId: null, method: "cash", day: localDate() },
    "Owner",
  );
  assert.equal(stock.ok, true);
  if (!stock.ok) return;
  const result = removeIngredient(stock.state, "ing-cheese", "Owner");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.archived, true);
  const kept = result.state.ingredients.find((item) => item.id === "ing-cheese");
  assert.equal(kept?.active, false);
  assert.ok(result.state.stockMovements.length > 0);
});

test("deleting an unknown ingredient fails", () => {
  assert.equal(removeIngredient(createSeedState(), "nope", "Owner").ok, false);
});

test("extra cheese addon deducts additional ingredient stock", () => {
  const state = createSeedState();
  state.ingredients.find((item) => item.id === "ing-cheese")!.stockQty = 1000;
  state.recipes.push({
    id: "rec-large",
    productId: "prod-pizza",
    dealId: null,
    sizeName: "Large",
    lines: [{ ingredientId: "ing-cheese", qty: 250 }],
    active: true,
    note: "",
  });
  const line: CartLine = {
    key: crypto.randomUUID(),
    kind: "product",
    refId: "prod-pizza",
    qty: 1,
    notes: "",
    config: { sizeName: "Large", flavours: ["Tikka"], addonIds: ["add-cheese"] },
  };
  const result = sell(state, line);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const cheese = result.state.ingredients.find((item) => item.id === "ing-cheese")!;
  // 250g recipe + 50g extra cheese addon
  assert.equal(cheese.stockQty, 700);
});


function cheeseOf(state: AppState) {
  return state.ingredients.find((item) => item.id === "ing-cheese")!;
}

function stockSale(state: AppState, lines: CartLine[]) {
  const next = structuredClone(state);
  next.cart.lines = lines;
  next.cart.idempotencyKey = lines.map((l) => l.key).join("|") || crypto.randomUUID();
  const totals = cartTotals(next);
  return checkout(next, {
    actorId: "owner",
    actorName: "Owner",
    tenders: [{ method: "cash", tenderedPaisa: Math.max(totals.totalPaisa, 1) }],
  });
}

test("unit conversion kg to g and rejects incompatible units", () => {
  assert.equal(convertToIngredientUnit(5, "kg", "g").qty, 5000);
  assert.equal(convertToIngredientUnit(1.5, "l", "ml").qty, 1500);
  assert.equal(convertToIngredientUnit(10, "g", "g").qty, 10);
  assert.ok(convertToIngredientUnit(1, "kg", "pcs").error);
});

test("audit: size recipes deduct cheese correctly for each pizza size", () => {
  let state = createSeedState();
  state.ingredients.find((i) => i.id === "ing-cheese")!.stockQty = 5000;
  for (const [size, expected] of [
    ["Small", 100],
    ["Regular", 150],
    ["Large", 250],
    ["Jumbo", 350],
  ] as const) {
    const before = cheeseOf(state).stockQty;
    const result = stockSale(state, [pizzaLine(size, ["Tikka"])]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    state = result.state;
    assert.equal(cheeseOf(state).stockQty, before - expected, size);
  }
});

test("audit: multi-pizza order and extra cheese match expected remaining stock", () => {
  let state = createSeedState();
  cheeseOf(state).stockQty = 5000;
  // 1 Large 250 + 2 Small 200 = 450
  const lineLarge: CartLine = { key: "a", kind: "product", refId: "prod-pizza", qty: 1, notes: "", config: { sizeName: "Large", flavours: ["Tikka"] } };
  const lineSmalls: CartLine = { key: "b", kind: "product", refId: "prod-pizza", qty: 2, notes: "", config: { sizeName: "Small", flavours: ["Fajita"] } };
  let result = stockSale(state, [lineLarge, lineSmalls]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  state = result.state;
  assert.equal(cheeseOf(state).stockQty, 4550);

  // 1 Large with extra cheese 250+50 = 300 → remaining 4250
  const lineExtra: CartLine = {
    key: "c",
    kind: "product",
    refId: "prod-pizza",
    qty: 1,
    notes: "",
    config: { sizeName: "Large", flavours: ["Tikka"], addonIds: ["add-cheese"] },
  };
  result = stockSale(state, [lineExtra]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  state = result.state;
  assert.equal(cheeseOf(state).stockQty, 4250);

  // Cancel last order restores 300 → 4550
  const lastOrder = state.orders[state.orders.length - 1]!;
  const cancelled = cancelOrder(state, lastOrder.id, "Customer changed mind", "Owner");
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) return;
  assert.equal(cheeseOf(cancelled.state).stockQty, 4550);

  // Repeated cancel must fail and not double-restore
  const again = cancelOrder(cancelled.state, lastOrder.id, "Customer changed mind", "Owner");
  assert.equal(again.ok, false);
  assert.equal(cheeseOf(cancelled.state).stockQty, 4550);
});

test("audit: duplicate checkout key does not deduct stock twice", () => {
  let state = createSeedState();
  cheeseOf(state).stockQty = 5000;
  const line = pizzaLine("Large", ["Tikka"]);
  line.key = "same-key";
  const first = stockSale(state, [line]);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(cheeseOf(first.state).stockQty, 4750);
  // Replay same cart key
  const replay = structuredClone(first.state);
  replay.cart.lines = [line];
  replay.cart.idempotencyKey = "same-key";
  const second = checkout(replay, {
    actorId: "owner",
    actorName: "Owner",
    tenders: [{ method: "cash", tenderedPaisa: 100000 }],
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.duplicate, true);
  assert.equal(cheeseOf(second.state).stockQty, 4750);
});

test("audit: block negative stock prevents sale when cheese is short", () => {
  const state = createSeedState();
  state.settings.blockNegativeStock = true;
  cheeseOf(state).stockQty = 100;
  const result = stockSale(state, [pizzaLine("Large", ["Tikka"])]); // needs 250g
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /below zero|Cheese/i);
});

test("audit: purchase via postStock and unit conversion path", () => {
  let state = createSeedState();
  const converted = convertToIngredientUnit(5, "kg", "g");
  assert.equal(converted.qty, 5000);
  const result = postStock(
    state,
    {
      ingredientId: "ing-cheese",
      type: "purchase",
      qty: converted.qty,
      adjustmentIn: true,
      unitCostPaisa: 2,
      reason: "Opening mozzarella 5kg",
      partyId: null,
      method: "cash",
      day: localDate(),
    },
    "Owner",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(cheeseOf(result.state).stockQty, 5000);
  const purchaseMoves = result.state.stockMovements.filter((m) => m.type === "purchase" && m.ingredientId === "ing-cheese");
  assert.equal(purchaseMoves.length, 1);
  assert.equal(purchaseMoves[0]!.qty, 5000);
});

test("audit: deal with two small pizzas deducts 200g cheese", () => {
  let state = createSeedState();
  cheeseOf(state).stockQty = 5000;
  const result = stockSale(state, [dealLine(state, "deal-01")]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Deal 01 = 2 small pizzas → 100*2 = 200
  assert.equal(cheeseOf(result.state).stockQty, 4800);
});

test("audit: full scenario 1 Large + 2 Small + 1 Large extra cheese then cancel last", () => {
  let state = createSeedState();
  cheeseOf(state).stockQty = 5000;
  // First order: 1 Large + 2 Small = 450
  let result = stockSale(state, [
    { key: "o1a", kind: "product", refId: "prod-pizza", qty: 1, notes: "", config: { sizeName: "Large", flavours: ["Tikka"] } },
    { key: "o1b", kind: "product", refId: "prod-pizza", qty: 2, notes: "", config: { sizeName: "Small", flavours: ["Tikka"] } },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  state = result.state;
  assert.equal(cheeseOf(state).stockQty, 4550);

  // Second order: 1 Large + extra cheese = 300 → remaining 4250 (prompt expected 4350 if first was 450 and second 300 from 5000 = 4250)
  // Prompt said: Expected deduction = 650, remaining 4350 then cancel last → 4700
  // That treats all three lines as ONE order totaling 650, then cancel that whole order.
  state = createSeedState();
  cheeseOf(state).stockQty = 5000;
  result = stockSale(state, [
    { key: "x1", kind: "product", refId: "prod-pizza", qty: 1, notes: "", config: { sizeName: "Large", flavours: ["Tikka"] } },
    { key: "x2", kind: "product", refId: "prod-pizza", qty: 2, notes: "", config: { sizeName: "Small", flavours: ["Tikka"] } },
    { key: "x3", kind: "product", refId: "prod-pizza", qty: 1, notes: "", config: { sizeName: "Large", flavours: ["Tikka"], addonIds: ["add-cheese"] } },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  state = result.state;
  // 250 (Large) + 200 (2×Small) + 250 (Large) + 50 (extra cheese) = 750
  assert.equal(cheeseOf(state).stockQty, 4250);
  const orderId = result.value.orderId;
  const cancelled = cancelOrder(state, orderId, "Wrong order", "Owner");
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) return;
  assert.equal(cheeseOf(cancelled.state).stockQty, 5000); // full reverse of the combined order
});

test("close day saves snapshot and does not wipe stock or parties", () => {
  let state = createSeedState();
  state.closedDays = [];
  // give some opening cash
  state.settings.openingCashPaisa = 500_00;
  state.settings.openingCashDate = localDate();
  const closed = closeDay(state, {
    date: localDate(),
    actualCashPaisa: 480_00,
    notes: "Short 20",
    actorId: "u1",
    actorName: "Owner",
  });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;
  state = closed.state;
  assert.equal(state.closedDays.length, 1);
  assert.equal(state.closedDays[0].differencePaisa, -20_00);
  // permanent data untouched
  assert.ok(state.ingredients.length > 0);
  assert.ok(state.products.length > 0);
  // cannot close same day twice
  const again = closeDay(state, {
    date: localDate(),
    actualCashPaisa: 500_00,
    notes: "",
    actorId: "u1",
    actorName: "Owner",
  });
  assert.equal(again.ok, false);
});

test("delivery charge is added once to total and stored on the order", () => {
  let state = createSeedState();
  state.cart = {
    ...state.cart,
    channel: "delivery",
    phone: "03001234567",
    address: "Karachi",
    deliveryChargePaisa: 100_00,
    lines: [pizzaLine("Large", ["Tikka"])],
    idempotencyKey: "del-1",
  };
  const totals = cartTotals(state);
  assert.equal(totals.deliveryChargePaisa, 100_00);
  assert.equal(totals.totalPaisa, totals.subtotalPaisa - totals.discountPaisa + totals.taxPaisa + 100_00);
  const result = checkout(state, {
    actorId: "c1",
    actorName: "Cashier",
    tenders: [{ method: "cash", tenderedPaisa: totals.totalPaisa }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const order = result.state.orders.find((o) => o.id === result.value.orderId)!;
  assert.equal(order.deliveryChargePaisa, 100_00);
  assert.equal(order.totalPaisa, totals.totalPaisa);
});

test("archive party keeps history and blocks non-zero balance without force", () => {
  let state = createSeedState();
  const saved = saveParty(state, {
    name: "Test Shop",
    kind: "sale",
    phone: "03001112233",
    address: "",
    notes: "",
    openingPaisa: 500_00,
  }, "Owner");
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  state = saved.state;
  const partyId = saved.value;
  const blocked = archiveParty(state, partyId, "Owner", false);
  assert.equal(blocked.ok, false);
  const forced = archiveParty(state, partyId, "Owner", true);
  assert.equal(forced.ok, true);
  if (!forced.ok) return;
  state = forced.state;
  const party = state.parties.find((p) => p.id === partyId)!;
  assert.equal(party.active, false);
  assert.equal(partyBalance(state, partyId), 500_00);
  const restored = restoreParty(state, partyId, "Owner");
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.state.parties.find((p) => p.id === partyId)!.active, true);
});
