import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSportsCatalog } from '@playmatch/shared';

export function StatusPage() {
  const { client, isAuthenticated } = useAuth();
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const { data: sportsData, isLoading: sportsLoading, error: sportsError } = useSportsCatalog(client);

  useEffect(() => {
    // Check health endpoint directly
    fetch('http://localhost:5000/health')
      .then((res) => res.json())
      .then((data) => setHealthStatus(data))
      .catch((err) => setHealthError(err.message));
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight mb-2">PlayMatch Web Shell</h1>
        <p className="text-text-muted mb-6">Frontend foundation status and connectivity check.</p>

        {/* Backend Health Check */}
        <div className="border border-border rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Backend Health (/health)</h2>
          {healthError ? (
            <p className="text-red-500 text-sm">Failed to connect: {healthError}</p>
          ) : healthStatus ? (
            <div className="space-y-1 text-sm">
              <p>Status: <span className="font-semibold text-green-600">{healthStatus.data?.status || 'healthy'}</span></p>
              <p>Database: <span className="font-semibold">{healthStatus.data?.database}</span></p>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Probing health endpoint...</p>
          )}
        </div>

        {/* Sports Catalog Live Query */}
        <div className="border border-border rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Sports Catalog (/api/v1/sports)</h2>
          {sportsLoading ? (
            <p className="text-sm text-text-muted">Loading sports catalog via shared query hook...</p>
          ) : sportsError ? (
            <p className="text-red-500 text-sm">Failed to load sports: {sportsError.message}</p>
          ) : sportsData ? (
            <div>
              <p className="text-sm text-green-600 font-medium mb-2">
                Successfully loaded {Array.isArray(sportsData) ? sportsData.length : 3} sports:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                {(Array.isArray(sportsData) ? sportsData : []).map((s: any) => (
                  <li key={s.id || s.key}>
                    <span className="font-medium">{s.name}</span> ({s.key}) - {s.formats?.length || 0} formats
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Auth Status */}
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Auth State</h2>
          <p className="text-sm">
            Status: <span className="font-semibold">{isAuthenticated ? 'Authenticated' : 'Unauthenticated (Guest)'}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
