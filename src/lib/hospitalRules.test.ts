import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAmbulanceDispatchMetrics,
  calculateBillingTotals,
  calculateBmi,
  checkMedicationAllergyConflict,
  computeDoctorDashboardMetrics,
  computeHospitalAnalytics,
  findAppointmentsDueForReminder,
  formatCurrency,
  formatPrescriptionSummary,
  getAvailableSlots,
  hasPermission,
  maskEmailAddress,
  maskIdentifier,
  maskPhoneNumber,
  selectBestAmbulanceUnit,
} from './hospitalRules.ts';
import type {
  AmbulanceUnit,
  Appointment,
  DigitalPrescription,
  Doctor,
  EmailReminder,
  LabOrder,
  PaymentTransaction,
  SpecialistReferral,
} from '../types.ts';

const sampleDoctor: Doctor = {
  id: 'doc-1',
  name: 'Dr. Arvind Subramanian',
  departmentId: 'dept-cardiology',
  departmentName: 'Cardiology',
  specialty: 'Interventional Cardiology',
  qualifications: 'MD, DM',
  experienceYears: 16,
  consultationFee: 145,
  languages: ['English', 'Tamil'],
  roomNumber: '204',
  bio: 'Senior cardiologist.',
  availableDays: [1, 2, 3, 4, 5, 6],
  dailySlots: ['09:00', '10:00', '11:00', '14:00'],
  acceptingNewPatients: true,
};

test('RBAC enforces strict separation between patient, staff, doctor, and admin', () => {
  assert.equal(hasPermission('patient', 'book_appointment'), true);
  assert.equal(hasPermission('patient', 'decrypt_patient_phi'), false);
  assert.equal(hasPermission('patient', 'manage_system_config'), false);

  assert.equal(hasPermission('staff', 'manage_appointments'), true);
  assert.equal(hasPermission('staff', 'decrypt_patient_phi'), false);
  assert.equal(hasPermission('staff', 'manage_users_rbac'), false);

  assert.equal(hasPermission('doctor', 'decrypt_patient_phi'), true);
  assert.equal(hasPermission('doctor', 'edit_clinical_notes'), true);
  assert.equal(hasPermission('doctor', 'manage_system_config'), false);

  assert.equal(hasPermission('admin', 'manage_system_config'), true);
  assert.equal(hasPermission('admin', 'manage_users_rbac'), true);
  assert.equal(hasPermission('admin', 'view_analytics'), true);
});

test('getAvailableSlots filters out booked and cancelled-safe slots accurately', () => {
  const appointments: Appointment[] = [
    {
      id: 'apt-1',
      bookingCode: 'MS-1001',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientEmail: 'ananya@example.com',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-16', // Monday (day 1)
      timeSlot: '10:00',
      visitType: 'In-Person Consultation',
      reasonSummary: 'Annual cardiac check',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      amountPaid: 150,
      reminderStatus: 'Scheduled',
      createdAt: '2026-11-14T10:00:00Z',
    },
    {
      id: 'apt-2',
      bookingCode: 'MS-1002',
      patientId: 'pat-2',
      patientName: 'Vikram Rao',
      patientEmail: 'vikram@example.com',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-16',
      timeSlot: '11:00',
      visitType: 'Follow-Up Review',
      reasonSummary: 'BP follow up',
      status: 'Cancelled',
      paymentStatus: 'Refunded',
      amountPaid: 0,
      reminderStatus: 'Opted-Out',
      createdAt: '2026-11-14T10:00:00Z',
    },
  ];

  const slots = getAvailableSlots(sampleDoctor, '2026-11-16', appointments, new Date('2026-11-14T08:00:00Z'));
  assert.deepEqual(slots, ['09:00', '11:00', '14:00']);

  // Sunday (day 0) not in sampleDoctor.availableDays
  const sundaySlots = getAvailableSlots(sampleDoctor, '2026-11-15', appointments, new Date('2026-11-14T08:00:00Z'));
  assert.deepEqual(sundaySlots, []);
});

test('calculateBillingTotals computes insurance copay discounts and platform fee cleanly', () => {
  const cardTotal = calculateBillingTotals(145, 'Card', 60, 5);
  assert.equal(cardTotal.subtotal, 145);
  assert.equal(cardTotal.insuranceDiscount, 0);
  assert.equal(cardTotal.platformFee, 5);
  assert.equal(cardTotal.totalAmount, 150);

  const copayTotal = calculateBillingTotals(100, 'Insurance Copay', 70, 5);
  assert.equal(copayTotal.insuranceDiscount, 70);
  assert.equal(copayTotal.totalAmount, 35);
});

test('findAppointmentsDueForReminder identifies upcoming scheduled visits within lead window', () => {
  const now = new Date('2026-11-15T10:00:00');
  const appointments: Appointment[] = [
    {
      id: 'a1',
      bookingCode: 'MS-1',
      patientId: 'p1',
      patientName: 'Test One',
      patientEmail: 'a@b.com',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-16',
      timeSlot: '09:00', // 23 hours away
      visitType: 'In-Person Consultation',
      reasonSummary: 'Checkup',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      amountPaid: 150,
      reminderStatus: 'Scheduled',
      createdAt: '2026-11-14T00:00:00Z',
    },
    {
      id: 'a2',
      bookingCode: 'MS-2',
      patientId: 'p2',
      patientName: 'Test Two',
      patientEmail: 'c@d.com',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-20',
      timeSlot: '09:00', // 5 days away
      visitType: 'In-Person Consultation',
      reasonSummary: 'Checkup',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      amountPaid: 150,
      reminderStatus: 'Scheduled',
      createdAt: '2026-11-14T00:00:00Z',
    },
  ];

  const due = findAppointmentsDueForReminder(appointments, now, 24);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, 'a1');
});

test('PHI masking functions obscure sensitive identifiers while keeping last chars', () => {
  assert.equal(maskEmailAddress('ananya.iyer@medistream.org'), 'an*********@medistream.org');
  assert.equal(maskPhoneNumber('+91 98401 44821'), '+91 ••••• 4821');
  assert.equal(maskIdentifier('SSN-892-44-4821'), '•••••••••••4821');
});

test('computeHospitalAnalytics aggregates department revenue and status counts', () => {
  const appts: Appointment[] = [
    {
      id: 'a1',
      bookingCode: 'MS-1',
      patientId: 'p1',
      patientName: 'Ananya',
      patientEmail: 'a@b.com',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-15',
      timeSlot: '09:00',
      visitType: 'In-Person Consultation',
      reasonSummary: 'Consult',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      amountPaid: 150,
      reminderStatus: 'Sent',
      createdAt: '2026-11-14T00:00:00Z',
    },
  ];
  const payments: PaymentTransaction[] = [
    {
      id: 'pay-1',
      invoiceId: 'INV-1',
      appointmentId: 'a1',
      bookingCode: 'MS-1',
      patientName: 'Ananya',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      subtotal: 145,
      insuranceDiscount: 0,
      platformFee: 5,
      totalAmount: 150,
      method: 'Card',
      lastFourOrRef: '4242',
      status: 'Paid',
      paidAt: '2026-11-14T10:00:00Z',
    },
  ];
  const reminders: EmailReminder[] = [
    {
      id: 'rem-1',
      appointmentId: 'a1',
      bookingCode: 'MS-1',
      recipientName: 'Ananya',
      maskedRecipientEmail: 'an**@b.com',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      visitDate: '2026-11-15',
      visitTime: '09:00',
      subject: 'Reminder',
      bodyPreview: 'Visit tomorrow',
      channel: 'Automated Scheduler',
      status: 'Sent',
      scheduledFor: '2026-11-14T09:00:00Z',
      sentAt: '2026-11-14T09:00:00Z',
    },
  ];

  const analytics = computeHospitalAnalytics(appts, [sampleDoctor], payments, reminders, 5, []);
  assert.equal(analytics.totalRevenue, 150);
  assert.equal(analytics.confirmedAppointments, 1);
  assert.equal(analytics.remindersSent, 1);
  assert.equal(analytics.byDepartment[0].revenue, 150);
});

test('formatCurrency formats Indian Rupees with en-IN grouping', () => {
  assert.equal(formatCurrency(1200, '₹', 0), '₹1,200');
  assert.equal(formatCurrency(1250, '₹', 2), '₹1,250.00');
  assert.equal(formatCurrency(145000, '₹', 2), '₹1,45,000.00');
  assert.equal(formatCurrency(0, '₹', 0), '₹0');
});

test('calculateAmbulanceDispatchMetrics computes INR fare and priority ETA cleanly', () => {
  const shortBls = calculateAmbulanceDispatchMetrics(
    'Basic Life Support (BLS)',
    4,
    'Scheduled Patient Transport'
  );
  assert.equal(shortBls.baseFee, 1200);
  assert.equal(shortBls.distanceCharge, 0);
  assert.equal(shortBls.totalFare, 1200);

  const longAcls = calculateAmbulanceDispatchMetrics(
    'Advanced Cardiac Life Support (ACLS)',
    15,
    'Critical Emergency'
  );
  assert.equal(longAcls.baseFee, 2400);
  assert.equal(longAcls.distanceCharge, 750);
  assert.equal(longAcls.totalFare, 3150);
  assert.ok(longAcls.estimatedEtaMinutes < 30);
});

test('selectBestAmbulanceUnit matches available unit type or falls back cleanly', () => {
  const fleet: AmbulanceUnit[] = [
    {
      id: 'amb-1',
      vehicleNumber: 'TN-01-MS-108',
      unitName: 'ACLS-1',
      unitType: 'Advanced Cardiac Life Support (ACLS)',
      driverName: 'Muruganandam S.',
      paramedicName: 'Deepak K.',
      contactPhone: '+91 98401 10801',
      baseLocation: 'Cardiac Wing Gate',
      equipment: ['Defibrillator', 'Ventilator'],
      baseFeeInr: 2400,
      perKmFeeInr: 75,
      status: 'Dispatched',
    },
    {
      id: 'amb-2',
      vehicleNumber: 'TN-01-MS-112',
      unitName: 'BLS-1',
      unitType: 'Basic Life Support (BLS)',
      driverName: 'Selvakumar N.',
      paramedicName: 'Priya R.',
      contactPhone: '+91 98401 10802',
      baseLocation: 'Main Casualty Bay',
      equipment: ['Oxygen', 'Stretcher'],
      baseFeeInr: 1200,
      perKmFeeInr: 45,
      status: 'Available',
    },
  ];

  const picked = selectBestAmbulanceUnit(fleet, 'Basic Life Support (BLS)');
  assert.equal(picked?.id, 'amb-2');

  const fallback = selectBestAmbulanceUnit(fleet, 'Advanced Cardiac Life Support (ACLS)');
  assert.equal(fallback?.id, 'amb-2');

  const none = selectBestAmbulanceUnit([{ ...fleet[0], status: 'Maintenance' }]);
  assert.equal(none, null);
});

test('Doctor Portal permissions cover prescriptions, lab orders, referrals, and schedule', () => {
  assert.equal(hasPermission('doctor', 'create_prescriptions'), true);
  assert.equal(hasPermission('doctor', 'order_labs'), true);
  assert.equal(hasPermission('doctor', 'manage_referrals'), true);
  assert.equal(hasPermission('doctor', 'manage_own_schedule'), true);
  assert.equal(hasPermission('patient', 'create_prescriptions'), false);
  assert.equal(hasPermission('staff', 'order_labs'), false);
});

test('getAvailableSlots respects doctor blockedDates leave calendar', () => {
  const doctorWithLeave: Doctor = {
    ...sampleDoctor,
    blockedDates: ['2026-11-16'],
  };
  const blocked = getAvailableSlots(
    doctorWithLeave,
    '2026-11-16',
    [],
    new Date('2026-11-14T08:00:00Z')
  );
  assert.deepEqual(blocked, []);

  const open = getAvailableSlots(
    doctorWithLeave,
    '2026-11-17',
    [],
    new Date('2026-11-14T08:00:00Z')
  );
  assert.deepEqual(open, ['09:00', '10:00', '11:00', '14:00']);
});

test('calculateBmi computes rounded clinical BMI and handles invalid inputs safely', () => {
  assert.equal(calculateBmi(70, 175), 22.9);
  assert.equal(calculateBmi(0, 175), undefined);
  assert.equal(calculateBmi(70, 0), undefined);
});

test('checkMedicationAllergyConflict flags penicillin, sulfa, and direct drug conflicts', () => {
  const penWarnings = checkMedicationAllergyConflict(
    ['Amoxicillin 500mg', 'Paracetamol 650mg'],
    'Penicillin (mild rash)'
  );
  assert.equal(penWarnings.length, 1);
  assert.match(penWarnings[0], /Amoxicillin 500mg/);

  const sulfaWarnings = checkMedicationAllergyConflict(
    ['Celecoxib 100mg'],
    'Sulfa drugs'
  );
  assert.equal(sulfaWarnings.length, 1);

  const safeWarnings = checkMedicationAllergyConflict(
    ['Atorvastatin 10mg'],
    'No known drug allergies'
  );
  assert.deepEqual(safeWarnings, []);
});

test('formatPrescriptionSummary and computeDoctorDashboardMetrics aggregate doctor practice stats', () => {
  const summary = formatPrescriptionSummary([
    {
      medication: 'Metoprolol Succinate',
      dosage: '25mg',
      frequency: 'OD',
      duration: '30 days',
      instructions: 'Morning after breakfast',
    },
  ]);
  assert.equal(summary, 'Metoprolol Succinate 25mg OD 30 days');

  const appts: Appointment[] = [
    {
      id: 'a1',
      bookingCode: 'MS-1',
      patientId: 'p1',
      patientName: 'Ananya',
      patientEmail: 'a@b.com',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-23',
      timeSlot: '09:30',
      visitType: 'In-Person Consultation',
      reasonSummary: 'Review',
      status: 'Checked-In',
      paymentStatus: 'Paid',
      amountPaid: 1250,
      reminderStatus: 'Sent',
      createdAt: '2026-11-22T00:00:00Z',
    },
    {
      id: 'a2',
      bookingCode: 'MS-2',
      patientId: 'p2',
      patientName: 'Ravi',
      patientEmail: 'r@b.com',
      doctorId: 'doc-2',
      doctorName: 'Dr. Meenakshi',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: '2026-11-23',
      timeSlot: '10:30',
      visitType: 'Follow-Up Review',
      reasonSummary: 'Echo',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      amountPaid: 1050,
      reminderStatus: 'Scheduled',
      createdAt: '2026-11-22T00:00:00Z',
    },
  ];
  const rxs: DigitalPrescription[] = [
    {
      id: 'rx-1',
      rxCode: 'RX-1',
      patientId: 'p1',
      patientName: 'Ananya',
      patientMrn: 'MRN-1',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind',
      departmentName: 'Cardiology',
      diagnosis: 'Hypertension',
      items: [],
      status: 'Active',
      issuedAt: '2026-11-22T00:00:00Z',
    },
  ];
  const labs: LabOrder[] = [
    {
      id: 'lab-1',
      orderCode: 'LAB-1',
      patientId: 'p1',
      patientName: 'Ananya',
      patientMrn: 'MRN-1',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind',
      departmentName: 'Cardiology',
      testName: 'Lipid Profile',
      category: 'Biochemistry',
      priority: 'Routine',
      clinicalIndication: 'Baseline lipids',
      status: 'Results Ready',
      orderedAt: '2026-11-22T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    },
  ];
  const refs: SpecialistReferral[] = [
    {
      id: 'ref-1',
      referralCode: 'REF-1',
      patientId: 'p2',
      patientName: 'Vikram',
      patientMrn: 'MRN-2',
      fromDoctorId: 'doc-3',
      fromDoctorName: 'Dr. Karthikeyan',
      fromDepartmentName: 'Neurology',
      toDoctorId: 'doc-1',
      toDoctorName: 'Dr. Arvind',
      toDepartmentName: 'Cardiology',
      urgency: 'Urgent',
      reason: 'Arrhythmia evaluation',
      clinicalSummary: 'Palpitations with migraine',
      status: 'Pending',
      createdAt: '2026-11-22T00:00:00Z',
      updatedAt: '2026-11-22T00:00:00Z',
    },
  ];

  const metrics = computeDoctorDashboardMetrics({
    doctorId: 'doc-1',
    todayIso: '2026-11-23',
    appointments: appts,
    assignedPatientsCount: 3,
    prescriptions: rxs,
    labOrders: labs,
    referrals: refs,
  });

  assert.equal(metrics.todayAppointments, 1);
  assert.equal(metrics.waitingCheckedIn, 1);
  assert.equal(metrics.activePrescriptionsCount, 1);
  assert.equal(metrics.pendingLabReviewsCount, 1);
  assert.equal(metrics.incomingReferralsCount, 1);
  assert.equal(metrics.consultationEarnings, 1250);
});


