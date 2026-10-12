import React, { createContext, useContext, useEffect, useState } from 'react';
import { ApiClient, WebAuthAdapter } from '@playmatch/shared';
import { webClientConfig } from '../config';

interface AuthContextType {
  client: ApiClient;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any | null;
  setUser: (user: any | null) => void;
  logout: () => Promise<void>;
}

const authAdapter = new WebAuthAdapter();
export const sharedApiClient = new ApiClient(webClientConfig, authAdapter);

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Single-flight session restore on boot
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
      authAdapter.clearSession();
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        client: sharedApiClient,
        isAuthenticated,
        isLoading,
        user,
        setUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
