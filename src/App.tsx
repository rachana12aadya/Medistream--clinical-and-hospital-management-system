import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { api, getAuthToken, setAuthToken, type PublicOverviewResponse } from './api';
import { AdminPortalWorkspace } from './components/AdminPortalWorkspace';
import { AmbulanceDispatchView } from './components/AmbulanceDispatchView';
import { BookingWizard } from './components/BookingWizard';
import { ClinicChatbot } from './components/ClinicChatbot';
import { DoctorPortalWorkspace } from './components/DoctorPortalWorkspace';
import { DoctorsDirectoryView } from './components/DoctorsDirectoryView';
import { PortalLogin } from './components/PortalLogin';
import { PublicHomeView } from './components/PublicHomeView';
import { TopBar, type PublicRoute } from './components/TopBar';
import { UserPortalWorkspace } from './components/UserPortalWorkspace';
import { auth } from './firebase';
import {
  syncAmbulanceDispatchToFirestore,
  syncBookingToFirestore,
  syncFirebaseUserProfileToFirestore,
} from './lib/firestoreSync';
import type { Doctor, UserAccountView } from './types';

export default function App() {
  const [overview, setOverview] = useState<PublicOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [publicRoute, setPublicRoute] = useState<PublicRoute>(() => {
    if (typeof window === 'undefined') return 'overview';
    const portal = new URLSearchParams(window.location.search).get('portal');
    if (portal === 'admin') return 'admin-portal';
    if (portal === 'doctor') return 'doctor-portal';
    if (portal === 'user') return 'user-portal';
    if (portal === 'doctors') return 'doctors';
    if (portal === 'book') return 'book';
    if (portal === 'ambulance') return 'ambulance';
    return 'overview';
  });
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('all');
  const [bookingDoctor, setBookingDoctor] = useState<Doctor | null>(null);
  const [bookingDate, setBookingDate] = useState<string | undefined>(undefined);
  const [bookingSlot, setBookingSlot] = useState<string | undefined>(undefined);

  const [sessionUser, setSessionUser] = useState<UserAccountView | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  const fetchOverview = async () => {
    try {
      const data = await api.getPublicOverview();
      setOverview(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to reach MediStream server.');
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    fetchOverview();

    // Restore persisted admin session token if present
    const savedToken = getAuthToken();
    if (savedToken) {
      api
        .getMe()
        .then((res) => {
          setSessionUser(res.user);
        })
        .catch(() => {
          setAuthToken(null);
        });
    }

    // Keep Firebase Google patient session synced cleanly
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await api.loginPatientWithGoogle(idToken);
          setAuthToken(res.token, false);
          setSessionUser(res.user);
          void syncFirebaseUserProfileToFirestore(fbUser, res.user, res.patientId).catch(() => {});
        } catch {
          // Ignore silent restore errors; explicit sign-in will surface messages
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await api.logout().catch(() => {});
      if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
    } finally {
      setAuthToken(null);
      setSessionUser(null);
      setFirebaseUser(null);
    }
  };

  const handleStartBooking = (doctor: Doctor, date?: string, slot?: string) => {
    setBookingDoctor(doctor);
    setBookingDate(date);
    setBookingSlot(slot);
    setPublicRoute('book');
  };

  if (loadingOverview) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-lg font-bold text-slate-900">MediStream</p>
          <p className="text-sm text-slate-500">Initializing clinical workspace...</p>
        </div>
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md text-center space-y-3">
          <p className="text-base font-semibold text-slate-900">Unable to Connect</p>
          <p className="text-xs text-slate-600">{loadError || 'Server unavailable'}</p>
          <button
            type="button"
            onClick={fetchOverview}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const switchPortalMode = (nextMode: 'user' | 'doctor' | 'admin') => {
    setPublicRoute(
      nextMode === 'admin'
        ? 'admin-portal'
        : nextMode === 'doctor'
        ? 'doctor-portal'
        : 'user-portal'
    );
  };

  if (publicRoute === 'admin-portal') {
    if (!sessionUser || sessionUser.role !== 'admin') {
      return (
        <PortalLogin
          mode="admin"
          doctors={overview.doctors}
          onSwitchMode={switchPortalMode}
          onBackToOverview={() => setPublicRoute('overview')}
          onAuthenticated={({ user }) => {
            setSessionUser(user);
            setPublicRoute('admin-portal');
          }}
        />
      );
    }

    return (
      <AdminPortalWorkspace
        currentUser={sessionUser}
        doctors={overview.doctors}
        departments={overview.departments}
        onRefreshPublic={fetchOverview}
        onNavigate={(route) => setPublicRoute(route)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (publicRoute === 'doctor-portal') {
    if (!sessionUser || (sessionUser.role !== 'doctor' && sessionUser.role !== 'admin')) {
      return (
        <PortalLogin
          mode="doctor"
          doctors={overview.doctors}
          onSwitchMode={switchPortalMode}
          onBackToOverview={() => setPublicRoute('overview')}
          onAuthenticated={({ user }) => {
            setSessionUser(user);
            setPublicRoute('doctor-portal');
          }}
        />
      );
    }

    return (
      <DoctorPortalWorkspace
        currentUser={sessionUser}
        doctors={overview.doctors}
        currencySymbol={overview.publicConfig.currencySymbol}
        onRefreshPublic={fetchOverview}
        onNavigate={(route) => setPublicRoute(route)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (publicRoute === 'user-portal') {
    if (!sessionUser) {
      return (
        <PortalLogin
          mode="user"
          doctors={overview.doctors}
          onSwitchMode={switchPortalMode}
          onBackToOverview={() => setPublicRoute('overview')}
          onAuthenticated={({ user, firebaseUser: fbUser }) => {
            setSessionUser(user);
            if (fbUser) setFirebaseUser(fbUser);
            setPublicRoute('user-portal');
          }}
        />
      );
    }

    return (
      <>
        <UserPortalWorkspace
          currentUser={sessionUser}
          firebaseUser={firebaseUser}
          departments={overview.departments}
          doctors={overview.doctors}
          currencySymbol={overview.publicConfig.currencySymbol}
          insuranceCoveragePct={overview.publicConfig.defaultInsuranceCoveragePct}
          platformFee={overview.publicConfig.platformProcessingFee}
          onRefreshPublic={fetchOverview}
          onNavigate={(route) => setPublicRoute(route)}
          onSignOut={handleSignOut}
        />
        <ClinicChatbot onNavigate={setPublicRoute} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar activeRoute={publicRoute} onNavigate={setPublicRoute} />

      <main>
        {publicRoute === 'overview' && (
          <PublicHomeView
            departments={overview.departments}
            doctors={overview.doctors}
            currencySymbol={overview.publicConfig.currencySymbol}
            onNavigate={setPublicRoute}
            onSelectDepartment={(deptId) => setSelectedDepartmentId(deptId)}
            onBookDoctor={(doc) => handleStartBooking(doc)}
          />
        )}

        {publicRoute === 'doctors' && (
          <DoctorsDirectoryView
            departments={overview.departments}
            doctors={overview.doctors}
            currencySymbol={overview.publicConfig.currencySymbol}
            initialDepartmentId={selectedDepartmentId}
            onStartBooking={handleStartBooking}
          />
        )}

        {publicRoute === 'book' && (
          <BookingWizard
            departments={overview.departments}
            doctors={overview.doctors}
            currencySymbol={overview.publicConfig.currencySymbol}
            insuranceCoveragePct={overview.publicConfig.defaultInsuranceCoveragePct}
            platformFee={overview.publicConfig.platformProcessingFee}
            preselectedDoctor={bookingDoctor}
            preselectedDate={bookingDate}
            preselectedSlot={bookingSlot}
            defaultPatientName={sessionUser?.role === 'patient' ? sessionUser.name : undefined}
            defaultPatientEmail={sessionUser?.role === 'patient' ? sessionUser.email : undefined}
            onBookingComplete={(created) => {
              if (firebaseUser && created) {
                void syncBookingToFirestore(
                  firebaseUser,
                  created.appointment,
                  created.transaction,
                  created.reminder
                ).catch(() => {});
              }
              fetchOverview();
            }}
          />
        )}

        {publicRoute === 'ambulance' && (
          <AmbulanceDispatchView
            currencySymbol={overview.publicConfig.currencySymbol}
            defaultPatientName={sessionUser?.role === 'patient' ? sessionUser.name : undefined}
            defaultPatientEmail={sessionUser?.role === 'patient' ? sessionUser.email : undefined}
            onDispatchComplete={(dispatch) => {
              if (firebaseUser) {
                void syncAmbulanceDispatchToFirestore(firebaseUser, dispatch).catch(() => {});
              }
            }}
          />
        )}
      </main>

      <ClinicChatbot onNavigate={setPublicRoute} />
    </div>
  );
}
