import { useSyncExternalStore } from "react";

/** A minimal external store: one value, subscribers, optional localStorage. */
type Store<T> = {
  get: () => T;
  set: (next: T | ((previous: T) => T)) => void;
  /** Take a value written elsewhere (another tab) without writing it back. */
  adopt: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T, persistKey?: string): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
      if (persistKey) persist(persistKey, value);
      notify();
    },
    adopt(next) {
      value = next;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Writing can fail - private browsing, a full quota, storage blocked by the
 * browser. The conversation keeps going in memory rather than every change
 * throwing; the failure is logged, not swallowed.
 */
function persist(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[store] couldn't save "${key}"; continuing in memory.`, error);
  }
}

/**
 * The saved value, or null if there is none or it can't be read. Unreadable
 * data (not JSON, blocked storage) is reported and treated as "nothing saved",
 * so a bad value never stops the app from rendering.
 */
export function readPersisted(key: string): unknown {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`[store] couldn't read "${key}".`, error);
    return null;
  }
  return raw === null ? null : parsePersisted(key, raw);
}

/** A raw value written under `key` (here, or by another tab), or null if it isn't JSON. */
export function parsePersisted(key: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[store] "${key}" isn't valid JSON; ignoring it.`, error);
    return null;
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
