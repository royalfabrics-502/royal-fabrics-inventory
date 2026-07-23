export class MemoryCache {
  constructor({ now = () => Date.now() } = {}) {
    this.store = new Map();
    this.now = now;
  }

  set(key, value, { ttlMs = null, tags = [] } = {}) {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? this.now() + ttlMs : null,
      tags: new Set(tags),
    });
    return value;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.store.delete(key);
  }

  invalidateTag(tag) {
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.has(tag)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }
}

export const cache = new MemoryCache();
