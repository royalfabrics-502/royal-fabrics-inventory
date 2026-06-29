// Royal Fabrics — IndexedDB local database
// Used for: offline read cache + pending write queue

const DB_NAME = 'royal-fabrics-local';
const DB_VERSION = 1;

// Table names mirror Supabase tables
const STORES = [
  'yarn_entries',
  'production_entries',
  'fabric_entries',
  'outlets',
  'outlet_stock_moves',
  'outlet_sales',
  'payment_entries',
  'expense_entries',
  'pending_ops',   // queue of writes to sync when online
];

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

// ── Generic get all from a store ─────────────────────────────
export async function localGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ── Generic put (insert or replace) ──────────────────────────
export async function localPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

// ── Generic put many (bulk replace) ──────────────────────────
export async function localPutMany(storeName, records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    records.forEach((r) => store.put(r));
    tx.oncomplete = () => resolve(records);
    tx.onerror = () => reject(tx.error);
  });
}

// ── Generic delete ────────────────────────────────────────────
export async function localDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

// ── Clear and replace entire store (used after full sync) ─────
export async function localReplaceAll(storeName, records) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    records.forEach((r) => store.put(r));
    tx.oncomplete = () => resolve(records);
    tx.onerror = () => reject(tx.error);
  });
}

// ── Pending operations queue ──────────────────────────────────
// Each pending op: { id, table, action('insert'|'delete'|'update'), payload, timestamp }

export async function enqueuePendingOp(op) {
  const record = { ...op, id: op.id || (Date.now().toString(36) + Math.random().toString(36).slice(2)), timestamp: Date.now() };
  await localPut('pending_ops', record);
  return record;
}

export async function getPendingOps() {
  const ops = await localGetAll('pending_ops');
  return ops.sort((a, b) => a.timestamp - b.timestamp); // oldest first
}

export async function removePendingOp(id) {
  await localDelete('pending_ops', id);
}

export async function clearPendingOps() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_ops', 'readwrite');
    tx.objectStore('pending_ops').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount() {
  const ops = await getPendingOps();
  return ops.length;
                  }
