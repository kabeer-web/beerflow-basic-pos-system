import { create } from "zustand";
import { hasSavedState, wipeDatabase } from "./db.ts";

const INSTALL_KEY = "beerflow-pos-install";

export type InstallMode = "wizard" | "existing";
export type LifecycleView = "checking" | "install" | "app" | "uninstalling" | "uninstalled";

export interface InstallRecord {
  at: string;
  mode: InstallMode;
}

export function readInstall(): InstallRecord | null {
  try {
    const raw = localStorage.getItem(INSTALL_KEY);
    return raw ? (JSON.parse(raw) as InstallRecord) : null;
  } catch {
    return null;
  }
}

export function writeInstall(mode: InstallMode) {
  try {
    localStorage.setItem(INSTALL_KEY, JSON.stringify({ at: new Date().toISOString(), mode }));
  } catch {
    // Private mode can block storage; the till still works, the wizard just shows again.
  }
}

interface LifecycleStore {
  view: LifecycleView;
  detect: () => Promise<void>;
  setView: (view: LifecycleView) => void;
}

export const useLifecycle = create<LifecycleStore>((set) => ({
  view: "checking",
  detect: async () => {
    const hasData = await hasSavedState();
    if (hasData) {
      if (!readInstall()) writeInstall("existing");
      set({ view: "app" });
      return;
    }
    // No till data → always show setup wizard (ignore stale install flag)
    try {
      localStorage.removeItem(INSTALL_KEY);
    } catch {
      /* ignore */
    }
    set({ view: "install" });
  },
  setView: (view) => set({ view }),
}));

type DesktopApi = {
  isDesktop: boolean;
  wipeAllData: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  showMessage?: (title: string, message: string) => Promise<void>;
};

function getDesktopApi(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { beerflowDesktop?: DesktopApi }).beerflowDesktop;
  return api?.isDesktop ? api : null;
}

/**
 * Remove the till data from this device.
 * - Electron desktop: deletes the whole userData folder (permanent — reinstall is empty).
 * - Browser: clears IndexedDB, localStorage, caches, service workers for this origin.
 */
export async function uninstallEverything(): Promise<void> {
  const desktop = getDesktopApi();
  if (desktop) {
    await wipeDatabase().catch(() => undefined);
    try {
      localStorage.removeItem(INSTALL_KEY);
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    await desktop.wipeAllData();
    return;
  }

  await wipeDatabase();
  try {
    localStorage.removeItem(INSTALL_KEY);
    sessionStorage.clear();
  } catch {
    // Nothing to clear when storage is blocked.
  }
  if ("caches" in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}
