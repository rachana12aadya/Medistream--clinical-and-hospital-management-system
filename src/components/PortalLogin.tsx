import React, { useState } from 'react';
import { signInWithPopup, type User as FirebaseUser } from 'firebase/auth';
import { ArrowLeft, Lock, ShieldCheck, Stethoscope } from 'lucide-react';
import { api, setAuthToken } from '../api';
import { auth, googleProvider } from '../firebase';
import { syncFirebaseUserProfileToFirestore } from '../lib/firestoreSync';
import type { Doctor, PortalType, UserAccountView } from '../types';

interface PortalLoginProps {
  mode: PortalType;
  doctors?: Doctor[];
  onSwitchMode: (mode: PortalType) => void;
  onBackToOverview: () => void;
  onAuthenticated: (payload: {
    user: UserAccountView;
    patientId?: string;
    firebaseUser?: FirebaseUser | null;
  }) => void;
}

function getDoctorEmailFromName(name: string): string {
  const clean = name
    .replace(/^Dr\.\s+/i, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');
  return `${clean}@medistream.org`;
}

export const PortalLogin: React.FC<PortalLoginProps> = ({
  mode,
  doctors = [],
  onSwitchMode,
  onBackToOverview,
  onAuthenticated,
}) => {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('arvind.subramanian@medistream.org');
  const [doctorPassword, setDoctorPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGooglePatientSignIn = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const idToken = await credential.user.getIdToken();
      const res = await api.loginPatientWithGoogle(idToken);
      setAuthToken(res.token, false);
      await syncFirebaseUserProfileToFirestore(credential.user, res.user, res.patientId).catch(
        (err) => {
          console.error('Firestore profile sync warning:', err);
        }
      );
      onAuthenticated({
        user: res.user,
        patientId: res.patientId,
        firebaseUser: credential.user,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to complete Google sign-in.';
      if (message.includes('popup-closed-by-user')) {
        setErrorMsg('Google sign-in window was closed before completing.');
      } else {
        setErrorMsg(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!doctorEmail.trim() || !doctorPassword) {
      setErrorMsg('Please enter your physician portal email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.loginDoctor(doctorEmail.trim(), doctorPassword);
      setAuthToken(res.token, true);
      onAuthenticated({
        user: res.user,
        firebaseUser: null,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid physician credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!adminEmail.trim() || !adminPassword) {
      setErrorMsg('Please enter your administrator email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.loginAdmin(adminEmail.trim(), adminPassword);
      setAuthToken(res.token, true);
      onAuthenticated({
        user: res.user,
        firebaseUser: null,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center px-4 sm:px-6 py-12">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToOverview}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to MediStream
          </button>

          <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-xs font-medium self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                onSwitchMode('user');
              }}
              className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'user'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Patient
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                onSwitchMode('doctor');
              }}
              className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'doctor'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Doctor Portal
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                onSwitchMode('admin');
              }}
              className={`px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'admin'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-teal-800 tracking-wide">
              {mode === 'user'
                ? 'PATIENT PORTAL'
                : mode === 'doctor'
                ? 'ATTENDING PHYSICIAN WORKBENCH'
                : 'SYSTEM ADMINISTRATION'}
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              {mode === 'user'
                ? 'Sign in with Gmail'
                : mode === 'doctor'
                ? 'Doctor Portal Sign In'
                : 'Admin Portal Sign In'}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              {mode === 'user'
                ? 'Access your upcoming appointments, encrypted health records, e-prescriptions, lab results, and email reminders using your Google account.'
                : mode === 'doctor'
                ? 'Sign in with your MediStream physician credentials to manage clinic queues, SOAP encounters, e-prescriptions, lab orders, referrals, and leave schedules.'
                : 'Sign in with your administrator credentials to manage system settings, doctor fees, users, and hospital analytics.'}
            </p>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3"
            >
              {errorMsg}
            </div>
          )}

          {mode === 'user' ? (
            <div className="space-y-4">
              <button
                type="button"
                disabled={loading}
                onClick={handleGooglePatientSignIn}
                className="w-full py-3 px-4 inline-flex items-center justify-center gap-3 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors disabled:opacity-60 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>{loading ? 'Signing in...' : 'Continue with Google (Gmail)'}</span>
              </button>

              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                <span>One-click Google sign-in with AES-256-GCM encrypted patient records.</span>
              </div>
            </div>
          ) : mode === 'doctor' ? (
            <form onSubmit={handleDoctorSubmit} className="space-y-4">
              {doctors.length > 0 && (
                <div>
                  <label htmlFor="doctor-directory-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Select Attending Specialist
                  </label>
                  <select
                    id="doctor-directory-select"
                    value={doctorEmail}
                    onChange={(e) => setDoctorEmail(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    {doctors.map((d) => {
                      const email = getDoctorEmailFromName(d.name);
                      return (
                        <option key={d.id} value={email}>
                          {d.name} ({d.departmentName}) — {email}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="doctor-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Physician Email
                </label>
                <input
                  id="doctor-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={doctorEmail}
                  onChange={(e) => setDoctorEmail(e.target.value)}
                  placeholder="arvind.subramanian@medistream.org"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="doctor-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="doctor-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={doctorPassword}
                  onChange={(e) => setDoctorPassword(e.target.value)}
                  placeholder="Default seeded physician password: Doctor@2026"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {loading ? 'Signing in...' : 'Sign In to Doctor Portal'}
              </button>

              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                <Stethoscope className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                <span>HIPAA-audited physician access · Default physician password: <span className="font-mono text-slate-700">Doctor@2026</span></span>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Administrator Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin12@gmail.com"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {loading ? 'Signing in...' : 'Sign In to Admin Portal'}
              </button>

              <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                <Lock className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                <span>Restricted to authorized MediStream hospital administrators.</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
