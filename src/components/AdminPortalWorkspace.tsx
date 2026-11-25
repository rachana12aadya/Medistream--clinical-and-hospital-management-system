import React, { useEffect, useState } from 'react';
import {
  Activity,
  Ambulance,
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Database,
  Download,
  LogOut,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { api } from '../api';
import { formatCurrency } from '../lib/hospitalRules';
import type {
  AdminDatabaseSnapshot,
  AmbulanceDispatch,
  AmbulanceDispatchStatus,
  AmbulanceUnit,
  AmbulanceUnitStatus,
  AuditLogEntry,
  Department,
  Doctor,
  EmailReminder,
  HospitalAnalytics,
  SystemConfig,
  UserAccountView,
  UserRole,
} from '../types';

type AdminTab = 'analytics' | 'ambulance' | 'database' | 'users' | 'doctors' | 'config' | 'audit';
type DbCollectionKey = keyof AdminDatabaseSnapshot['collections'];

interface AdminPortalWorkspaceProps {
  currentUser: UserAccountView;
  doctors: Doctor[];
  departments: Department[];
  onRefreshPublic: () => void;
  onNavigate: (route: 'overview' | 'user-portal' | 'doctor-portal') => void;
  onSignOut: () => void;
}

export const AdminPortalWorkspace: React.FC<AdminPortalWorkspaceProps> = ({
  currentUser,
  doctors: initialDoctors,
  departments,
  onRefreshPublic,
  onNavigate,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (typeof window === 'undefined') return 'analytics';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (
      tab === 'ambulance' ||
      tab === 'database' ||
      tab === 'users' ||
      tab === 'doctors' ||
      tab === 'config' ||
      tab === 'audit'
    ) {
      return tab;
    }
    return 'analytics';
  });
  const [analytics, setAnalytics] = useState<HospitalAnalytics | null>(null);
  const [users, setUsers] = useState<UserAccountView[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>(initialDoctors);
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [reminders, setReminders] = useState<EmailReminder[]>([]);
  const [ambulanceUnits, setAmbulanceUnits] = useState<AmbulanceUnit[]>([]);
  const [ambulanceDispatches, setAmbulanceDispatches] = useState<AmbulanceDispatch[]>([]);
  const [databaseSnapshot, setDatabaseSnapshot] = useState<AdminDatabaseSnapshot | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<DbCollectionKey>(() => {
    if (typeof window === 'undefined') return 'appointments';
    const col = new URLSearchParams(window.location.search).get('collection');
    if (
      col === 'appointments' ||
      col === 'patients' ||
      col === 'payments' ||
      col === 'reminders' ||
      col === 'users' ||
      col === 'doctors' ||
      col === 'departments' ||
      col === 'ambulances' ||
      col === 'ambulanceDispatches' ||
      col === 'encounters' ||
      col === 'prescriptions' ||
      col === 'labOrders' ||
      col === 'referrals'
    ) {
      return col;
    }
    return 'appointments';
  });
  const [dbSearch, setDbSearch] = useState('');
  const [inspectedRecordJson, setInspectedRecordJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create user state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [newDoctorId, setNewDoctorId] = useState(initialDoctors[0]?.id || 'doc-1');

  // Create Attending Doctor state
  const [docName, setDocName] = useState('');
  const [docDeptId, setDocDeptId] = useState(departments[0]?.id || 'dept-cardio');
  const [docSpecialty, setDocSpecialty] = useState('');
  const [docQualifications, setDocQualifications] = useState('MBBS, MD, DM');
  const [docFee, setDocFee] = useState('1200');
  const [docRoom, setDocRoom] = useState('Suite 210');

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [anaRes, usrRes, cfgRes, audRes, remRes, dbRes, ambRes] = await Promise.all([
        api.getAdminAnalytics(),
        api.getAdminUsers(),
        api.getAdminConfig(),
        api.getAdminAuditLogs(),
        api.getReminders(),
        api.getAdminDatabase(),
        api.getAmbulanceDispatches(),
      ]);
      setAnalytics(anaRes.analytics);
      setUsers(usrRes.users);
      setConfig(cfgRes.config);
      setAuditLogs(audRes.auditLogs);
      setReminders(remRes.reminders);
      setDatabaseSnapshot(dbRes);
      setAmbulanceUnits(ambRes.units);
      setAmbulanceDispatches(ambRes.dispatches);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to load admin console.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    setDoctors(initialDoctors);
  }, [initialDoctors]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      const res = await api.createAdminUser({
        name: newName.trim(),
        email: newEmail.trim(),
        role: newRole,
        doctorId: newRole === 'doctor' ? newDoctorId : undefined,
      });
      setUsers((prev) => [res.user, ...prev]);
      setNewName('');
      setNewEmail('');
      setStatusMsg({ type: 'ok', text: `Created ${res.user.role} profile for ${res.user.email}.` });
      loadAdminData();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to create user.' });
    }
  };

  const handleUpdateUser = async (
    targetId: string,
    payload: { role?: UserRole; active?: boolean; doctorId?: string }
  ) => {
    setStatusMsg(null);
    try {
      const res = await api.updateAdminUser(targetId, payload);
      setUsers((prev) => prev.map((u) => (u.id === targetId ? res.user : u)));
      setStatusMsg({ type: 'ok', text: `Updated role permissions for ${res.user.email}.` });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to update user.' });
    }
  };

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    try {
      const res = await api.createAdminDoctor({
        name: docName,
        departmentId: docDeptId,
        specialty: docSpecialty,
        qualifications: docQualifications,
        consultationFee: Number(docFee) || 1000,
        roomNumber: docRoom,
      });
      setDoctors((prev) => [...prev, res.doctor]);
      setDocName('');
      setDocSpecialty('');
      onRefreshPublic();
      loadAdminData();
      setStatusMsg({
        type: 'ok',
        text: `Added ${res.doctor.name} (${res.doctor.departmentName})${
          res.user ? ` with Doctor Portal login ${res.user.email}` : ''
        }.`,
      });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not add specialist.' });
    }
  };

  const handleToggleDoctorAccepting = async (doc: Doctor) => {
    setStatusMsg(null);
    try {
      const res = await api.updateAdminDoctor(doc.id, {
        acceptingNewPatients: !doc.acceptingNewPatients,
      });
      setDoctors((prev) => prev.map((d) => (d.id === doc.id ? res.doctor : d)));
      onRefreshPublic();
      setStatusMsg({
        type: 'ok',
        text: `${res.doctor.name} is now ${res.doctor.acceptingNewPatients ? 'Accepting Visits' : 'Paused'}.`,
      });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Doctor update failed.' });
    }
  };

  const handleUpdateDoctorFee = async (doc: Doctor, fee: number) => {
    if (Number.isNaN(fee) || fee < 0) return;
    try {
      const res = await api.updateAdminDoctor(doc.id, { consultationFee: fee });
      setDoctors((prev) => prev.map((d) => (d.id === doc.id ? res.doctor : d)));
      onRefreshPublic();
      setStatusMsg({ type: 'ok', text: `Updated consultation fee for ${res.doctor.name}.` });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Fee update failed.' });
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setStatusMsg(null);
    try {
      const res = await api.updateAdminConfig(config);
      setConfig(res.config);
      onRefreshPublic();
      setStatusMsg({ type: 'ok', text: 'System & HIPAA security configuration saved.' });
      loadAdminData();
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save config.' });
    }
  };

  const handleDispatchReminders = async () => {
    setStatusMsg(null);
    try {
      const res = await api.dispatchReminders();
      setReminders(res.reminders);
      loadAdminData();
      setStatusMsg({
        type: 'ok',
        text:
          res.dispatchedCount > 0
            ? `Dispatched ${res.dispatchedCount} scheduled email reminder(s).`
            : 'No queued reminders due right now.',
      });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Dispatch failed.' });
    }
  };

  const handleUpdateDispatchStatus = async (
    dispatchId: string,
    status: AmbulanceDispatchStatus
  ) => {
    setStatusMsg(null);
    try {
      const res = await api.updateAdminAmbulanceDispatchStatus(dispatchId, status);
      setAmbulanceDispatches((prev) => prev.map((d) => (d.id === dispatchId ? res.dispatch : d)));
      setAmbulanceUnits(res.units);
      const dbRes = await api.getAdminDatabase();
      setDatabaseSnapshot(dbRes);
      setStatusMsg({
        type: 'ok',
        text: `Dispatch ${res.dispatch.dispatchCode} (${res.dispatch.vehicleNumber}) updated to ${status}.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update dispatch status.',
      });
    }
  };

  const handleUpdateUnitStatus = async (unitId: string, status: AmbulanceUnitStatus) => {
    setStatusMsg(null);
    try {
      const res = await api.updateAdminAmbulanceUnitStatus(unitId, status);
      setAmbulanceUnits((prev) => prev.map((u) => (u.id === unitId ? res.unit : u)));
      const dbRes = await api.getAdminDatabase();
      setDatabaseSnapshot(dbRes);
      setStatusMsg({
        type: 'ok',
        text: `Unit ${res.unit.vehicleNumber} marked ${status}.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update unit status.',
      });
    }
  };

  const currency = config?.currencySymbol || '₹';

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" aria-hidden="true" /> },
    { id: 'ambulance', label: 'Ambulance Fleet', icon: <Ambulance className="w-4 h-4" aria-hidden="true" /> },
    { id: 'database', label: 'Stored Data', icon: <Database className="w-4 h-4" aria-hidden="true" /> },
    { id: 'users', label: 'Users & RBAC', icon: <Users className="w-4 h-4" aria-hidden="true" /> },
    { id: 'doctors', label: 'Doctors & Fees', icon: <Stethoscope className="w-4 h-4" aria-hidden="true" /> },
    { id: 'config', label: 'System Config', icon: <Settings className="w-4 h-4" aria-hidden="true" /> },
    { id: 'audit', label: 'HIPAA Audit & Mail', icon: <ClipboardList className="w-4 h-4" aria-hidden="true" /> },
  ];

  const tabTitles: Record<AdminTab, string> = {
    analytics: 'Hospital Analytics Dashboard',
    ambulance: 'Emergency Ambulance Fleet & Dispatch Control',
    database: 'Stored Database Collections',
    users: 'User Accounts & Role-Based Access Control',
    doctors: 'Physicians & Department Configuration',
    config: 'HIPAA Security, Billing & Mailer Config',
    audit: 'HIPAA Audit Logs & Reminder Outbox',
  };

  const collectionLabels: Record<DbCollectionKey, string> = {
    appointments: 'Appointments',
    patients: 'Patient Charts',
    encounters: 'SOAP Encounters',
    prescriptions: 'E-Prescriptions',
    labOrders: 'Lab Orders',
    referrals: 'Referrals',
    payments: 'Payments (INR)',
    reminders: 'Email Reminders',
    users: 'Users',
    doctors: 'Doctors',
    departments: 'Departments',
    ambulances: 'Ambulance Fleet',
    ambulanceDispatches: 'Ambulance Dispatches',
  };

  const handleExportCollectionJson = () => {
    if (!databaseSnapshot) return;
    const rows = databaseSnapshot.collections[selectedCollection];
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medistream-${selectedCollection}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const maxDeptAppts = Math.max(1, ...(analytics?.byDepartment.map((d) => d.appointments) || [1]));
  const maxDailyAppts = Math.max(1, ...(analytics?.dailyVolume.map((d) => d.appointments) || [1]));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Dark Slate Admin Sidebar */}
      <aside className="w-full lg:w-64 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto bg-slate-900 text-slate-100 flex flex-col justify-between shrink-0">
        <div>
          <div className="px-6 h-16 border-b border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="text-lg font-bold tracking-tight text-white cursor-pointer"
            >
              MediStream
            </button>
            <span className="text-xs font-medium text-teal-300">Admin</span>
          </div>

          <nav aria-label="Admin Portal Navigation" className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-slate-800 space-y-2.5">
          <div className="text-xs">
            <p className="font-semibold text-white truncate">{currentUser.name}</p>
            <p className="font-mono text-slate-400 truncate">{currentUser.email}</p>
            <p className="text-teal-300 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              AES-256 HIPAA Console
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-200 bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/60 rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign Out
          </button>
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Overview
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-0 sm:min-h-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Admin Portal / {tabTitles[activeTab]}</p>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{tabTitles[activeTab]}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('doctor-portal')}
              className="px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg whitespace-nowrap cursor-pointer"
            >
              Open Doctor Portal
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Sign Out
            </button>
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="lg:hidden px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
            >
              Overview
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {statusMsg && (
            <div
              role="status"
              className={`text-xs px-4 py-3 rounded-lg border flex items-center justify-between ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{statusMsg.text}</span>
              <button type="button" onClick={() => setStatusMsg(null)} className="underline ml-4 cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
              Loading hospital analytics and governance data...
            </div>
          ) : activeTab === 'analytics' && analytics ? (
            <div className="space-y-6">
              {/* 4-Column KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Total Collected Revenue</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {formatCurrency(analytics.totalRevenue, currency, 2)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    Pending balance: {formatCurrency(analytics.pendingBalance, currency, 2)}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Total Appointments</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {analytics.totalAppointments}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {analytics.confirmedAppointments} Active · {analytics.completedAppointments} Completed
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Encrypted Patient Charts</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {analytics.totalPatients}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {analytics.phiDecryptEvents} audited PHI{' '}
                    {analytics.phiDecryptEvents === 1 ? 'decryption' : 'decryptions'}
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Automated Email Reminders</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {analytics.remindersSent} Sent
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {analytics.remindersQueued} queued for upcoming visits
                  </p>
                </div>
              </div>

              {/* Department Utilization & Daily Visit Volume Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">Department Load &amp; Revenue</h2>
                    <span className="text-xs text-slate-500">{analytics.activeDoctors} active specialists</span>
                  </div>

                  <div className="space-y-4">
                    {analytics.byDepartment.map((dept) => {
                      const pct = Math.round((dept.appointments / maxDeptAppts) * 100);
                      return (
                        <div key={dept.departmentId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">
                              {dept.departmentName} ({dept.doctorsCount} doctors)
                            </span>
                            <span className="font-mono text-slate-600 tabular-nums">
                              {dept.appointments} {dept.appointments === 1 ? 'visit' : 'visits'} ·{' '}
                              {formatCurrency(dept.revenue, currency, 0)}
                            </span>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-700 rounded-full"
                              style={{ width: `${Math.max(6, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">Daily Visit Volume</h2>
                    <Activity className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  </div>

                  {/* Clean SVG Bar Chart */}
                  <div className="pt-2">
                    <svg
                      viewBox="0 0 320 140"
                      className="w-full h-36"
                      role="img"
                      aria-label="Daily appointment volume bar chart"
                    >
                      {analytics.dailyVolume.map((day, idx) => {
                        const count = Math.max(1, analytics.dailyVolume.length);
                        const slotWidth = 300 / count;
                        const barWidth = Math.min(44, Math.max(20, slotWidth * 0.62));
                        const x = 10 + idx * slotWidth + (slotWidth - barWidth) / 2;
                        const barH = Math.max(10, Math.round((day.appointments / maxDailyAppts) * 88));
                        const y = 105 - barH;
                        return (
                          <g key={day.date}>
                            <rect x={x} y={y} width={barWidth} height={barH} rx={4} fill="#0f766e" />
                            <text
                              x={x + barWidth / 2}
                              y={y - 5}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#0f172a"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {day.appointments}
                            </text>
                            <text
                              x={x + barWidth / 2}
                              y={124}
                              textAnchor="middle"
                              fontSize="9"
                              fill="#64748b"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {day.date.slice(5)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-semibold text-slate-800">Payment Channel Mix</p>
                    {analytics.byPaymentMethod.map((pm) => (
                      <div key={pm.method} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{pm.method}</span>
                        <span className="font-mono text-slate-900 tabular-nums">
                          {pm.count} tx · {formatCurrency(pm.revenue, currency, 2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'ambulance' ? (
            <div className="space-y-6">
              {/* Fleet Availability Strip */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ambulanceUnits.map((unit) => (
                  <div
                    key={unit.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono font-semibold text-slate-600">{unit.vehicleNumber}</p>
                        <h2 className="text-base font-bold text-slate-900 mt-0.5">{unit.unitName}</h2>
                        <p className="text-xs text-teal-800 font-medium">{unit.unitType}</p>
                      </div>
                      <select
                        aria-label={`Unit status for ${unit.vehicleNumber}`}
                        value={unit.status}
                        onChange={(e) =>
                          handleUpdateUnitStatus(unit.id, e.target.value as AmbulanceUnitStatus)
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-900"
                      >
                        <option value="Available">Available</option>
                        <option value="Dispatched">Dispatched</option>
                        <option value="Maintenance">Maintenance</option>
                      </select>
                    </div>
                    <div className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                      <span>
                        Crew: {unit.driverName} &amp; {unit.paramedicName}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(unit.baseFeeInr, currency)} +{' '}
                        {formatCurrency(unit.perKmFeeInr, currency)}/km
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active & Historical Dispatch Queue */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Emergency Dispatch Queue</h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {ambulanceDispatches.length} total requests
                  </span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Patient &amp; Pickup</th>
                      <th className="py-3 px-4">Assigned Unit</th>
                      <th className="py-3 px-4">Priority &amp; ETA</th>
                      <th className="py-3 px-4 text-right">Fare ({currency})</th>
                      <th className="py-3 px-4">Dispatch Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {ambulanceDispatches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                          No ambulance dispatches recorded yet.
                        </td>
                      </tr>
                    ) : (
                      ambulanceDispatches.map((disp) => (
                        <tr key={disp.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {disp.dispatchCode}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{disp.patientName}</p>
                            <p className="text-slate-600 max-w-xs">{disp.pickupAddress}</p>
                            <p className="text-slate-500">{disp.clinicalCondition}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-mono font-semibold text-slate-900">{disp.vehicleNumber}</p>
                            <p className="text-slate-500">{disp.driverName}</p>
                          </td>
                          <td className="py-3 px-4 tabular-nums">
                            <p className="font-medium text-slate-800">{disp.priority}</p>
                            <p className="text-slate-500">
                              ETA {disp.estimatedEtaMinutes} mins · {disp.distanceKm} km
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatCurrency(disp.estimatedFareInr, currency)}
                          </td>
                          <td className="py-3 px-4">
                            <select
                              aria-label={`Dispatch status for ${disp.dispatchCode}`}
                              value={disp.status}
                              onChange={(e) =>
                                handleUpdateDispatchStatus(
                                  disp.id,
                                  e.target.value as AmbulanceDispatchStatus
                                )
                              }
                              className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-md bg-white text-slate-900"
                            >
                              <option value="Dispatched">Dispatched</option>
                              <option value="En Route">En Route</option>
                              <option value="Arrived at Pickup">Arrived at Pickup</option>
                              <option value="In Transit to Hospital">In Transit to Hospital</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'database' && databaseSnapshot ? (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-slate-900">
                    MediStream Database Collections
                  </h2>
                  <p className="text-xs text-slate-600">
                    Cloud Firestore DB:{' '}
                    <span className="font-mono text-slate-900">
                      {databaseSnapshot.storageMeta.firestoreDatabaseId}
                    </span>{' '}
                    · Project:{' '}
                    <span className="font-mono text-slate-900">
                      {databaseSnapshot.storageMeta.firestoreProjectId}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCollectionJson}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Export {collectionLabels[selectedCollection]} JSON
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {(Object.keys(collectionLabels) as DbCollectionKey[]).map((key) => {
                  const count = databaseSnapshot.collections[key].length;
                  const active = selectedCollection === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedCollection(key);
                        setInspectedRecordJson(null);
                      }}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        active
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-teal-600'
                      }`}
                    >
                      {collectionLabels[key]} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <label htmlFor="db-search" className="sr-only">
                  Filter stored records
                </label>
                <div className="relative">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="db-search"
                    type="text"
                    value={dbSearch}
                    onChange={(e) => setDbSearch(e.target.value)}
                    placeholder={`Search ${collectionLabels[selectedCollection].toLowerCase()} by ID, name, email, code, or status...`}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>

              {(() => {
                const rawRows = databaseSnapshot.collections[
                  selectedCollection
                ] as unknown as Array<Record<string, unknown>>;
                const q = dbSearch.trim().toLowerCase();
                const filteredRows = rawRows.filter((row) =>
                  !q ? true : JSON.stringify(row).toLowerCase().includes(q)
                );

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div
                      className={`${
                        inspectedRecordJson ? 'lg:col-span-8' : 'lg:col-span-12'
                      } bg-white border border-slate-200 rounded-xl overflow-x-auto`}
                    >
                      {filteredRows.length === 0 ? (
                        <div className="p-8 text-sm text-slate-500 text-center">
                          No stored records match your filter in {collectionLabels[selectedCollection]}.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                              <th className="py-3 px-3">Record ID</th>
                              <th className="py-3 px-3">Primary Label</th>
                              <th className="py-3 px-3">Details</th>
                              <th className="py-3 px-3">Status / Value</th>
                              <th className="py-3 px-3 text-right">Inspect</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {filteredRows.map((row, idx) => {
                              const idStr = String(row.id || `row-${idx}`);
                              const primary = String(
                                row.patientName ||
                                  row.fullName ||
                                  row.unitName ||
                                  row.name ||
                                  row.recipientName ||
                                  row.email ||
                                  idStr
                              );
                              const details = String(
                                row.bookingCode ||
                                  row.dispatchCode ||
                                  row.vehicleNumber ||
                                  row.mrn ||
                                  row.invoiceId ||
                                  row.email ||
                                  row.specialty ||
                                  row.floor ||
                                  '-'
                              );
                              const statusOrVal =
                                selectedCollection === 'users'
                                  ? row.lastLoginAt
                                    ? `${String(row.role)} · Login ${String(row.lastLoginAt).slice(0, 16).replace('T', ' ')}`
                                    : `${String(row.role)} · Active`
                                  : typeof row.estimatedFareInr === 'number'
                                  ? `${String(row.status || '')} · ${formatCurrency(row.estimatedFareInr, currency, 0)}`
                                  : typeof row.baseFeeInr === 'number'
                                  ? `${String(row.status || '')} · ${formatCurrency(row.baseFeeInr, currency, 0)}`
                                  : typeof row.totalAmount === 'number'
                                  ? formatCurrency(row.totalAmount, currency, 2)
                                  : typeof row.amountPaid === 'number'
                                  ? `${String(row.status || '')} · ${formatCurrency(row.amountPaid, currency, 2)}`
                                  : typeof row.consultationFee === 'number'
                                  ? formatCurrency(row.consultationFee, currency, 0)
                                  : String(row.status || row.role || row.encryptionCipher || 'Stored');

                              return (
                                <tr key={idStr} className="hover:bg-slate-50/70">
                                  <td className="py-3 px-3 font-mono text-slate-700 break-all">
                                    {idStr}
                                  </td>
                                  <td className="py-3 px-3 font-medium text-slate-900">{primary}</td>
                                  <td className="py-3 px-3 font-mono text-slate-600 break-all">{details}</td>
                                  <td className="py-3 px-3 font-mono text-slate-800">
                                    {statusOrVal}
                                  </td>
                                  <td className="py-3 px-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setInspectedRecordJson(JSON.stringify(row, null, 2))}
                                      className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
                                    >
                                      View JSON
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {inspectedRecordJson && (
                      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-slate-900">
                            Stored Document Fields
                          </h3>
                          <button
                            type="button"
                            onClick={() => setInspectedRecordJson(null)}
                            className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                        <pre className="text-xs font-mono bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto max-h-96 leading-relaxed">
                          {inspectedRecordJson}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-6">
              {/* Create Staff / User Profile Form */}
              <form
                onSubmit={handleCreateUser}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <h2 className="text-sm font-semibold text-slate-900">Add Staff / Physician Profile</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Dr. Ramesh Iyer"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="ramesh@medistream.org"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="staff">Staff</option>
                      <option value="doctor">Doctor</option>
                      <option value="patient">Patient</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {newRole === 'doctor' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Linked Specialist</label>
                      <select
                        value={newDoctorId}
                        onChange={(e) => setNewDoctorId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      >
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <button
                      type="submit"
                      className="w-full py-2 px-3 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                    >
                      Add Profile
                    </button>
                  </div>
                </div>
              </form>

              {/* Roles Directory Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Assigned Role</th>
                      <th className="py-3 px-4">Account Status</th>
                      <th className="py-3 px-4">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{u.name}</p>
                          <p className="text-xs font-mono text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as UserRole })}
                            className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white"
                          >
                            <option value="patient">patient</option>
                            <option value="staff">staff</option>
                            <option value="doctor">doctor</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleUpdateUser(u.id, { active: !u.active })}
                            className={`text-xs font-semibold cursor-pointer ${
                              u.active ? 'text-teal-800' : 'text-rose-700'
                            }`}
                          >
                            {u.active ? 'Active' : 'Suspended'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500 tabular-nums">
                          {u.createdAt ? u.createdAt.slice(0, 10) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'doctors' ? (
            <div className="space-y-6">
              <form
                onSubmit={handleCreateDoctor}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Add Attending Specialist &amp; Doctor Portal Account
                  </h2>
                  <span className="text-xs text-slate-500">
                    Automatically provisions a <span className="font-mono">@medistream.org</span> Doctor Portal login
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Physician Name *</label>
                    <input
                      type="text"
                      required
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="Dr. Kavitha Raman"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Department *</label>
                    <select
                      value={docDeptId}
                      onChange={(e) => setDocDeptId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Specialty *</label>
                    <input
                      type="text"
                      required
                      value={docSpecialty}
                      onChange={(e) => setDocSpecialty(e.target.value)}
                      placeholder="Clinical Electrophysiology"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Qualifications</label>
                    <input
                      type="text"
                      value={docQualifications}
                      onChange={(e) => setDocQualifications(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Fee ({currency})</label>
                      <input
                        type="number"
                        value={docFee}
                        onChange={(e) => setDocFee(e.target.value)}
                        className="w-full px-2.5 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Suite</label>
                      <input
                        type="text"
                        value={docRoom}
                        onChange={(e) => setDocRoom(e.target.value)}
                        className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="py-2 px-3 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    Add Specialist
                  </button>
                </div>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Physician</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Suite</th>
                      <th className="py-3 px-4">Fee ({currency})</th>
                      <th className="py-3 px-4">Scheduling Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {doctors.map((doc) => (
                      <tr key={doc.id}>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{doc.name}</p>
                          <p className="text-xs text-slate-500">{doc.specialty}</p>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{doc.departmentName}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600">{doc.roomNumber}</td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            aria-label={`Consultation fee for ${doc.name}`}
                            defaultValue={doc.consultationFee}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (val !== doc.consultationFee) handleUpdateDoctorFee(doc, val);
                            }}
                            className="w-24 px-2 py-1 text-xs font-mono border border-slate-200 rounded-md tabular-nums"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleDoctorAccepting(doc)}
                            className={`text-xs font-semibold cursor-pointer ${
                              doc.acceptingNewPatients ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {doc.acceptingNewPatients ? 'Accepting Bookings' : 'Paused'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'config' && config ? (
            <form onSubmit={handleSaveConfig} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">HIPAA Security &amp; Hospital Configuration</h2>
                  <p className="text-xs text-slate-500">
                    Cipher: <span className="font-mono">{config.hipaaEncryptionAlgorithm}</span> · Key Fingerprint:{' '}
                    <span className="font-mono">{config.encryptionKeyFingerprint}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="cfg-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Hospital Display Name
                  </label>
                  <input
                    id="cfg-name"
                    type="text"
                    value={config.hospitalName}
                    onChange={(e) => setConfig({ ...config, hospitalName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-timeout" className="block text-xs font-medium text-slate-700 mb-1.5">
                    HIPAA Session Inactivity Timeout (minutes)
                  </label>
                  <input
                    id="cfg-timeout"
                    type="number"
                    min={5}
                    max={240}
                    value={config.sessionTimeoutMinutes}
                    onChange={(e) => setConfig({ ...config, sessionTimeoutMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-lead" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Automated Email Reminder Lead Window (hours before visit)
                  </label>
                  <input
                    id="cfg-lead"
                    type="number"
                    min={1}
                    max={168}
                    value={config.reminderLeadHours}
                    onChange={(e) => setConfig({ ...config, reminderLeadHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-smtp" className="block text-xs font-medium text-slate-700 mb-1.5">
                    SMTP Relay Host
                  </label>
                  <input
                    id="cfg-smtp"
                    type="text"
                    value={config.smtpHost}
                    onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="cfg-sender" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Reminder Sender Email
                  </label>
                  <input
                    id="cfg-sender"
                    type="email"
                    value={config.smtpSenderEmail}
                    onChange={(e) => setConfig({ ...config, smtpSenderEmail: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cfg-cov" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Insurance Coverage (%)
                    </label>
                    <input
                      id="cfg-cov"
                      type="number"
                      min={0}
                      max={90}
                      value={config.defaultInsuranceCoveragePct}
                      onChange={(e) =>
                        setConfig({ ...config, defaultInsuranceCoveragePct: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="cfg-fee" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Platform Fee ({currency})
                    </label>
                    <input
                      id="cfg-fee"
                      type="number"
                      min={0}
                      value={config.platformProcessingFee}
                      onChange={(e) => setConfig({ ...config, platformProcessingFee: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoReminderEnabled}
                    onChange={(e) => setConfig({ ...config, autoReminderEnabled: e.target.checked })}
                  />
                  Enable Automated Visit Email Reminder Scheduler
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Last updated by {config.updatedBy} · {config.updatedAt.slice(0, 16).replace('T', ' ')}
                </span>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  Save System Configuration
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Automated Email Reminder Outbox</h2>
                  <p className="text-xs text-slate-500">
                    {reminders.filter((r) => r.status === 'Queued').length} queued ·{' '}
                    {reminders.filter((r) => r.status === 'Sent').length} sent
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDispatchReminders}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Run Reminder Dispatch Now
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor &amp; Portal</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Outcome</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                          {log.timestamp.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-slate-900">{log.actorEmail}</span>
                          <span className="text-slate-500"> · {log.actorRole} ({log.portal})</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-800">{log.action}</td>
                        <td className="py-3 px-4 font-semibold">
                          <span className={log.outcome === 'ALLOWED' ? 'text-emerald-700' : 'text-rose-700'}>
                            {log.outcome}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
