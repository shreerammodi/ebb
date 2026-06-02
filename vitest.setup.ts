import '@testing-library/jest-dom';

// jsdom in this environment does not provide localStorage. Supply a minimal
// in-memory polyfill so code that persists settings can run under test.
if (typeof window !== 'undefined' && window.localStorage == null) {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}
