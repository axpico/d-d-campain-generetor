// IndexedDB persistence: campaigns and generated images (images can be large blobs,
// which would blow through localStorage's ~5 MB limit).
import type { Campaign } from './types';
import type { GameState } from '../play/types';

const DB_NAME = 'dnd-campaign-generator';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('campaigns')) d.createObjectStore('campaigns', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('games')) d.createObjectStore('games', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const campaignsDb = {
  list: () => tx<Campaign[]>('campaigns', 'readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt)),
  get: (id: string) => tx<Campaign | undefined>('campaigns', 'readonly', (s) => s.get(id)),
  put: (c: Campaign) => tx('campaigns', 'readwrite', (s) => s.put(c)),
  delete: (id: string) => tx('campaigns', 'readwrite', (s) => s.delete(id)),
};

export const gamesDb = {
  get: (id: string) => tx<GameState | undefined>('games', 'readonly', (s) => s.get(id)),
  put: (g: GameState) => tx('games', 'readwrite', (s) => s.put(g)),
  delete: (id: string) => tx('games', 'readwrite', (s) => s.delete(id)),
};

export interface StoredImage {
  id: string;
  prompt: string;
  provider: string;
  createdAt: number;
  url?: string; // remote URL (e.g. Pollinations)
  blob?: Blob; // binary result from other providers
}

export const imagesDb = {
  get: (id: string) => tx<StoredImage | undefined>('images', 'readonly', (s) => s.get(id)),
  put: (img: StoredImage) => tx('images', 'readwrite', (s) => s.put(img)),
  delete: (id: string) => tx('images', 'readwrite', (s) => s.delete(id)),
};

/** Settings are small and read synchronously, so they live in localStorage. */
export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — settings just won't persist */
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
