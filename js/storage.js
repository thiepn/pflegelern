const DB_NAME = 'pflegelern';
const DB_VERSION = 2;
const STORE_DEFS = {
  cardState: { keyPath: 'cardId' },
  conceptState: { keyPath: 'conceptId' },
  sessions: { keyPath: 'id' },
  examAttempts: { keyPath: 'id' },
  mistakes: { keyPath: 'id' },
  bookmarks: { keyPath: 'id' },
  reports: { keyPath: 'id' },
  history: { keyPath: 'date' },
  questionHistory: { keyPath: 'questionId' },
  settings: { keyPath: 'key' },
  metadata: { keyPath: 'key' }
};

const LEARNING_STORES = [
  'cardState', 'conceptState', 'sessions', 'examAttempts', 'mistakes',
  'bookmarks', 'reports', 'history', 'questionHistory'
];

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, options] of Object.entries(STORE_DEFS)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden.'));
    request.onblocked = () => reject(new Error('Die Lerndatenbank wird in einem anderen Tab aktualisiert.'));
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(store, key) {
  const db = await openDatabase();
  const tx = db.transaction(store, 'readonly');
  return requestToPromise(tx.objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await openDatabase();
  const tx = db.transaction(store, 'readonly');
  return requestToPromise(tx.objectStore(store).getAll());
}

export async function put(store, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

export async function remove(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function clear(store) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSetting(key, fallback = null) {
  const item = await get('settings', key);
  return item ? item.value : fallback;
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

export async function exportBackup(contentVersion = 'unknown') {
  const stores = {};
  for (const name of Object.keys(STORE_DEFS)) stores[name] = await getAll(name);
  return {
    app: 'pflegelern',
    backupVersion: 1,
    contentVersion,
    createdAt: new Date().toISOString(),
    stores
  };
}

function validateBackup(backup) {
  if (!backup || backup.app !== 'pflegelern' || backup.backupVersion !== 1 || !backup.stores || typeof backup.stores !== 'object') {
    throw new Error('Diese Sicherung gehört nicht zu einer unterstützten Version von PflegeLern.');
  }
  const accepted = {};
  for (const [name, def] of Object.entries(STORE_DEFS)) {
    const items = backup.stores[name];
    if (items === undefined) continue;
    if (!Array.isArray(items)) throw new Error(`Die Sicherung enthält ungültige Daten für „${name}“.`);
    const keyPath = def.keyPath;
    accepted[name] = items.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Ungültiger Datensatz in „${name}“ (${index + 1}).`);
      if (keyPath && (item[keyPath] === undefined || item[keyPath] === null || item[keyPath] === '')) throw new Error(`Datensatz ohne Schlüssel „${keyPath}“ in „${name}“.`);
      return item;
    });
  }
  if (!Object.keys(accepted).length) throw new Error('Die Sicherung enthält keine unterstützten Lerndaten.');
  return accepted;
}

export async function importBackup(backup) {
  const accepted = validateBackup(backup);
  const db = await openDatabase();

  // A restore replaces the complete learning state, even when an older backup
  // predates a newer learning store. Settings/metadata are replaced only when
  // the backup explicitly contains them.
  const transactionStores = [...new Set([
    ...LEARNING_STORES,
    ...Object.keys(accepted).filter((name) => !LEARNING_STORES.includes(name))
  ])];

  await new Promise((resolve, reject) => {
    const tx = db.transaction(transactionStores, 'readwrite');
    for (const name of LEARNING_STORES) tx.objectStore(name).clear();
    for (const name of Object.keys(accepted).filter((name) => !LEARNING_STORES.includes(name))) tx.objectStore(name).clear();
    for (const [name, items] of Object.entries(accepted)) {
      const store = tx.objectStore(name);
      for (const item of items) store.put(item);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Sicherung konnte nicht eingespielt werden.'));
  });
}

export async function resetLearningData() {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(LEARNING_STORES, 'readwrite');
    for (const name of LEARNING_STORES) tx.objectStore(name).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export { STORE_DEFS, LEARNING_STORES, DB_NAME, DB_VERSION, validateBackup };