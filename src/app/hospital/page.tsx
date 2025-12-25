'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

export default function HospitalDashboard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();

  const trackingFailuresRef = useRef(0);
  const docsRefreshInFlightRef = useRef(false);

  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [selectedEmergency, setSelectedEmergency] = useState<any | null>(null);
  const [isLoadingEmergencies, setIsLoadingEmergencies] = useState(false);
  const [emergenciesError, setEmergenciesError] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [tracking, setTracking] = useState<any | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState<any | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState('');
  const [docsNow, setDocsNow] = useState<number>(() => Date.now());

  const [bedCounts, setBedCounts] = useState<{ icu: number; general: number; emergency: number } | null>(null);
  const [isEditingBeds, setIsEditingBeds] = useState(false);
  const [bedsForm, setBedsForm] = useState<{ icu: string; general: string; emergency: string }>({
    icu: '',
    general: '',
    emergency: '',
  });
  const [bedsError, setBedsError] = useState('');
  const [isSavingBeds, setIsSavingBeds] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const loadBedCounts = async () => {
      if (!user?.email) return;
      setBedsError('');
      try {
        const res = await fetch(`/api/hospital/beds?email=${encodeURIComponent(user.email)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || 'Failed to load bed counts');
        }

        const counts = data?.bedCounts;
        if (counts && typeof counts.icu === 'number' && typeof counts.general === 'number' && typeof counts.emergency === 'number') {
          setBedCounts({ icu: counts.icu, general: counts.general, emergency: counts.emergency });
          setBedsForm({
            icu: String(counts.icu),
            general: String(counts.general),
            emergency: String(counts.emergency),
          });
        } else {
          setBedCounts(null);
          setBedsForm({ icu: '', general: '', emergency: '' });
        }
      } catch (e) {
        setBedsError(e instanceof Error ? e.message : 'Failed to load bed counts');
      }
    };
    loadBedCounts();
  }, [user?.email]);

  const loadDocuments = useCallback(
    async (emergencyId: string) => {
      if (!user) return [];
      setDocsError('');
      setIsLoadingDocs(true);
      try {
        const res = await fetch(`/api/uploads/document?emergencyId=${encodeURIComponent(emergencyId)}`, {
          headers: {
            'x-user-id': user.id,
            'x-user-role': user.role,
            'x-user-email': user.email,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load documents');
        }

        return Array.isArray(data?.documents) ? data.documents : [];
      } catch (e) {
        setDocsError(e instanceof Error ? e.message : 'Failed to load documents');
        return [];
      } finally {
        setIsLoadingDocs(false);
      }
    },
    [user]
  );

  const openDocuments = async () => {
    if (!user || !selectedEmergency?.id) return;
    const list = await loadDocuments(selectedEmergency.id);
    setDocuments(list);
    setActiveDoc(list[0] || null);
    setIsDocsOpen(true);
  };

  useEffect(() => {
    if (!isDocsOpen) return;
    const id = setInterval(() => setDocsNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isDocsOpen]);

  const activeDocExpiryMs = (() => {
    const exp = activeDoc?.expiresAt;
    const t = exp ? new Date(exp).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  })();

  const docsExpiryMs = (() => {
    if (activeDocExpiryMs) return activeDocExpiryMs;
    let best: number | null = null;
    for (const d of documents) {
      const t = d?.expiresAt ? new Date(d.expiresAt).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      if (best == null || t < best) best = t;
    }
    return best;
  })();

  const docsMsLeft = docsExpiryMs != null ? Math.max(0, docsExpiryMs - docsNow) : null;
  const docsTimeLeftLabel = (() => {
    if (docsMsLeft == null) return '';
    const totalSec = Math.ceil(docsMsLeft / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  })();

  useEffect(() => {
    if (!isDocsOpen) return;
    if (!selectedEmergency?.id) return;
    if (docsMsLeft == null) return;
    if (docsMsLeft > 0) return;
    if (docsRefreshInFlightRef.current) return;
    docsRefreshInFlightRef.current = true;

    (async () => {
      const list = await loadDocuments(selectedEmergency.id);
      setDocuments(list);
      setActiveDoc(list[0] || null);
      if (list.length === 0) {
        setIsDocsOpen(false);
        setDocsError('');
      }
    })().finally(() => {
      docsRefreshInFlightRef.current = false;
    });
  }, [docsMsLeft, isDocsOpen, selectedEmergency?.id, loadDocuments]);

  useEffect(() => {
    if (!selectedEmergency?.id) return;
    const stillVisible = emergencies.some((e: any) => e.id === selectedEmergency.id);
    if (!stillVisible) {
      setSelectedEmergency(null);
      setIsDocsOpen(false);
      setDocuments([]);
      setActiveDoc(null);
      setDocsError('');
    }
  }, [emergencies, selectedEmergency?.id]);

  useEffect(() => {
    if (!user) return;

    const loadEmergencies = async () => {
      setEmergenciesError('');
      setIsLoadingEmergencies(true);
      try {
        const res = await fetch('/api/hospital/emergencies?limit=50&offset=0', {
          headers: {
            'x-user-id': user.id,
            'x-user-role': user.role,
            'x-user-email': user.email,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load emergencies');
        }

        const list = Array.isArray(data?.emergencies) ? data.emergencies : [];
        setEmergencies(list);

        // Keep selection in sync
        if (selectedEmergency?.id) {
          const updated = list.find((e: any) => e.id === selectedEmergency.id);
          if (updated) setSelectedEmergency(updated);
        }
      } catch (e) {
        setEmergenciesError(e instanceof Error ? e.message : 'Failed to load emergencies');
        throw e;
      } finally {
        setIsLoadingEmergencies(false);
      }
    };

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    let failures = 0;

    const tick = async () => {
      if (stopped) return;
      try {
        await loadEmergencies();
        failures = 0;
      } catch {
        failures = Math.min(6, failures + 1);
      }
      if (stopped) return;
      const base = 12000;
      const backoff = failures > 0 ? Math.min(60000, base * (failures + 1)) : base;
      timeoutId = setTimeout(tick, backoff);
    };

    tick().catch(() => null);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user, selectedEmergency?.id]);

  useEffect(() => {
    if (!user || !selectedEmergency?.id) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/emergency/tracking?emergencyId=${encodeURIComponent(selectedEmergency.id)}`, {
          headers: {
            'x-user-id': user.id,
            'x-user-role': user.role,
            'x-user-email': user.email,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('tracking_failed');
        setTracking(data?.tracking || null);
        if (data?.tracking?.status === 'completed') return 'completed';
      } catch {
        throw new Error('tracking_failed');
      }

      return null;
    };

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      let status: any = null;
      try {
        status = await poll();
        trackingFailuresRef.current = 0;
      } catch {
        trackingFailuresRef.current = Math.min(6, trackingFailuresRef.current + 1);
      }
      if (status === 'completed') {
        stopped = true;
        return;
      }
      if (stopped) return;
      const base = 8000;
      const backoff = trackingFailuresRef.current > 0
        ? Math.min(60000, base * (trackingFailuresRef.current + 1))
        : base;
      timeoutId = setTimeout(tick, backoff);
    };

    tick().catch(() => null);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user, selectedEmergency?.id]);

  const handleSaveBeds = async () => {
    if (!user?.email) return;
    setBedsError('');
    setIsSavingBeds(true);
    try {
      const payload = {
        email: user.email,
        bedCounts: {
          icu: Number(bedsForm.icu),
          general: Number(bedsForm.general),
          emergency: Number(bedsForm.emergency),
        },
      };

      const res = await fetch('/api/hospital/beds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to save bed counts');
      }

      const counts = data?.bedCounts;
      setBedCounts({ icu: counts.icu, general: counts.general, emergency: counts.emergency });
      setIsEditingBeds(false);
    } catch (e) {
      setBedsError(e instanceof Error ? e.message : 'Failed to save bed counts');
    } finally {
      setIsSavingBeds(false);
    }
  };

  const handleAcceptCase = async () => {
    if (!user || !selectedEmergency?.id) return;
    setIsAccepting(true);
    try {
      const res = await fetch('/api/hospital/emergencies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
        body: JSON.stringify({ emergencyId: selectedEmergency.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to accept case');
      }
    } catch (e) {
      setEmergenciesError(e instanceof Error ? e.message : 'Failed to accept case');
    } finally {
      setIsAccepting(false);
    }
  };

  // Show loading while redirecting
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-100">Redirecting to login...</div>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-400">Emergency Command Center</h1>
            <p className="text-sm text-gray-400">{user.name} Hospital</p>
          </div>
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-6 mb-8">
          {/* Bed Count Cards */}
          {[
            { name: 'ICU Beds', count: bedCounts?.icu ?? null, icon: '🏥', color: 'from-red-600 to-red-700' },
            { name: 'General Beds', count: bedCounts?.general ?? null, icon: '🛏️', color: 'from-blue-600 to-blue-700' },
            { name: 'Emergency Beds', count: bedCounts?.emergency ?? null, icon: '🚑', color: 'from-orange-600 to-orange-700' },
            { name: 'Active Cases', count: emergencies.length, icon: '⚠️', color: 'from-purple-600 to-purple-700' },
          ].map((bed, idx) => (
            <div
              key={idx}
              className={`bg-gradient-to-br ${bed.color} rounded-lg p-6 shadow-lg border border-gray-700`}
            >
              <div className="text-3xl mb-2">{bed.icon}</div>
              <p className="text-gray-200 text-sm font-semibold">{bed.name}</p>
              <p className="text-4xl font-bold mt-2">{bed.count === null ? 'NA' : bed.count}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 p-6 mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Bed Availability</h2>
              <p className="text-sm text-gray-400 mt-1">
                Update ICU / General / Emergency bed availability. Until you update, it will show as NA.
              </p>
              {bedsError ? (
                <div className="mt-3 text-sm text-red-300 bg-red-900 bg-opacity-20 border border-red-700 rounded p-3">
                  {bedsError}
                </div>
              ) : null}
            </div>

            <button
              onClick={() => setIsEditingBeds((v) => !v)}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition"
            >
              {isEditingBeds ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {isEditingBeds ? (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">ICU Beds</label>
                <input
                  type="number"
                  min={0}
                  value={bedsForm.icu}
                  onChange={(e) => setBedsForm((p) => ({ ...p, icu: e.target.value }))}
                  className="w-full px-4 py-2 rounded bg-gray-900 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">General Beds</label>
                <input
                  type="number"
                  min={0}
                  value={bedsForm.general}
                  onChange={(e) => setBedsForm((p) => ({ ...p, general: e.target.value }))}
                  className="w-full px-4 py-2 rounded bg-gray-900 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">Emergency Beds</label>
                <input
                  type="number"
                  min={0}
                  value={bedsForm.emergency}
                  onChange={(e) => setBedsForm((p) => ({ ...p, emergency: e.target.value }))}
                  className="w-full px-4 py-2 rounded bg-gray-900 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <button
                onClick={handleSaveBeds}
                disabled={isSavingBeds}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingBeds ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase font-semibold">ICU Beds</p>
                <p className="text-2xl font-bold mt-2">{bedCounts?.icu ?? 'NA'}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase font-semibold">General Beds</p>
                <p className="text-2xl font-bold mt-2">{bedCounts?.general ?? 'NA'}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 uppercase font-semibold">Emergency Beds</p>
                <p className="text-2xl font-bold mt-2">{bedCounts?.emergency ?? 'NA'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Emergency Feed */}
          <div className="col-span-2">
            <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 overflow-hidden">
              <div className="bg-gray-700 px-6 py-4 border-b border-gray-600">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  🚨 Live Emergency Feed
                  <span className="animate-pulse w-3 h-3 bg-red-500 rounded-full"></span>
                </h2>
              </div>

              <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
                {emergenciesError ? (
                  <div className="p-5 text-sm text-red-300">{emergenciesError}</div>
                ) : null}

                {isLoadingEmergencies && emergencies.length === 0 ? (
                  <div className="p-5 text-sm text-gray-300">Loading emergencies...</div>
                ) : null}

                {!isLoadingEmergencies && emergencies.length === 0 ? (
                  <div className="p-5 text-sm text-gray-300">No emergencies yet</div>
                ) : null}

                {emergencies.map((emergency) => (
                  <div
                    key={emergency.id}
                    onClick={() => setSelectedEmergency(emergency)}
                    className={`p-5 cursor-pointer hover:bg-gray-700 transition border-l-4 ${
                      emergency.priority === 'critical'
                        ? 'border-red-500 bg-red-900 bg-opacity-10'
                        : emergency.priority === 'high'
                        ? 'border-orange-500 bg-orange-900 bg-opacity-10'
                        : 'border-yellow-500 bg-yellow-900 bg-opacity-10'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-lg">
                          {emergency?.patient?.name || 'Patient'}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">📍 {emergency?.location?.address || 'Location not available'}</p>
                        {emergency?.patient?.phone ? (
                          <p className="text-xs text-gray-500 mt-1">📞 {emergency.patient.phone}</p>
                        ) : null}
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getPriorityColor(
                          emergency.priority
                        )}`}
                      >
                        {emergency.priority.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-sm text-gray-300 mb-2">🏥 {emergency.symptoms || '—'}</p>

                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{emergency.createdAt ? new Date(emergency.createdAt).toLocaleTimeString() : ''}</span>
                      <span>ETA: {typeof emergency.eta === 'number' ? `${emergency.eta} min` : '--'}</span>
                    </div>

                    <button
                      onClick={() => setSelectedEmergency(emergency)}
                      className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition text-sm font-semibold"
                    >
                      View Case Details
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Details Panel */}
          <div>
            {selectedEmergency ? (
              <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 p-6 sticky top-6">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-lg font-bold">Case Details</h3>
                  <button
                    onClick={() => setSelectedEmergency(null)}
                    className="text-gray-400 hover:text-gray-200 text-xl"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  {tracking?.status === 'completed' ? (
                    <div className="bg-green-900 bg-opacity-30 border border-green-700 p-3 rounded text-sm text-green-200">
                      The patient has arrived.
                    </div>
                  ) : null}
                  <div>
                    <p className="text-gray-400 text-xs uppercase font-semibold">Patient</p>
                    <p className="text-lg font-bold mt-1">{selectedEmergency?.patient?.name || 'Patient'}</p>
                    {selectedEmergency?.patient?.phone ? (
                      <p className="text-sm text-gray-300 mt-1">📞 {selectedEmergency.patient.phone}</p>
                    ) : null}
                    {selectedEmergency?.patient?.email ? (
                      <p className="text-sm text-gray-300 mt-1">✉️ {selectedEmergency.patient.email}</p>
                    ) : null}
                  </div>

                  {tracking?.patient?.lat != null && tracking?.patient?.lng != null ? (
                    <div className="h-56 rounded-lg overflow-hidden border border-gray-700">
                      <LeafletMap
                        center={{ lat: tracking.patient.lat, lng: tracking.patient.lng }}
                        zoom={14}
                        className="w-full h-full"
                        markers={[
                          { position: { lat: tracking.patient.lat, lng: tracking.patient.lng }, label: 'Patient', color: '#ef4444' },
                          ...(tracking?.ambulance?.lat != null && tracking?.ambulance?.lng != null
                            ? [{ position: { lat: tracking.ambulance.lat, lng: tracking.ambulance.lng }, label: 'Ambulance', color: '#22c55e' }]
                            : []),
                        ]}
                        route={
                          tracking?.ambulance?.lat != null && tracking?.ambulance?.lng != null
                            ? [
                                { lat: tracking.ambulance.lat, lng: tracking.ambulance.lng },
                                { lat: tracking.patient.lat, lng: tracking.patient.lng },
                              ]
                            : []
                        }
                      />
                    </div>
                  ) : null}

                  <div>
                    <p className="text-gray-400 text-xs uppercase font-semibold">Symptoms</p>
                    <p className="text-sm mt-1">{selectedEmergency.symptoms || '—'}</p>
                  </div>

                  <div>
                    <p className="text-gray-400 text-xs uppercase font-semibold">Priority</p>
                    <span
                      className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold border ${getPriorityColor(
                        selectedEmergency.priority
                      )}`}
                    >
                      {selectedEmergency.priority.toUpperCase()}
                    </span>
                  </div>

                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <button
                      onClick={openDocuments}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition font-semibold mb-2"
                    >
                      📄 View Medical Records (PDF)
                    </button>
                    <button
                      onClick={handleAcceptCase}
                      disabled={isAccepting}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAccepting ? 'Accepting...' : '✓ Accept Case'}
                    </button>
                  </div>

                  <div className="bg-yellow-900 bg-opacity-30 border border-yellow-700 p-3 rounded text-xs text-yellow-200 mt-4">
                    <p className="font-semibold mb-1">⏱️ Medical documents expire in 60 minutes</p>
                    <p>Medical records will automatically delete after this session</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 p-6">
                <p className="text-gray-400 text-center">Select an emergency case to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {isDocsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="w-full max-w-5xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
              <div>
                <p className="text-sm font-bold">Medical Documents</p>
                <p className="text-xs text-gray-400">Access expires automatically (60 minutes)</p>
                {docsTimeLeftLabel ? (
                  <p className={`text-xs mt-1 ${docsMsLeft === 0 ? 'text-red-300' : 'text-yellow-200'}`}>
                    Time left: {docsTimeLeftLabel}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!selectedEmergency?.id) return;
                    const list = await loadDocuments(selectedEmergency.id);
                    setDocuments(list);
                    setActiveDoc(list[0] || null);
                  }}
                  disabled={isLoadingDocs}
                  className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingDocs ? 'Loading…' : 'Refresh'}
                </button>
                <button
                  onClick={() => {
                    setIsDocsOpen(false);
                    setActiveDoc(null);
                    setDocsError('');
                  }}
                  className="text-gray-300 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4">
              <div className="md:col-span-1 border-r border-gray-700 bg-gray-900">
                <div className="p-3 space-y-2">
                  {docsError ? (
                    <div className="text-sm text-red-300 bg-red-900 bg-opacity-20 border border-red-700 rounded p-3">
                      {docsError}
                    </div>
                  ) : null}
                  {isLoadingDocs ? (
                    <div className="text-sm text-gray-300">Loading documents…</div>
                  ) : null}
                  {!isLoadingDocs && !docsError && documents.length === 0 ? (
                    <div className="text-sm text-gray-400">No documents available</div>
                  ) : null}
                  {documents.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setActiveDoc(d)}
                      className={`w-full text-left px-3 py-2 rounded border text-sm transition ${
                        activeDoc?.id === d.id
                          ? 'bg-gray-800 border-blue-600 text-white'
                          : 'bg-gray-950 border-gray-700 text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      <div className="font-semibold">{String(d.type || 'document').toUpperCase()}</div>
                      <div className="text-xs text-gray-400">Expires: {d.expiresAt ? new Date(d.expiresAt).toLocaleTimeString() : ''}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-3 bg-black">
                {activeDoc?.viewUrl ? (
                  <iframe
                    src={activeDoc.viewUrl}
                    className="w-full h-[70vh]"
                    sandbox="allow-same-origin allow-scripts"
                  />
                ) : (
                  <div className="h-[70vh] flex items-center justify-center text-gray-400">
                    Select a document
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
