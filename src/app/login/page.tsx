'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'patient' | 'hospital' | 'driver'>('patient');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const roleParam = searchParams.get('role');
    if (roleParam === 'patient' || roleParam === 'hospital' || roleParam === 'driver') {
      setRole(roleParam);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!email || !password) {
        setError('Please fill in all fields');
        return;
      }

      await login(email, password, role);

      const nextRole = localStorage.getItem('role');
      if (nextRole === 'patient' || nextRole === 'hospital' || nextRole === 'driver') {
        router.push(`/${nextRole}`);
        return;
      }

      const me = await fetch('/api/auth/me', { method: 'GET' }).catch(() => null);
      if (me && me.ok) {
        const data = await me.json().catch(() => ({}));
        const r = data?.user?.role;
        if (r === 'patient' || r === 'hospital' || r === 'driver') {
          router.push(`/${r}`);
          return;
        }
      }

      router.push('/login');
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-red-50 flex items-center justify-center p-4">
      {/* Medical Theme Background Decoration */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-red-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-1/2 w-96 h-96 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header with Medical Theme */}
          <div className="bg-gradient-to-r from-blue-600 to-red-600 px-8 py-12 text-center">
            <div className="mb-4 text-5xl">🚑</div>
            <h1 className="text-3xl font-bold text-white">Emergency Aid</h1>
            <p className="text-blue-100 mt-2">Medical Emergency Response System</p>
          </div>

          {/* Form Content */}
          <div className="px-8 py-8">
            {error && (
              <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Login As
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'patient', label: '🏥 Patient', desc: 'Seek Help' },
                    { value: 'hospital', label: '🏢 Hospital', desc: 'Command Center' },
                    { value: 'driver', label: '🚗 Driver', desc: 'Ambulance' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRole(option.value as any)}
                      className={`p-3 rounded-lg border-2 transition-all text-center text-xs ${
                        role === option.value
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-lg mb-1">{option.label.split(' ')[0]}</div>
                      <div className="text-xs">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-red-600 text-white font-semibold py-3 rounded-lg hover:from-blue-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>

              {role === 'patient' ? (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/api/auth/google/start';
                  }}
                  className="w-full bg-white border border-gray-300 text-gray-800 font-semibold py-3 rounded-lg hover:bg-gray-50 transition-all"
                >
                  Sign in with Google
                </button>
              ) : null}

              <div className="text-center text-sm text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                  Create one
                </Link>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 text-center text-xs text-gray-600">
            <p>For emergency medical assistance, call <strong>911</strong></p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
