import React, { createContext, useContext, useState, useMemo } from "react";
// IMPORTAÇÕES NOVAS DO FIRESTORE AQUI:
import {
  writeBatch,
  doc,
  setDoc,
  increment as fbIncrement,
  serverTimestamp as fbServerTimestamp,
  where as fbWhere,
  limit as fbLimit,
  orderBy as fbOrderBy,
  startAt as fbStartAt,
  endAt as fbEndAt,
} from "firebase/firestore";
import { db, tenantDAL } from "../firebase"; // Garanta que o 'db' está sendo exportado do seu firebase.js
import { supabase } from "../supabaseClient";

const TenantContext = createContext(null);

export const TenantProvider = ({ children }) => {
  const [currentStore, setCurrentStore] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const appId = currentStore?.id;

  const tenantDB = useMemo(() => {
    if (!appId) return null;

    return {
      storeId: String(appId),

      firestore: {
        getAll: (colName, constraints = []) =>
          tenantDAL.getAll(appId, colName, constraints),
        getById: (colName, docId) => tenantDAL.getById(appId, colName, docId),
        add: (colName, data) => tenantDAL.add(appId, colName, data),
        update: (colName, docId, data) =>
          tenantDAL.update(appId, colName, docId, data),
        delete: (colName, docId) => tenantDAL.delete(appId, colName, docId),
        subscribe: (colName, callback, constraints = []) =>
          tenantDAL.subscribe(appId, colName, callback, constraints),
        getRawRef: (colName, docId) =>
          tenantDAL.getRawRef(appId, colName, docId),
        generateId: (colName) => {
          const colRef = tenantDAL.getRawRef(appId, colName);
          return doc(colRef).id;
        },

        // --- COMEÇO DAS NOVAS ABSTRAÇÕES --- //

        // 1. SET (Upsert com Merge Automático)
        set: (colName, docId, data) => {
          const ref = tenantDAL.getRawRef(appId, colName, docId);
          return setDoc(ref, data, { merge: true });
        },

        // 2. TRANSAÇÕES EM LOTE (BATCH)
        batch: () => {
          const b = writeBatch(db);

          const batchOperations = {
            update: (colName, docId, data) => {
              const ref = tenantDAL.getRawRef(appId, colName, docId);
              b.update(ref, data);
              return batchOperations; // Permite encadear chamadas (chaining)
            },
            set: (colName, docId, data, options = { merge: true }) => {
              const ref = tenantDAL.getRawRef(appId, colName, docId);
              b.set(ref, data, options);
              return batchOperations;
            },
            add: (colName, data) => {
              // IMPORTANTE: Assumimos que se não passar o docId, o getRawRef retorna a referência da COLEÇÃO
              const colRef = tenantDAL.getRawRef(appId, colName);
              const newDocRef = doc(colRef); // O Firebase gera um novo ID automaticamente
              b.set(newDocRef, data);
              return batchOperations;
            },
            delete: (colName, docId) => {
              const ref = tenantDAL.getRawRef(appId, colName, docId);
              b.delete(ref);
              return batchOperations;
            },
            commit: () => b.commit(),
          };

          return batchOperations;
        },

        // 3. UTILITÁRIOS (Para que a UI não importe nada do Firebase)
        utils: {
          increment: (value) => fbIncrement(value),
          serverTimestamp: () => fbServerTimestamp(),
          where: (field, op, value) => fbWhere(field, op, value),
          limit: (number) => fbLimit(number),
          orderBy: (field, directionStr) => fbOrderBy(field, directionStr),
          startAt: (val) => fbStartAt(val),
          endAt: (val) => fbEndAt(val),
        },

        // --- FIM DAS NOVAS ABSTRAÇÕES --- //
      },

      supabase: {
        query: (tableName) => {
          return supabase
            .from(tableName)
            .select("*")
            .eq("firebase_store_id", String(appId));
        },
        withStoreId: (payload) => {
          if (Array.isArray(payload)) {
            return payload.map((item) => ({
              ...item,
              firebase_store_id: String(appId),
            }));
          }
          return { ...payload, firebase_store_id: String(appId) };
        },
        insert: async (tableName, payload) => {
          const dataWithStoreId = tenantDB.supabase.withStoreId(payload);
          return await supabase.from(tableName).insert([dataWithStoreId]);
        },
        insertAndReturn: async (tableName, payload) => {
          const dataWithStoreId = tenantDB.supabase.withStoreId(payload);
          return await supabase
            .from(tableName)
            .insert([dataWithStoreId])
            .select()
            .single();
        },
        update: async (tableName, id, payload) => {
          // O eq('firebase_store_id', appId) garante a segurança multi-tenant
          return await supabase
            .from(tableName)
            .update(payload)
            .eq("id", id)
            .eq("firebase_store_id", String(appId));
        },
        delete: async (tableName, id) => {
          return await supabase
            .from(tableName)
            .delete()
            .eq("id", id)
            .eq("firebase_store_id", String(appId));
        },
      },
    };
  }, [appId]);

  return (
    <TenantContext.Provider
      value={{
        currentStore,
        setCurrentStore,
        currentUser,
        setCurrentUser,
        tenantDB,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant deve ser usado dentro de um TenantProvider");
  }
  return context;
};
