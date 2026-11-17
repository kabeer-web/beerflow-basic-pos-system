import { create } from "zustand";
import { exportBackup, importBackup, initDatabase, loadImages, resetDatabase, saveImage, updateState, type InstallSetup } from "./db.ts";
import { uninstallEverything, writeInstall } from "./lifecycle.ts";
import {
  archiveParty,
  cancelOrder,
  checkout,
  closeDay,
  collectOrderPayment,
  patchCart,
  postLedger,
  postStock,
  removeDeal,
  removeIngredient,
  removeProduct,
  reopenDay,
  restoreParty,
  saveCustomer,
  saveDeal,
  saveExpense,
  saveIngredient,
  saveParty,
  saveProduct,
  saveRecipe,
  updateSettings,
  voidExpense,
} from "./logic.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import type { AppState, Cart, Customer, Deal, Expense, Ingredient, PayMethod, Product, Recipe, Result, Role, Session, Settings } from "./types.ts";
import { uid } from "./money.ts";

const SESSION_KEY = "bf-session";

interface PosStore {
  ready: boolean;
  error: string;
  state: AppState | null;
  session: Session | null;
  imageUrls: Record<string, string>;
  boot: () => Promise<void>;
  login: (usernameOrRole: string, password: string, roleHint?: "owner" | "cashier") => Promise<void>;
  logout: () => void;
  refreshImages: () => Promise<void>;
  uploadImage: (file: File) => Promise<string>;
  setCart: (cart: Cart) => Promise<void>;
  checkout: (tenders: { method: PayMethod; tenderedPaisa: number }[]) => Promise<{ orderId: string; changePaisa: number; duplicate: boolean }>;
  collect: (orderId: string, method: PayMethod, amountPaisa: number) => Promise<void>;
  cancel: (orderId: string, reason: string) => Promise<void>;
  saveProduct: (product: Product) => Promise<string>;
  removeProduct: (id: string) => Promise<boolean>;
  saveDeal: (deal: Deal) => Promise<string>;
  removeDeal: (id: string) => Promise<boolean>;
  saveCustomer: (customer: Customer) => Promise<void>;
  saveParty: (input: Parameters<typeof saveParty>[1]) => Promise<void>;
  archiveParty: (partyId: string, force?: boolean) => Promise<void>;
  restoreParty: (partyId: string) => Promise<void>;
  postLedger: (input: Parameters<typeof postLedger>[1]) => Promise<void>;
  saveIngredient: (ingredient: Ingredient) => Promise<void>;
  removeIngredient: (id: string) => Promise<boolean>;
  postStock: (input: Parameters<typeof postStock>[1]) => Promise<void>;
  saveRecipe: (recipe: Recipe) => Promise<void>;
  saveExpense: (expense: Expense) => Promise<void>;
  voidExpense: (id: string, reason: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  closeDay: (input: { date: string; actualCashPaisa: number; notes: string }) => Promise<string>;
  reopenDay: (closedDayId: string, reason: string) => Promise<void>;
  addStaff: (input: { username: string; displayName: string; role: Role; password: string }) => Promise<void>;
  setStaffActive: (id: string, active: boolean) => Promise<void>;
  changePassword: (userId: string, nextPassword: string, oldPassword?: string) => Promise<void>;
  backup: () => Promise<void>;
  restore: (raw: unknown) => Promise<void>;
  resetAll: () => Promise<void>;
  install: (setup: InstallSetup) => Promise<void>;
  uninstall: () => Promise<void>;
}

function remember(session: Session | null) {
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let seenRevision = 0;

function publish(state: AppState, revision: number, set: (partial: Partial<PosStore>) => void) {
  if (revision < seenRevision) return;
  seenRevision = revision;
  set({ state });
}

async function apply<T>(
  maker: (state: AppState) => Result<T> | Promise<Result<T>>,
  set: (partial: Partial<PosStore>) => void,
): Promise<T> {
  const packed = await updateState(async (current) => {
    const result = await maker(current);
    if (!result.ok) throw new Error(result.error);
    return { state: result.state, value: result.value };
  });
  publish(packed.state, packed.revision, set);
  return packed.value;
}

function owner(session: Session | null) {
  if (!session || session.role !== "owner") throw new Error("Only the owner can do that.");
  return session;
}

function actor(session: Session | null): Session {
  if (!session) throw new Error("Sign in first.");
  return session;
}

let cartTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCart: import("./types.ts").Cart | null = null;
let cartFlush: Promise<void> = Promise.resolve();

async function flushPendingCart(set: (partial: Partial<PosStore>) => void): Promise<void> {
  if (cartTimer) {
    clearTimeout(cartTimer);
    cartTimer = null;
  }
  if (!pendingCart) return;
  const cart = pendingCart;
  pendingCart = null;
  cartFlush = (async () => {
    const packed = await updateState(async (current) => {
      const result = patchCart(current, cart);
      if (!result.ok) throw new Error(result.error);
      return { state: result.state, value: result.value };
    });
    // Don't overwrite newer keystrokes that happened while IDB was writing.
    if (pendingCart) return;
    const live = usePos.getState().state;
    if (live && live.cart !== cart && JSON.stringify(live.cart) !== JSON.stringify(cart)) {
      // Keep live optimistic cart, but persist completed write's non-cart fields if any.
      publish({ ...packed.state, cart: live.cart }, packed.revision, set);
      return;
    }
    publish(packed.state, packed.revision, set);
  })();
  await cartFlush;
}

export const usePos = create<PosStore>((set, get) => ({
  ready: false,
  error: "",
  state: null,
  session: null,
  imageUrls: {},
  boot: async () => {
    try {
      const state = await initDatabase();
      const saved = readSession();
      const user = saved ? state.staff.find((member) => member.id === saved.userId && member.active) : undefined;
      set({
        ready: true,
        state,
        error: "",
        session: user ? { userId: user.id, username: user.username, displayName: user.displayName, role: user.role } : null,
      });
      await get().refreshImages();
    } catch (error) {
      set({ ready: true, error: error instanceof Error ? error.message : "The till could not start." });
    }
  },
  refreshImages: async () => {
    const images = await loadImages();
    const next: Record<string, string> = {};
    for (const image of images) next[image.id] = URL.createObjectURL(image.blob);
    const previous = get().imageUrls;
    for (const url of Object.values(previous)) URL.revokeObjectURL(url);
    set({ imageUrls: next });
  },
  login: async (usernameOrRole, password, roleHint) => {
    const state = get().state;
    if (!state) throw new Error("The till is not ready yet.");
    const trimmed = usernameOrRole.trim().toLowerCase();
    // Prefer explicit role from dropdown: match active staff of that role by password
    let user = null as (typeof state.staff)[number] | null | undefined;
    if (roleHint === "owner" || roleHint === "cashier") {
      const candidates = state.staff.filter((member) => member.role === roleHint && member.active);
      for (const member of candidates) {
        if (await verifyPassword(password, member.passwordHash)) {
          user = member;
          break;
        }
      }
    }
    // Fallback: classic username + password
    if (!user) {
      const byName = state.staff.find((member) => member.username.toLowerCase() === trimmed && member.active);
      if (byName && (await verifyPassword(password, byName.passwordHash))) user = byName;
    }
    if (!user) {
      throw new Error("Wrong password for that account.");
    }
    const session = { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
    remember(session);
    set({ session });
  },
  logout: () => {
    if (cartTimer) {
      clearTimeout(cartTimer);
      cartTimer = null;
    }
    pendingCart = null;
    remember(null);
    set({ session: null });
  },
  uploadImage: async (file) => {
    owner(get().session);
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) throw new Error("Use a JPG, PNG, or WebP image.");
    if (file.size > 1_500_000) throw new Error("Image must be under 1.5 MB.");
    const id = uid();
    await saveImage(id, file.type, file);
    const url = URL.createObjectURL(file);
    set({ imageUrls: { ...get().imageUrls, [id]: url } });
    return id;
  },
  setCart: async (cart) => {
    actor(get().session);
    const state = get().state;
    if (!state) throw new Error("The till is not ready yet.");
    // Instant UI update — no IndexedDB on every keystroke (was causing freezes).
    set({ state: { ...state, cart } });
    pendingCart = cart;
    if (cartTimer) clearTimeout(cartTimer);
    cartTimer = setTimeout(() => {
      void flushPendingCart(set).catch(() => undefined);
    }, 280);
  },
  checkout: async (tenders) => {
    const session = actor(get().session);
    await flushPendingCart(set);
    return apply((current) => checkout(current, { actorId: session.userId, actorName: session.displayName, tenders }), set);
  },
  collect: async (orderId, method, amount) => {
    const session = actor(get().session);
    await apply((current) => collectOrderPayment(current, orderId, method, amount, session.displayName), set);
  },
  cancel: async (orderId, reason) => {
    const session = actor(get().session);
    await apply((current) => cancelOrder(current, orderId, reason, session.displayName), set);
  },
  saveProduct: async (product) => {
    const session = owner(get().session);
    return apply((current) => saveProduct(current, product, session.displayName), set);
  },
  removeProduct: async (id) => {
    const session = owner(get().session);
    const value = await apply((current) => removeProduct(current, id, session.displayName), set);
    return value.archived;
  },
  saveDeal: async (deal) => {
    const session = owner(get().session);
    return apply((current) => saveDeal(current, deal, session.displayName), set);
  },
  removeDeal: async (id) => {
    const session = owner(get().session);
    const value = await apply((current) => removeDeal(current, id, session.displayName), set);
    return value.archived;
  },
  saveCustomer: async (customer) => {
    const session = actor(get().session);
    await apply((current) => saveCustomer(current, customer, session.displayName), set);
  },
  saveParty: async (input) => {
    const session = owner(get().session);
    await apply((current) => saveParty(current, input, session.displayName), set);
  },
  archiveParty: async (partyId, force = false) => {
    const session = owner(get().session);
    await apply((current) => archiveParty(current, partyId, session.displayName, force), set);
  },
  restoreParty: async (partyId) => {
    const session = owner(get().session);
    await apply((current) => restoreParty(current, partyId, session.displayName), set);
  },
  postLedger: async (input) => {
    const session = owner(get().session);
    await apply((current) => postLedger(current, input, session.displayName), set);
  },
  removeIngredient: async (id) => {
    const session = owner(get().session);
    const value = await apply((current) => removeIngredient(current, id, session.displayName), set);
    return value.archived;
  },
  saveIngredient: async (ingredient) => {
    const session = owner(get().session);
    await apply((current) => saveIngredient(current, ingredient, session.displayName), set);
  },
  postStock: async (input) => {
    const session = owner(get().session);
    await apply((current) => postStock(current, input, session.displayName), set);
  },
  saveRecipe: async (recipe) => {
    const session = owner(get().session);
    await apply((current) => saveRecipe(current, recipe, session.displayName), set);
  },
  saveExpense: async (expense) => {
    const session = owner(get().session);
    await apply((current) => saveExpense(current, expense, session.displayName), set);
  },
  voidExpense: async (id, reason) => {
    const session = owner(get().session);
    await apply((current) => voidExpense(current, id, reason, session.displayName), set);
  },
  saveSettings: async (settings) => {
    const session = owner(get().session);
    await apply((current) => updateSettings(current, settings, session.displayName), set);
  },
  closeDay: async (input) => {
    const session = owner(get().session);
    let id = "";
    await apply((current) => {
      const result = closeDay(current, {
        ...input,
        actorId: session.userId,
        actorName: session.displayName,
      });
      if (result.ok) id = result.value;
      return result;
    }, set);
    return id;
  },
  reopenDay: async (closedDayId, reason) => {
    const session = owner(get().session);
    await apply(
      (current) => reopenDay(current, closedDayId, reason, session.userId, session.displayName),
      set,
    );
  },
  addStaff: async (input) => {
    const session = owner(get().session);
    if (input.password.length < 4) throw new Error("Use at least 4 characters.");
    if (!/^[a-z0-9._-]{3,20}$/i.test(input.username)) throw new Error("Username should be 3–20 letters or numbers.");
    const passwordHash = await hashPassword(input.password);
    await apply((current) => {
      const next = structuredClone(current);
      if (next.staff.some((member) => member.username.toLowerCase() === input.username.toLowerCase())) {
        return { ok: false, error: "That username is taken." };
      }
      next.staff.push({
        id: uid(),
        username: input.username.trim(),
        displayName: input.displayName.trim() || input.username.trim(),
        role: input.role,
        passwordHash,
        active: true,
        createdAt: new Date().toISOString(),
      });
      next.audit.unshift({ id: uid(), at: new Date().toISOString(), actor: session.displayName, action: "staff", detail: input.username });
      return { ok: true, state: next, value: true };
    }, set);
  },
  setStaffActive: async (id, active) => {
    const session = owner(get().session);
    await apply((current) => {
      const next = structuredClone(current);
      const user = next.staff.find((member) => member.id === id);
      if (!user) return { ok: false, error: "Login not found." };
      const owners = next.staff.filter((member) => member.role === "owner" && member.active && member.id !== id);
      if (user.role === "owner" && !active && owners.length === 0) return { ok: false, error: "Keep at least one active owner." };
      user.active = active;
      next.audit.unshift({ id: uid(), at: new Date().toISOString(), actor: session.displayName, action: "staff", detail: user.username });
      return { ok: true, state: next, value: true };
    }, set);
  },
  changePassword: async (userId, nextPassword, oldPassword) => {
    const session = actor(get().session);
    if (nextPassword.length < 4) throw new Error("Use at least 4 characters.");
    const known = get().state?.staff.find((member) => member.id === userId);
    if (!known) throw new Error("Login not found.");
    const self = session.userId === userId;
    if (!self && session.role !== "owner") throw new Error("Only the owner can reset another login.");
    if (self && !(await verifyPassword(oldPassword ?? "", known.passwordHash))) throw new Error("Current password is wrong.");
    const passwordHash = await hashPassword(nextPassword);
    await apply((current) => {
      const next = structuredClone(current);
      const user = next.staff.find((member) => member.id === userId);
      if (!user) return { ok: false, error: "Login not found." };
      user.passwordHash = passwordHash;
      next.audit.unshift({ id: uid(), at: new Date().toISOString(), actor: session.displayName, action: "password", detail: user.username });
      return { ok: true, state: next, value: true };
    }, set);
  },
  backup: async () => {
    owner(get().session);
    const file = await exportBackup();
    const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    const shop = (get().state?.settings.shopName || "beerflow-pos")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const day = new Date().toISOString().slice(0, 10);
    anchor.download = `${shop}-backup-${day}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  },
  restore: async (raw) => {
    owner(get().session);
    const state = await importBackup(raw);
    set({ state });
    await get().refreshImages();
  },
  install: async (setup) => {
    const state = await initDatabase(setup);
    remember(null);
    set({ ready: true, state, error: "", session: null });
    await get().refreshImages();
  },
  uninstall: async () => {
    owner(get().session);
    await uninstallEverything();
    for (const url of Object.values(get().imageUrls)) URL.revokeObjectURL(url);
    set({ ready: false, state: null, session: null, imageUrls: {}, error: "" });
  },
  resetAll: async () => {
    owner(get().session);
    const state = await resetDatabase();
    // Reset brings back the starter logins, so the login screen should show them again.
    writeInstall("existing");
    remember(null);
    set({ state, session: null });
    await get().refreshImages();
  },
}));

export async function runMutation(work: () => Promise<void>, setError?: (message: string) => void) {
  try {
    await work();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    setError?.(message);
    return false;
  }
}
