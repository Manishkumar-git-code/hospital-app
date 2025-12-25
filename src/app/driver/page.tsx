'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

type LatLng = { lat: number; lng: number };

type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver?: LatLng;
};

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distPointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng) {
  // Equirectangular projection for small distances
  const lat0 = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const ax = a.lng * Math.cos(lat0);
  const ay = a.lat;
  const bx = b.lng * Math.cos(lat0);
  const by = b.lat;
  const px = p.lng * Math.cos(lat0);
  const py = p.lat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  const t = abLen2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
  const cx = ax + t * abx;
  const cy = ay + t * aby;

  // Convert degrees back to meters
  const c: LatLng = { lat: cy, lng: cx / Math.cos(lat0) };
  return haversineMeters(p, c);
}

function distToPolylineMeters(p: LatLng, line: LatLng[]) {
  if (!Array.isArray(line) || line.length < 2) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distPointToSegmentMeters(p, line[i]!, line[i + 1]!);
    if (d < best) best = d;
  }
  return best;
}

function buildOsrmInstruction(step: any): string {
  const maneuverType = step?.maneuver?.type;
  const modifier = step?.maneuver?.modifier;
  const name = typeof step?.name === 'string' && step.name.trim().length > 0 ? step.name.trim() : '';

  if (maneuverType === 'depart') return name ? `Depart on ${name}` : 'Depart';
  if (maneuverType === 'arrive') return 'Arrive at destination';
  if (maneuverType === 'roundabout') return 'Enter roundabout';
  if (maneuverType === 'rotary') return 'Enter rotary';
  if (maneuverType === 'merge') return name ? `Merge onto ${name}` : 'Merge';
  if (maneuverType === 'on ramp') return name ? `Take ramp onto ${name}` : 'Take ramp';
  if (maneuverType === 'off ramp') return name ? `Exit via ramp to ${name}` : 'Exit via ramp';

  const turn = maneuverType === 'turn' || maneuverType === 'new name' ? 'Turn' : 'Continue';
  const dir = modifier ? ` ${modifier}` : '';
  const onto = name ? ` onto ${name}` : '';
  return `${turn}${dir}${onto}`.trim();
}

export default function DriverDashboard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [isNavigating, setIsNavigating] = useState(false);
  const [navPhase, setNavPhase] = useState<'to_patient' | 'to_hospital'>('to_patient');
  const [pickedUpAt, setPickedUpAt] = useState<number | null>(null);
  const [showThanks, setShowThanks] = useState(false);
  const [distance, setDistance] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);

  const [assignment, setAssignment] = useState<any | null>(null);
  const [isLoadingAssignment, setIsLoadingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [patientPos, setPatientPos] = useState<LatLng | null>(null);
  const [ambulancePos, setAmbulancePos] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const [routeRefreshKey, setRouteRefreshKey] = useState(0);
  const lastRerouteAtRef = useRef(0);
  const trackingFailuresRef = useRef(0);
  const lastLocationSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);

  const fallbackCenter: LatLng = { lat: 28.6139, lng: 77.209 }; // New Delhi

  const hospitalPos: LatLng | null =
    assignment?.hospital?.location?.lat != null && assignment?.hospital?.location?.lng != null
      ? { lat: assignment.hospital.location.lat, lng: assignment.hospital.location.lng }
      : null;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    const loadAssignment = async () => {
      try {
        setIsLoadingAssignment(true);
        setAssignmentError(null);

        const res = await fetch('/api/driver/assignment', {
          cache: 'no-store',
          headers: {
            'x-user-id': user.id,
            'x-user-role': user.role,
            'x-user-email': user.email,
          },
        });

        if (res.status === 204) {
          setAssignment(null);
          setPatientPos(null);
          setDistance(null);
          setDuration(null);
          setRoute([]);
          setRouteSteps([]);
          setRouteError(null);
          setIsLoadingAssignment(false);
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message =
            typeof data?.error === 'string'
              ? data.error
              : typeof data?.message === 'string'
                ? data.message
                : `Failed to load assignment (${res.status})`;
          setAssignmentError(message);
          setIsLoadingAssignment(false);
          return;
        }

        const a = data?.assignment;
        setAssignment(a || null);

        setNavPhase('to_patient');
        setPickedUpAt(null);

        const coords = a?.location?.coordinates;
        if (coords?.lat != null && coords?.lng != null) {
          setPatientPos({ lat: coords.lat, lng: coords.lng });
        } else {
          setPatientPos(null);
        }

        setIsLoadingAssignment(false);
      } catch (e) {
        setAssignmentError(e instanceof Error ? e.message : 'Failed to fetch assignment');
        setIsLoadingAssignment(false);
      }
    };

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timeoutId = setTimeout(tick, 15000);
        return;
      }
      await loadAssignment().catch(() => null);
      if (stopped) return;
      timeoutId = setTimeout(tick, 15000);
    };

    const onVisibility = () => {
      if (stopped) return;
      if (document.visibilityState === 'visible') {
        tick().catch(() => null);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    tick().catch(() => null);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!assignment?.id) return;
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setAmbulancePos(loc);

          const prev = lastLocationSentRef.current;
          const now = Date.now();
          const movedEnough =
            !prev ||
            Math.abs(loc.lat - prev.lat) > 0.00015 ||
            Math.abs(loc.lng - prev.lng) > 0.00015;
          const timeEnough = !prev || now - prev.at > 5000;
          if (!movedEnough || !timeEnough) return;
          lastLocationSentRef.current = { at: now, lat: loc.lat, lng: loc.lng };

          fetch('/api/driver/assignment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': user.id,
              'x-user-role': user.role,
              'x-user-email': user.email,
            },
            body: JSON.stringify({ emergencyId: assignment.id, latitude: loc.lat, longitude: loc.lng }),
          }).catch(() => null);
        } catch {
          // ignore
        }
      },
      () => {
        // ignore
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user, assignment?.id]);

  useEffect(() => {
    if (!user) return;
    if (!isNavigating) return;
    if (!assignment?.id) return;

    const poll = async () => {
      const res = await fetch(`/api/emergency/tracking?emergencyId=${encodeURIComponent(assignment.id)}`, {
        headers: {
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('tracking_failed');
      return data?.tracking || null;
    };

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const tracking = await poll();
        trackingFailuresRef.current = 0;
        if (navPhase === 'to_patient' && tracking?.patient?.lat != null && tracking?.patient?.lng != null) {
          setPatientPos({ lat: tracking.patient.lat, lng: tracking.patient.lng });
        }
        if (tracking?.status === 'completed') {
          setIsNavigating(false);
          setNavPhase('to_patient');
          setRoute([]);
          setRouteSteps([]);
          setRouteError(null);
          setDistance(null);
          setDuration(null);
          setShowThanks(true);
          stopped = true;
          return;
        }
      } catch {
        trackingFailuresRef.current = Math.min(6, trackingFailuresRef.current + 1);
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
  }, [user, isNavigating, assignment?.id, navPhase]);

  // Re-route if ambulance deviates too far from current polyline
  useEffect(() => {
    if (!isNavigating) return;
    if (!ambulancePos) return;
    if (!route || route.length < 2) return;

    const offMeters = distToPolylineMeters(ambulancePos, route);
    if (!Number.isFinite(offMeters)) return;
    if (offMeters < 85) return;

    const now = Date.now();
    if (now - lastRerouteAtRef.current < 5000) return;
    lastRerouteAtRef.current = now;
    setRouteRefreshKey((v) => v + 1);
  }, [isNavigating, ambulancePos, route]);

  useEffect(() => {
    if (!isNavigating) {
      setRoute([]);
      setRouteSteps([]);
      setRouteError(null);
      setActiveStepIdx(0);
      return;
    }

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const hospitalLoc = assignment?.hospital?.location;
      const hasHospital =
        hospitalLoc?.lat != null &&
        hospitalLoc?.lng != null &&
        Number.isFinite(hospitalLoc.lat) &&
        Number.isFinite(hospitalLoc.lng);

      const from = ambulancePos;
      const to = navPhase === 'to_hospital' && hasHospital ? { lat: hospitalLoc.lat, lng: hospitalLoc.lng } : patientPos;

      if (!from || !to) {
        timeoutId = setTimeout(tick, 4000);
        return;
      }

      const coordsStr = `${from.lng},${from.lat};${to.lng},${to.lat}`;

      try {
        setRouteError(null);
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&alternatives=true&steps=true`;
        const res = await fetch(url);
        const data = await res.json();

        const routes = Array.isArray(data?.routes) ? data.routes : [];
        const best = routes.reduce((acc: any, cur: any) => {
          if (!acc) return cur;
          const aDur = typeof acc?.duration === 'number' ? acc.duration : Number.POSITIVE_INFINITY;
          const cDur = typeof cur?.duration === 'number' ? cur.duration : Number.POSITIVE_INFINITY;
          return cDur < aDur ? cur : acc;
        }, null);

        const coords = best?.geometry?.coordinates;
        if (Array.isArray(coords)) {
          setRoute(coords.map((c: any) => ({ lng: c[0], lat: c[1] })));
        }

        if (typeof best?.distance === 'number') {
          setDistance(`${(best.distance / 1000).toFixed(1)} km`);
        }
        if (typeof best?.duration === 'number') {
          setDuration(`${Math.max(1, Math.round(best.duration / 60))} min`);
        }

        const steps: RouteStep[] = [];
        const legSteps = best?.legs?.[0]?.steps;
        if (Array.isArray(legSteps)) {
          for (const s of legSteps) {
            const loc = Array.isArray(s?.maneuver?.location) ? s.maneuver.location : null;
            steps.push({
              instruction: buildOsrmInstruction(s),
              distanceMeters: typeof s?.distance === 'number' ? s.distance : 0,
              durationSeconds: typeof s?.duration === 'number' ? s.duration : 0,
              maneuver: loc && loc.length === 2 ? { lng: Number(loc[0]), lat: Number(loc[1]) } : undefined,
            });
          }
        }
        setRouteSteps(steps);
        setActiveStepIdx(0);
      } catch {
        setRouteError('Failed to fetch route. Please try again.');
      }

      if (stopped) return;
      timeoutId = setTimeout(tick, 6000);
    };

    tick().catch(() => null);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isNavigating, ambulancePos, patientPos, navPhase, assignment?.hospital?.location?.lat, assignment?.hospital?.location?.lng, routeRefreshKey]);

  // Update active step (simple: nearest maneuver point)
  useEffect(() => {
    if (!isNavigating) return;
    if (!ambulancePos) return;
    if (!Array.isArray(routeSteps) || routeSteps.length === 0) return;

    let bestIdx = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < routeSteps.length; i++) {
      const m = routeSteps[i]?.maneuver;
      if (!m) continue;
      const d = haversineMeters(ambulancePos, m);
      if (d < best) {
        best = d;
        bestIdx = i;
      }
    }

    setActiveStepIdx(bestIdx);
  }, [isNavigating, ambulancePos, routeSteps]);

  const destPos = navPhase === 'to_hospital' ? hospitalPos : patientPos;
  const destMeters = ambulancePos && destPos ? haversineMeters(ambulancePos, destPos) : null;
  const arrivedAtDest = destMeters != null ? destMeters < (navPhase === 'to_hospital' ? 180 : 120) : false;

  const justPickedUp = pickedUpAt != null ? Date.now() - pickedUpAt < 20000 : false;
  const statusText =
    !isNavigating
      ? 'Standby'
      : navPhase === 'to_patient'
        ? arrivedAtDest
          ? 'Arrived at Patient'
          : 'En route to Patient'
        : arrivedAtDest
          ? 'Arrived at Hospital'
          : justPickedUp
            ? 'Patient Picked Up'
            : 'En route to Hospital';

  // Show loading while redirecting
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-100">Redirecting to login...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Header - Mobile Optimized */}
      <header className="bg-gray-800 border-b border-gray-700 shadow-lg fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-400">🚑 Ambulance Nav</h1>
            <p className="text-sm text-gray-400">Emergency Route</p>
          </div>
          <div className="flex items-center gap-4">
            {user?.licenseNumber ? (
              <div className="text-right">
                <p className="text-xs text-gray-400">Hospital License</p>
                <p className="text-sm font-semibold text-gray-100">{user.licenseNumber}</p>
              </div>
            ) : null}
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Split Layout */}
      <div className="mt-20 h-[calc(100vh-80px)] flex flex-col lg:flex-row bg-gray-950">
        <div className="w-full lg:w-[430px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-950 overflow-y-auto p-4 space-y-3">
          {!isNavigating ? (
            <>
              {showThanks ? (
                <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-200">thanks 👏</p>
                </div>
              ) : null}

              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold text-gray-300 mb-3">Patient Details</h3>
                {!user?.licenseNumber ? (
                  <div className="text-sm text-yellow-300 mb-3">
                    No hospital license linked to this ambulance. Assignments will not be shown.
                  </div>
                ) : null}
                {isLoadingAssignment ? (
                  <div className="text-sm text-gray-400">Loading assignment...</div>
                ) : assignmentError ? (
                  <div className="text-sm text-red-300">{assignmentError}</div>
                ) : assignment ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Name</p>
                      <p className="font-semibold">{assignment?.patient?.name || '--'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="font-semibold">{assignment?.patient?.phone || '--'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Hospital</p>
                      <p className="font-semibold text-sm">
                        {assignment?.hospital?.name || '--'}
                        {assignment?.hospital?.licenseNumber ? ` • ${assignment.hospital.licenseNumber}` : ''}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="font-semibold text-sm">{assignment?.location?.address || '--'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Symptoms</p>
                      <p className="font-semibold text-sm">{assignment?.emergency?.symptoms || '--'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">No active assignment yet.</div>
                )}
              </div>

              <button
                onClick={() => {
                  if (!assignment || !patientPos) return;
                  setShowThanks(false);
                  setNavPhase('to_patient');
                  setPickedUpAt(null);
                  setIsNavigating(true);
                }}
                disabled={!assignment || !patientPos || (!!user?.licenseNumber && assignment?.hospital?.licenseNumber && user.licenseNumber !== assignment.hospital.licenseNumber)}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🗺️ Start Navigation
              </button>
            </>
          ) : (
            <>
              <div className="bg-green-900 bg-opacity-30 border border-green-600 rounded-lg p-4">
                <p className="text-sm font-semibold text-green-300 mb-2">✓ Navigation Active</p>
                <p className="text-xs text-green-200">{statusText}</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold text-gray-300 mb-3">ETA / Distance</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">ETA</p>
                    <p className="text-lg font-bold text-white">{duration ?? '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Distance</p>
                    <p className="text-lg font-bold text-white">{distance ?? '--'}</p>
                  </div>
                </div>
                {destMeters != null ? (
                  <p className="text-xs text-gray-400 mt-2">Remaining: {(destMeters / 1000).toFixed(2)} km</p>
                ) : null}
              </div>

              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold text-gray-300 mb-3">Route Mode</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNavPhase('to_patient');
                      setPickedUpAt(null);
                      setRouteRefreshKey((v) => v + 1);
                    }}
                    className={`py-2 rounded-lg text-sm font-semibold border transition ${navPhase === 'to_patient' ? 'bg-blue-600 border-blue-500' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}
                  >
                    To Patient
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setNavPhase('to_hospital');
                      setPickedUpAt(Date.now());
                      if (ambulancePos) setPatientPos(ambulancePos);
                      setRouteRefreshKey((v) => v + 1);
                      try {
                        if (assignment?.id) {
                          await fetch('/api/driver/assignment', {
                            method: 'PATCH',
                            headers: {
                              'Content-Type': 'application/json',
                              'x-user-id': user.id,
                              'x-user-role': user.role,
                              'x-user-email': user.email,
                            },
                            body: JSON.stringify({ emergencyId: assignment.id, action: 'patient_loaded' }),
                          });
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    className={`py-2 rounded-lg text-sm font-semibold border transition ${navPhase === 'to_hospital' ? 'bg-blue-600 border-blue-500' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'}`}
                  >
                    To Hospital
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {navPhase === 'to_patient'
                    ? 'Showing route from ambulance to patient (live patient location).'
                    : 'Showing route from ambulance/patient to hospital (live ambulance tracking).'}
                </p>
              </div>

              {routeError ? (
                <div className="bg-red-900 bg-opacity-30 border border-red-600 rounded-lg p-3 text-sm text-red-200">
                  {routeError}
                </div>
              ) : null}

              {routeSteps.length > 0 ? (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-sm font-bold text-gray-300 mb-3">Directions</h3>
                  <div className="space-y-2 max-h-52 overflow-auto">
                    {routeSteps.slice(0, 10).map((s, idx) => (
                      <div key={idx} className="text-sm text-gray-200">
                        <div className="font-semibold">{idx + 1}. {s.instruction}</div>
                        <div className="text-xs text-gray-400">
                          {(s.distanceMeters / 1000).toFixed(1)} km • {Math.max(1, Math.round(s.durationSeconds / 60))} min
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-bold text-gray-300 mb-3">Upon Arrival</h3>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-3 p-3 bg-gray-700 rounded">
                    <input type="checkbox" id="bp" className="w-4 h-4" />
                    <label htmlFor="bp" className="text-sm">Check patient vitals</label>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-700 rounded">
                    <input type="checkbox" id="docs" className="w-4 h-4" />
                    <label htmlFor="docs" className="text-sm">Collect medical documents</label>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-700 rounded">
                    <input type="checkbox" id="photo" className="w-4 h-4" />
                    <label htmlFor="photo" className="text-sm">Take photos if needed</label>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    try {
                      if (assignment?.id) {
                        await fetch('/api/driver/assignment', {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': user.id,
                            'x-user-role': user.role,
                            'x-user-email': user.email,
                          },
                          body: JSON.stringify({ emergencyId: assignment.id, action: 'handover_complete' }),
                        });
                      }
                    } catch {
                      // ignore
                    }

                    setIsNavigating(false);
                    setNavPhase('to_patient');
                    setPickedUpAt(null);
                    setRoute([]);
                    setRouteSteps([]);
                    setRouteError(null);
                    setDistance(null);
                    setDuration(null);
                    setShowThanks(true);
                  }}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white font-bold py-3 rounded-lg hover:from-green-700 hover:to-green-800 transition-all"
                >
                  END Navigation
                </button>
              </div>

              <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition">
                📞 Contact Hospital
              </button>
            </>
          )}

          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 text-xs text-gray-400">
            <p>Driver: {user.name}</p>
            <p>Driver ID: {user.id}</p>
            <p>Hospital License: {user.licenseNumber || '—'}</p>
            <p>Vehicle: Ambulance #2847</p>
          </div>
        </div>

        <div className="relative flex-1 min-h-[50vh] lg:min-h-0">
          <div className="absolute inset-0">
            <LeafletMap
              center={ambulancePos || patientPos || fallbackCenter}
              zoom={14}
              className="w-full h-full"
              followCenter={isNavigating && isFollowing}
              fitBoundsOnRoute={route.length >= 2}
              markers={[
                ...(patientPos
                  ? [
                      {
                        position: patientPos,
                        label: assignment?.patient?.name ? `Patient: ${assignment.patient.name}` : 'Patient Location',
                        color: '#ef4444',
                      },
                    ]
                  : []),
                ...(ambulancePos
                  ? [{ position: ambulancePos, label: 'Ambulance', color: '#22c55e' }]
                  : []),
                ...(assignment?.hospital?.location?.lat != null && assignment?.hospital?.location?.lng != null
                  ? [
                      {
                        position: { lat: assignment.hospital.location.lat, lng: assignment.hospital.location.lng },
                        label: assignment?.hospital?.licenseNumber
                          ? `Hospital: ${assignment.hospital.name} (${assignment.hospital.licenseNumber})`
                          : `Hospital: ${assignment.hospital.name}`,
                        color: '#3b82f6',
                      },
                    ]
                  : []),
              ]}
              route={route.length >= 2 ? route : []}
            />
          </div>

          <div className="absolute top-4 left-4 right-4 bg-gray-900/85 backdrop-blur rounded-xl p-4 border border-gray-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400">{statusText}</p>
                <p className="text-xl font-bold text-white">{distance ?? '--'} <span className="text-sm font-medium text-gray-400">• {duration ?? '--'}</span></p>
                <p className="text-xs text-gray-400 mt-1">{assignment?.location?.address || '--'}</p>
              </div>
              <div className="shrink-0">
                <div className={`${isNavigating ? 'bg-green-600/90 border-green-500' : 'bg-yellow-600/90 border-yellow-500'} px-3 py-1 rounded-lg border`}
                >
                  <p className="text-xs font-semibold">{isNavigating ? 'ACTIVE' : 'STANDBY'}</p>
                </div>
                {isNavigating ? (
                  <button
                    type="button"
                    onClick={() => setIsFollowing((v) => !v)}
                    className="mt-2 w-full bg-gray-950/80 hover:bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs"
                  >
                    {isFollowing ? 'Free Pan' : 'Follow'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {isNavigating && routeSteps.length > 0 ? (
            <div className="absolute bottom-4 left-4 right-4 bg-blue-600/90 backdrop-blur rounded-xl p-4 border border-blue-500">
              <p className="text-xs text-blue-100">Next</p>
              <p className="text-lg font-bold text-white">{routeSteps[Math.min(activeStepIdx, routeSteps.length - 1)]?.instruction}</p>
              <p className="text-xs text-blue-100 mt-1">
                {((routeSteps[Math.min(activeStepIdx, routeSteps.length - 1)]?.distanceMeters ?? 0) / 1000).toFixed(1)} km • {Math.max(1, Math.round(((routeSteps[Math.min(activeStepIdx, routeSteps.length - 1)]?.durationSeconds ?? 0) / 60)))} min
              </p>
            </div>
          ) : null}

          {!assignment ? (
            <div className="absolute inset-x-4 bottom-4 bg-gray-900/85 backdrop-blur rounded-xl p-4 border border-gray-800">
              <p className="text-sm text-gray-200 font-semibold">Waiting for assignment...</p>
              <p className="text-xs text-gray-400 mt-1">When a patient triggers SOS, their location will appear here with a route.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
