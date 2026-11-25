import type {
  AmbulancePriority,
  AmbulanceUnit,
  AmbulanceUnitType,
  Appointment,
  AuditLogEntry,
  DigitalPrescription,
  Doctor,
  DoctorDashboardMetrics,
  EmailReminder,
  HospitalAnalytics,
  LabOrder,
  PaymentMethod,
  PaymentTransaction,
  PermissionAction,
  PrescriptionItem,
  SpecialistReferral,
  UserRole,
} from '../types';

const ROLE_PERMISSIONS: Record<UserRole, Set<PermissionAction>> = {
  patient: new Set([
    'view_doctors',
    'book_appointment',
    'view_own_appointments',
    'view_patient_phi_masked',
    'process_payment',
  ]),
  doctor: new Set([
    'view_doctors',
    'book_appointment',
    'view_own_appointments',
    'view_all_appointments',
    'manage_appointments',
    'view_patient_phi_masked',
    'decrypt_patient_phi',
    'edit_clinical_notes',
    'create_prescriptions',
    'order_labs',
    'manage_referrals',
    'manage_own_schedule',
    'trigger_reminders',
  ]),
  staff: new Set([
    'view_doctors',
    'book_appointment',
    'view_all_appointments',
    'manage_appointments',
    'view_patient_phi_masked',
    'process_payment',
    'trigger_reminders',
  ]),
  admin: new Set([
    'view_doctors',
    'book_appointment',
    'view_own_appointments',
    'view_all_appointments',
    'manage_appointments',
    'view_patient_phi_masked',
    'decrypt_patient_phi',
    'edit_clinical_notes',
    'create_prescriptions',
    'order_labs',
    'manage_referrals',
    'manage_own_schedule',
    'process_payment',
    'trigger_reminders',
    'manage_users_rbac',
    'manage_doctors',
    'manage_system_config',
    'view_analytics',
    'view_audit_logs',
  ]),
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export function getRolePermissionsList(role: UserRole): PermissionAction[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}

export function getAvailableSlots(
  doctor: Doctor,
  dateStr: string,
  existingAppointments: Appointment[],
  nowDate: Date = new Date()
): string[] {
  if (!doctor.acceptingNewPatients) return [];
  if (Array.isArray(doctor.blockedDates) && doctor.blockedDates.includes(dateStr)) {
    return [];
  }
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return [];

  const dayOfWeek = parsed.getDay();
  if (!doctor.availableDays.includes(dayOfWeek)) {
    return [];
  }

  const bookedSlots = new Set(
    existingAppointments
      .filter(
        (appt) =>
          appt.doctorId === doctor.id &&
          appt.date === dateStr &&
          appt.status !== 'Cancelled'
      )
      .map((appt) => appt.timeSlot)
  );

  const todayIso = nowDate.toISOString().slice(0, 10);
  const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

  return doctor.dailySlots.filter((slot) => {
    if (bookedSlots.has(slot)) return false;
    if (dateStr === todayIso) {
      const [h, m] = slot.split(':').map(Number);
      if (h * 60 + m <= currentMinutes + 15) return false;
    }
    return true;
  });
}

export interface BillingCalculation {
  subtotal: number;
  insuranceDiscount: number;
  platformFee: number;
  totalAmount: number;
}

export function calculateBillingTotals(
  consultationFee: number,
  paymentMethod: PaymentMethod,
  insuranceCoveragePct: number,
  platformFee: number
): BillingCalculation {
  const safeFee = Math.max(0, Number(consultationFee) || 0);
  const safeCoverage = Math.min(90, Math.max(0, Number(insuranceCoveragePct) || 0));
  const safePlatformFee = Math.max(0, Number(platformFee) || 0);

  const insuranceDiscount =
    paymentMethod === 'Insurance Copay'
      ? Math.round(safeFee * (safeCoverage / 100) * 100) / 100
      : 0;

  const netConsultation = Math.max(0, safeFee - insuranceDiscount);
  const totalAmount = Math.round((netConsultation + safePlatformFee) * 100) / 100;

  return {
    subtotal: Math.round(safeFee * 100) / 100,
    insuranceDiscount,
    platformFee: Math.round(safePlatformFee * 100) / 100,
    totalAmount,
  };
}

export function findAppointmentsDueForReminder(
  appointments: Appointment[],
  now: Date,
  leadHours: number
): Appointment[] {
  const leadMs = Math.max(1, leadHours) * 60 * 60 * 1000;
  const nowMs = now.getTime();

  return appointments.filter((appt) => {
    if (appt.status === 'Cancelled' || appt.status === 'Completed') return false;
    if (appt.reminderStatus !== 'Scheduled') return false;

    const visitTs = new Date(`${appt.date}T${appt.timeSlot}:00`).getTime();
    if (Number.isNaN(visitTs)) return false;

    const diff = visitTs - nowMs;
    return diff > -60 * 60 * 1000 && diff <= leadMs;
  });
}

export function maskEmailAddress(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const [local, domain] = parts;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\s+/g, '');
  if (digits.length <= 4) return '••••';
  return `${digits.slice(0, 3)} ••••• ${digits.slice(-4)}`;
}

export function maskIdentifier(idVal: string): string {
  const trimmed = idVal.trim();
  if (trimmed.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

export function computeHospitalAnalytics(
  appointments: Appointment[],
  doctors: Doctor[],
  payments: PaymentTransaction[],
  reminders: EmailReminder[],
  patientsCount: number,
  auditLogs: AuditLogEntry[]
): HospitalAnalytics {
  const confirmedAppointments = appointments.filter((a) => a.status === 'Confirmed' || a.status === 'Checked-In').length;
  const completedAppointments = appointments.filter((a) => a.status === 'Completed').length;
  const cancelledAppointments = appointments.filter((a) => a.status === 'Cancelled').length;

  const paidTx = payments.filter((p) => p.status === 'Paid');
  const totalRevenue = Math.round(paidTx.reduce((sum, p) => sum + p.totalAmount, 0) * 100) / 100;
  const pendingBalance = Math.round(
    appointments
      .filter((a) => a.paymentStatus === 'Pending' && a.status !== 'Cancelled')
      .reduce((sum, a) => {
        const doc = doctors.find((d) => d.id === a.doctorId);
        return sum + (doc ? doc.consultationFee : 0);
      }, 0) * 100
  ) / 100;

  const deptMap = new Map<string, { departmentId: string; departmentName: string; appointments: number; revenue: number; doctorsCount: number }>();
  for (const doc of doctors) {
    const existing = deptMap.get(doc.departmentId) ?? {
      departmentId: doc.departmentId,
      departmentName: doc.departmentName,
      appointments: 0,
      revenue: 0,
      doctorsCount: 0,
    };
    existing.doctorsCount += 1;
    deptMap.set(doc.departmentId, existing);
  }

  for (const appt of appointments) {
    const entry = deptMap.get(appt.departmentId) ?? {
      departmentId: appt.departmentId,
      departmentName: appt.departmentName,
      appointments: 0,
      revenue: 0,
      doctorsCount: 0,
    };
    if (appt.status !== 'Cancelled') {
      entry.appointments += 1;
    }
    if (appt.paymentStatus === 'Paid') {
      entry.revenue = Math.round((entry.revenue + appt.amountPaid) * 100) / 100;
    }
    deptMap.set(appt.departmentId, entry);
  }

  const methods: PaymentMethod[] = ['Card', 'Insurance Copay', 'Instant Bank / UPI'];
  const byPaymentMethod = methods.map((method) => {
    const matching = paidTx.filter((p) => p.method === method);
    return {
      method,
      count: matching.length,
      revenue: Math.round(matching.reduce((sum, p) => sum + p.totalAmount, 0) * 100) / 100,
    };
  });

  const dailyMap = new Map<string, { date: string; appointments: number; revenue: number }>();
  for (const appt of appointments) {
    if (appt.status === 'Cancelled') continue;
    const row = dailyMap.get(appt.date) ?? { date: appt.date, appointments: 0, revenue: 0 };
    row.appointments += 1;
    if (appt.paymentStatus === 'Paid') {
      row.revenue = Math.round((row.revenue + appt.amountPaid) * 100) / 100;
    }
    dailyMap.set(appt.date, row);
  }

  const dailyVolume = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalAppointments: appointments.length,
    confirmedAppointments,
    completedAppointments,
    cancelledAppointments,
    totalRevenue,
    pendingBalance,
    totalPatients: patientsCount,
    activeDoctors: doctors.filter((d) => d.acceptingNewPatients).length,
    remindersSent: reminders.filter((r) => r.status === 'Sent').length,
    remindersQueued: reminders.filter((r) => r.status === 'Queued').length,
    phiDecryptEvents: auditLogs.filter((l) => l.action === 'PHI_DECRYPTED').length,
    byDepartment: Array.from(deptMap.values()).sort((a, b) => b.appointments - a.appointments),
    byPaymentMethod,
    dailyVolume,
  };
}

export function formatCurrency(
  amount: number,
  currencySymbol: string = '₹',
  decimals: number = 0
): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeAmount);
  return `${currencySymbol}${formatted}`;
}

export interface AmbulanceFareCalculation {
  baseFee: number;
  distanceCharge: number;
  totalFare: number;
  estimatedEtaMinutes: number;
}

const DEFAULT_AMBULANCE_RATES: Record<AmbulanceUnitType, { baseFee: number; perKmFee: number }> = {
  'Basic Life Support (BLS)': { baseFee: 1200, perKmFee: 45 },
  'Advanced Cardiac Life Support (ACLS)': { baseFee: 2400, perKmFee: 75 },
  'Neonatal & Pediatric ICU': { baseFee: 2800, perKmFee: 85 },
};

export function calculateAmbulanceDispatchMetrics(
  unitType: AmbulanceUnitType,
  distanceKm: number,
  priority: AmbulancePriority,
  customBaseFee?: number,
  customPerKmFee?: number
): AmbulanceFareCalculation {
  const defaults = DEFAULT_AMBULANCE_RATES[unitType];
  const baseFee = Math.max(0, Number.isFinite(customBaseFee) ? Number(customBaseFee) : defaults.baseFee);
  const perKmFee = Math.max(0, Number.isFinite(customPerKmFee) ? Number(customPerKmFee) : defaults.perKmFee);
  const clampedKm = Math.min(120, Math.max(1, Number(distanceKm) || 5));
  const billableExtraKm = Math.max(0, clampedKm - 5);
  const distanceCharge = Math.round(billableExtraKm * perKmFee);
  const totalFare = Math.round(baseFee + distanceCharge);

  const speedKmPerMin =
    priority === 'Critical Emergency' ? 0.65 : priority === 'Urgent Transfer' ? 0.5 : 0.4;
  const dispatchPrepMins = priority === 'Critical Emergency' ? 3 : 6;
  const estimatedEtaMinutes = Math.max(5, Math.round(dispatchPrepMins + clampedKm / speedKmPerMin));

  return {
    baseFee,
    distanceCharge,
    totalFare,
    estimatedEtaMinutes,
  };
}

export function selectBestAmbulanceUnit(
  fleet: AmbulanceUnit[],
  requestedType?: AmbulanceUnitType
): AmbulanceUnit | null {
  const available = fleet.filter((u) => u.status === 'Available');
  if (available.length === 0) return null;
  if (requestedType) {
    const exact = available.find((u) => u.unitType === requestedType);
    if (exact) return exact;
  }
  return available[0];
}

export function calculateBmi(weightKg?: number, heightCm?: number): number | undefined {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) return undefined;
  const meters = heightCm / 100;
  if (meters <= 0) return undefined;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

const ALLERGY_DRUG_GROUPS: Array<{ allergyKeywords: string[]; drugKeywords: string[]; label: string }> = [
  {
    allergyKeywords: ['penicillin', 'amoxicillin', 'ampicillin', 'beta-lactam'],
    drugKeywords: ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'piperacillin', 'clavulanate'],
    label: 'Penicillin / Beta-lactam sensitivity',
  },
  {
    allergyKeywords: ['sulfa', 'sulfonamide', 'bactrim', 'sulfamethoxazole'],
    drugKeywords: ['sulfa', 'sulfamethoxazole', 'trimethoprim', 'bactrim', 'celecoxib', 'furosemide'],
    label: 'Sulfonamide cross-sensitivity',
  },
  {
    allergyKeywords: ['nsaid', 'aspirin', 'ibuprofen', 'naproxen', 'diclofenac'],
    drugKeywords: ['aspirin', 'ibuprofen', 'naproxen', 'diclofenac', 'ketorolac', 'aceclofenac'],
    label: 'NSAID / Salicylate sensitivity',
  },
  {
    allergyKeywords: ['cephalosporin', 'ceftriaxone', 'cefixime'],
    drugKeywords: ['ceftriaxone', 'cefixime', 'cephalexin', 'cefuroxime', 'cefpodoxime'],
    label: 'Cephalosporin sensitivity',
  },
];

export function checkMedicationAllergyConflict(
  medications: string[],
  allergyText: string
): string[] {
  const normalizedAllergy = (allergyText || '').trim().toLowerCase();
  if (
    !normalizedAllergy ||
    normalizedAllergy.includes('no known drug allergies') ||
    normalizedAllergy === 'none' ||
    normalizedAllergy === 'nkda'
  ) {
    return [];
  }

  const warnings: string[] = [];
  for (const medRaw of medications) {
    const med = medRaw.trim().toLowerCase();
    if (!med) continue;

    for (const group of ALLERGY_DRUG_GROUPS) {
      const hasAllergyMatch = group.allergyKeywords.some((kw) => normalizedAllergy.includes(kw));
      const hasDrugMatch = group.drugKeywords.some((kw) => med.includes(kw));
      if (hasAllergyMatch && hasDrugMatch) {
        warnings.push(`${medRaw.trim()} may conflict with documented ${group.label}.`);
      }
    }

    // Direct token match against allergy text
    const medBase = med.split(/\s+/)[0];
    if (medBase && medBase.length >= 4 && normalizedAllergy.includes(medBase)) {
      const msg = `${medRaw.trim()} directly matches documented allergy (${allergyText.trim()}).`;
      if (!warnings.includes(msg)) {
        warnings.push(msg);
      }
    }
  }
  return warnings;
}

export function formatPrescriptionSummary(items: PrescriptionItem[]): string {
  if (items.length === 0) return 'None';
  return items
    .map((item) => {
      const parts = [item.medication.trim(), item.dosage.trim(), item.frequency.trim(), item.duration.trim()].filter(
        Boolean
      );
      return parts.join(' ');
    })
    .join(' · ');
}

export function computeDoctorDashboardMetrics(input: {
  doctorId: string;
  todayIso: string;
  appointments: Appointment[];
  assignedPatientsCount: number;
  prescriptions: DigitalPrescription[];
  labOrders: LabOrder[];
  referrals: SpecialistReferral[];
}): DoctorDashboardMetrics {
  const docAppts = input.appointments.filter((a) => a.doctorId === input.doctorId);
  const todayAppointments = docAppts.filter(
    (a) => a.date === input.todayIso && a.status !== 'Cancelled'
  ).length;
  const waitingCheckedIn = docAppts.filter((a) => a.status === 'Checked-In').length;
  const upcomingConfirmed = docAppts.filter((a) => a.status === 'Confirmed').length;
  const completedConsultations = docAppts.filter((a) => a.status === 'Completed').length;
  const consultationEarnings =
    Math.round(
      docAppts
        .filter((a) => a.paymentStatus === 'Paid')
        .reduce((sum, a) => sum + (a.amountPaid || 0), 0) * 100
    ) / 100;

  const activePrescriptionsCount = input.prescriptions.filter(
    (rx) => rx.doctorId === input.doctorId && rx.status === 'Active'
  ).length;

  const pendingLabReviewsCount = input.labOrders.filter(
    (lab) =>
      lab.doctorId === input.doctorId &&
      (lab.status === 'Ordered' || lab.status === 'Sample Collected' || lab.status === 'Results Ready')
  ).length;

  const incomingReferralsCount = input.referrals.filter(
    (ref) => ref.toDoctorId === input.doctorId && ref.status === 'Pending'
  ).length;

  return {
    todayAppointments,
    waitingCheckedIn,
    upcomingConfirmed,
    completedConsultations,
    assignedPatientsCount: input.assignedPatientsCount,
    activePrescriptionsCount,
    pendingLabReviewsCount,
    incomingReferralsCount,
    consultationEarnings,
  };
}



