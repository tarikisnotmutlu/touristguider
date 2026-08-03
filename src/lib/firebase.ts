import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Single shared client instance — Next.js can re-evaluate this module across
 *  HMR/fast-refresh cycles, and Firebase throws if you call initializeApp
 *  twice for the same app, so guard on getApps() rather than a module-level
 *  boolean that HMR would reset anyway. */
function getFirebaseApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp(firebaseConfig);
}

let firestoreSingleton: Firestore | null = null;

/** Firestore with IndexedDB offline persistence enabled — reads/writes keep
 *  working (queued/served from cache) through a cellular drop on the trail,
 *  and sync back up the moment connectivity returns. Multi-tab manager so
 *  having the app open in two tabs doesn't fight over the same cache. Only
 *  ever constructed client-side — offline persistence needs IndexedDB, which
 *  doesn't exist during SSR. */
export function getDb(): Firestore {
  if (firestoreSingleton) return firestoreSingleton;
  firestoreSingleton = initializeFirestore(getFirebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    // Trip/gem/route documents are full of optional fields (imageUrl,
    // transitLine, a gem's name, geometryDegraded, ...) that get spread into
    // a write as `undefined` when unset — Firestore's default is to reject
    // the entire write with "Unsupported field value: undefined" rather
    // than just omitting that key. This is exactly why saving a Hidden Gem
    // without a photo (imageUrl left undefined) failed outright.
    ignoreUndefinedProperties: true,
  });
  return firestoreSingleton;
}

let storageSingleton: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage {
  if (storageSingleton) return storageSingleton;
  storageSingleton = getStorage(getFirebaseApp());
  return storageSingleton;
}
