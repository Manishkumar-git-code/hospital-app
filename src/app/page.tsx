'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type RoleKey = 'hospital' | 'driver' | 'admin';

export default function Home() {
  const router = useRouter();
  const [activeRole, setActiveRole] = useState<RoleKey>('hospital');

  const roleContent = useMemo(() => {
    const common = {
      hospital: {
        title: 'Hospital',
        subtitle: 'Triage emergencies, view live ETAs, and access time-limited documents securely',
        steps: [
          'Monitor the emergency feed and prioritize instantly',
          'Open uploaded reports with a strict expiry timer',
          'Track ambulance progress and prepare beds/resources',
        ],
      },
      driver: {
        title: 'Ambulance',
        subtitle: 'Navigate Ambulance → Patient → Hospital with live route updates and ETA',
        steps: [
          'Receive assignment + patient/hospital details',
          'Start navigation with rerouting when needed',
          'Share location efficiently for stable tracking',
        ],
      },
      admin: {
        title: 'Admin',
        subtitle: 'Monitor readiness, audit access, and maintain emergency operations hygiene',
        steps: [
          'View system health and throughput indicators',
          'Audit access to documents and incident timeline',
          'Manage onboarding and operational readiness',
        ],
      },
    } satisfies Record<RoleKey, { title: string; subtitle: string; steps: string[] }>;

    return common[activeRole];
  }, [activeRole]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-[360px] w-[360px] rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 h-[420px] w-[420px] rounded-full bg-red-200/30 blur-3xl" />
      </div>

      <header className="relative border-b border-slate-200/70 bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold tracking-tight">Emergency Coordination</div>
            <div className="text-xs text-slate-600 mt-1">
              SOS intake, live tracking, and secure medical documents with auto-expiry.
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 transition text-white font-semibold"
          >
            Get Started
          </button>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-10">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              <span>Live incident ready</span>
              <span className="text-slate-300">•</span>
              <span>High-clarity UI for emergencies</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.05] tracking-tight">
              Fast Emergency Response for Hospitals & Ambulances
            </h1>

            <p className="text-slate-700 leading-relaxed">
              A single platform to coordinate SOS events: request intake, live ambulance tracking, navigation guidance,
              and secure document sharing with automatic expiry.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 transition text-white font-semibold shadow-sm"
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                className="px-5 py-3 rounded-xl bg-white hover:bg-slate-50 transition text-slate-900 font-semibold border border-slate-200"
              >
                View System Overview
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="text-sm font-semibold">SOS Requests</div>
                <div className="text-xs text-slate-600 mt-2">One-tap request, location-aware, priority-ready.</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="text-sm font-semibold">Live Tracking</div>
                <div className="text-xs text-slate-600 mt-2">Ambulance + patient location, ETA, and status.</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
                <div className="text-sm font-semibold">Secure Docs</div>
                <div className="text-xs text-slate-600 mt-2">Uploads expire automatically to reduce exposure.</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Choose your entry</div>
                <div className="text-xs text-slate-600 mt-1">A smooth start based on your role.</div>
              </div>
              <div className="text-[10px] px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                Role-based routing
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <button
                type="button"
                onClick={() => router.push('/login?role=hospital')}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <div className="text-sm font-semibold">Hospital</div>
                <div className="text-xs text-slate-600 mt-1">Emergency feed and document access.</div>
                <div className="mt-3 text-xs font-semibold text-blue-700 group-hover:text-blue-800">Continue</div>
              </button>

              <button
                type="button"
                onClick={() => router.push('/login?role=driver')}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <div className="text-sm font-semibold">Ambulance</div>
                <div className="text-xs text-slate-600 mt-1">Navigation and live location updates.</div>
                <div className="mt-3 text-xs font-semibold text-blue-700 group-hover:text-blue-800">Continue</div>
              </button>

              <button
                type="button"
                disabled
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-slate-500 cursor-not-allowed"
              >
                <div className="text-sm font-semibold">Admin</div>
                <div className="text-xs mt-1">Ops and audit dashboards.</div>
                <div className="mt-3 text-[10px] inline-flex rounded-full border border-slate-200 bg-white px-2 py-1">Coming soon</div>
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-bold tracking-tight">{roleContent.title} workflow</div>
                  <div className="text-sm text-slate-700 mt-1">{roleContent.subtitle}</div>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveRole('hospital')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      activeRole === 'hospital'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Hospital
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRole('driver')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      activeRole === 'driver'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Ambulance
                  </button>
                  <button
                    type="button"
                    disabled
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white text-slate-400 border-slate-200 cursor-not-allowed"
                  >
                    Admin
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3">
                {roleContent.steps.map((s, idx) => (
                  <div key={idx} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-900">
                      {idx + 1}
                    </div>
                    <div className="text-sm text-slate-800">{s}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 pt-10 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <div className="text-2xl font-bold tracking-tight">Core features</div>
              <div className="text-sm text-slate-700 mt-1">Scannable, minimal, and designed for speed.</div>
            </div>
            <div className="text-xs text-slate-600">High contrast • Responsive • Hover guidance</div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: 'SOS-based patient requests', desc: 'Create emergencies quickly with location and symptoms.' },
              { title: 'Real-time ambulance tracking', desc: 'Reliable ETA/distance/status for faster decisions.' },
              { title: 'Live navigation', desc: 'Ambulance → Patient → Hospital routing workflow.' },
              { title: 'Secure uploads with auto-expiry', desc: 'Short-lived access reduces data exposure risk.' },
              { title: 'Emergency feed for hospitals', desc: 'See active cases and open details instantly.' },
              { title: 'Stability under load', desc: 'Throttled GPS + caching to reduce DB pressure.' },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-slate-600 mt-2">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 pt-10 border-t border-slate-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xl font-bold tracking-tight">Trust & safety</div>
              <div className="text-sm text-slate-700 mt-2">
                Built for life-critical workflows with strict access control and time-limited documents.
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Secure access</div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Enabled</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-2">Role checks on sensitive endpoints.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Auto-expiry</div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">60 min</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-2">Documents expire automatically after upload.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Real-time reliability</div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">Stable</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-2">Throttling + caching reduces overload.</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Emergency ready</div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">Active</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-2">Clear UI built for quick scanning.</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xl font-bold tracking-tight">Get started in seconds</div>
              <div className="text-sm text-slate-700 mt-2">
                Choose your role and sign in. You’ll be routed to the right dashboard automatically.
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/login?role=hospital')}
                  className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 transition text-white font-semibold"
                >
                  Hospital Login
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/login?role=driver')}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 transition text-white font-semibold"
                >
                  Ambulance Login
                </button>
              </div>

              <div className="mt-4 text-xs text-slate-600">
                Admin dashboards are not enabled in this build.
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-slate-200 bg-white/60">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>© {new Date().getFullYear()} Emergency Coordination</div>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-slate-900 hover:text-slate-700 transition font-semibold"
          >
            Get Started
          </button>
        </div>
      </footer>
    </div>
  );
}
