import type { AppState } from "./types.ts";
import { createSeedState, STARTER_LOGINS } from "./seed.ts";
import { hashPassword } from "./password.ts";

const DB_NAME = "beerflow-pos";
const DB_VERSION = 1;

export interface StoredImage {
  id: string;
  mime: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the till database."));
  });
}

async function rawGetState(): Promise<AppState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const request = tx.objectStore("kv").get("state");
    request.onsuccess = () => resolve((request.result as AppState | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function rawPutState(state: AppState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(state, "state");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let chain: Promise<unknown> = Promise.resolve();
let revision = 0;

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function updateState<T>(
  fn: (state: AppState) => { state: AppState; value: T } | Promise<{ state: AppState; value: T }>,
): Promise<{ state: AppState; value: T; revision: number }> {
  return enqueue(async () => {
    const current = await rawGetState();
    if (!current) throw new Error("The till is not ready yet.");
    const result = await fn(normalizeState(current));
    await rawPutState(result.state);
    revision += 1;
    return { state: result.state, value: result.value, revision };
  });
}

export function commitState(state: AppState): Promise<number> {
  return enqueue(async () => {
    await rawPutState(state);
    revision += 1;
    return revision;
  });
}

export async function loadImages(): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("images", "readonly");
    const request = tx.objectStore("images").getAll();
    const keys = tx.objectStore("images").getAllKeys();
    let rows: { mime: string; blob: Blob }[] = [];
    let ids: IDBValidKey[] = [];
    request.onsuccess = () => {
      rows = request.result as { mime: string; blob: Blob }[];
    };
    keys.onsuccess = () => {
      ids = keys.result;
    };
    tx.oncomplete = () => {
      resolve(rows.map((row, index) => ({ id: String(ids[index]), mime: row.mime, blob: row.blob })));
    };
    tx.onerror = () => reject(tx.error);
  });
}

export function saveImage(id: string, mime: string, blob: Blob): Promise<void> {
  return enqueue(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put({ mime, blob }, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export function deleteImage(id: string): Promise<void> {
  return enqueue(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

export interface BackupFile {
  app: "beerflow-pos";
  version: 1;
  exportedAt: string;
  state: AppState;
  images: { id: string; mime: string; base64: string }[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode(...bytes.subarray(index, index + size));
    }
    return btoa(binary);
  });
}

export async function exportBackup(): Promise<BackupFile> {
  const state = await enqueue(() => rawGetState());
  if (!state) throw new Error("Nothing to back up yet.");
  const images = await loadImages();
  const encoded = await Promise.all(
    images.map(async (image) => ({ id: image.id, mime: image.mime, base64: await blobToBase64(image.blob) })),
  );
  return { app: "beerflow-pos", version: 1, exportedAt: new Date().toISOString(), state, images: encoded };
}

function isState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const state = value as AppState;
  return (
    state.meta?.version === 1 &&
    Array.isArray(state.orders) &&
    Array.isArray(state.products) &&
    Array.isArray(state.deals) &&
    Array.isArray(state.ledger) &&
    Array.isArray(state.staff) &&
    !!state.settings &&
    !!state.cart
  );
}

/** Fill fields added after older backups so the app never crashes on missing keys. */
export function normalizeState(state: AppState): AppState {
  if (!Array.isArray(state.closedDays)) state.closedDays = [];
  if (state.cart && typeof state.cart.deliveryChargePaisa !== "number") {
    state.cart.deliveryChargePaisa = 0;
  }
  for (const order of state.orders ?? []) {
    if (typeof (order as { deliveryChargePaisa?: number }).deliveryChargePaisa !== "number") {
      (order as { deliveryChargePaisa: number }).deliveryChargePaisa = 0;
    }
  }
  for (const party of state.parties ?? []) {
    if (typeof (party as { active?: boolean }).active !== "boolean") {
      (party as { active: boolean }).active = true;
    }
  }
  return state;
}

export async function importBackup(raw: unknown): Promise<AppState> {
  const data = raw as BackupFile;
  if (!data || data.app !== "beerflow-pos" || data.version !== 1 || !isState(data.state)) {
    throw new Error("This file is not a BeerFlow POS backup.");
  }
  if (!Array.isArray(data.state.staff) || data.state.staff.length === 0) {
    throw new Error("The backup has no till logins.");
  }
  normalizeState(data.state);
  const images = (data.images ?? []).map((image) => {
    const binary = atob(image.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { id: image.id, mime: image.mime, blob: new Blob([bytes], { type: image.mime }) };
  });
  await enqueue(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["kv", "images"], "readwrite");
      tx.objectStore("images").clear();
      for (const image of images) tx.objectStore("images").put({ mime: image.mime, blob: image.blob }, image.id);
      tx.objectStore("kv").put(data.state, "state");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Restore failed. Your current till was left as it was."));
    });
  });
  return data.state;
}

export interface InstallSetup {
  shopName: string;
  ownerUsername: string;
  ownerPassword: string;
  cashierPassword: string;
}

/** True when this browser already holds a till, without creating one. */
export async function hasSavedState(): Promise<boolean> {
  try {
    return (await enqueue(rawGetState)) !== null;
  } catch {
    return false;
  }
}

export function initDatabase(setup?: InstallSetup): Promise<AppState> {
  return enqueue(async () => {
    const existing = await rawGetState();
    if (existing) return normalizeState(existing);
    const state = createSeedState();
    const now = new Date().toISOString();
    const shopName = setup?.shopName.trim();
    if (shopName) state.settings.shopName = shopName;
    state.staff = await Promise.all(
      STARTER_LOGINS.map(async (login) => {
        const isOwner = login.role === "owner";
        const username = setup && isOwner ? setup.ownerUsername.trim() || login.username : login.username;
        const password = setup ? (isOwner ? setup.ownerPassword : setup.cashierPassword) : login.password;
        return {
          id: crypto.randomUUID(),
          username,
          displayName: login.displayName,
          role: login.role,
          passwordHash: await hashPassword(password),
          active: true,
          createdAt: now,
        };
      }),
    );
    state.audit.push({
      id: crypto.randomUUID(),
      at: now,
      actor: "System",
      action: "setup",
      detail: setup
        ? "Installed with the setup wizard. Starter sample menu loaded. Stock counts are empty until you enter them."
        : "Starter sample menu loaded. Stock counts are empty until you enter them.",
    });
    await rawPutState(state);
    return state;
  });
}

/** Erase every stored record and picture. Used by the uninstall flow. */
export async function wipeDatabase(): Promise<void> {
  await enqueue(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["kv", "images"], "readwrite");
      tx.objectStore("kv").clear();
      tx.objectStore("images").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
}

export async function resetDatabase(): Promise<AppState> {
  await enqueue(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["kv", "images"], "readwrite");
      tx.objectStore("kv").clear();
      tx.objectStore("images").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
  return initDatabase();
}
