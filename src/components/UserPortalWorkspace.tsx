import React, { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  Ambulance,
  ArrowLeft,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CreditCard,
  FileLock2,
  FileText,
  LogOut,
  Mail,
  Pill,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  Unlock,
  UserPlus,
  Video,
} from 'lucide-react';
import { api } from '../api';
import {
  syncAmbulanceDispatchToFirestore,
  syncAppointmentCancelToFirestore,
  syncBookingToFirestore,
  syncPatientRecordsToFirestore,
  syncPaymentToFirestore,
} from '../lib/firestoreSync';
import { formatCurrency, hasPermission } from '../lib/hospitalRules';
import type {
  AmbulanceDispatch,
  Appointment,
  AppointmentStatus,
  ClinicalEncounter,
  Department,
  DigitalPrescription,
  Doctor,
  EmailReminder,
  LabOrder,
  PatientRecordView,
  PaymentMethod,
  PaymentTransaction,
  SpecialistReferral,
  UserAccountView,
} from '../types';
import { AmbulanceDispatchView } from './AmbulanceDispatchView';
import { BookingWizard } from './BookingWizard';

type UserTab =
  | 'appointments'
  | 'clinical'
  | 'book'
  | 'ambulance'
  | 'patients'
  | 'payments'
  | 'reminders'
  | 'doctors';

interface UserPortalWorkspaceProps {
  currentUser: UserAccountView;
  firebaseUser: FirebaseUser | null;
  departments: Department[];
  doctors: Doctor[];
  currencySymbol: string;
  insuranceCoveragePct: number;
  platformFee: number;
  onRefreshPublic: () => void;
  onNavigate: (route: 'overview' | 'admin-portal') => void;
  onSignOut: () => void;
}

export const UserPortalWorkspace: React.FC<UserPortalWorkspaceProps> = ({
  currentUser,
  firebaseUser,
  departments,
  doctors,
  currencySymbol,
  insuranceCoveragePct,
  platformFee,
  onRefreshPublic,
  onNavigate,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<UserTab>('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<PatientRecordView[]>([]);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [reminders, setReminders] = useState<EmailReminder[]>([]);
  const [ambulanceDispatches, setAmbulanceDispatches] = useState<AmbulanceDispatch[]>([]);
  const [encounters, setEncounters] = useState<ClinicalEncounter[]>([]);
  const [prescriptions, setPrescriptions] = useState<DigitalPrescription[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [referrals, setReferrals] = useState<SpecialistReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [apptFilter, setApptFilter] = useState<'all' | AppointmentStatus>('all');
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);

  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientRecordView | null>(null);

  // Clinical note editing
  const [editAllergies, setEditAllergies] = useState('');
  const [editHistory, setEditHistory] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRx, setEditRx] = useState('');
  const [savingClinical, setSavingClinical] = useState(false);

  // New Patient Intake modal/form
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [npName, setNpName] = useState('');
  const [npEmail, setNpEmail] = useState('');
  const [npPhone, setNpPhone] = useState('');
  const [npDob, setNpDob] = useState('1990-01-01');
  const [npGender, setNpGender] = useState<'Female' | 'Male' | 'Other'>('Female');
  const [npAllergies, setNpAllergies] = useState('');
  const [npDoctorId, setNpDoctorId] = useState(doctors[0]?.id || '');

  // Quick booking prefill from doctors tab
  const [preselectedDoctor, setPreselectedDoctor] = useState<Doctor | null>(null);

  const canManageAppts = hasPermission(currentUser.role, 'manage_appointments');
  const canEditClinical = hasPermission(currentUser.role, 'edit_clinical_notes');
  const canTriggerReminders = hasPermission(currentUser.role, 'trigger_reminders');
  const canProcessPayments = hasPermission(currentUser.role, 'process_payment');

  const loadWorkspaceData = async () => {
    setLoading(true);
    try {
      const [apptsRes, ptsRes, payRes, remRes, ambRes, encRes, rxRes, labRes, refRes] =
        await Promise.all([
          api.getAppointments(),
          api.getPatients(),
          api.getPayments(),
          api.getReminders(),
          api.getAmbulanceDispatches(),
          api.getEncounters(),
          api.getPrescriptions(),
          api.getLabOrders(),
          api.getReferrals(),
        ]);
      setAppointments(apptsRes.appointments);
      setPatients(ptsRes.patients);
      setPayments(payRes.payments);
      setReminders(remRes.reminders);
      setAmbulanceDispatches(ambRes.dispatches);
      setEncounters(encRes.encounters);
      setPrescriptions(rxRes.prescriptions);
      setLabOrders(labRes.labOrders);
      setReferrals(refRes.referrals);
      if (ptsRes.patients.length > 0 && !selectedPatient) {
        setSelectedPatient(ptsRes.patients[0]);
      }
      if (firebaseUser && ptsRes.patients.length > 0) {
        void syncPatientRecordsToFirestore(firebaseUser, ptsRes.patients).catch(() => {});
      }
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to load clinical data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, [currentUser.id]);

  const handleStatusChange = async (apptId: string, status: AppointmentStatus) => {
    setBannerMsg(null);
    try {
      const res = await api.updateAppointmentStatus(apptId, status);
      setAppointments((prev) => prev.map((a) => (a.id === apptId ? res.appointment : a)));
      if (firebaseUser && status === 'Cancelled') {
        void syncAppointmentCancelToFirestore(firebaseUser, apptId).catch(() => {});
      }
      setBannerMsg({ type: 'ok', text: `Appointment ${res.appointment.bookingCode} updated to ${status}.` });
      onRefreshPublic();
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const handleOpenReschedule = async (appt: Appointment) => {
    setRescheduleTarget(appt);
    setRescheduleDate(appt.date);
    setRescheduleSlot('');
    setLoadingRescheduleSlots(true);
    try {
      const res = await api.getDoctorSlots(appt.doctorId, appt.date);
      setRescheduleSlots(res.availableSlots);
      setRescheduleSlot(res.availableSlots[0] || '');
    } catch {
      setRescheduleSlots([]);
    } finally {
      setLoadingRescheduleSlots(false);
    }
  };

  const handleRescheduleDateChange = async (newDate: string) => {
    setRescheduleDate(newDate);
    if (!rescheduleTarget || !newDate) return;
    setLoadingRescheduleSlots(true);
    try {
      const res = await api.getDoctorSlots(rescheduleTarget.doctorId, newDate);
      setRescheduleSlots(res.availableSlots);
      setRescheduleSlot(res.availableSlots[0] || '');
    } catch {
      setRescheduleSlots([]);
    } finally {
      setLoadingRescheduleSlots(false);
    }
  };

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !rescheduleDate || !rescheduleSlot) return;
    setBannerMsg(null);
    try {
      const res = await api.rescheduleAppointment(
        rescheduleTarget.id,
        rescheduleDate,
        rescheduleSlot
      );
      setAppointments((prev) =>
        prev.map((a) => (a.id === res.appointment.id ? res.appointment : a))
      );
      setRescheduleTarget(null);
      setBannerMsg({
        type: 'ok',
        text: `Appointment ${res.appointment.bookingCode} rescheduled to ${res.appointment.date} at ${res.appointment.timeSlot}.`,
      });
      onRefreshPublic();
    } catch (err) {
      setBannerMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Reschedule failed.',
      });
    }
  };

  const handleDecryptChart = async (patientId: string) => {
    setBannerMsg(null);
    try {
      const res = await api.decryptPatient(patientId);
      setSelectedPatient(res.patient);
      setPatients((prev) => prev.map((p) => (p.id === patientId ? res.patient : p)));
      if (res.patient.decrypted) {
        setEditAllergies(res.patient.decrypted.allergies);
        setEditHistory(res.patient.decrypted.medicalHistory);
        setEditNotes(res.patient.decrypted.clinicalNotes);
        setEditRx(res.patient.decrypted.prescriptions);
      }
      setBannerMsg({
        type: 'ok',
        text: `HIPAA Audit Logged: Decrypted AES-256-GCM chart for ${res.patient.mrn}.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Decryption denied.' });
    }
  };

  const handleSaveClinicalNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSavingClinical(true);
    setBannerMsg(null);
    try {
      const res = await api.updateClinicalNotes(selectedPatient.id, {
        allergies: editAllergies,
        medicalHistory: editHistory,
        clinicalNotes: editNotes,
        prescriptions: editRx,
      });
      setSelectedPatient(res.patient);
      setPatients((prev) => prev.map((p) => (p.id === res.patient.id ? res.patient : p)));
      setBannerMsg({
        type: 'ok',
        text: `Clinical notes & prescriptions re-encrypted (AES-256-GCM) for ${res.patient.mrn}.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save chart.' });
    } finally {
      setSavingClinical(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    try {
      const res = await api.createPatient({
        fullName: npName,
        email: npEmail,
        phone: npPhone,
        dateOfBirth: npDob,
        gender: npGender,
        allergies: npAllergies,
        assignedDoctorId: npDoctorId,
      });
      setPatients((prev) => [res.patient, ...prev]);
      setSelectedPatient(res.patient);
      setShowNewPatient(false);
      setNpName('');
      setNpEmail('');
      setNpPhone('');
      setNpAllergies('');
      setBannerMsg({ type: 'ok', text: `Created encrypted patient record ${res.patient.mrn}.` });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not create patient.' });
    }
  };

  const handleSettleInvoice = async (apptId: string, method: PaymentMethod) => {
    setBannerMsg(null);
    try {
      const res = await api.settlePayment(apptId, method, `${method} Settled`);
      setAppointments((prev) => prev.map((a) => (a.id === apptId ? res.appointment : a)));
      setPayments((prev) => [res.transaction, ...prev]);
      if (firebaseUser) {
        void syncPaymentToFirestore(firebaseUser, res.transaction).catch(() => {});
      }
      setBannerMsg({
        type: 'ok',
        text: `Payment settled (${res.transaction.invoiceId}) for ${res.appointment.bookingCode}.`,
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Payment settlement failed.' });
    }
  };

  const handleDispatchReminders = async (appointmentId?: string) => {
    setBannerMsg(null);
    try {
      const res = await api.dispatchReminders(appointmentId);
      setReminders(res.reminders);
      await loadWorkspaceData();
      setBannerMsg({
        type: 'ok',
        text:
          res.dispatchedCount > 0
            ? `Dispatched ${res.dispatchedCount} HIPAA-compliant appointment reminder email(s).`
            : 'All upcoming reminders within the configured lead window are already sent.',
      });
    } catch (err) {
      setBannerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to send reminders.' });
    }
  };

  const filteredAppointments = appointments.filter(
    (a) => apptFilter === 'all' || a.status === apptFilter
  );

  const filteredPatients = patients.filter((p) => {
    const q = patientSearch.trim().toLowerCase();
    return (
      !q ||
      p.fullName.toLowerCase().includes(q) ||
      p.mrn.toLowerCase().includes(q) ||
      p.primaryDepartment.toLowerCase().includes(q)
    );
  });

  const navItems: Array<{ id: UserTab; label: string; icon: React.ReactNode }> = [
    { id: 'appointments', label: 'Appointments', icon: <Calendar className="w-4 h-4" aria-hidden="true" /> },
    { id: 'clinical', label: 'Prescriptions & Labs', icon: <Pill className="w-4 h-4" aria-hidden="true" /> },
    { id: 'book', label: 'Book Appointment', icon: <CalendarPlus className="w-4 h-4" aria-hidden="true" /> },
    { id: 'ambulance', label: 'Ambulance', icon: <Ambulance className="w-4 h-4" aria-hidden="true" /> },
    { id: 'patients', label: 'Patient Records', icon: <FileLock2 className="w-4 h-4" aria-hidden="true" /> },
    { id: 'payments', label: 'Payments & Billing', icon: <CreditCard className="w-4 h-4" aria-hidden="true" /> },
    { id: 'reminders', label: 'Email Reminders', icon: <Mail className="w-4 h-4" aria-hidden="true" /> },
    { id: 'doctors', label: 'Specialists', icon: <Stethoscope className="w-4 h-4" aria-hidden="true" /> },
  ];

  const tabTitles: Record<UserTab, string> = {
    appointments: 'Appointments & Schedule',
    clinical: 'E-Prescriptions, Lab Results & Visit Summaries',
    book: 'New Appointment Booking',
    ambulance: 'Emergency Ambulance Dispatch',
    patients: 'Encrypted Patient Records (HIPAA)',
    payments: 'Billing & Payment Settlement',
    reminders: 'Automated Email Reminders',
    doctors: 'Attending South Indian Specialists',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between shrink-0">
        <div>
          <div className="px-6 h-16 border-b border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="text-lg font-bold tracking-tight text-slate-900 cursor-pointer"
            >
              MediStream
            </button>
            <span className="text-xs font-medium text-teal-800">Clinical</span>
          </div>

          <nav aria-label="User Portal Navigation" className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-50 text-teal-900'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-slate-200 space-y-2.5">
          <div className="text-xs">
            <p className="font-semibold text-slate-900 truncate">{currentUser.name}</p>
            <p className="font-mono text-slate-500 truncate">{currentUser.email}</p>
            <p className="text-teal-700 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              AES-256-GCM Encrypted
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign Out
          </button>
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
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
            <p className="text-xs text-slate-500">User Portal / {tabTitles[activeTab]}</p>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{tabTitles[activeTab]}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('book')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap cursor-pointer"
            >
              Book Visit
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
          {bannerMsg && (
            <div
              role="status"
              className={`text-xs px-4 py-3 rounded-lg border flex items-center justify-between ${
                bannerMsg.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{bannerMsg.text}</span>
              <button
                type="button"
                onClick={() => setBannerMsg(null)}
                className="text-xs underline ml-4 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
              Loading encrypted workspace records...
            </div>
          ) : activeTab === 'appointments' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['all', 'Confirmed', 'Checked-In', 'Completed', 'Cancelled'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setApptFilter(status)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        apptFilter === status
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {status === 'all' ? `All (${appointments.length})` : status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Booking</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Doctor &amp; Dept</th>
                      <th className="py-3 px-4">Schedule</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredAppointments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-500 text-xs">
                          No appointments found for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredAppointments.map((appt) => (
                        <tr key={appt.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {appt.bookingCode}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{appt.patientName}</p>
                            <p className="text-xs text-slate-500">{appt.visitType}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{appt.doctorName}</p>
                            <p className="text-xs text-slate-500">{appt.departmentName}</p>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                            {appt.date} · {appt.timeSlot}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                            <span
                              className={
                                appt.status === 'Confirmed'
                                  ? 'text-teal-800'
                                  : appt.status === 'Checked-In'
                                  ? 'text-amber-700'
                                  : appt.status === 'Completed'
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
                              }
                            >
                              {appt.status}
                            </span>
                            <span className="text-slate-400"> · </span>
                            <span className="text-slate-500">Reminder: {appt.reminderStatus}</span>
                          </td>
                          <td className="py-3 px-4 text-xs font-mono tabular-nums whitespace-nowrap">
                            <span className={appt.paymentStatus === 'Paid' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                              {appt.paymentStatus}
                            </span>
                            {appt.amountPaid > 0 && (
                              <span className="text-slate-600"> · {formatCurrency(appt.amountPaid, currencySymbol)}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                            {canManageAppts && appt.status === 'Confirmed' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(appt.id, 'Checked-In')}
                                className="text-xs font-medium text-teal-800 hover:underline cursor-pointer"
                              >
                                Check In
                              </button>
                            )}
                            {canManageAppts && appt.status === 'Checked-In' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(appt.id, 'Completed')}
                                className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                              >
                                Complete
                              </button>
                            )}
                            {canProcessPayments && appt.paymentStatus === 'Pending' && appt.status !== 'Cancelled' && (
                              <button
                                type="button"
                                onClick={() => handleSettleInvoice(appt.id, 'Card')}
                                className="text-xs font-semibold text-teal-800 hover:underline cursor-pointer"
                              >
                                Pay Now
                              </button>
                            )}
                            {appt.status !== 'Cancelled' && appt.status !== 'Completed' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenReschedule(appt)}
                                  className="text-xs font-medium text-teal-800 hover:underline cursor-pointer"
                                >
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(appt.id, 'Cancelled')}
                                  className="text-xs font-medium text-rose-700 hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {rescheduleTarget && (
                <form
                  onSubmit={handleConfirmReschedule}
                  className="bg-white border border-teal-200 rounded-xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-mono text-teal-800">
                        RESCHEDULE VISIT · {rescheduleTarget.bookingCode}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {rescheduleTarget.doctorName} ({rescheduleTarget.departmentName})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRescheduleTarget(null)}
                      className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                      <label htmlFor="resched-date" className="block text-xs font-medium text-slate-700 mb-1">
                        New Visit Date
                      </label>
                      <input
                        id="resched-date"
                        type="date"
                        required
                        value={rescheduleDate}
                        onChange={(e) => handleRescheduleDateChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="resched-slot" className="block text-xs font-medium text-slate-700 mb-1">
                        Available Slot
                      </label>
                      <select
                        id="resched-slot"
                        required
                        value={rescheduleSlot}
                        onChange={(e) => setRescheduleSlot(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      >
                        {loadingRescheduleSlots ? (
                          <option value="">Checking slots...</option>
                        ) : rescheduleSlots.length === 0 ? (
                          <option value="">No slots on this date</option>
                        ) : (
                          rescheduleSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={!rescheduleSlot}
                      className="py-2.5 px-4 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      Confirm New Time
                    </button>
                  </div>
                </form>
              )}

              {appointments.some(
                (a) =>
                  a.visitType === 'Telehealth Video' &&
                  (a.status === 'Confirmed' || a.status === 'Checked-In')
              ) && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-teal-800">
                    <Video className="w-4 h-4" aria-hidden="true" />
                    <span>Upcoming Telehealth Video Consultation Rooms</span>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs">
                    {appointments
                      .filter(
                        (a) =>
                          a.visitType === 'Telehealth Video' &&
                          (a.status === 'Confirmed' || a.status === 'Checked-In')
                      )
                      .map((a) => (
                        <div key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-slate-800 font-medium">
                            {a.doctorName} · {a.date} {a.timeSlot}
                          </span>
                          <span className="font-mono text-teal-800">
                            Room ID: ms-tele-{a.bookingCode.toLowerCase()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'clinical' ? (
            <div className="space-y-6">
              {/* Digital E-Prescriptions */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-teal-700" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-slate-900">Your Digital E-Prescriptions</h2>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">{prescriptions.length} on file</span>
                </div>
                {prescriptions.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No digital e-prescriptions issued yet.</p>
                ) : (
                  prescriptions.map((rx) => (
                    <div key={rx.id} className="p-5 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-slate-900">{rx.rxCode}</span>
                          <span className="text-slate-400"> · </span>
                          <span className="font-semibold text-slate-900">{rx.diagnosis}</span>
                        </div>
                        <span className="font-semibold text-teal-800">
                          {rx.status} · {rx.doctorName} ({rx.issuedAt.slice(0, 10)})
                        </span>
                      </div>
                      <ul className="space-y-1 font-mono text-slate-700">
                        {rx.items.map((item, idx) => (
                          <li key={idx}>
                            {item.medication} {item.dosage} · {item.frequency} · {item.duration} ({item.instructions})
                          </li>
                        ))}
                      </ul>
                      {rx.notes && <p className="text-slate-600">Instructions: {rx.notes}</p>}
                    </div>
                  ))
                )}
              </div>

              {/* Lab Orders & Results */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-slate-900">Diagnostic &amp; Lab Results</h2>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">{labOrders.length} tests</span>
                </div>
                {labOrders.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No laboratory or imaging orders found.</p>
                ) : (
                  labOrders.map((lab) => (
                    <div key={lab.id} className="p-5 space-y-1.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          <span className="font-mono">{lab.orderCode}</span> · {lab.testName} ({lab.category})
                        </span>
                        <span className="font-semibold text-teal-800">{lab.status}</span>
                      </div>
                      <p className="text-slate-600">
                        Ordered by {lab.doctorName} · Indication: {lab.clinicalIndication}
                      </p>
                      {lab.resultSummary && (
                        <p className="font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mt-1">
                          Result ({lab.resultFlag || 'Normal'}): {lab.resultSummary}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* SOAP Consultation Summaries */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Physician Consultation Summaries (SOAP)</h2>
                  <span className="text-xs text-slate-500 tabular-nums">{encounters.length} visits</span>
                </div>
                {encounters.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No completed consultation summaries recorded yet.</p>
                ) : (
                  encounters.map((enc) => (
                    <div key={enc.id} className="p-5 space-y-1.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-slate-900">
                          {enc.encounterCode} · {enc.visitDate} · {enc.visitType}
                        </span>
                        <span className="text-slate-600">
                          {enc.doctorName} ({enc.departmentName})
                        </span>
                      </div>
                      <p className="font-semibold text-teal-800">{enc.assessment}</p>
                      <p className="text-slate-700">Plan: {enc.plan}</p>
                      {enc.vitals && (
                        <p className="font-mono text-slate-500 tabular-nums">
                          Vitals: BP {enc.vitals.bloodPressureSystolic || '--'}/{enc.vitals.bloodPressureDiastolic || '--'} mmHg · HR{' '}
                          {enc.vitals.heartRateBpm || '--'} bpm · SpO2 {enc.vitals.spo2Pct || '--'}%
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Specialist Referrals */}
              {referrals.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  <div className="px-5 py-4 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Specialist Referrals</h2>
                    <span className="text-xs text-slate-500 tabular-nums">{referrals.length} active</span>
                  </div>
                  {referrals.map((ref) => (
                    <div key={ref.id} className="p-5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">
                          <span className="font-mono">{ref.referralCode}</span> · {ref.fromDoctorName} → {ref.toDoctorName} ({ref.toDepartmentName})
                        </p>
                        <p className="text-slate-600">{ref.reason}</p>
                      </div>
                      <span className="font-semibold text-teal-800">{ref.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'book' ? (
            <div className="bg-white border border-slate-200 rounded-xl p-2">
              <BookingWizard
                departments={departments}
                doctors={doctors}
                currencySymbol={currencySymbol}
                insuranceCoveragePct={insuranceCoveragePct}
                platformFee={platformFee}
                preselectedDoctor={preselectedDoctor}
                defaultPatientName={currentUser.name}
                defaultPatientEmail={currentUser.email}
                onBookingComplete={(created) => {
                  if (firebaseUser && created) {
                    void syncBookingToFirestore(
                      firebaseUser,
                      created.appointment,
                      created.transaction,
                      created.reminder
                    ).catch(() => {});
                  }
                  loadWorkspaceData();
                  onRefreshPublic();
                }}
              />
            </div>
          ) : activeTab === 'ambulance' ? (
            <div className="space-y-6">
              <AmbulanceDispatchView
                compact
                currencySymbol={currencySymbol}
                defaultPatientName={currentUser.name}
                defaultPatientEmail={currentUser.email}
                onDispatchComplete={(dispatch) => {
                  if (firebaseUser) {
                    void syncAmbulanceDispatchToFirestore(firebaseUser, dispatch).catch(() => {});
                  }
                  setAmbulanceDispatches((prev) => [dispatch, ...prev]);
                  setBannerMsg({
                    type: 'ok',
                    text: `Ambulance ${dispatch.vehicleNumber} dispatched (${dispatch.dispatchCode}). ETA ${dispatch.estimatedEtaMinutes} mins.`,
                  });
                }}
              />

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Your Ambulance Dispatch History</h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {ambulanceDispatches.length} {ambulanceDispatches.length === 1 ? 'dispatch' : 'dispatches'}
                  </span>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Vehicle &amp; Crew</th>
                      <th className="py-3 px-4">Pickup Address</th>
                      <th className="py-3 px-4">Priority &amp; ETA</th>
                      <th className="py-3 px-4 text-right">Fare</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {ambulanceDispatches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                          No ambulance dispatches linked to your account yet.
                        </td>
                      </tr>
                    ) : (
                      ambulanceDispatches.map((disp) => (
                        <tr key={disp.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {disp.dispatchCode}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{disp.vehicleNumber}</p>
                            <p className="text-slate-500">
                              {disp.driverName} · {disp.driverPhone}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-xs">{disp.pickupAddress}</td>
                          <td className="py-3 px-4 tabular-nums">
                            <p className="font-medium text-slate-800">{disp.priority}</p>
                            <p className="text-slate-500">
                              {disp.estimatedEtaMinutes} mins · {disp.distanceKm} km
                            </p>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatCurrency(disp.estimatedFareInr, currencySymbol)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-teal-800 whitespace-nowrap">
                            {disp.status}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'patients' ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Search patient records"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search patient name or MRN..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                {canManageAppts && (
                  <button
                    type="button"
                    onClick={() => setShowNewPatient((s) => !s)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    {showNewPatient ? 'Close Intake Form' : 'New Encrypted Patient'}
                  </button>
                )}
              </div>

              {showNewPatient && (
                <form
                  onSubmit={handleCreatePatient}
                  className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={npName}
                      onChange={(e) => setNpName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={npEmail}
                      onChange={(e) => setNpEmail(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Phone *</label>
                    <input
                      type="tel"
                      required
                      value={npPhone}
                      onChange={(e) => setNpPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={npDob}
                      onChange={(e) => setNpDob(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                    <select
                      value={npGender}
                      onChange={(e) => setNpGender(e.target.value as typeof npGender)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Specialist</label>
                    <select
                      value={npDoctorId}
                      onChange={(e) => setNpDoctorId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      {doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.departmentName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Known Allergies</label>
                    <input
                      type="text"
                      value={npAllergies}
                      onChange={(e) => setNpAllergies(e.target.value)}
                      placeholder="e.g. No known drug allergies"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 px-4 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                    >
                      Encrypt &amp; Save Record
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {filteredPatients.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500">No patient records found.</p>
                  ) : (
                    filteredPatients.map((p) => {
                      const active = selectedPatient?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            if (p.decrypted) {
                              setEditAllergies(p.decrypted.allergies);
                              setEditHistory(p.decrypted.medicalHistory);
                              setEditNotes(p.decrypted.clinicalNotes);
                              setEditRx(p.decrypted.prescriptions);
                            }
                          }}
                          className={`w-full text-left p-4 transition-colors cursor-pointer ${
                            active ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-mono tabular-nums">{p.mrn}</span>
                            <span>{p.encryptionCipher}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 mt-1">{p.fullName}</p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {p.primaryDepartment} · {p.assignedDoctorName}
                          </p>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  {selectedPatient ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                        <div>
                          <p className="text-xs font-mono text-teal-800 tabular-nums">
                            {selectedPatient.mrn} · Blood Group {selectedPatient.bloodGroup} · {selectedPatient.encryptionCipher}
                          </p>
                          <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                            {selectedPatient.fullName}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            DOB: <span className="font-mono tabular-nums">{selectedPatient.dateOfBirth}</span> · {selectedPatient.gender} · Attending: {selectedPatient.assignedDoctorName}
                          </p>
                        </div>

                        {!selectedPatient.decrypted && (
                          <button
                            type="button"
                            onClick={() => handleDecryptChart(selectedPatient.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                            Decrypt PHI (Audit Logged)
                          </button>
                        )}
                      </div>

                      {/* Masked vs Decrypted PHI view */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-500 block">Phone Number</span>
                          <span className="font-mono text-slate-900">
                            {selectedPatient.decrypted ? selectedPatient.decrypted.phone : selectedPatient.maskedPhone}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Email Address</span>
                          <span className="font-mono text-slate-900">
                            {selectedPatient.decrypted ? selectedPatient.decrypted.email : selectedPatient.maskedEmail}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">National / Tax ID</span>
                          <span className="font-mono text-slate-900">
                            {selectedPatient.decrypted
                              ? selectedPatient.decrypted.nationalId
                              : selectedPatient.maskedNationalId}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Insurance Member ID</span>
                          <span className="font-mono text-slate-900">
                            {selectedPatient.decrypted
                              ? selectedPatient.decrypted.insuranceId
                              : selectedPatient.maskedInsuranceId}
                          </span>
                        </div>
                      </div>

                      {selectedPatient.decrypted ? (
                        canEditClinical ? (
                          <form onSubmit={handleSaveClinicalNotes} className="space-y-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                              <FileText className="w-4 h-4" aria-hidden="true" />
                              Decrypted Clinical Chart (Editable by Attending Physician)
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Allergies</label>
                              <input
                                type="text"
                                value={editAllergies}
                                onChange={(e) => setEditAllergies(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Medical History</label>
                              <textarea
                                rows={2}
                                value={editHistory}
                                onChange={(e) => setEditHistory(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Clinical Examination Notes</label>
                              <textarea
                                rows={3}
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Active Prescriptions</label>
                              <input
                                type="text"
                                value={editRx}
                                onChange={(e) => setEditRx(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={savingClinical}
                              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                            >
                              {savingClinical ? 'Re-Encrypting...' : 'Save & Re-Encrypt Clinical Chart'}
                            </button>
                          </form>
                        ) : (
                          <div className="space-y-3 pt-4 border-t border-slate-100 text-sm">
                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Allergies</span>
                              <p className="text-slate-900">{selectedPatient.decrypted.allergies}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Medical History</span>
                              <p className="text-slate-900">{selectedPatient.decrypted.medicalHistory}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Clinical Notes</span>
                              <p className="text-slate-900">{selectedPatient.decrypted.clinicalNotes}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-slate-500 block">Prescriptions</span>
                              <p className="text-slate-900 font-mono text-xs">{selectedPatient.decrypted.prescriptions}</p>
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                          Clinical history, examination notes, and prescriptions are encrypted at rest with AES-256-GCM.
                          Click &quot;Decrypt PHI (Audit Logged)&quot; above to view and edit full protected clinical data.
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">Select a patient record from the list.</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'payments' ? (
            <div className="space-y-6">
              {appointments.some((a) => a.paymentStatus === 'Pending' && a.status !== 'Cancelled') && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-900">Pending Consultation Invoices</h2>
                  <div className="divide-y divide-slate-100">
                    {appointments
                      .filter((a) => a.paymentStatus === 'Pending' && a.status !== 'Cancelled')
                      .map((appt) => (
                        <div key={appt.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="text-xs">
                            <p className="font-semibold text-slate-900">
                              {appt.bookingCode} · {appt.patientName} with {appt.doctorName}
                            </p>
                            <p className="text-slate-500">
                              {appt.departmentName} · Scheduled {appt.date} {appt.timeSlot}
                            </p>
                          </div>
                          {canProcessPayments && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSettleInvoice(appt.id, 'Card')}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                              >
                                Settle via Card
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSettleInvoice(appt.id, 'Insurance Copay')}
                                className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg cursor-pointer"
                              >
                                Apply Insurance Copay
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Invoice</th>
                      <th className="py-3 px-4">Booking</th>
                      <th className="py-3 px-4">Patient &amp; Physician</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-500">
                          No payment transactions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      payments.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                            {tx.invoiceId}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums">{tx.bookingCode}</td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{tx.patientName}</p>
                            <p className="text-xs text-slate-500">
                              {tx.doctorName} · {tx.departmentName}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700">
                            {tx.method} · <span className="font-mono text-slate-500">{tx.lastFourOrRef}</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(tx.totalAmount, currencySymbol, 2)}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-emerald-700">{tx.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'reminders' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  HIPAA-compliant automated visit reminders omit sensitive diagnoses from email bodies.
                </p>
                {canTriggerReminders && (
                  <button
                    type="button"
                    onClick={() => handleDispatchReminders()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    Dispatch All Queued Reminders
                  </button>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {reminders.length === 0 ? (
                  <p className="p-8 text-center text-xs text-slate-500">No automated reminders scheduled.</p>
                ) : (
                  reminders.map((rem) => (
                    <div key={rem.id} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-800">{rem.bookingCode}</span>
                          <span> · To: </span>
                          <span className="font-mono">{rem.maskedRecipientEmail}</span>
                          <span> · {rem.channel}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{rem.subject}</p>
                        <p className="text-xs text-slate-600 max-w-2xl">{rem.bodyPreview}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-xs font-semibold ${
                            rem.status === 'Sent' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {rem.status}
                        </span>
                        {canTriggerReminders && rem.status === 'Queued' && (
                          <button
                            type="button"
                            onClick={() => handleDispatchReminders(rem.appointmentId)}
                            className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg cursor-pointer"
                          >
                            Send Now
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {doctors.map((doc) => (
                <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <p className="text-xs text-slate-500">
                      {doc.departmentName} · {doc.roomNumber} · {doc.experienceYears} yrs exp
                    </p>
                    <h2 className="text-base font-semibold text-slate-900 mt-1">{doc.name}</h2>
                    <p className="text-xs text-slate-600 mt-0.5">{doc.specialty}</p>
                    <p className="text-xs text-slate-500 mt-1">{doc.qualifications}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(doc.consultationFee, currencySymbol)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedDoctor(doc);
                        setActiveTab('book');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                    >
                      Schedule Visit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
