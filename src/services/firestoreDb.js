import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  connectFirestoreEmulator, clearIndexedDbPersistence, terminate
} from 'firebase/firestore';
import { app } from './firebase';

const firestoreEmulator = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST; // e.g. 127.0.0.1:8080

/*
 * Firestore keeps a copy of what it has read in the browser (IndexedDB), so the CRM opens fast
 * and repeated visits cost far fewer reads from the free daily quota. It is wiped on sign-out.
 */
let firestore = null;
function makeFirestore() {
  let localCache;
  try { localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch { localCache = memoryLocalCache(); }
  const fs = initializeFirestore(app, { localCache, ignoreUndefinedProperties: true });
  if (firestoreEmulator) {
    const [h, p] = firestoreEmulator.split(':');
    connectFirestoreEmulator(fs, h, Number(p));
  }
  return fs;
}
export const getFirestoreDb = () => { if (!firestore) firestore = makeFirestore(); return firestore; };

/** Drop the local Firestore copy (used on sign-out so the next person on this computer sees nothing). */
export async function clearLocalData() {
  if (!firestore) return;
  const fs = firestore;
  firestore = null;
  try { await terminate(fs); } catch { /* ignore */ }
  try { await clearIndexedDbPersistence(fs); } catch { /* another tab still open: cleared next time */ }
}

