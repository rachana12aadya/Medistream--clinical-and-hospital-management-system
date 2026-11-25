import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  Trash2,
  Unlock,
  Users,
  Video,
} from 'lucide-react';
import { api, type DoctorWorkspaceResponse } from '../api';
import {
  checkMedicationAllergyConflict,
  computeDoctorDashboardMetrics,
  formatCurrency,
} from '../lib/hospitalRules';
import type {
  Appointment,
  AppointmentStatus,
  ClinicalEncounter,
  DigitalPrescription,
  Doctor,
  LabCategory,
  LabOrder,
  LabOrderStatus,
  PatientRecordView,
  PrescriptionItem,
  ReferralStatus,
  SpecialistReferral,
  UserAccountView,
} from '../types';
import type { PublicRoute } from './TopBar';
import { ConsultationRoomPanel } from './doctor/ConsultationRoomPanel';
import { DoctorAvailabilityPanel } from './doctor/DoctorAvailabilityPanel';

type DoctorTab =
  | 'queue'
  | 'ehr'
  | 'prescriptions'
  | 'labs'
  | 'patients'
  | 'referrals'
  | 'availability'
  | 'emergency';

interface DoctorPortalWorkspaceProps {
  currentUser: UserAccountView;
  doctors: Doctor[];
  currencySymbol: string;
  onRefreshPublic: () => void;
  onNavigate: (route: PublicRoute) => void;
  onSignOut: () => void;
}

const COMMON_LAB_PANELS: Array<{ name: string; category: LabCategory }> = [
  { name: 'CBC + ESR & CRP', category: 'Hematology' },
  { name: 'Lipid Profile & HbA1c', category: 'Biochemistry' },
  { name: 'Troponin-I + 12-Lead ECG', category: 'Cardiac Diagnostics' },
  { name: 'Echocardiogram (2D Echo)', category: 'Cardiac Diagnostics' },
  { name: 'MRI Brain w/ Contrast', category: 'Neuro Diagnostics' },
  { name: 'Digital X-Ray (AP/Lateral)', category: 'Radiology' },
];

export const DoctorPortalWorkspace: React.FC<DoctorPortalWorkspaceProps> = ({
  currentUser,
  doctors: publicDoctors,
  currencySymbol,
  onRefreshPublic,
  onNavigate,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<DoctorTab>('queue');
  const [workspace, setWorkspace] = useState<DoctorWorkspaceResponse | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    currentUser.doctorId || publicDoctors[0]?.id || 'doc-1'
  );
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Queue filters
  const [queueFilter, setQueueFilter] = useState<'all' | 'today' | AppointmentStatus>('today');

  // Active consultation selection
  const [consultPatientId, setConsultPatientId] = useState<string>('');
  const [consultAppointmentId, setConsultAppointmentId] = useState<string>('');

  // E-Prescription Composer
  const [rxPatientId, setRxPatientId] = useState<string>('');
  const [rxDiagnosis, setRxDiagnosis] = useState('');
  const [rxNotes, setRxNotes] = useState('');
  const [rxItems, setRxItems] = useState<PrescriptionItem[]>([
    { medication: '', dosage: '', frequency: 'OD', duration: '30 days', instructions: 'After food' },
  ]);
  const [submittingRx, setSubmittingRx] = useState(false);
  const [printPreviewRx, setPrintPreviewRx] = useState<DigitalPrescription | null>(null);

  // Lab Orders Composer & Result Publishing
  const [labPatientId, setLabPatientId] = useState<string>('');
  const [labTestName, setLabTestName] = useState('');
  const [labCategory, setLabCategory] = useState<LabCategory>('Biochemistry');
  const [labPriority, setLabPriority] = useState<'Routine' | 'Urgent / STAT'>('Routine');
  const [labIndication, setLabIndication] = useState('');
  const [submittingLab, setSubmittingLab] = useState(false);
  const [editingLabId, setEditingLabId] = useState<string | null>(null);
  const [labResultStatus, setLabResultStatus] = useState<LabOrderStatus>('Results Ready');
  const [labResultSummary, setLabResultSummary] = useState('');
  const [labResultFlag, setLabResultFlag] = useState<'Normal' | 'Borderline' | 'Critical'>('Normal');

  // Patient directory state
  const [patientSearch, setPatientSearch] = useState('');
  const [showAllPatients, setShowAllPatients] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');

  // Specialist Referrals Composer
  const [refPatientId, setRefPatientId] = useState<string>('');
  const [refToDoctorId, setRefToDoctorId] = useState<string>('');
  const [refUrgency, setRefUrgency] = useState<'Routine' | 'Urgent' | 'Emergency'>('Routine');
  const [refReason, setRefReason] = useState('');
  const [refSummary, setRefSummary] = useState('');
  const [submittingRef, setSubmittingRef] = useState(false);
  const [refNoteDrafts, setRefNoteDrafts] = useState<Record<string, string>>({});

  const loadWorkspace = async (overrideDoctorId?: string) => {
    setLoading(true);
    try {
      const targetId = overrideDoctorId || currentUser.doctorId || selectedDoctorId;
      const data = await api.getDoctorWorkspace(
        currentUser.role === 'admin' ? targetId : undefined
      );
      setWorkspace(data);
      setSelectedDoctorId(data.doctor.id);
      const docAppts = data.appointments.filter((a) => a.doctorId === data.doctor.id);
      const todayKey = new Date().toISOString().slice(0, 10);
      const hasTodayAppts = docAppts.some((a) => a.date === todayKey && a.status !== 'Cancelled');
      if (!hasTodayAppts && docAppts.length > 0) {
        setQueueFilter((prev) => (prev === 'today' ? 'all' : prev));
      }
      const defaultPtId =
        docAppts[0]?.patientId ||
        data.patients.find((p) => p.assignedDoctorId === data.doctor.id)?.id ||
        data.patients[0]?.id ||
        '';
      setConsultPatientId((prev) => prev || defaultPtId);
      setRxPatientId((prev) => prev || defaultPtId);
      setLabPatientId((prev) => prev || defaultPtId);
      setSelectedPatientId((prev) => prev || defaultPtId);
      setRefPatientId((prev) => prev || defaultPtId);
      const otherDoc = data.doctors.find((d) => d.id !== data.doctor.id);
      if (otherDoc) {
        setRefToDoctorId((prev) => prev || otherDoc.id);
      }
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load Doctor Portal workspace.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [currentUser.id]);

  const activeDoctor = workspace?.doctor || publicDoctors[0];
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const doctorAppointments = useMemo(() => {
    if (!workspace || !activeDoctor) return [];
    return workspace.appointments
      .filter((a) => a.doctorId === activeDoctor.id)
      .sort((a, b) => `${a.date} ${a.timeSlot}`.localeCompare(`${b.date} ${b.timeSlot}`));
  }, [workspace, activeDoctor]);

  const filteredQueue = useMemo(() => {
    return doctorAppointments.filter((a) => {
      if (queueFilter === 'all') return true;
      if (queueFilter === 'today') return a.date === todayIso && a.status !== 'Cancelled';
      return a.status === queueFilter;
    });
  }, [doctorAppointments, queueFilter, todayIso]);

  const assignedPatientIds = useMemo(() => {
    const ids = new Set<string>();
    if (!workspace || !activeDoctor) return ids;
    for (const p of workspace.patients) {
      if (p.assignedDoctorId === activeDoctor.id) ids.add(p.id);
    }
    for (const a of doctorAppointments) {
      ids.add(a.patientId);
    }
    return ids;
  }, [workspace, activeDoctor, doctorAppointments]);

  const liveMetrics = useMemo(() => {
    if (!workspace || !activeDoctor) return null;
    return computeDoctorDashboardMetrics({
      doctorId: activeDoctor.id,
      todayIso,
      appointments: workspace.appointments,
      assignedPatientsCount: assignedPatientIds.size,
      prescriptions: workspace.prescriptions,
      labOrders: workspace.labOrders,
      referrals: workspace.referrals,
    });
  }, [workspace, activeDoctor, todayIso, assignedPatientIds]);

  const rxSelectedPatient = useMemo(
    () => workspace?.patients.find((p) => p.id === rxPatientId) || null,
    [workspace, rxPatientId]
  );

  // Real-time client drug-allergy cross-check when patient chart is decrypted
  const liveAllergyConflicts = useMemo(() => {
    const allergiesText = rxSelectedPatient?.decrypted?.allergies;
    if (!allergiesText) return [];
    return checkMedicationAllergyConflict(
      rxItems.map((i) => i.medication).filter(Boolean),
      allergiesText
    );
  }, [rxSelectedPatient, rxItems]);

  const handleQueueStatus = async (apptId: string, status: AppointmentStatus) => {
    try {
      const res = await api.updateAppointmentStatus(apptId, status);
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              appointments: prev.appointments.map((a) =>
                a.id === apptId ? res.appointment : a
              ),
            }
          : prev
      );
      setBanner({
        type: 'ok',
        text: `Appointment ${res.appointment.bookingCode} updated to ${status}.`,
      });
      onRefreshPublic();
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Status update failed.' });
    }
  };

  const handleOpenConsult = (appt: Appointment) => {
    setConsultPatientId(appt.patientId);
    setConsultAppointmentId(appt.id);
    setActiveTab('ehr');
  };

  const handlePatientUpdated = (updatedPatient: PatientRecordView) => {
    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            patients: prev.patients.map((p) => (p.id === updatedPatient.id ? updatedPatient : p)),
          }
        : prev
    );
  };

  const handleEncounterCreated = (payload: {
    encounter: ClinicalEncounter;
    patient: PatientRecordView;
    appointment?: Appointment;
  }) => {
    setWorkspace((prev) =>
      prev
        ? {
            ...prev,
            encounters: [payload.encounter, ...prev.encounters],
            patients: prev.patients.map((p) =>
              p.id === payload.patient.id ? payload.patient : p
            ),
            appointments: payload.appointment
              ? prev.appointments.map((a) =>
                  a.id === payload.appointment!.id ? payload.appointment! : a
                )
              : prev.appointments,
          }
        : prev
    );
    if (payload.appointment?.status === 'Completed') {
      onRefreshPublic();
    }
  };

  const handleAddRxRow = () => {
    setRxItems((prev) => [
      ...prev,
      { medication: '', dosage: '', frequency: 'OD', duration: '14 days', instructions: 'After food' },
    ]);
  };

  const handleRemoveRxRow = (idx: number) => {
    setRxItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const handleSubmitRx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rxPatientId || !rxDiagnosis.trim()) return;
    setSubmittingRx(true);
    setBanner(null);
    try {
      const res = await api.createDoctorPrescription({
        patientId: rxPatientId,
        appointmentId:
          consultPatientId === rxPatientId && consultAppointmentId ? consultAppointmentId : undefined,
        diagnosis: rxDiagnosis,
        items: rxItems,
        notes: rxNotes,
      });
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              prescriptions: [res.prescription, ...prev.prescriptions],
              patients: prev.patients.map((p) => (p.id === res.patient.id ? res.patient : p)),
            }
          : prev
      );
      setRxDiagnosis('');
      setRxNotes('');
      setRxItems([
        { medication: '', dosage: '', frequency: 'OD', duration: '30 days', instructions: 'After food' },
      ]);
      setBanner({
        type: res.allergyWarnings.length > 0 ? 'err' : 'ok',
        text:
          res.allergyWarnings.length > 0
            ? `Issued ${res.prescription.rxCode} WITH ALLERGY ALERT: ${res.allergyWarnings.join(' ')}`
            : `Digital E-Prescription ${res.prescription.rxCode} issued & encrypted on patient chart.`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to issue prescription.' });
    } finally {
      setSubmittingRx(false);
    }
  };

  const handleRxStatus = async (rxId: string, status: 'Active' | 'Completed' | 'Discontinued') => {
    try {
      const res = await api.updatePrescriptionStatus(rxId, status);
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              prescriptions: prev.prescriptions.map((r) => (r.id === rxId ? res.prescription : r)),
            }
          : prev
      );
      setBanner({ type: 'ok', text: `Prescription ${res.prescription.rxCode} marked ${status}.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const handleSubmitLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labPatientId || !labTestName.trim() || !labIndication.trim()) return;
    setSubmittingLab(true);
    try {
      const res = await api.createDoctorLabOrder({
        patientId: labPatientId,
        testName: labTestName,
        category: labCategory,
        priority: labPriority,
        clinicalIndication: labIndication,
      });
      setWorkspace((prev) =>
        prev ? { ...prev, labOrders: [res.labOrder, ...prev.labOrders] } : prev
      );
      setLabTestName('');
      setLabIndication('');
      setBanner({ type: 'ok', text: `Diagnostic order ${res.labOrder.orderCode} submitted.` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Lab order failed.' });
    } finally {
      setSubmittingLab(false);
    }
  };

  const handleSaveLabResult = async (orderId: string) => {
    try {
      const res = await api.updateDoctorLabOrder(orderId, {
        status: labResultStatus,
        resultSummary: labResultSummary,
        resultFlag: labResultFlag,
      });
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              labOrders: prev.labOrders.map((l) => (l.id === orderId ? res.labOrder : l)),
            }
          : prev
      );
      setEditingLabId(null);
      setLabResultSummary('');
      setBanner({ type: 'ok', text: `Updated ${res.labOrder.orderCode} (${res.labOrder.status}).` });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Failed to update lab order.' });
    }
  };

  const handleDecryptPatientCard = async (patientId: string) => {
    try {
      const res = await api.decryptPatient(patientId);
      handlePatientUpdated(res.patient);
      setBanner({
        type: 'ok',
        text: `HIPAA Audit Logged: Decrypted AES-256-GCM chart for ${res.patient.mrn}.`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Decryption denied.' });
    }
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refPatientId || !refToDoctorId || !refReason.trim()) return;
    setSubmittingRef(true);
    try {
      const res = await api.createDoctorReferral({
        patientId: refPatientId,
        toDoctorId: refToDoctorId,
        urgency: refUrgency,
        reason: refReason,
        clinicalSummary: refSummary,
      });
      setWorkspace((prev) =>
        prev ? { ...prev, referrals: [res.referral, ...prev.referrals] } : prev
      );
      setRefReason('');
      setRefSummary('');
      setBanner({
        type: 'ok',
        text: `Specialist referral ${res.referral.referralCode} sent to ${res.referral.toDoctorName}.`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Referral failed.' });
    } finally {
      setSubmittingRef(false);
    }
  };

  const handleUpdateReferral = async (referralId: string, status: ReferralStatus) => {
    try {
      const res = await api.updateDoctorReferral(referralId, {
        status,
        doctorNotes: refNoteDrafts[referralId],
      });
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              referrals: prev.referrals.map((r) => (r.id === referralId ? res.referral : r)),
            }
          : prev
      );
      setBanner({
        type: 'ok',
        text: `Referral ${res.referral.referralCode} updated to ${status}.`,
      });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : 'Referral update failed.' });
    }
  };

  const navItems: Array<{ id: DoctorTab; label: string; icon: React.ReactNode }> = [
    { id: 'queue', label: 'Queue & Schedule', icon: <ClipboardList className="w-4 h-4" aria-hidden="true" /> },
    { id: 'ehr', label: 'Consultation & EHR', icon: <Stethoscope className="w-4 h-4" aria-hidden="true" /> },
    { id: 'prescriptions', label: 'E-Prescriptions', icon: <Pill className="w-4 h-4" aria-hidden="true" /> },
    { id: 'labs', label: 'Lab Orders', icon: <TestTube2 className="w-4 h-4" aria-hidden="true" /> },
    { id: 'patients', label: 'My Patients', icon: <Users className="w-4 h-4" aria-hidden="true" /> },
    { id: 'referrals', label: 'Referrals', icon: <Send className="w-4 h-4" aria-hidden="true" /> },
    { id: 'availability', label: 'Availability & Leave', icon: <CalendarClock className="w-4 h-4" aria-hidden="true" /> },
    { id: 'emergency', label: 'Emergency Arrivals', icon: <Ambulance className="w-4 h-4" aria-hidden="true" /> },
  ];

  const tabTitles: Record<DoctorTab, string> = {
    queue: 'Live Clinic Queue & Schedule',
    ehr: 'Consultation & Encrypted EHR Room',
    prescriptions: 'Digital E-Prescriptions',
    labs: 'Diagnostic & Lab Orders',
    patients: 'Patient Panel & Encrypted Charts',
    referrals: 'Inter-Departmental Specialist Referrals',
    availability: 'Physician Availability & Leave Calendar',
    emergency: 'Incoming Emergency Ambulance Arrivals',
  };

  const visiblePatients = useMemo(() => {
    if (!workspace) return [];
    const base = showAllPatients
      ? workspace.patients
      : workspace.patients.filter((p) => assignedPatientIds.has(p.id));
    const q = patientSearch.trim().toLowerCase();
    return base.filter(
      (p) =>
        !q ||
        p.fullName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.primaryDepartment.toLowerCase().includes(q)
    );
  }, [workspace, showAllPatients, assignedPatientIds, patientSearch]);

  const activeConsultPatient =
    workspace?.patients.find((p) => p.id === consultPatientId) || null;
  const activeConsultAppointment =
    workspace?.appointments.find((a) => a.id === consultAppointmentId) || null;
  const consultPatientEncounters = useMemo(
    () =>
      (workspace?.encounters || []).filter((e) => e.patientId === consultPatientId),
    [workspace, consultPatientId]
  );

  const selectedPanelPatient =
    workspace?.patients.find((p) => p.id === selectedPatientId) || visiblePatients[0] || null;

  const doctorPrescriptions = useMemo(() => {
    if (!workspace || !activeDoctor) return [];
    return workspace.prescriptions.filter(
      (rx) => rx.doctorId === activeDoctor.id || assignedPatientIds.has(rx.patientId)
    );
  }, [workspace, activeDoctor, assignedPatientIds]);

  const doctorLabOrders = useMemo(() => {
    if (!workspace || !activeDoctor) return [];
    return workspace.labOrders.filter(
      (l) => l.doctorId === activeDoctor.id || assignedPatientIds.has(l.patientId)
    );
  }, [workspace, activeDoctor, assignedPatientIds]);

  const incomingReferrals = useMemo(
    () =>
      (workspace?.referrals || []).filter((r) => r.toDoctorId === activeDoctor?.id),
    [workspace, activeDoctor]
  );

  const outgoingReferrals = useMemo(
    () =>
      (workspace?.referrals || []).filter((r) => r.fromDoctorId === activeDoctor?.id),
    [workspace, activeDoctor]
  );

  const activeTelehealthVisit = useMemo(
    () =>
      doctorAppointments.find(
        (a) =>
          a.visitType === 'Telehealth Video' &&
          (a.status === 'Confirmed' || a.status === 'Checked-In')
      ) || null,
    [doctorAppointments]
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* 256px Physician Sidebar */}
      <aside className="w-full lg:w-64 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between shrink-0">
        <div>
          <div className="px-6 h-16 border-b border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="text-lg font-bold tracking-tight text-slate-900 cursor-pointer"
            >
              MediStream
            </button>
            <span className="text-xs font-semibold text-teal-800">Doctor</span>
          </div>

          <nav aria-label="Doctor Portal Navigation" className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
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
            <p className="font-semibold text-slate-900 truncate">
              {activeDoctor?.name || currentUser.name}
            </p>
            <p className="text-slate-600 truncate">
              {activeDoctor?.departmentName} · {activeDoctor?.roomNumber}
            </p>
            <p className="font-mono text-slate-500 truncate mt-0.5">{currentUser.email}</p>
            <p className="text-teal-700 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              HIPAA MD Workbench
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
            <p className="text-xs text-slate-500">
              Doctor Portal / {tabTitles[activeTab]}
            </p>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">{tabTitles[activeTab]}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {currentUser.role === 'admin' && workspace && (
              <select
                aria-label="Preview physician schedule"
                value={selectedDoctorId}
                onChange={(e) => {
                  setSelectedDoctorId(e.target.value);
                  loadWorkspace(e.target.value);
                }}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-900"
              >
                {workspace.doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.departmentName})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => loadWorkspace(selectedDoctorId)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ehr')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap cursor-pointer"
            >
              Consultation Room
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
          {banner && (
            <div
              role="status"
              className={`text-xs px-4 py-3 rounded-lg border flex items-center justify-between ${
                banner.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-xs underline ml-4 shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading || !workspace || !activeDoctor || !liveMetrics ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
              Loading physician clinical workbench...
            </div>
          ) : activeTab === 'queue' ? (
            <div className="space-y-6">
              {/* 4-Column Physician KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Today&apos;s Outpatient Queue</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {liveMetrics.todayAppointments}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {liveMetrics.waitingCheckedIn} Checked-In · {liveMetrics.upcomingConfirmed} Confirmed
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Patient Panel &amp; Consults</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {liveMetrics.assignedPatientsCount} Patients
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {liveMetrics.completedConsultations} completed consultations
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Pending Lab Reviews</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {liveMetrics.pendingLabReviewsCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {liveMetrics.activePrescriptionsCount} active digital prescriptions
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs font-medium text-slate-500">Incoming Referrals &amp; Billing</p>
                  <p className="mt-2 text-2xl font-mono font-bold text-slate-900 tabular-nums">
                    {liveMetrics.incomingReferralsCount} Pending
                  </p>
                  <p className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
                    {formatCurrency(liveMetrics.consultationEarnings, currencySymbol, 0)} settled revenue
                  </p>
                </div>
              </div>

              {/* Active Telehealth Quick-Launch Card */}
              {activeTelehealthVisit && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-mono text-teal-800">
                        TELEHEALTH VIDEO VISIT · {activeTelehealthVisit.bookingCode} · {activeTelehealthVisit.date}{' '}
                        {activeTelehealthVisit.timeSlot}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        {activeTelehealthVisit.patientName} — {activeTelehealthVisit.reasonSummary}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenConsult(activeTelehealthVisit)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0 cursor-pointer"
                  >
                    Open Telehealth Consult
                  </button>
                </div>
              )}

              {/* Queue Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'today', label: `Today (${doctorAppointments.filter((a) => a.date === todayIso && a.status !== 'Cancelled').length})` },
                      { id: 'Checked-In', label: 'Checked-In' },
                      { id: 'Confirmed', label: 'Confirmed' },
                      { id: 'Completed', label: 'Completed' },
                      { id: 'all', label: `All (${doctorAppointments.length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setQueueFilter(f.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                        queueFilter === f.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-slate-500">
                  {activeDoctor.roomNumber} ·{' '}
                  <span className={activeDoctor.acceptingNewPatients ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                    {activeDoctor.acceptingNewPatients ? 'Accepting Bookings' : 'Bookings Paused'}
                  </span>
                </span>
              </div>

              {/* Clinic Queue Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Schedule</th>
                      <th className="py-3 px-4">Patient</th>
                      <th className="py-3 px-4">Chief Reason &amp; Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Clinical Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredQueue.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500">
                          No appointments match this queue filter.
                        </td>
                      </tr>
                    ) : (
                      filteredQueue.map((appt) => (
                        <tr key={appt.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                              {appt.date} · {appt.timeSlot}
                            </p>
                            <p className="font-mono text-xs text-slate-500">{appt.bookingCode}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{appt.patientName}</p>
                            <p className="text-xs text-slate-500">{appt.visitType}</p>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                            {appt.reasonSummary}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                            <span
                              className={
                                appt.status === 'Checked-In'
                                  ? 'text-amber-700'
                                  : appt.status === 'Confirmed'
                                  ? 'text-teal-800'
                                  : appt.status === 'Completed'
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
                              }
                            >
                              {appt.status}
                            </span>
                            <span className="text-slate-400"> · </span>
                            <span className="text-slate-500 font-normal">{appt.paymentStatus}</span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                            {appt.status === 'Confirmed' && (
                              <button
                                type="button"
                                onClick={() => handleQueueStatus(appt.id, 'Checked-In')}
                                className="text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
                              >
                                Check In
                              </button>
                            )}
                            {appt.status !== 'Cancelled' && (
                              <button
                                type="button"
                                onClick={() => handleOpenConsult(appt)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                              >
                                Start Consult
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setRxPatientId(appt.patientId);
                                setRxDiagnosis(appt.reasonSummary);
                                setActiveTab('prescriptions');
                              }}
                              className="text-xs font-medium text-teal-800 hover:underline cursor-pointer"
                            >
                              Write Rx
                            </button>
                            {appt.status === 'Checked-In' && (
                              <button
                                type="button"
                                onClick={() => handleQueueStatus(appt.id, 'Completed')}
                                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                              >
                                Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeTab === 'ehr' ? (
            <div className="space-y-5">
              {/* Patient & Appointment Selector Strip */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ehr-patient-select" className="block text-xs font-medium text-slate-700 mb-1">
                    Active Patient Chart
                  </label>
                  <select
                    id="ehr-patient-select"
                    value={consultPatientId}
                    onChange={(e) => {
                      setConsultPatientId(e.target.value);
                      setConsultAppointmentId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {workspace.patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} ({p.mrn}) — {p.primaryDepartment}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ehr-appt-select" className="block text-xs font-medium text-slate-700 mb-1">
                    Linked Appointment (Optional)
                  </label>
                  <select
                    id="ehr-appt-select"
                    value={consultAppointmentId}
                    onChange={(e) => setConsultAppointmentId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">Walk-in / Standalone Chart Encounter</option>
                    {doctorAppointments
                      .filter((a) => a.patientId === consultPatientId && a.status !== 'Cancelled')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bookingCode} · {a.date} {a.timeSlot} ({a.status})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <ConsultationRoomPanel
                patient={activeConsultPatient}
                linkedAppointment={activeConsultAppointment}
                patientEncounters={consultPatientEncounters}
                onPatientUpdated={handlePatientUpdated}
                onEncounterCreated={handleEncounterCreated}
                onNotify={setBanner}
                onJumpToRx={(ptId) => {
                  setRxPatientId(ptId);
                  setActiveTab('prescriptions');
                }}
                onJumpToLab={(ptId) => {
                  setLabPatientId(ptId);
                  setActiveTab('labs');
                }}
              />
            </div>
          ) : activeTab === 'prescriptions' ? (
            <div className="space-y-6">
              {/* Digital E-Prescription Composer */}
              <form
                onSubmit={handleSubmitRx}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Issue Digital E-Prescription
                    </h2>
                    <p className="text-xs text-slate-500">
                      Encrypted &amp; synced directly to the patient&apos;s User Portal chart with allergy screening.
                    </p>
                  </div>
                  {rxSelectedPatient && !rxSelectedPatient.decrypted && (
                    <button
                      type="button"
                      onClick={() => handleDecryptPatientCard(rxSelectedPatient.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                      Decrypt Allergies Before Prescribing
                    </button>
                  )}
                </div>

                {liveAllergyConflicts.length > 0 && (
                  <div
                    role="alert"
                    className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-900"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Clinical Allergy Contraindication Warning</p>
                      <p className="mt-0.5">{liveAllergyConflicts.join(' ')}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rx-patient" className="block text-xs font-medium text-slate-700 mb-1">
                      Patient *
                    </label>
                    <select
                      id="rx-patient"
                      value={rxPatientId}
                      onChange={(e) => setRxPatientId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      {workspace.patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.mrn})
                        </option>
                      ))}
                    </select>
                    {rxSelectedPatient?.decrypted?.allergies && (
                      <p className="text-xs text-slate-500 mt-1">
                        Allergies: <span className="font-medium text-slate-800">{rxSelectedPatient.decrypted.allergies}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="rx-diag" className="block text-xs font-medium text-slate-700 mb-1">
                      Primary Diagnosis / Indication *
                    </label>
                    <input
                      id="rx-diag"
                      type="text"
                      required
                      value={rxDiagnosis}
                      onChange={(e) => setRxDiagnosis(e.target.value)}
                      placeholder="e.g. Stable Angina & Dyslipidemia"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Medication Rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">Medications</span>
                    <button
                      type="button"
                      onClick={handleAddRxRow}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      Add Medication
                    </button>
                  </div>

                  {rxItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-slate-50/70 border border-slate-200 rounded-lg p-3"
                    >
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Drug Name *</label>
                        <input
                          type="text"
                          required
                          value={item.medication}
                          onChange={(e) =>
                            setRxItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, medication: e.target.value } : row
                              )
                            )
                          }
                          placeholder="e.g. Telmisartan"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Dosage</label>
                        <input
                          type="text"
                          value={item.dosage}
                          onChange={(e) =>
                            setRxItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, dosage: e.target.value } : row
                              )
                            )
                          }
                          placeholder="40 mg"
                          className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                        <select
                          value={item.frequency}
                          onChange={(e) =>
                            setRxItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, frequency: e.target.value } : row
                              )
                            )
                          }
                          className="w-full px-2 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="OD">OD (Once Daily)</option>
                          <option value="BD">BD (Twice Daily)</option>
                          <option value="TDS">TDS (Three Times)</option>
                          <option value="HS">HS (At Bedtime)</option>
                          <option value="SOS">SOS (As Needed)</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Duration</label>
                        <input
                          type="text"
                          value={item.duration}
                          onChange={(e) =>
                            setRxItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, duration: e.target.value } : row
                              )
                            )
                          }
                          placeholder="30 days"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Instructions</label>
                        <input
                          type="text"
                          value={item.instructions}
                          onChange={(e) =>
                            setRxItems((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, instructions: e.target.value } : row
                              )
                            )
                          }
                          placeholder="After food"
                          className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          aria-label="Remove medication row"
                          disabled={rxItems.length <= 1}
                          onClick={() => handleRemoveRxRow(idx)}
                          className="p-2 text-slate-500 hover:text-rose-700 disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="md:col-span-3">
                    <label htmlFor="rx-notes" className="block text-xs font-medium text-slate-700 mb-1">
                      Pharmacist &amp; Dietary Instructions (Optional)
                    </label>
                    <input
                      id="rx-notes"
                      type="text"
                      value={rxNotes}
                      onChange={(e) => setRxNotes(e.target.value)}
                      placeholder="e.g. Monitor fasting glucose weekly; avoid grapefruit juice"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingRx}
                    className="py-2.5 px-4 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    {submittingRx ? 'Issuing E-Rx...' : 'Sign & Issue Prescription'}
                  </button>
                </div>
              </form>

              {/* Printable Summary Preview if requested */}
              {printPreviewRx && (
                <div className="bg-white border border-slate-300 rounded-xl p-6 space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-mono text-teal-800">MEDISTREAM E-PRESCRIPTION · {printPreviewRx.rxCode}</p>
                      <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                        {printPreviewRx.patientName} ({printPreviewRx.patientMrn})
                      </h3>
                      <p className="text-xs text-slate-600">
                        Prescribed by {printPreviewRx.doctorName} ({printPreviewRx.departmentName}) · Issued{' '}
                        {printPreviewRx.issuedAt.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintPreviewRx(null)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    Diagnosis: <span className="font-normal text-slate-700">{printPreviewRx.diagnosis}</span>
                  </p>
                  <div className="divide-y divide-slate-100 text-xs">
                    {printPreviewRx.items.map((it, i) => (
                      <div key={i} className="py-2 flex flex-wrap justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {i + 1}. {it.medication} {it.dosage}
                        </span>
                        <span className="font-mono text-slate-700">
                          {it.frequency} · {it.duration} · {it.instructions}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prescriptions Ledger */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Issued Digital E-Prescriptions</h2>
                  <span className="text-xs text-slate-500 tabular-nums">{doctorPrescriptions.length} total</span>
                </div>
                {doctorPrescriptions.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No e-prescriptions recorded yet.</p>
                ) : (
                  doctorPrescriptions.map((rx) => (
                    <div key={rx.id} className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{rx.rxCode}</span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-slate-900">{rx.patientName}</span>
                          <span className="font-mono text-slate-500">({rx.patientMrn})</span>
                          <span className="text-slate-400">·</span>
                          <span
                            className={`font-semibold ${
                              rx.status === 'Active'
                                ? 'text-emerald-700'
                                : rx.status === 'Completed'
                                ? 'text-slate-600'
                                : 'text-rose-700'
                            }`}
                          >
                            {rx.status}
                          </span>
                        </div>
                        <p className="text-slate-700 font-medium">{rx.diagnosis}</p>
                        <ul className="space-y-0.5 text-slate-600 font-mono">
                          {rx.items.map((item, i) => (
                            <li key={i}>
                              {item.medication} {item.dosage} · {item.frequency} · {item.duration} ({item.instructions})
                            </li>
                          ))}
                        </ul>
                        {rx.allergyWarning && (
                          <p className="text-rose-700 font-semibold">{rx.allergyWarning}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPrintPreviewRx(rx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                          Summary
                        </button>
                        {rx.status === 'Active' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRxStatus(rx.id, 'Completed')}
                              className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md cursor-pointer"
                            >
                              Mark Completed
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRxStatus(rx.id, 'Discontinued')}
                              className="px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md cursor-pointer"
                            >
                              Discontinue
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'labs' ? (
            <div className="space-y-6">
              {/* Lab Order Composer */}
              <form
                onSubmit={handleSubmitLab}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Order Diagnostic Laboratory &amp; Imaging Panel
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_LAB_PANELS.map((panel) => (
                      <button
                        key={panel.name}
                        type="button"
                        onClick={() => {
                          setLabTestName(panel.name);
                          setLabCategory(panel.category);
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md cursor-pointer"
                      >
                        {panel.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label htmlFor="lab-pt" className="block text-xs font-medium text-slate-700 mb-1">
                      Patient *
                    </label>
                    <select
                      id="lab-pt"
                      value={labPatientId}
                      onChange={(e) => setLabPatientId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      {workspace.patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.mrn})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lab-test" className="block text-xs font-medium text-slate-700 mb-1">
                      Test / Panel Name *
                    </label>
                    <input
                      id="lab-test"
                      type="text"
                      required
                      value={labTestName}
                      onChange={(e) => setLabTestName(e.target.value)}
                      placeholder="e.g. Troponin-I + Lipid Panel"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="lab-cat" className="block text-xs font-medium text-slate-700 mb-1">
                      Diagnostic Category
                    </label>
                    <select
                      id="lab-cat"
                      value={labCategory}
                      onChange={(e) => setLabCategory(e.target.value as LabCategory)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="Hematology">Hematology</option>
                      <option value="Biochemistry">Biochemistry</option>
                      <option value="Cardiac Diagnostics">Cardiac Diagnostics</option>
                      <option value="Neuro Diagnostics">Neuro Diagnostics</option>
                      <option value="Radiology">Radiology</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="lab-pri" className="block text-xs font-medium text-slate-700 mb-1">
                      Priority
                    </label>
                    <select
                      id="lab-pri"
                      value={labPriority}
                      onChange={(e) => setLabPriority(e.target.value as 'Routine' | 'Urgent / STAT')}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="Routine">Routine</option>
                      <option value="Urgent / STAT">Urgent / STAT</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div className="sm:col-span-3">
                    <label htmlFor="lab-ind" className="block text-xs font-medium text-slate-700 mb-1">
                      Clinical Indication *
                    </label>
                    <input
                      id="lab-ind"
                      type="text"
                      required
                      value={labIndication}
                      onChange={(e) => setLabIndication(e.target.value)}
                      placeholder="e.g. Baseline metabolic screening prior to statin titration"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submittingLab}
                    className="py-2.5 px-4 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    {submittingLab ? 'Ordering...' : 'Submit Lab Order'}
                  </button>
                </div>
              </form>

              {/* Lab Orders & Result Publishing Table */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Diagnostic Orders &amp; Results</h2>
                  <span className="text-xs text-slate-500 tabular-nums">{doctorLabOrders.length} orders</span>
                </div>
                {doctorLabOrders.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No laboratory orders recorded yet.</p>
                ) : (
                  doctorLabOrders.map((order) => (
                    <div key={order.id} className="p-5 space-y-3 text-xs">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{order.orderCode}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-slate-900">{order.testName}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600">{order.category}</span>
                            <span className="text-slate-400">·</span>
                            <span
                              className={
                                order.priority === 'Urgent / STAT'
                                  ? 'font-semibold text-rose-700'
                                  : 'text-slate-600'
                              }
                            >
                              {order.priority}
                            </span>
                          </div>
                          <p className="text-slate-600">
                            Patient: <span className="font-medium text-slate-900">{order.patientName}</span> ({order.patientMrn}) · Indication:{' '}
                            {order.clinicalIndication}
                          </p>
                          {order.resultSummary && (
                            <p className="text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mt-1.5 font-mono">
                              Result ({order.resultFlag || 'Normal'}): {order.resultSummary}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-semibold ${
                              order.status === 'Results Ready'
                                ? 'text-amber-700'
                                : order.status === 'Reviewed'
                                ? 'text-emerald-700'
                                : 'text-teal-800'
                            }`}
                          >
                            {order.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (editingLabId === order.id) {
                                setEditingLabId(null);
                              } else {
                                setEditingLabId(order.id);
                                setLabResultStatus(
                                  order.status === 'Ordered' ? 'Results Ready' : order.status
                                );
                                setLabResultSummary(order.resultSummary || '');
                                setLabResultFlag(order.resultFlag || 'Normal');
                              }
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md cursor-pointer"
                          >
                            {editingLabId === order.id ? 'Cancel' : 'Update / Publish Result'}
                          </button>
                        </div>
                      </div>

                      {editingLabId === order.id && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                            <select
                              value={labResultStatus}
                              onChange={(e) => setLabResultStatus(e.target.value as LabOrderStatus)}
                              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              <option value="Ordered">Ordered</option>
                              <option value="Sample Collected">Sample Collected</option>
                              <option value="Results Ready">Results Ready</option>
                              <option value="Reviewed">Reviewed</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Result Flag</label>
                            <select
                              value={labResultFlag}
                              onChange={(e) =>
                                setLabResultFlag(e.target.value as 'Normal' | 'Borderline' | 'Critical')
                              }
                              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                            >
                              <option value="Normal">Normal</option>
                              <option value="Borderline">Borderline</option>
                              <option value="Critical">Critical</option>
                            </select>
                          </div>
                          <div className="md:col-span-2 flex gap-2 items-end">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Quantitative Result Summary
                              </label>
                              <input
                                type="text"
                                value={labResultSummary}
                                onChange={(e) => setLabResultSummary(e.target.value)}
                                placeholder="e.g. Troponin-I <0.01 ng/mL; LVEF 62%"
                                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveLabResult(order.id)}
                              className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                            >
                              Publish
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'patients' ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    aria-label="Search physician patients"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search patient name or MRN..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAllPatients}
                    onChange={(e) => setShowAllPatients(e.target.checked)}
                  />
                  Include cross-department hospital patients ({workspace.patients.length})
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {visiblePatients.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500">No patients match your filter.</p>
                  ) : (
                    visiblePatients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatientId(p.id)}
                        className={`w-full text-left p-4 transition-colors cursor-pointer ${
                          selectedPanelPatient?.id === p.id ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-mono tabular-nums">{p.mrn}</span>
                          <span>{p.bloodGroup}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{p.fullName}</p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {p.primaryDepartment} · {p.assignedDoctorName}
                        </p>
                      </button>
                    ))
                  )}
                </div>

                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  {selectedPanelPatient ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                        <div>
                          <p className="text-xs font-mono text-teal-800">
                            {selectedPanelPatient.mrn} · {selectedPanelPatient.encryptionCipher}
                          </p>
                          <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                            {selectedPanelPatient.fullName}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            DOB <span className="font-mono tabular-nums">{selectedPanelPatient.dateOfBirth}</span> ·{' '}
                            {selectedPanelPatient.gender} · Blood Group {selectedPanelPatient.bloodGroup}
                          </p>
                        </div>

                        {!selectedPanelPatient.decrypted && (
                          <button
                            type="button"
                            onClick={() => handleDecryptPatientCard(selectedPanelPatient.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shrink-0 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                            Decrypt Chart
                          </button>
                        )}
                      </div>

                      {selectedPanelPatient.decrypted ? (
                        <div className="space-y-3 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span className="text-slate-500 block">Phone</span>
                              <span className="font-mono text-slate-900">
                                {selectedPanelPatient.decrypted.phone}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Email</span>
                              <span className="font-mono text-slate-900">
                                {selectedPanelPatient.decrypted.email}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Allergies</span>
                            <span className="font-semibold text-slate-900">
                              {selectedPanelPatient.decrypted.allergies}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Medical History</span>
                            <p className="text-slate-800">{selectedPanelPatient.decrypted.medicalHistory}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Latest Clinical Notes</span>
                            <p className="text-slate-800">{selectedPanelPatient.decrypted.clinicalNotes}</p>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Active Prescriptions</span>
                            <p className="font-mono text-slate-800">
                              {selectedPanelPatient.decrypted.prescriptions}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4">
                          Masked contact: <span className="font-mono">{selectedPanelPatient.maskedPhone}</span> ·{' '}
                          <span className="font-mono">{selectedPanelPatient.maskedEmail}</span>. Click &quot;Decrypt Chart&quot; above for full PHI access.
                        </p>
                      )}

                      <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setConsultPatientId(selectedPanelPatient.id);
                            setActiveTab('ehr');
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                        >
                          Open in Consultation Room
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRxPatientId(selectedPanelPatient.id);
                            setActiveTab('prescriptions');
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg cursor-pointer"
                        >
                          Write E-Prescription
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLabPatientId(selectedPanelPatient.id);
                            setActiveTab('labs');
                          }}
                          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          Order Diagnostics
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Select a patient from the list.</p>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'referrals' ? (
            <div className="space-y-6">
              {/* Send Inter-Departmental Referral */}
              <form
                onSubmit={handleCreateReferral}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="text-sm font-semibold text-slate-900">
                  Send Inter-Departmental Specialist Referral
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="ref-pt" className="block text-xs font-medium text-slate-700 mb-1">
                      Patient *
                    </label>
                    <select
                      id="ref-pt"
                      value={refPatientId}
                      onChange={(e) => setRefPatientId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      {workspace.patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.mrn})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ref-doc" className="block text-xs font-medium text-slate-700 mb-1">
                      Receiving Specialist *
                    </label>
                    <select
                      id="ref-doc"
                      value={refToDoctorId}
                      onChange={(e) => setRefToDoctorId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      {workspace.doctors
                        .filter((d) => d.id !== activeDoctor.id)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} ({d.departmentName})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ref-urg" className="block text-xs font-medium text-slate-700 mb-1">
                      Urgency
                    </label>
                    <select
                      id="ref-urg"
                      value={refUrgency}
                      onChange={(e) =>
                        setRefUrgency(e.target.value as 'Routine' | 'Urgent' | 'Emergency')
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    >
                      <option value="Routine">Routine</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="ref-reason" className="block text-xs font-medium text-slate-700 mb-1">
                      Reason for Referral *
                    </label>
                    <input
                      id="ref-reason"
                      type="text"
                      required
                      value={refReason}
                      onChange={(e) => setRefReason(e.target.value)}
                      placeholder="e.g. Neurological workup for recurrent visual migraine"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label htmlFor="ref-sum" className="block text-xs font-medium text-slate-700 mb-1">
                      Handover Clinical Summary
                    </label>
                    <input
                      id="ref-sum"
                      type="text"
                      value={refSummary}
                      onChange={(e) => setRefSummary(e.target.value)}
                      placeholder="Vitals stable; rule out cerebrovascular etiology"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingRef}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    {submittingRef ? 'Sending Referral...' : 'Send Specialist Referral'}
                  </button>
                </div>
              </form>

              {/* Incoming Referrals */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Incoming Referrals to {activeDoctor.name}
                  </h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {incomingReferrals.length} total
                  </span>
                </div>
                {incomingReferrals.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No incoming referrals assigned to you.</p>
                ) : (
                  incomingReferrals.map((ref) => (
                    <div key={ref.id} className="p-5 space-y-3 text-xs">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{ref.referralCode}</span>
                            <span className="text-slate-400">·</span>
                            <span className="font-semibold text-slate-900">{ref.patientName}</span>
                            <span className="font-mono text-slate-500">({ref.patientMrn})</span>
                            <span className="text-slate-400">·</span>
                            <span className={ref.urgency === 'Emergency' ? 'font-semibold text-rose-700' : 'text-teal-800 font-semibold'}>
                              {ref.urgency}
                            </span>
                          </div>
                          <p className="text-slate-700 font-medium">{ref.reason}</p>
                          <p className="text-slate-600">
                            From {ref.fromDoctorName} ({ref.fromDepartmentName}) — {ref.clinicalSummary}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <span className="font-semibold text-slate-800">{ref.status}</span>
                          {ref.status === 'Pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateReferral(ref.id, 'Accepted')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateReferral(ref.id, 'Declined')}
                                className="px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md cursor-pointer"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {ref.status === 'Accepted' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateReferral(ref.id, 'Completed')}
                              className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md cursor-pointer"
                            >
                              Mark Completed
                            </button>
                          )}
                        </div>
                      </div>

                      {ref.status === 'Pending' && (
                        <input
                          type="text"
                          aria-label={`Response note for ${ref.referralCode}`}
                          value={refNoteDrafts[ref.id] || ''}
                          onChange={(e) =>
                            setRefNoteDrafts((prev) => ({ ...prev, [ref.id]: e.target.value }))
                          }
                          placeholder="Optional triage note upon accepting/declining..."
                          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
                        />
                      )}
                      {ref.doctorNotes && (
                        <p className="text-slate-600 bg-slate-50 px-3 py-2 rounded-md">
                          Response Note: {ref.doctorNotes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Outgoing Referrals */}
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="px-5 py-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Outgoing Referrals Sent</h2>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {outgoingReferrals.length} total
                  </span>
                </div>
                {outgoingReferrals.length === 0 ? (
                  <p className="p-6 text-xs text-slate-500">No outgoing referrals sent yet.</p>
                ) : (
                  outgoingReferrals.map((ref) => (
                    <div key={ref.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">
                          <span className="font-mono">{ref.referralCode}</span> · {ref.patientName} →{' '}
                          {ref.toDoctorName} ({ref.toDepartmentName})
                        </p>
                        <p className="text-slate-600 mt-0.5">{ref.reason}</p>
                      </div>
                      <span className="font-semibold text-teal-800 shrink-0">{ref.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'availability' ? (
            <DoctorAvailabilityPanel
              doctor={activeDoctor}
              onUpdated={(updatedDoc) => {
                setWorkspace((prev) =>
                  prev
                    ? {
                        ...prev,
                        doctor: updatedDoc,
                        doctors: prev.doctors.map((d) =>
                          d.id === updatedDoc.id ? updatedDoc : d
                        ),
                      }
                    : prev
                );
                onRefreshPublic();
              }}
              onNotify={setBanner}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-slate-900">
                    Active Emergency Ambulance Arrivals &amp; Triage Feed
                  </h2>
                </div>
                <span className="text-xs text-slate-500 tabular-nums">
                  {workspace.ambulanceDispatches.length} dispatches logged
                </span>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-3 px-4">Dispatch</th>
                    <th className="py-3 px-4">Patient &amp; Condition</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4">Priority &amp; ETA</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {workspace.ambulanceDispatches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                        No emergency ambulance arrivals active.
                      </td>
                    </tr>
                  ) : (
                    workspace.ambulanceDispatches.map((disp) => (
                      <tr key={disp.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {disp.dispatchCode}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{disp.patientName}</p>
                          <p className="text-slate-600">{disp.clinicalCondition || 'Acute medical transport'}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-mono text-slate-900">{disp.vehicleNumber}</p>
                          <p className="text-slate-500">{disp.unitType}</p>
                        </td>
                        <td className="py-3 px-4 tabular-nums">
                          <p className={disp.priority === 'Critical Emergency' ? 'font-semibold text-rose-700' : 'font-medium text-slate-800'}>
                            {disp.priority}
                          </p>
                          <p className="text-slate-500">ETA {disp.estimatedEtaMinutes} mins</p>
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
          )}
        </main>
      </div>
    </div>
  );
};
