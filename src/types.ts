export type UserRole = 'patient' | 'doctor' | 'staff' | 'admin';

export type PortalType = 'user' | 'doctor' | 'admin';

export type PermissionAction =
  | 'view_doctors'
  | 'book_appointment'
  | 'view_own_appointments'
  | 'view_all_appointments'
  | 'manage_appointments'
  | 'view_patient_phi_masked'
  | 'decrypt_patient_phi'
  | 'edit_clinical_notes'
  | 'create_prescriptions'
  | 'order_labs'
  | 'manage_referrals'
  | 'manage_own_schedule'
  | 'process_payment'
  | 'trigger_reminders'
  | 'manage_users_rbac'
  | 'manage_doctors'
  | 'manage_system_config'
  | 'view_analytics'
  | 'view_audit_logs';

export interface Department {
  id: string;
  name: string;
  code: string;
  floor: string;
  description: string;
  headDoctorId: string;
}

export interface Doctor {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  specialty: string;
  qualifications: string;
  experienceYears: number;
  consultationFee: number;
  languages: string[];
  roomNumber: string;
  bio: string;
  availableDays: number[]; // 0=Sun..6=Sat
  dailySlots: string[];
  blockedDates?: string[]; // YYYY-MM-DD
  telehealthEnabled?: boolean;
  acceptingNewPatients: boolean;
}

export interface PatientRecordView {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'Female' | 'Male' | 'Other';
  bloodGroup: string;
  maskedPhone: string;
  maskedEmail: string;
  maskedNationalId: string;
  maskedInsuranceId: string;
  primaryDepartment: string;
  assignedDoctorId: string;
  assignedDoctorName: string;
  encryptionCipher: string;
  encryptedAt: string;
  lastUpdatedAt: string;
  // Decrypted fields only present when explicitly decrypted via authorized endpoint
  decrypted?: {
    phone: string;
    email: string;
    nationalId: string;
    insuranceId: string;
    allergies: string;
    medicalHistory: string;
    clinicalNotes: string;
    prescriptions: string;
  };
}

export type AppointmentStatus = 'Confirmed' | 'Checked-In' | 'Completed' | 'Cancelled';
export type PaymentStatus = 'Paid' | 'Pending' | 'Refunded';
export type PaymentMethod = 'Card' | 'Insurance Copay' | 'Instant Bank / UPI';

export interface Appointment {
  id: string;
  bookingCode: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  doctorId: string;
  doctorName: string;
  departmentId: string;
  departmentName: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "09:30"
  visitType: 'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video';
  reasonSummary: string;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  amountPaid: number;
  invoiceId?: string;
  reminderStatus: 'Scheduled' | 'Sent' | 'Opted-Out';
  reminderSentAt?: string;
  createdAt: string;
}

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  appointmentId: string;
  bookingCode: string;
  patientName: string;
  doctorName: string;
  departmentName: string;
  subtotal: number;
  insuranceDiscount: number;
  platformFee: number;
  totalAmount: number;
  method: PaymentMethod;
  lastFourOrRef: string;
  status: PaymentStatus;
  paidAt: string;
}

export interface EmailReminder {
  id: string;
  appointmentId: string;
  bookingCode: string;
  recipientName: string;
  maskedRecipientEmail: string;
  doctorName: string;
  departmentName: string;
  visitDate: string;
  visitTime: string;
  subject: string;
  bodyPreview: string;
  channel: 'Automated Scheduler' | 'Manual Staff Trigger';
  status: 'Queued' | 'Sent';
  scheduledFor: string;
  sentAt?: string;
}

export interface UserAccountView {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  doctorId?: string;
  mfaEnabled: boolean;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorEmail: string;
  actorRole: UserRole | 'anonymous' | 'system';
  portal: PortalType | 'public' | 'system';
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'ALLOWED' | 'DENIED';
  details: string;
}

export interface SystemConfig {
  hospitalName: string;
  hipaaEncryptionAlgorithm: string;
  encryptionKeyFingerprint: string;
  enforceMfaForAllPortals: boolean;
  sessionTimeoutMinutes: number;
  reminderLeadHours: number;
  autoReminderEnabled: boolean;
  smtpHost: string;
  smtpSenderEmail: string;
  defaultInsuranceCoveragePct: number;
  platformProcessingFee: number;
  currencySymbol: string;
  updatedAt: string;
  updatedBy: string;
}

export interface HospitalAnalytics {
  totalAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  totalRevenue: number;
  pendingBalance: number;
  totalPatients: number;
  activeDoctors: number;
  remindersSent: number;
  remindersQueued: number;
  phiDecryptEvents: number;
  byDepartment: Array<{
    departmentId: string;
    departmentName: string;
    appointments: number;
    revenue: number;
    doctorsCount: number;
  }>;
  byPaymentMethod: Array<{
    method: PaymentMethod;
    count: number;
    revenue: number;
  }>;
  dailyVolume: Array<{
    date: string;
    appointments: number;
    revenue: number;
  }>;
}

export type AmbulanceUnitType =
  | 'Basic Life Support (BLS)'
  | 'Advanced Cardiac Life Support (ACLS)'
  | 'Neonatal & Pediatric ICU';

export type AmbulanceUnitStatus = 'Available' | 'Dispatched' | 'Maintenance';

export type AmbulanceDispatchStatus =
  | 'Dispatched'
  | 'En Route'
  | 'Arrived at Pickup'
  | 'In Transit to Hospital'
  | 'Completed'
  | 'Cancelled';

export type AmbulancePriority =
  | 'Critical Emergency'
  | 'Urgent Transfer'
  | 'Scheduled Patient Transport';

export interface AmbulanceUnit {
  id: string;
  vehicleNumber: string;
  unitName: string;
  unitType: AmbulanceUnitType;
  driverName: string;
  paramedicName: string;
  contactPhone: string;
  baseLocation: string;
  equipment: string[];
  baseFeeInr: number;
  perKmFeeInr: number;
  status: AmbulanceUnitStatus;
}

export interface AmbulanceDispatch {
  id: string;
  dispatchCode: string;
  unitId: string;
  vehicleNumber: string;
  unitType: AmbulanceUnitType;
  driverName: string;
  driverPhone: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  pickupAddress: string;
  landmark: string;
  priority: AmbulancePriority;
  clinicalCondition: string;
  distanceKm: number;
  estimatedEtaMinutes: number;
  estimatedFareInr: number;
  status: AmbulanceDispatchStatus;
  requestedAt: string;
  updatedAt: string;
}

export interface VitalSigns {
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRateBpm?: number;
  temperatureC?: number;
  spo2Pct?: number;
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
}

export interface ClinicalEncounter {
  id: string;
  encounterCode: string;
  appointmentId?: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  visitDate: string;
  visitType: 'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video';
  vitals: VitalSigns;
  subjective: string;
  objective: string;
  assessment: string;
  icdCode?: string;
  plan: string;
  followUpDays?: number;
  createdAt: string;
}

export interface PrescriptionItem {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface DigitalPrescription {
  id: string;
  rxCode: string;
  encounterId?: string;
  appointmentId?: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  diagnosis: string;
  items: PrescriptionItem[];
  allergyWarning?: string;
  notes?: string;
  status: 'Active' | 'Completed' | 'Discontinued';
  issuedAt: string;
}

export type LabOrderStatus = 'Ordered' | 'Sample Collected' | 'Results Ready' | 'Reviewed';

export type LabCategory =
  | 'Hematology'
  | 'Biochemistry'
  | 'Cardiac Diagnostics'
  | 'Neuro Diagnostics'
  | 'Radiology';

export interface LabOrder {
  id: string;
  orderCode: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  testName: string;
  category: LabCategory;
  priority: 'Routine' | 'Urgent / STAT';
  clinicalIndication: string;
  status: LabOrderStatus;
  resultSummary?: string;
  resultFlag?: 'Normal' | 'Borderline' | 'Critical';
  orderedAt: string;
  updatedAt: string;
}

export type ReferralStatus = 'Pending' | 'Accepted' | 'Scheduled' | 'Completed' | 'Declined';

export interface SpecialistReferral {
  id: string;
  referralCode: string;
  patientId: string;
  patientName: string;
  patientMrn: string;
  fromDoctorId: string;
  fromDoctorName: string;
  fromDepartmentName: string;
  toDoctorId: string;
  toDoctorName: string;
  toDepartmentName: string;
  urgency: 'Routine' | 'Urgent' | 'Emergency';
  reason: string;
  clinicalSummary: string;
  status: ReferralStatus;
  doctorNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorDashboardMetrics {
  todayAppointments: number;
  waitingCheckedIn: number;
  upcomingConfirmed: number;
  completedConsultations: number;
  assignedPatientsCount: number;
  activePrescriptionsCount: number;
  pendingLabReviewsCount: number;
  incomingReferralsCount: number;
  consultationEarnings: number;
}

export interface AdminDatabaseSnapshot {
  storageMeta: {
    firestoreProjectId: string;
    firestoreDatabaseId: string;
    serverStorePath: string;
  };
  collections: {
    appointments: Appointment[];
    patients: PatientRecordView[];
    payments: PaymentTransaction[];
    reminders: EmailReminder[];
    users: UserAccountView[];
    doctors: Doctor[];
    departments: Department[];
    ambulances: AmbulanceUnit[];
    ambulanceDispatches: AmbulanceDispatch[];
    encounters: ClinicalEncounter[];
    prescriptions: DigitalPrescription[];
    labOrders: LabOrder[];
    referrals: SpecialistReferral[];
  };
}



