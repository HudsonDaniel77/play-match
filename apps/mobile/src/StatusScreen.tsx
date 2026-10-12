import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useMobileAuth } from './AuthContext';
import { useSportsCatalog } from '@playmatch/shared';
import { mobileClientConfig } from './config';

export function StatusScreen() {
  const { client, isAuthenticated } = useMobileAuth();
  const { data: sports, isLoading, error } = useSportsCatalog(client);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>PlayMatch Mobile Shell</Text>
      <Text style={styles.subtitle}>Mobile foundation and endpoint probe</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Configured Backend URL</Text>
        <Text style={styles.codeText}>{mobileClientConfig.baseUrl}</Text>
        <Text style={styles.hintText}>
          Android Emulator: http://10.0.2.2:5000/api/v1{'\n'}
          Physical Device (LAN): http://&lt;YOUR_PC_IP&gt;:5000/api/v1
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Live Sports Catalog Probe</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color="#0284c7" />
        ) : error ? (
          <View>
            <Text style={styles.errorText}>Connection Error: {error.message}</Text>
            <Text style={styles.hintText}>
              Ensure the local backend is running (npm run dev in /server) and your device/emulator can reach the host.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.successText}>
              Connected! {Array.isArray(sports) ? sports.length : 3} sports retrieved:
            </Text>
            {(Array.isArray(sports) ? sports : []).map((s: any) => (
              <Text key={s.id || s.key} style={styles.itemText}>
                • {s.name} ({s.key})
              </Text>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Auth State</Text>
        <Text style={styles.statusText}>
          {isAuthenticated ? 'Authenticated' : 'Unauthenticated (Guest)'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1e293b',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: '#f1f5f9',
    padding: 6,
    borderRadius: 6,
    marginBottom: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  successText: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '500',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    marginBottom: 4,
  },
  itemText: {
    fontSize: 13,
    color: '#334155',
    marginVertical: 2,
  },
  statusText: {
    fontSize: 14,
    color: '#334155',
  },
});
