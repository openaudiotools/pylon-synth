// store.ts — a minimal external store bridging the imperative three.js control
// loop to the React overlay panels.
//
// Each overlay factory (midi.js, supersonic.js, readout.js) owns one store and
// pushes state into it with set(); its React panel reads the state through
// useSyncExternalStore. This replaces the old imperative DOM setters
// (ui.setStatus, ui.setValue, …) one-for-one, so the factories keep their
// existing { tick, dispose } contract and main.js's bootstrap is unchanged.

export interface Store<T> {
  /** Current snapshot. Stable identity until the next set(). */
  get: () => T;
  /** Merge a partial patch and notify subscribers. */
  set: (patch: Partial<T>) => void;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
