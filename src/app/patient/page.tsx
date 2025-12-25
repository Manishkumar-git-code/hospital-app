'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

export default function PatientDashboard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [sosTriggered, setSosTriggered] = useState(false);
  const [isTriggeringSOS, setIsTriggeringSOS] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [eta, setEta] = useState('--:--');
  const [sosError, setSosError] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [isResolvingManual, setIsResolvingManual] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [emergencyId, setEmergencyId] = useState<string | null>(null);
  const [patientPos, setPatientPos] = useState<{ lat: number; lng: number } | null>(null);
  const [ambulancePos, setAmbulancePos] = useState<{ lat: number; lng: number } | null>(null);
  const [hospitalInfo, setHospitalInfo] = useState<any | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [uploadedCount, setUploadedCount] = useState(0);
  const [symptomsText, setSymptomsText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [pdfError, setPdfError] = useState('');
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mouseDownRef = useRef(false);
  const speechRef = useRef<any>(null);
  const lastLocationSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const handleSOSMouseDown = () => {
    if (isTriggeringSOS) return;
    if (sosTriggered) return;
    setSosError('');
    mouseDownRef.current = true;
    setHoldProgress(0);

    holdIntervalRef.current = setInterval(() => {
      setHoldProgress((prev) => {
        const newProgress = prev + 3.33; // 100/30 for 3 seconds
        if (newProgress >= 100) {
          if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
          triggerSOS();
          return 100;
        }
        return newProgress;
      });
    }, 100);
  };

  const handleSOSMouseUp = () => {
    mouseDownRef.current = false;
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    
    if (holdProgress < 100) {
      setHoldProgress(0);
    }
  };

  const stopVoice = () => {
    const inst = speechRef.current;
    if (inst) {
      try {
        inst.stop();
      } catch {
        // ignore
      }
    }
    speechRef.current = null;
    setIsListening(false);
  };

  const startVoice = () => {
    if (typeof window === 'undefined') return;
    if (isListening) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setPdfStatus('error');
      setPdfError('Voice input is not supported in this browser.');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: any) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        chunk += String(event.results[i][0]?.transcript || '');
      }
      const next = chunk.trim();
      if (!next) return;
      setSymptomsText((prev) => (prev ? `${prev} ${next}` : next));
    };

    rec.onerror = () => {
      stopVoice();
    };

    rec.onend = () => {
      stopVoice();
    };

    speechRef.current = rec;
    setIsListening(true);
    try {
      rec.start();
    } catch {
      stopVoice();
    }
  };

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, []);

  const handleGeneratePdf = async () => {
    if (!user) return;

    setPdfError('');
    if (!emergencyId) {
      setPdfStatus('error');
      setPdfError('Trigger SOS first to attach the PDF.');
      return;
    }

    const text = symptomsText.trim();
    if (!text) {
      setPdfStatus('error');
      setPdfError('Please enter symptoms text (or use voice) before converting to PDF.');
      return;
    }

    setPdfStatus('uploading');
    try {
      const res = await fetch('/api/documents/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
        body: JSON.stringify({ emergencyId, text, title: 'Symptoms Report' }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate PDF');
      }

      setPdfStatus('uploaded');
      setUploadedCount((c) => c + 1);
    } catch (err) {
      setPdfStatus('error');
      setPdfError(err instanceof Error ? err.message : 'Failed to generate PDF');
    }
  };

  const triggerSOS = async () => {
    if (!user) return;
    if (isTriggeringSOS) return;
    setIsTriggeringSOS(true);
    setEta('Requesting location...');
    setSosError('');

    if (!('geolocation' in navigator)) {
      setEta('GPS not supported');
      setIsTriggeringSOS(false);
      return;
    }

    const getPos = () =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });

    try {
      const pos = await getPos();
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPatientPos(loc);

      const res = await fetch('/api/patient/sos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
        body: JSON.stringify({ location: loc, symptoms: symptomsText.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSosTriggered(false);
        setShowSidebar(false);
        setEmergencyId(null);
        setHospitalInfo(null);
        setEta('--:--');
        setSosError(data?.error || 'SOS failed');
        return;
      }

      setEmergencyId(data?.sosId || null);
      setHospitalInfo(data?.hospital || null);
      setSosTriggered(true);
      setShowSidebar(true);
      setSosError('');

      if (typeof data?.eta === 'number') {
        setEta(`${data.eta} min`);
      } else {
        setEta('SOS sent');
      }
    } catch (err: any) {
      setSosTriggered(false);
      setShowSidebar(false);
      setEmergencyId(null);
      setHospitalInfo(null);

      const code = err?.code;
      const msg = typeof err?.message === 'string' ? err.message : '';

      setEta('--:--');
      if (code === 1) {
        setSosError('Location denied. Please allow location access and try again.');
      } else if (code === 2) {
        setSosError(
          `Location unavailable${msg ? `: ${msg}` : ''}. You can try again, enable Windows Location Services, or enter your address below.`
        );
      } else if (code === 3) {
        setSosError(
          `Location request timed out${msg ? `: ${msg}` : ''}. Try again or enter your address below.`
        );
      } else {
        setSosError(
          `Failed to get location${msg ? `: ${msg}` : ''}. Please try again or enter your address below.`
        );
      }
    } finally {
      setIsTriggeringSOS(false);
      setHoldProgress(0);
    }
  };

  const triggerSOSWithManualAddress = async () => {
    if (!user) return;
    if (isTriggeringSOS || isResolvingManual) return;
    const q = manualAddress.trim();
    if (!q) {
      setSosError('Please enter your address.');
      return;
    }

    setIsResolvingManual(true);
    setEta('Resolving address...');
    setSosError('');

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
      );
      const data = await res.json().catch(() => []);
      const best = Array.isArray(data) ? data[0] : null;
      const latNum = Number(best?.lat);
      const lngNum = Number(best?.lon);

      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        setEta('--:--');
        setSosError('Could not find that address. Please enter a more specific address.');
        return;
      }

      setIsTriggeringSOS(true);
      const loc = { lat: latNum, lng: lngNum, address: q };
      setPatientPos({ lat: latNum, lng: lngNum });

      const apiRes = await fetch('/api/patient/sos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
        body: JSON.stringify({ location: loc, symptoms: symptomsText.trim() }),
      });

      const apiData = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        setSosTriggered(false);
        setShowSidebar(false);
        setEmergencyId(null);
        setHospitalInfo(null);
        setEta('--:--');
        setSosError(apiData?.error || 'SOS failed');
        return;
      }

      setEmergencyId(apiData?.sosId || null);
      setHospitalInfo(apiData?.hospital || null);
      setSosTriggered(true);
      setShowSidebar(true);
      setSosError('');

      if (typeof apiData?.eta === 'number') {
        setEta(`${apiData.eta} min`);
      } else {
        setEta('SOS sent');
      }
    } catch (e) {
      setEta('--:--');
      setSosError('Failed to resolve address. Please try again.');
    } finally {
      setIsResolvingManual(false);
      setIsTriggeringSOS(false);
      setHoldProgress(0);
    }
  };

  useEffect(() => {
    if (!user || !emergencyId) return;
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPatientPos(loc);

        const prev = lastLocationSentRef.current;
        const now = Date.now();
        const movedEnough =
          !prev ||
          Math.abs(loc.lat - prev.lat) > 0.00015 ||
          Math.abs(loc.lng - prev.lng) > 0.00015;
        const timeEnough = !prev || now - prev.at > 5000;
        if (!movedEnough || !timeEnough) return;

        lastLocationSentRef.current = { at: now, lat: loc.lat, lng: loc.lng };

        fetch('/api/patient/sos', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user.id,
            'x-user-role': user.role,
            'x-user-email': user.email,
          },
          body: JSON.stringify({ emergencyId, location: loc }),
        }).catch(() => null);
      },
      () => {
        // ignore
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user, emergencyId]);

  useEffect(() => {
    if (!user || !emergencyId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/emergency/tracking?emergencyId=${encodeURIComponent(emergencyId)}`, {
          headers: {
            'x-user-id': user.id,
            'x-user-role': user.role,
            'x-user-email': user.email,
          },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;

        const tracking = data?.tracking;
        if (tracking?.status === 'completed') {
          setEta('You have reached');
          setAmbulancePos(null);
          return 'completed';
        }
        if (tracking?.ambulance?.lat != null && tracking?.ambulance?.lng != null) {
          setAmbulancePos({ lat: tracking.ambulance.lat, lng: tracking.ambulance.lng });
        }
        if (tracking?.hospital?.id) {
          setHospitalInfo(tracking.hospital);
        }
        if (typeof tracking?.etaMinutes === 'number') {
          setEta(`${tracking.etaMinutes} min`);
        }
      } catch {
        // ignore
      }

      return null;
    };

    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const status = await poll().catch(() => null);
      if (status === 'completed') {
        stopped = true;
        return;
      }
      if (stopped) return;
      timeoutId = setTimeout(tick, 4500);
    };

    tick().catch(() => null);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user, emergencyId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    setUploadError('');

    const files = e.target.files;
    const file = files?.[0];
    if (!file) return;

    if (!emergencyId) {
      setUploadStatus('error');
      setUploadError('Please trigger SOS first, then upload medical records.');
      return;
    }

    setUploadStatus('uploading');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('emergencyId', emergencyId);
      form.append('docType', 'report');

      const res = await fetch('/api/uploads/document', {
        method: 'POST',
        headers: {
          'x-user-id': user.id,
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      setUploadStatus('uploaded');
      setUploadedCount((c) => c + 1);
    } catch (err) {
      setUploadStatus('error');
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      // allow re-uploading the same file
      e.target.value = '';
    }
  };

  // Show loading while redirecting (must be after all hooks)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-100">Redirecting to login...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-600">Emergency Aid</h1>
            <p className="text-sm text-gray-600">Patient Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-semibold text-gray-800">{user.name}</p>
              <p className="text-xs text-gray-600">{user.email}</p>
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* SOS Section - Left/Center */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
              <h2 className="text-2xl font-bold text-gray-800 mb-8">Emergency Alert System</h2>
              
              {!(sosTriggered || isTriggeringSOS) ? (
                <>
                  <p className="text-gray-600 mb-8">
                    Hold the button for 3 seconds to trigger emergency alert
                  </p>
                  
                  {/* SOS Button with Progress Ring */}
                  <div className="flex justify-center mb-8">
                    <div className="relative w-40 h-40">
                      {/* Progress Circle */}
                      <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                        />
                        <circle
                          cx="100"
                          cy="100"
                          r="90"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="8"
                          strokeDasharray={`${2 * Math.PI * 90}`}
                          strokeDashoffset={`${2 * Math.PI * 90 * (1 - holdProgress / 100)}`}
                          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                        />
                      </svg>

                      {/* Button */}
                      <button
                        type="button"
                        onPointerDown={handleSOSMouseDown}
                        onPointerUp={handleSOSMouseUp}
                        onPointerCancel={handleSOSMouseUp}
                        onPointerLeave={handleSOSMouseUp}
                        onTouchStart={handleSOSMouseDown}
                        onTouchEnd={handleSOSMouseUp}
                        onTouchCancel={handleSOSMouseUp}
                        onContextMenu={(e) => e.preventDefault()}
                        style={{ touchAction: 'none' }}
                        className="absolute inset-0 m-auto w-32 h-32 bg-gradient-to-br from-red-500 to-red-700 text-white rounded-full font-bold text-2xl hover:from-red-600 hover:to-red-800 transition-all shadow-lg active:scale-95"
                      >
                        🆘
                        <div className="text-xs mt-1">SOS</div>
                      </button>

                      {/* Progress Text */}
                      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full mt-4 text-sm text-gray-600">
                        {holdProgress > 0 && `${Math.round(holdProgress)}%`}
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                    <p className="text-sm text-blue-800">
                      ⓘ Your location will be automatically shared with nearby hospitals and ambulances
                    </p>
                  </div>

                  {sosError ? (
                    <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                      {sosError}
                    </div>
                  ) : null}

                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">If GPS fails, enter your address to send SOS:</p>
                    <div className="flex gap-2">
                      <input
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value)}
                        placeholder="Enter your address"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none"
                      />
                      <button
                        type="button"
                        onClick={triggerSOSWithManualAddress}
                        disabled={isResolvingManual || isTriggeringSOS}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isResolvingManual ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-8">
                    <div className="inline-block bg-green-100 text-green-800 px-6 py-3 rounded-full font-semibold mb-4">
                      {sosTriggered ? '✓ SOS Alert Triggered' : 'Requesting location...'}
                    </div>
                    <p className="text-gray-600">
                      {sosTriggered ? 'Emergency services have been notified' : 'Please allow location access in your browser prompt'}
                    </p>
                  </div>

                  {/* ETA Display */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-8 rounded-xl mb-8 border border-blue-200">
                    <p className="text-gray-700 text-sm mb-2">Estimated Time of Arrival</p>
                    <p className="text-5xl font-bold text-blue-600">{eta}</p>
                  </div>

                  {patientPos ? (
                    <div className="h-80 rounded-xl overflow-hidden border border-gray-200">
                      <LeafletMap
                        center={patientPos}
                        zoom={14}
                        className="w-full h-full"
                        markers={[
                          { position: patientPos, label: 'You', color: '#ef4444' },
                          ...(hospitalInfo?.lat != null && hospitalInfo?.lng != null
                            ? [
                                {
                                  position: { lat: hospitalInfo.lat, lng: hospitalInfo.lng },
                                  label: hospitalInfo?.licenseNumber
                                    ? `Hospital: ${hospitalInfo.name} (${hospitalInfo.licenseNumber})`
                                    : `Hospital: ${hospitalInfo.name}`,
                                  color: '#3b82f6',
                                },
                              ]
                            : []),
                          ...(ambulancePos
                            ? [{ position: ambulancePos, label: 'Ambulance', color: '#22c55e' }]
                            : []),
                        ]}
                        route={ambulancePos ? [ambulancePos, patientPos] : []}
                      />
                    </div>
                  ) : null}

                  {/* Status Info */}
                  <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-6">
                    <p className="text-sm text-amber-800">
                      🚑 Ambulance dispatched • Location shared • Stay calm
                    </p>
                    {hospitalInfo?.name ? (
                      <p className="text-xs text-amber-800 mt-2">
                        🏥 Hospital: {hospitalInfo.name}
                        {hospitalInfo.licenseNumber ? ` • License: ${hospitalInfo.licenseNumber}` : ''}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Smart Sidebar - Right */}
          {showSidebar && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-6">
                <h3 className="text-lg font-bold text-gray-800 mb-6">Quick Actions</h3>

                {/* Document Upload */}
                <div className="mb-6">
                  <label className="block">
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
                        uploadStatus === 'uploaded'
                          ? 'bg-green-50 border-green-400 hover:bg-green-100'
                          : uploadStatus === 'uploading'
                          ? 'bg-blue-50 border-blue-300 opacity-80'
                          : uploadStatus === 'error'
                          ? 'bg-red-50 border-red-300 hover:bg-red-100'
                          : 'bg-blue-50 border-blue-300 hover:bg-blue-100'
                      }`}
                    >
                      <p className="text-2xl mb-2">📄</p>
                      <p className="text-sm font-semibold text-blue-600">
                        {uploadStatus === 'uploaded'
                          ? `Uploaded${uploadedCount ? ` (${uploadedCount})` : ''}`
                          : uploadStatus === 'uploading'
                          ? 'Uploading...'
                          : 'Upload Medical Records'}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">PDF, JPG, PNG</p>
                      {!emergencyId ? (
                        <p className="text-xs text-amber-700 mt-2">Trigger SOS first to attach documents.</p>
                      ) : null}
                      {uploadStatus === 'error' && uploadError ? (
                        <p className="text-xs text-red-700 mt-2">{uploadError}</p>
                      ) : null}
                    </div>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      disabled={uploadStatus === 'uploading'}
                    />
                  </label>
                </div>

                {/* Symptoms Input */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Describe Symptoms
                  </label>
                  <textarea
                    placeholder="E.g., Chest pain, shortness of breath..."
                    value={symptomsText}
                    onChange={(e) => setSymptomsText(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none resize-none h-24"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => (isListening ? stopVoice() : startVoice())}
                      className="w-full bg-gray-900 text-white py-2 rounded-lg hover:bg-gray-800 transition text-sm font-semibold"
                    >
                      {isListening ? 'Stop Voice' : 'Start Voice'}
                    </button>
                    <button
                      type="button"
                      onClick={handleGeneratePdf}
                      disabled={pdfStatus === 'uploading'}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pdfStatus === 'uploading' ? 'Converting...' : 'Convert to PDF'}
                    </button>
                  </div>
                  {pdfStatus === 'uploaded' ? (
                    <p className="text-xs text-green-700 mt-2">PDF attached successfully.</p>
                  ) : null}
                  {pdfStatus === 'error' && pdfError ? (
                    <p className="text-xs text-red-700 mt-2">{pdfError}</p>
                  ) : null}
                </div>

                {/* Emergency Contacts */}
                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contacts</h4>
                  <div className="space-y-2">
                    <button className="w-full bg-red-100 text-red-700 py-2 rounded-lg hover:bg-red-200 transition text-sm font-semibold">
                      📞 Call Emergency
                    </button>
                    <button className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition text-sm font-semibold">
                      👥 Notify Contacts
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
