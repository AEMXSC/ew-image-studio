/**
 * Browser storage for the panel. Everything lives in localStorage on the
 * panel's own web address: the author's Gemini API key, the chosen model
 * and the Library folder per site. Generated images are never stored here.
 */
const PREFIX = 'ew-image-studio:';

/**
 * The panel's localStorage, or an in-memory store when the browser blocks it
 * (third-party storage off, sandboxed frame). `persistent` says which one.
 */
export function panelStore(win = window) {
  try {
    const store = win.localStorage;
    store.getItem(PREFIX);
    return { store, persistent: true };
  } catch {
    return { store: memoryStore(), persistent: false };
  }
}

export function browserStorage(store) {
  const read = (key) => {
    try {
      return JSON.parse(store.getItem(PREFIX + key));
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      if (value === null || value === undefined) store.removeItem(PREFIX + key);
      else store.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage blocked (private mode, policy): the panel still works for this session.
    }
  };

  return {
    key: () => read('key'),
    setKey: (k) => write('key', k),
    model: () => read('model'),
    setModel: (m) => write('model', m),
    folder: (org, site) => read(`folder:${org}/${site}`),
    setFolder: (org, site, f) => write(`folder:${org}/${site}`, f),
    clear() {
      try {
        const keys = [];
        for (let i = 0; i < store.length; i += 1) keys.push(store.key(i));
        keys.filter((k) => k?.startsWith(PREFIX)).forEach((k) => store.removeItem(k));
      } catch {
        // nothing to clear
      }
    },
  };
}

/** In-memory stand-in for tests and for browsers that block storage. */
export function memoryStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}
