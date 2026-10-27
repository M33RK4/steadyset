/** Tiny safe wrapper around localStorage (it can throw in private mode or when storage is full). */
export interface KV {
  get<T>(key: string): T | null;
  set(key: string, value: unknown): boolean;
  remove(key: string): void;
}

export const memoryKV = (): KV => {
  const m = new Map<string, string>();
  return {
    get: <T,>(k: string) => {
      const v = m.get(k);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    set: (k, v) => {
      m.set(k, JSON.stringify(v));
      return true;
    },
    remove: (k) => void m.delete(k),
  };
};

export const browserKV: KV = {
  get<T>(key: string): T | null {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const KEYS = {
  guestData: "steadyset:guest:data:v1",
  guestActive: "steadyset:guest:active:v1",
  theme: "steadyset:theme",
  userCache: (uid: string) => `steadyset:user:${uid}:cache:v1`,
  userOutbox: (uid: string) => `steadyset:user:${uid}:outbox:v1`,
  userPrefsPending: (uid: string) => `steadyset:user:${uid}:prefs-pending:v1`,
  userActive: (uid: string) => `steadyset:user:${uid}:active:v1`,
  lastUser: "steadyset:last-user",
};
