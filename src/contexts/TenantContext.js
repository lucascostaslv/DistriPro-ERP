import React, { createContext, useContext, useState, useMemo } from 'react';
import { tenantDAL } from '../firebase';
// import { supabaseDAL } from '../supabaseClient'; <-- Usaremos na Fase 3

const TenantContext = createContext(null);

export const TenantProvider = ({ children }) => {
  const [currentStore, setCurrentStore] = useState(null);
  const appId = currentStore?.id;

  // Memoizamos o hook para evitar re-renderizações desnecessárias nos componentes
  const tenantDB = useMemo(() => {
    if (!appId) return null;

    return {
      firestore: {
        getAll: (colName, constraints) => tenantDAL.getAll(appId, colName, constraints),
        getById: (colName, docId) => tenantDAL.getById(appId, colName, docId),
        add: (colName, data) => tenantDAL.add(appId, colName, data),
        update: (colName, docId, data) => tenantDAL.update(appId, colName, docId, data),
        delete: (colName, docId) => tenantDAL.delete(appId, colName, docId),
        subscribe: (colName, callback, constraints) => tenantDAL.subscribe(appId, colName, callback, constraints),
        getRawRef: (colName, docId) => tenantDAL.getRawRef(appId, colName, docId)
      },
      // supabase: supabaseDAL(appId) <-- Adicionaremos na Fase 3
    };
  }, [appId]);

  return (
    <TenantContext.Provider value={{ currentStore, setCurrentStore, tenantDB }}>
      {children}
    </TenantContext.Provider>
  );
};

// Custom Hook para ser usado nos componentes
export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant deve ser usado dentro de um TenantProvider");
  }
  return context;
};