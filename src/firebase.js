import { initializeApp } from "firebase/app";
import { 
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, query, where, orderBy, writeBatch, serverTimestamp, getFirestore, setDoc
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

// This is the config for your central "admin" database
// that would store the configurations for all other stores.
// In a real app, you would have a backend service to manage this securely.
export const adminFirebaseConfig = {
  apiKey: "AIzaSyBEhyislYrWz-4y_8EEQfxq8TJ2YqUjME4",
  authDomain: "distri-proerp.firebaseapp.com",
  projectId: "distri-proerp",
  storageBucket: "distri-proerp.appspot.com",
  messagingSenderId: "741629085924",
  appId: "1:741629085924:web:26d151b47b774394a844f1",
  measurementId: "G-YDH0W59Y89"
};

// Initialize the main admin app. We give it a unique name to avoid conflicts.
const adminApp = initializeApp(adminFirebaseConfig, "admin-app");
export const adminDB = getFirestore(adminApp);
export const db = adminDB; // Exporta como 'db' padrão para compatibilidade
export const auth = getAuth(adminApp); // Exporta o serviço de autenticação

// A cache for initialized store apps to avoid re-initialization on every call.
const appCache = new Map();

/**
 * Initializes a Firebase app for a specific store configuration.
 * It uses the store's unique ID as the app name to manage multiple app instances.
 * @param {object} storeConfig - The Firebase config for a specific store.
 * @returns The initialized Firebase app instance.
 */
export const getStoreApp = (storeConfig) => {
  const appName = String(storeConfig.id); // Use a unique identifier like store ID
  if (appCache.has(appName)) {
    return appCache.get(appName);
  }
  
  const storeApp = initializeApp(storeConfig.firebaseConfig, appName);
  appCache.set(appName, storeApp);
  return storeApp;
};

/**
 * Gets the Firestore instance for a specific store.
 * @param {object} storeConfig - The Firebase config for the store.
 * @returns The Firestore database instance for the store.
 */
export const getStoreDB = (storeConfig) => {
  const storeApp = getStoreApp(storeConfig);
  return getFirestore(storeApp);
};

// --- Data Access Layer ---

/**
 * Fetches all data for a given store from its dedicated Firestore.
 * Assumes all of a store's data is in a single document for simplicity.
 * @param {object} storeConfig - The metadata object for the store, including its firebaseConfig.
 * @returns {Promise<object>} A promise that resolves with the store's data.
 */
export const fetchStoreData = async (storeConfig) => {
  const db = getStoreDB(storeConfig);
  const storeDocRef = doc(db, "store", "data");
  const docSnap = await getDoc(storeDocRef);

  if (docSnap.exists()) {
    return { id: storeConfig.id, firebaseConfig: storeConfig.firebaseConfig, ...docSnap.data() };
  } else {
    throw new Error(`A base de dados para a loja "${storeConfig.name}" não foi encontrada.`);
  }
};

export const updateStoreData = async (storeData) => {
  const db = getStoreDB(storeData);
  const storeDocRef = doc(db, "store", "data");
  const { id, firebaseConfig, ...dataToSave } = storeData;
  await setDoc(storeDocRef, dataToSave);
};

// ============================================================================
// DATA ACCESS LAYER (DAL) - MULTI-TENANT
// ============================================================================

// Centralizador de caminhos: Se a estrutura de pastas mudar, muda só aqui.
const getTenantPath = (appId, collectionName) => `artifacts/${appId}/public/data/${collectionName}`;

export const tenantDAL = {
  // --- Leituras (Read) ---
  getAll: async (appId, collectionName, queryConstraints = []) => {
    const colRef = collection(db, getTenantPath(appId, collectionName));
    const q = query(colRef, ...queryConstraints);
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  getById: async (appId, collectionName, docId) => {
    const docRef = doc(db, getTenantPath(appId, collectionName), docId);
    const snap = await getDoc(docRef);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  // --- Escritas (Write) ---
  add: async (appId, collectionName, data) => {
    const colRef = collection(db, getTenantPath(appId, collectionName));
    const docRef = await addDoc(colRef, { ...data, createdAt: serverTimestamp() });
    return docRef.id;
  },

  update: async (appId, collectionName, docId, data) => {
    const docRef = doc(db, getTenantPath(appId, collectionName), docId);
    await updateDoc(docRef, { ...data, updatedAt: serverTimestamp() });
  },

  delete: async (appId, collectionName, docId) => {
    const docRef = doc(db, getTenantPath(appId, collectionName), docId);
    await deleteDoc(docRef);
  },

  // --- Realtime (Listen) ---
  // Retorna diretamente a função de unsubscribe do Firebase
  subscribe: (appId, collectionName, callback, queryConstraints = []) => {
    const colRef = collection(db, getTenantPath(appId, collectionName));
    const q = query(colRef, ...queryConstraints);
    
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(data);
    });
  },

  // Retorna a referência crua apenas para casos de BATCH ou transações complexas
  getRawRef: (appId, collectionName, docId = null) => {
    return docId 
      ? doc(db, getTenantPath(appId, collectionName), docId)
      : collection(db, getTenantPath(appId, collectionName));
  }
};