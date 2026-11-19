/**
 * store.js — tiny IndexedDB cache for parsed tests.
 *
 * Full test objects (including cropped math images) live in `tests`; lightweight
 * metadata lives in `meta` so the home screen can list tests without loading
 * every data URL. Falls back to an in-memory Map if IndexedDB is unavailable.
 */

const DB_NAME = 'sat-bluebook';
const DB_VERSION = 1;
const TEST_STORE = 'tests';
const META_STORE = 'meta';

let dbPromise = null;
const memory = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TEST_STORE)) db.createObjectStore(TEST_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open IndexedDB'));
  });
  return dbPromise;
}

function tx(storeName, mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        try {
          result = run(store);
        } catch (err) {
          reject(err);
          return;
        }
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      }),
  );
}

export async function saveTest(test) {
  const meta = {
    id: test.id,
    title: test.title,
    createdAt: test.createdAt,
    questionCount: test.questions.length,
    domains: test.domains || [],
    pageCount: test.pageCount,
    isSample: !!test.isSample,
  };
  memory.set(test.id, test);
  try {
    await tx(TEST_STORE, 'readwrite', (store) => store.put(test));
    await tx(META_STORE, 'readwrite', (store) => store.put(meta));
  } catch (err) {
    console.warn('Could not persist test to IndexedDB; keeping it in memory.', err);
  }
  return meta;
}

export async function getTest(id) {
  if (memory.has(id)) return memory.get(id);
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(TEST_STORE, 'readonly').objectStore(TEST_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function listTests() {
  try {
    const db = await openDb();
    const metas = await new Promise((resolve, reject) => {
      const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return metas.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [...memory.values()]
      .map((t) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        questionCount: t.questions.length,
        domains: t.domains || [],
        pageCount: t.pageCount,
        isSample: !!t.isSample,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
}

export async function deleteTest(id) {
  memory.delete(id);
  try {
    await tx(TEST_STORE, 'readwrite', (store) => store.delete(id));
    await tx(META_STORE, 'readwrite', (store) => store.delete(id));
  } catch {
    /* memory-only fallback */
  }
}
