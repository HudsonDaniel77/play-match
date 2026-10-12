import React, { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { MobileAuthProvider } from './src/AuthContext';
import { StatusScreen } from './src/StatusScreen';

// Wire focusManager to AppState (pause polling in background on mobile)
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <MobileAuthProvider>
        <StatusScreen />
      </MobileAuthProvider>
    </QueryClientProvider>
  );
}
