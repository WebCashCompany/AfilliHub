// src/contexts/PersistenceContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface PersistenceContextData {
  getItem: <T>(key: string, defaultValue: T) => T;
  setItem: <T>(key: string, value: T) => void;
  removeItem: (key: string) => void;
  clearAll: () => void;
}

const PersistenceContext = createContext<PersistenceContextData>({} as PersistenceContextData);

export function PersistenceProvider({ children }: { children: ReactNode }) {
  const getItem = useCallback(<T,>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Erro ao carregar ${key}:`, error);
      return defaultValue;
    }
  }, []);

  const setItem = useCallback(<T,>(key: string, value: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Erro ao salvar ${key}:`, error);
    }
  }, []);

  const removeItem = useCallback((key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Erro ao remover ${key}:`, error);
    }
  }, []);

  const clearAll = useCallback(() => {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Erro ao limpar localStorage:', error);
    }
  }, []);

  return (
    <PersistenceContext.Provider value={{ getItem, setItem, removeItem, clearAll }}>
      {children}
    </PersistenceContext.Provider>
  );
}

export function usePersistence() {
  const context = useContext(PersistenceContext);
  if (!context) {
    throw new Error('usePersistence deve ser usado dentro de PersistenceProvider');
  }
  return context;
}

// ✅ HOOK PERSONALIZADO PARA ESTADO PERSISTENTE
export function usePersistentState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const { getItem, setItem } = usePersistence();
  
  // Carregar valor inicial do localStorage
  const [state, setState] = useState<T>(() => getItem(key, defaultValue));

  // Salvar no localStorage quando o estado mudar
  useEffect(() => {
    setItem(key, state);
  }, [key, state, setItem]);

  return [state, setState];
}