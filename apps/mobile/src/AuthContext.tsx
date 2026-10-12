import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiClient, MobileAuthAdapter, type SecureStorageInterface } from '@playmatch/shared';
import { mobileClientConfig } from './config';

const secureStorageAdapter: SecureStorageInterface = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, val) => SecureStore.setItemAsync(key, val),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

const authAdapter = new MobileAuthAdapter(secureStorageAdapter);
export const sharedApiClient = new ApiClient(mobileClientConfig, authAdapter);

interface MobileAuthContextType {
  client: ApiClient;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any | null;
  logout: () => Promise<void>;
}

const MobileAuthContext = createContext<MobileAuthContextType | null>(null);

export function MobileAuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Single-flight session restore on app boot
    sharedApiClient
      .refreshSession()
      .then(async () => {
        if (!isMounted) return;
        try {
          const profile = await sharedApiClient.get('/profile/me');
          if (isMounted) {
            setUser(profile);
            setIsAuthenticated(true);
          }
        } catch {
          if (isMounted) {
            setIsAuthenticated(true);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsAuthenticated(false);
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const unsubscribe = sharedApiClient.onLoggedOut(() => {
      if (isMounted) {
        setIsAuthenticated(false);
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      await sharedApiClient.post('/auth/logout', {});
    } finally {
      await authAdapter.clearSession();
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return (
    <MobileAuthContext.Provider
      value={{
        client: sharedApiClient,
        isAuthenticated,
        isLoading,
        user,
        logout,
      }}
    >
      {children}
    </MobileAuthContext.Provider>
  );
}

export function useMobileAuth() {
  const context = useContext(MobileAuthContext);
  if (!context) {
    throw new Error('useMobileAuth must be used within MobileAuthProvider');
  }
  return context;
}
