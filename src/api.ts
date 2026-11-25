import type {
  AdminDatabaseSnapshot,
  AmbulanceDispatch,
  AmbulanceDispatchStatus,
  AmbulancePriority,
  AmbulanceUnit,
  AmbulanceUnitStatus,
  AmbulanceUnitType,
  Appointment,
  AppointmentStatus,
  AuditLogEntry,
  ClinicalEncounter,
  Department,
  DigitalPrescription,
  Doctor,
  DoctorDashboardMetrics,
  EmailReminder,
  HospitalAnalytics,
  LabCategory,
  LabOrder,
  LabOrderStatus,
  PatientRecordView,
  PaymentMethod,
  PaymentTransaction,
  PrescriptionItem,
  ReferralStatus,
  SpecialistReferral,
  SystemConfig,
  UserAccountView,
  UserRole,
  VitalSigns,
} from './types';

export interface PublicOverviewResponse {
  departments: Department[];
  doctors: Doctor[];
  bookedSlots: Array<{ doctorId: string; date: string; timeSlot: string }>;
  publicConfig: {
    hospitalName: string;
    currencySymbol: string;
    defaultInsuranceCoveragePct: number;
    platformProcessingFee: number;
    reminderLeadHours: number;
    hipaaEncryptionAlgorithm: string;
  };
}

export interface DoctorWorkspaceResponse {
  doctor: Doctor;
  metrics: DoctorDashboardMetrics;
  appointments: Appointment[];
  patients: PatientRecordView[];
  encounters: ClinicalEncounter[];
  prescriptions: DigitalPrescription[];
  labOrders: LabOrder[];
  referrals: SpecialistReferral[];
  ambulanceDispatches: AmbulanceDispatch[];
  doctors: Doctor[];
  departments: Department[];
}

let authToken: string | null = null;

export function setAuthToken(token: string | null, persistSession: boolean = false): void {
  authToken = token;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (token && persistSession) {
        window.sessionStorage.setItem('medistream_session_token', token);
      } else {
        window.sessionStorage.removeItem('medistream_session_token');
      }
    }
  } catch {
    // Ignore storage access errors
  }
}

export function getAuthToken(): string | null {
  if (authToken) return authToken;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const saved = window.sessionStorage.getItem('medistream_session_token');
      if (saved) {
        authToken = saved;
        return saved;
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return null;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  loginPatientWithGoogle: (idToken: string) =>
    request<{ token: string; user: UserAccountView; patientId?: string }>('/api/auth/patient/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  loginDoctor: (email: string, password: string) =>
    request<{ token: string; user: UserAccountView; doctor: Doctor | null }>('/api/auth/doctor/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  loginAdmin: (email: string, password: string) =>
    request<{ token: string; user: UserAccountView }>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getMe: () => request<{ user: UserAccountView; patientId?: string }>('/api/auth/me'),

  getPublicOverview: () => request<PublicOverviewResponse>('/api/public/overview'),
  getDoctorSlots: (doctorId: string, date: string) =>
    request<{ doctorId: string; date: string; availableSlots: string[] }>(
      `/api/public/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`
    ),
  bookAppointment: (payload: {
    patientName: string;
    patientEmail: string;
    patientPhone: string;
    dateOfBirth: string;
    gender: 'Female' | 'Male' | 'Other';
    doctorId: string;
    date: string;
    timeSlot: string;
    visitType: 'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video';
    reasonSummary: string;
    payNow: boolean;
    paymentMethod: PaymentMethod;
    paymentReference: string;
  }) =>
    request<{
      appointment: Appointment;
      transaction?: PaymentTransaction;
      reminder: EmailReminder;
      encryptionStatus: string;
    }>('/api/public/book', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAppointments: () => request<{ appointments: Appointment[] }>('/api/appointments'),
  updateAppointmentStatus: (id: string, status: AppointmentStatus) =>
    request<{ appointment: Appointment }>(`/api/appointments/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  rescheduleAppointment: (id: string, date: string, timeSlot: string) =>
    request<{ appointment: Appointment }>(`/api/appointments/${encodeURIComponent(id)}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ date, timeSlot }),
    }),

  getPatients: () => request<{ patients: PatientRecordView[] }>('/api/patients'),
  createPatient: (payload: Record<string, string>) =>
    request<{ patient: PatientRecordView }>('/api/patients', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  decryptPatient: (id: string) =>
    request<{ patient: PatientRecordView }>(`/api/patients/${encodeURIComponent(id)}/decrypt`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  updateClinicalNotes: (
    id: string,
    payload: { allergies?: string; medicalHistory?: string; clinicalNotes?: string; prescriptions?: string }
  ) =>
    request<{ patient: PatientRecordView }>(`/api/patients/${encodeURIComponent(id)}/clinical`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Doctor Portal & Cross-Portal Clinical Records
  getDoctorWorkspace: (doctorId?: string) =>
    request<DoctorWorkspaceResponse>(
      doctorId
        ? `/api/doctor/workspace?doctorId=${encodeURIComponent(doctorId)}`
        : '/api/doctor/workspace'
    ),
  getEncounters: () => request<{ encounters: ClinicalEncounter[] }>('/api/encounters'),
  createDoctorEncounter: (payload: {
    patientId: string;
    appointmentId?: string;
    visitType?: 'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video';
    vitals?: VitalSigns;
    subjective: string;
    objective?: string;
    assessment: string;
    icdCode?: string;
    plan: string;
    followUpDays?: number;
    markAppointmentCompleted?: boolean;
  }) =>
    request<{ encounter: ClinicalEncounter; patient: PatientRecordView; appointment?: Appointment }>(
      '/api/doctor/encounters',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  getPrescriptions: () => request<{ prescriptions: DigitalPrescription[] }>('/api/prescriptions'),
  createDoctorPrescription: (payload: {
    patientId: string;
    appointmentId?: string;
    encounterId?: string;
    diagnosis: string;
    items: PrescriptionItem[];
    notes?: string;
  }) =>
    request<{
      prescription: DigitalPrescription;
      allergyWarnings: string[];
      patient: PatientRecordView;
    }>('/api/doctor/prescriptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePrescriptionStatus: (id: string, status: 'Active' | 'Completed' | 'Discontinued') =>
    request<{ prescription: DigitalPrescription }>(
      `/api/doctor/prescriptions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),
  getLabOrders: () => request<{ labOrders: LabOrder[] }>('/api/lab-orders'),
  createDoctorLabOrder: (payload: {
    patientId: string;
    testName: string;
    category: LabCategory;
    priority: 'Routine' | 'Urgent / STAT';
    clinicalIndication: string;
  }) =>
    request<{ labOrder: LabOrder }>('/api/doctor/lab-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateDoctorLabOrder: (
    id: string,
    payload: {
      status?: LabOrderStatus;
      resultSummary?: string;
      resultFlag?: 'Normal' | 'Borderline' | 'Critical';
    }
  ) =>
    request<{ labOrder: LabOrder }>(`/api/doctor/lab-orders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getReferrals: () => request<{ referrals: SpecialistReferral[] }>('/api/referrals'),
  createDoctorReferral: (payload: {
    patientId: string;
    toDoctorId: string;
    urgency: 'Routine' | 'Urgent' | 'Emergency';
    reason: string;
    clinicalSummary?: string;
  }) =>
    request<{ referral: SpecialistReferral }>('/api/doctor/referrals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateDoctorReferral: (id: string, payload: { status?: ReferralStatus; doctorNotes?: string }) =>
    request<{ referral: SpecialistReferral }>(`/api/doctor/referrals/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateDoctorAvailability: (
    payload: Partial<Doctor> & { doctorId?: string }
  ) =>
    request<{ doctor: Doctor }>('/api/doctor/availability', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getPayments: () => request<{ payments: PaymentTransaction[] }>('/api/payments'),
  settlePayment: (appointmentId: string, method: PaymentMethod, reference: string) =>
    request<{ appointment: Appointment; transaction: PaymentTransaction }>('/api/payments/settle', {
      method: 'POST',
      body: JSON.stringify({ appointmentId, method, reference }),
    }),

  getReminders: () => request<{ reminders: EmailReminder[] }>('/api/reminders'),
  dispatchReminders: (appointmentId?: string) =>
    request<{ dispatchedCount: number; reminders: EmailReminder[] }>('/api/reminders/dispatch', {
      method: 'POST',
      body: JSON.stringify(appointmentId ? { appointmentId } : {}),
    }),

  getAdminAnalytics: () => request<{ analytics: HospitalAnalytics }>('/api/admin/analytics'),
  getAdminUsers: () => request<{ users: UserAccountView[] }>('/api/admin/users'),
  createAdminUser: (payload: {
    name: string;
    email: string;
    role: UserRole;
    departmentId?: string;
    doctorId?: string;
  }) =>
    request<{ user: UserAccountView }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminUser: (
    id: string,
    payload: { role?: UserRole; active?: boolean; doctorId?: string }
  ) =>
    request<{ user: UserAccountView }>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createAdminDoctor: (payload: {
    name: string;
    departmentId: string;
    specialty: string;
    qualifications?: string;
    experienceYears?: number;
    consultationFee: number;
    languages?: string[];
    roomNumber?: string;
    bio?: string;
    email?: string;
  }) =>
    request<{ doctor: Doctor; user?: UserAccountView }>('/api/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateAdminDoctor: (
    id: string,
    payload: { consultationFee?: number; acceptingNewPatients?: boolean; roomNumber?: string }
  ) =>
    request<{ doctor: Doctor }>(`/api/admin/doctors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getAdminConfig: () => request<{ config: SystemConfig }>('/api/admin/config'),
  updateAdminConfig: (payload: Partial<SystemConfig>) =>
    request<{ config: SystemConfig }>('/api/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  getAdminAuditLogs: () => request<{ auditLogs: AuditLogEntry[] }>('/api/admin/audit-logs'),
  getAdminDatabase: () => request<AdminDatabaseSnapshot>('/api/admin/database'),

  getPublicAmbulances: () =>
    request<{ units: AmbulanceUnit[]; availableCount: number; currencySymbol: string }>(
      '/api/public/ambulances'
    ),
  trackAmbulanceDispatch: (code: string) =>
    request<{ dispatch: AmbulanceDispatch }>(
      `/api/public/ambulances/track?code=${encodeURIComponent(code)}`
    ),
  requestAmbulanceDispatch: (payload: {
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    pickupAddress: string;
    landmark?: string;
    unitType?: AmbulanceUnitType;
    unitId?: string;
    priority: AmbulancePriority;
    clinicalCondition?: string;
    distanceKm: number;
  }) =>
    request<{
      dispatch: AmbulanceDispatch;
      unit: AmbulanceUnit;
      calculation: {
        baseFee: number;
        distanceCharge: number;
        totalFare: number;
        estimatedEtaMinutes: number;
      };
    }>('/api/public/ambulances/dispatch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAmbulanceDispatches: () =>
    request<{ dispatches: AmbulanceDispatch[]; units: AmbulanceUnit[] }>(
      '/api/ambulances/dispatches'
    ),
  updateAdminAmbulanceUnitStatus: (id: string, status: AmbulanceUnitStatus) =>
    request<{ unit: AmbulanceUnit }>(
      `/api/admin/ambulances/units/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),
  updateAdminAmbulanceDispatchStatus: (id: string, status: AmbulanceDispatchStatus) =>
    request<{ dispatch: AmbulanceDispatch; units: AmbulanceUnit[] }>(
      `/api/admin/ambulances/dispatches/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),
  sendChatMessage: (
    message: string,
    history: Array<{ role: 'user' | 'model'; text: string }>
  ) =>
    request<{ reply: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),
};
