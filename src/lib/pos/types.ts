export type Role = "owner" | "cashier";
export type PayMethod = "cash" | "card" | "wallet";
export type Channel = "dine-in" | "takeaway" | "delivery";
export type ProductType = "pizza" | "drink" | "side" | "extra" | "other" | "generic";
export type CategoryKind = "deals" | "pizza" | "drinks" | "sides" | "extras" | "other" | "food" | "beverages" | "desserts" | "bakery";

export interface StaffUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  createdAt: string;
}

export interface PayMethodSetting {
  id: PayMethod;
  label: string;
  enabled: boolean;
}

export interface Settings {
  shopName: string;
  branch: string;
  tagline: string;
  address: string;
  phones: string[];
  hours: string;
  website: string;
  currency: "PKR";
  dateFormat: "dmy" | "mdy";
  receiptWidth: "58" | "80";
  receiptFooter: string;
  logoImageId: string | null;
  taxEnabled: boolean;
  taxBps: number;
  blockNegativeStock: boolean;
  paymentMethods: PayMethodSetting[];
  expenseCategories: string[];
  openingCashPaisa: number;
  openingCashDate: string;
  tagFrequentDays: number;
  tagFrequentMinDays: number;
  tagInactiveDays: number;
  tagVipSpendPaisa: number;
  tagVipVisits: number;
  tagNewDays: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  sort: number;
  active: boolean;
}

/** Legacy named price (size / flavour / addon). Kept for backward compatibility. */
export interface NamedPrice {
  id: string;
  name: string;
  pricePaisa: number;
  /** Optional: when this addon is selected, also consume this ingredient */
  ingredientId?: string | null;
  /** Extra quantity of the linked ingredient (in the ingredient's unit) */
  extraQty?: number;
}

/* ------------------------------------------------------------------ */
/*  UNIVERSAL MODIFIER ENGINE                                          */
/* ------------------------------------------------------------------ */

export type ModifierSelectionMode = "single" | "multi";

export interface ModifierOption {
  id: string;
  name: string;
  /** Price adjustment in paisa (can be 0, positive or negative) */
  pricePaisa: number;
  /** Optional linked ingredient consumption when this option is chosen */
  ingredientId?: string | null;
  /** Quantity of the linked ingredient (positive = add, negative = remove) */
  ingredientQty?: number;
  /** Multiplier applied to the base recipe quantity of this ingredient (e.g. 2 = double) */
  qtyMultiplier?: number;
  /** Whether this option is available */
  active: boolean;
  sort: number;
  /** Default selected when the group is first shown */
  isDefault?: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  description: string;
  /** single = radio, multi = checkboxes */
  selectionMode: ModifierSelectionMode;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
  active: boolean;
  sort: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  categoryId: string;
  type: ProductType;
  imageId: string | null;
  basePricePaisa: number;
  costPricePaisa: number | null;
  /** Legacy size list – still fully supported */
  sizes: NamedPrice[];
  /** Legacy flavour list – still fully supported */
  flavours: NamedPrice[];
  halfAndHalf: boolean;
  /** Legacy addon list – still fully supported */
  addons: NamedPrice[];
  /**
   * New universal modifier groups attached to this product.
   * Empty array = product uses only legacy sizes/flavours/addons.
   */
  modifierGroups: ModifierGroup[];
  trackStock: boolean;
  stockQty: number;
  minStock: number;
  active: boolean;
  sort: number;
  /** Free-form preparation notes for kitchen */
  prepNotes?: string;
  /** Whether finished-goods stock is tracked (in addition to recipe ingredients) */
  trackFinishedStock?: boolean;
}

export interface DealSlot {
  id: string;
  label: string;
  mode: "pizza" | "fixed" | "choice";
  productId: string | null;
  choiceProductIds: string[];
  sizeName: string | null;
  flavourRequired: boolean;
  qty: number;
}

export interface Deal {
  id: string;
  title: string;
  description: string;
  pricePaisa: number;
  compareAtPaisa: number | null;
  imageId: string | null;
  slots: DealSlot[];
  active: boolean;
  sort: number;
  validFrom: string | null;
  validTo: string | null;
  notes: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  manualTags: string[];
  partyId: string | null;
  createdAt: string;
}

export interface Party {
  id: string;
  name: string;
  kind: "sale" | "purchase";
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  /** false = archived. History and balance are kept; party is hidden from normal lists. */
  active: boolean;
}

export interface LedgerEntry {
  id: string;
  partyId: string;
  at: string;
  type:
    | "opening"
    | "credit_sale"
    | "customer_payment"
    | "purchase"
    | "supplier_payment"
    | "refund"
    | "adjustment";
  direction: "increase" | "decrease";
  amountPaisa: number;
  method: PayMethod | "none";
  description: string;
  orderId: string | null;
  reversalOf: string | null;
  reversed: boolean;
}

export interface LinePick {
  slotId: string;
  label: string;
  productId: string;
  productName: string;
  sizeName: string | null;
  flavour: string | null;
  qty: number;
}

/** Selected modifier options for a cart / order line */
export interface ModifierSelection {
  groupId: string;
  optionIds: string[];
}

export interface LineConfig {
  sizeName?: string;
  flavours?: string[];
  addonIds?: string[];
  picks?: LinePick[];
  /** New universal modifier selections */
  modifierSelections?: ModifierSelection[];
}

export interface CartLine {
  key: string;
  kind: "product" | "deal";
  refId: string;
  qty: number;
  notes: string;
  config: LineConfig;
}

export interface Cart {
  lines: CartLine[];
  channel: Channel;
  tableNo: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  discountPaisa: number;
  /** Delivery fee in paisa. Only meaningful for delivery channel; still stored for history. */
  deliveryChargePaisa: number;
  partyId: string | null;
  idempotencyKey: string;
}

export interface OrderLine {
  id: string;
  kind: "product" | "deal";
  refId: string;
  name: string;
  qty: number;
  unitPricePaisa: number;
  lineTotalPaisa: number;
  notes: string;
  detail: string;
  config: LineConfig;
}

export interface Tender {
  id: string;
  method: PayMethod;
  amountPaisa: number;
  at: string;
}

export interface Order {
  id: string;
  number: string;
  createdAt: string;
  status: "completed" | "cancelled";
  channel: Channel;
  tableNo: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  partyId: string | null;
  onAccountPaisa: number;
  subtotalPaisa: number;
  discountPaisa: number;
  deliveryChargePaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  cogsPaisa: number;
  cogsPartial: boolean;
  items: OrderLine[];
  payments: Tender[];
  refunds: Tender[];
  cashierId: string;
  cashierName: string;
  idempotencyKey: string;
  cancelReason: string;
  cancelledAt: string | null;
}

export interface Expense {
  id: string;
  at: string;
  category: string;
  amountPaisa: number;
  method: PayMethod | "other";
  description: string;
  partyId: string | null;
  reference: string;
  voided: boolean;
  voidReason: string;
}

/* ------------------------------------------------------------------ */
/*  INGREDIENT & RECIPE ENGINE                                         */
/* ------------------------------------------------------------------ */

export type IngredientCategory =
  | "meat"
  | "chicken"
  | "beef"
  | "mutton"
  | "seafood"
  | "dairy"
  | "cheese"
  | "vegetables"
  | "fruits"
  | "spices"
  | "sauces"
  | "flour"
  | "bakery"
  | "rice"
  | "beverages"
  | "packaging"
  | "cleaning"
  | "prepared"
  | "other";

export interface Ingredient {
  id: string;
  name: string;
  /** Stock / recipe unit (g, kg, ml, litre, pcs, dozen …) */
  unit: string;
  /** Purchase unit (may differ from stock unit) */
  purchaseUnit?: string;
  /** How many stock-units equal one purchase-unit (e.g. 1000 for kg→g) */
  conversionFactor?: number;
  kind: "ingredient" | "packaging" | "prepared";
  category?: IngredientCategory | string;
  stockQty: number;
  avgCostPaisa: number;
  minQty: number;
  reorderLevel?: number;
  active: boolean;
  sku?: string;
  notes?: string;
  /** If this is a prepared item, the recipe that produces it */
  productionRecipeId?: string | null;
}

export interface RecipeLine {
  ingredientId: string;
  qty: number;
  /** Optional note for this line (e.g. "base dough only") */
  note?: string;
}

/**
 * Recipe matching priority (highest → lowest):
 * 1. Exact product + size + flavour + modifier combination
 * 2. Product + size + flavour
 * 3. Product + size
 * 4. Product only
 * 5. Deal-level recipe
 *
 * Half-and-half: two flavour recipes are each applied at 0.5×, shared base is applied once.
 */
export interface Recipe {
  id: string;
  productId: string | null;
  dealId: string | null;
  sizeName: string | null;
  /** Flavour this recipe belongs to (null = base / any) */
  flavourName?: string | null;
  /** Optional modifier option IDs that must all be selected for this recipe to apply */
  requiredModifierOptionIds?: string[];
  lines: RecipeLine[];
  active: boolean;
  note: string;
  /**
   * When true this recipe is an *adjustment* (additions / removals) rather than a full base recipe.
   * Used for modifier-driven ingredient changes.
   */
  isAdjustment?: boolean;
}

export interface StockMovement {
  id: string;
  at: string;
  ingredientId: string | null;
  productId: string | null;
  type: "purchase" | "sale" | "wastage" | "adjustment" | "reversal" | "out" | "production";
  qty: number;
  unitCostPaisa: number;
  totalCostPaisa: number;
  method: PayMethod | "credit" | "none";
  partyId: string | null;
  orderId: string | null;
  reason: string;
  /** Optional reference to a production batch */
  productionBatchId?: string | null;
}

/** Batch production of a prepared ingredient */
export interface ProductionBatch {
  id: string;
  preparedIngredientId: string;
  quantity: number;
  unit: string;
  producedAt: string;
  producedBy: string;
  rawCostPaisa: number;
  notes: string;
  /** Stock movement IDs created by this batch (for reversal) */
  movementIds?: string[];
  reversed?: boolean;
  reversedAt?: string | null;
  reversedBy?: string | null;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

/** One business day that has been formally closed. Does not delete any data. */
export interface ClosedDay {
  id: string;
  /** YYYY-MM-DD local business day */
  date: string;
  closedAt: string;
  closedBy: string;
  closedByName: string;
  actualCashPaisa: number;
  expectedCashPaisa: number;
  differencePaisa: number;
  notes: string;
  /** Snapshot of key numbers at close time for audit */
  summary: {
    orderCount: number;
    salesPaisa: number;
    cashSalesPaisa: number;
    cardWalletPaisa: number;
    creditSalesPaisa: number;
    partyPaymentsPaisa: number;
    expensesPaisa: number;
    refundPaisa: number;
    deliveryChargePaisa: number;
    revenuePaisa: number;
    cogsPaisa: number;
  };
  /** true if owner later reopened this day */
  reopened: boolean;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string;
}

export interface AppState {
  meta: { version: 2; nextOrder: number; createdAt: string };
  settings: Settings;
  staff: StaffUser[];
  categories: Category[];
  products: Product[];
  deals: Deal[];
  customers: Customer[];
  parties: Party[];
  ledger: LedgerEntry[];
  orders: Order[];
  expenses: Expense[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  stockMovements: StockMovement[];
  audit: AuditEvent[];
  closedDays: ClosedDay[];
  productionBatches: ProductionBatch[];
  cart: Cart;
}

export interface Session {
  userId: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface PricedLine {
  line: CartLine;
  name: string;
  detail: string;
  unitPricePaisa: number;
  lineTotalPaisa: number;
}

export interface CartTotals {
  lines: PricedLine[];
  subtotalPaisa: number;
  discountPaisa: number;
  deliveryChargePaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  error: string | null;
}

export type Result<T> = { ok: true; state: AppState; value: T } | { ok: false; error: string };
