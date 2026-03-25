import React, { createContext, useContext, useState, useMemo } from 'react';
import { tenantDAL } from '../firebase';
import { supabase } from '../supabaseClient'; 

const TenantContext = createContext(null);

export const TenantProvider = ({ children }) => {
  // Guardamos a loja E o usuário logado no contexto global
  const [currentStore, setCurrentStore] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); 
  
  const appId = currentStore?.id;

  // Memoizamos a DAL (Data Access Layer) para não recriar a cada renderização
  const tenantDB = useMemo(() => {
    if (!appId) return null;

    return {
      // O storeId fica disponível caso algum componente precise muito dele
      storeId: String(appId),
      
      // 1. Abstração do Firebase (já estava quase pronta, só mantive)
      firestore: {
        getAll: (colName, constraints = []) => tenantDAL.getAll(appId, colName, constraints),
        getById: (colName, docId) => tenantDAL.getById(appId, colName, docId),
        add: (colName, data) => tenantDAL.add(appId, colName, data),
        update: (colName, docId, data) => tenantDAL.update(appId, colName, docId, data),
        delete: (colName, docId) => tenantDAL.delete(appId, colName, docId),
        subscribe: (colName, callback, constraints = []) => tenantDAL.subscribe(appId, colName, callback, constraints),
        getRawRef: (colName, docId) => tenantDAL.getRawRef(appId, colName, docId)
      },

      // 2. Abstração do Supabase (Nova)
      supabase: {
        // Retorna a query base do Supabase já filtrando pela loja atual.
        // Uso: tenantDB.supabase.query('fiscal_clients').order('name')
        query: (tableName) => {
            return supabase.from(tableName).select('*').eq('firebase_store_id', String(appId));
        },
        // Prepara os dados para inserção, injetando o ID da loja automaticamente
        // Uso: supabase.from('fiscal_clients').insert(tenantDB.supabase.withStoreId(meusDados))
        withStoreId: (payload) => {
            if (Array.isArray(payload)) {
                return payload.map(item => ({ ...item, firebase_store_id: String(appId) }));
            }
            return { ...payload, firebase_store_id: String(appId) };
        }
      }
    };
  }, [appId]);

  return (
    <TenantContext.Provider value={{ 
        currentStore, setCurrentStore, 
        currentUser, setCurrentUser, 
        tenantDB 
    }}>
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
