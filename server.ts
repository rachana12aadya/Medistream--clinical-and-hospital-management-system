import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { generateClinicChatReply, normalizeChatHistory } from './server/chatService.ts';
import {
  decryptPHI,
  encryptPHI,
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './server/cryptoUtils.ts';
import { verifyFirebaseIdToken } from './server/firebaseAuth.ts';
import {
  HospitalStore,
  getEncryptionSecret,
  getSessionSecret,
  type StoredPatient,
  type StoredUser,
} from './server/store.ts';
import {
  calculateAmbulanceDispatchMetrics,
  calculateBillingTotals,
  calculateBmi,
  checkMedicationAllergyConflict,
  computeDoctorDashboardMetrics,
  computeHospitalAnalytics,
  findAppointmentsDueForReminder,
  formatPrescriptionSummary,
  getAvailableSlots,
  maskEmailAddress,
  maskIdentifier,
  maskPhoneNumber,
  selectBestAmbulanceUnit,
} from './src/lib/hospitalRules.ts';
import type {
  AmbulanceDispatch,
  AmbulanceDispatchStatus,
  AmbulancePriority,
  AmbulanceUnitStatus,
  AmbulanceUnitType,
  Appointment,
  AppointmentStatus,
  ClinicalEncounter,
  DigitalPrescription,
  Doctor,
  EmailReminder,
  LabCategory,
  LabOrder,
  LabOrderStatus,
  PatientRecordView,
  PaymentMethod,
  PaymentTransaction,
  PrescriptionItem,
  ReferralStatus,
  SpecialistReferral,
  UserAccountView,
  UserRole,
  VitalSigns,
} from './src/types.ts';

const store = new HospitalStore();

interface AuthRequest extends Request {
  authUser?: StoredUser;
}

function getRequestUser(req: Request): StoredUser | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return undefined;
  const payload = verifySessionToken(token, getSessionSecret());
  if (!payload) return undefined;
  const user = store.getState().users.find((u) => u.id === payload.userId && u.active);
  return user;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  if (user.role !== 'admin') {
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'admin',
      action: 'ADMIN_ACCESS_DENIED',
      resourceType: 'AdminPortal',
      resourceId: req.path,
      outcome: 'DENIED',
      details: `Non-admin role (${user.role}) attempted access to ${req.path}.`,
    });
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  req.authUser = user;
  next();
}

function requireDoctorOrAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const user = getRequestUser(req);
  if (!user) {
    res.status(401).json({ error: 'Physician authentication required.' });
    return;
  }
  if (user.role !== 'doctor' && user.role !== 'admin') {
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'DOCTOR_ACCESS_DENIED',
      resourceType: 'DoctorPortal',
      resourceId: req.path,
      outcome: 'DENIED',
      details: `Unauthorized role (${user.role}) attempted access to ${req.path}.`,
    });
    res.status(403).json({ error: 'Attending physician privileges required.' });
    return;
  }
  req.authUser = user;
  next();
}

function toPatientView(p: StoredPatient, includeDecrypted: boolean, secret: string): PatientRecordView {
  const view: PatientRecordView = {
    id: p.id,
    mrn: p.mrn,
    fullName: p.fullName,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    bloodGroup: p.bloodGroup,
    maskedPhone: maskPhoneNumber(p.phonePlain),
    maskedEmail: maskEmailAddress(p.emailPlain),
    maskedNationalId: maskIdentifier(p.nationalIdPlain),
    maskedInsuranceId: maskIdentifier(p.insuranceIdPlain),
    primaryDepartment: p.primaryDepartment,
    assignedDoctorId: p.assignedDoctorId,
    assignedDoctorName: p.assignedDoctorName,
    encryptionCipher: p.encryptionCipher,
    encryptedAt: p.encryptedAt,
    lastUpdatedAt: p.lastUpdatedAt,
  };

  if (includeDecrypted) {
    view.decrypted = {
      phone: decryptPHI(p.phoneEncrypted, secret),
      email: decryptPHI(p.emailEncrypted, secret),
      nationalId: decryptPHI(p.nationalIdEncrypted, secret),
      insuranceId: decryptPHI(p.insuranceIdEncrypted, secret),
      allergies: decryptPHI(p.allergiesEncrypted, secret),
      medicalHistory: decryptPHI(p.medicalHistoryEncrypted, secret),
      clinicalNotes: decryptPHI(p.clinicalNotesEncrypted, secret),
      prescriptions: decryptPHI(p.prescriptionsEncrypted, secret),
    };
  }
  return view;
}

function toUserView(u: StoredUser): UserAccountView {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    departmentId: u.departmentId,
    doctorId: u.doctorId,
    mfaEnabled: u.mfaEnabled,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

function runAutomatedReminderCheck(channel: 'Automated Scheduler' | 'Manual Staff Trigger', actorEmail: string, actorRole: UserRole | 'system'): number {
  const state = store.getState();
  const now = new Date();
  const dueAppointments = findAppointmentsDueForReminder(
    state.appointments,
    now,
    state.systemConfig.reminderLeadHours
  );

  let dispatchedCount = 0;

  for (const appt of dueAppointments) {
    const existingReminder = state.reminders.find((r) => r.appointmentId === appt.id);
    const sentAt = now.toISOString();
    if (existingReminder) {
      if (existingReminder.status !== 'Sent') {
        existingReminder.status = 'Sent';
        existingReminder.sentAt = sentAt;
        existingReminder.channel = channel;
        dispatchedCount += 1;
      }
    } else {
      const doc = state.doctors.find((d) => d.id === appt.doctorId);
      const reminder: EmailReminder = {
        id: `rem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        appointmentId: appt.id,
        bookingCode: appt.bookingCode,
        recipientName: appt.patientName,
        maskedRecipientEmail: maskEmailAddress(appt.patientEmail),
        doctorName: appt.doctorName,
        departmentName: appt.departmentName,
        visitDate: appt.date,
        visitTime: appt.timeSlot,
        subject: `MediStream Visit Reminder: ${appt.doctorName} on ${appt.date} at ${appt.timeSlot}`,
        bodyPreview: `Dear ${appt.patientName}, your ${appt.departmentName} visit (Ref ${appt.bookingCode}) with ${appt.doctorName} is confirmed for ${appt.date} at ${appt.timeSlot}${doc ? ` in ${doc.roomNumber}` : ''}.`,
        channel,
        status: 'Sent',
        scheduledFor: sentAt,
        sentAt,
      };
      state.reminders.unshift(reminder);
      dispatchedCount += 1;
    }

    appt.reminderStatus = 'Sent';
    appt.reminderSentAt = sentAt;
  }

  if (dispatchedCount > 0) {
    store.addAuditLog({
      actorEmail,
      actorRole,
      portal: actorRole === 'admin' ? 'admin' : actorRole === 'system' ? 'system' : 'user',
      action: 'REMINDER_DISPATCHED',
      resourceType: 'EmailReminder',
      resourceId: `${dispatchedCount}-reminders`,
      outcome: 'ALLOWED',
      details: `Dispatched ${dispatchedCount} HIPAA-compliant appointment reminder email(s) via ${channel}.`,
    });
  }

  return dispatchedCount;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Background automated reminder scheduler (runs every 60s)
  setInterval(() => {
    const state = store.getState();
    if (state.systemConfig.autoReminderEnabled) {
      runAutomatedReminderCheck('Automated Scheduler', state.systemConfig.smtpSenderEmail, 'system');
    }
  }, 60_000);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'MediStream', timestamp: new Date().toISOString() });
  });

  app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body as {
      message?: unknown;
      history?: unknown;
    };

    if (typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'Please enter a message for the Care Assistant.' });
      return;
    }

    if (message.trim().length > 1000) {
      res.status(400).json({ error: 'Message is too long. Please keep questions under 1,000 characters.' });
      return;
    }

    try {
      const normalizedHistory = normalizeChatHistory(history);
      const reply = await generateClinicChatReply(
        message.trim(),
        normalizedHistory,
        store.getState()
      );
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to generate assistant response.';
      const status = msg.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: msg });
    }
  });

  // Patient Portal: Google / Gmail Sign-In via Firebase ID Token
  app.post('/api/auth/patient/google', async (req, res) => {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Missing Google sign-in token.' });
      return;
    }

    try {
      const verified = await verifyFirebaseIdToken(idToken);
      if (!verified.emailVerified) {
        res.status(403).json({ error: 'Please use a verified Google / Gmail account.' });
        return;
      }

      const user = store.findOrProvisionFirebaseUser({
        uid: verified.uid,
        email: verified.email,
        name: verified.name,
      });

      if (!user.active) {
        res.status(403).json({ error: 'This patient account is suspended. Contact clinic administration.' });
        return;
      }

      const timeoutMinutes = store.getState().systemConfig.sessionTimeoutMinutes || 30;
      const token = signSessionToken(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          portal: 'user',
          exp: Date.now() + timeoutMinutes * 60_000,
        },
        getSessionSecret()
      );

      store.addAuditLog({
        actorEmail: user.email,
        actorRole: user.role,
        portal: 'user',
        action: 'PATIENT_GOOGLE_SIGNIN',
        resourceType: 'Session',
        resourceId: user.id,
        outcome: 'ALLOWED',
        details: `Patient signed in to User Portal via Google/Gmail authentication.`,
      });

      res.json({
        token,
        user: toUserView(user),
        patientId: user.patientId,
      });
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : 'Google authentication failed.',
      });
    }
  });

  // Admin Portal: Simple Email + Password Login (No MFA)
  app.post('/api/auth/admin/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const normalizedEmail = email?.trim().toLowerCase() || '';
    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Please enter both admin email and password.' });
      return;
    }

    const state = store.getState();
    const user = state.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail && u.role === 'admin'
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      store.addAuditLog({
        actorEmail: normalizedEmail,
        actorRole: 'anonymous',
        portal: 'admin',
        action: 'ADMIN_SIGNIN_FAILED',
        resourceType: 'Session',
        resourceId: normalizedEmail,
        outcome: 'DENIED',
        details: 'Invalid administrator email or password.',
      });
      res.status(401).json({ error: 'Invalid admin email or password.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Administrator account is inactive.' });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    const timeoutMinutes = state.systemConfig.sessionTimeoutMinutes || 30;
    const token = signSessionToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        portal: 'admin',
        exp: Date.now() + timeoutMinutes * 60_000,
      },
      getSessionSecret()
    );

    store.addAuditLog({
      actorEmail: user.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'ADMIN_SIGNIN',
      resourceType: 'Session',
      resourceId: user.id,
      outcome: 'ALLOWED',
      details: 'Administrator signed in to MediStream Admin Portal.',
    });

    res.json({
      token,
      user: toUserView(user),
    });
  });

  // Doctor Portal: Physician Email + Password Login
  app.post('/api/auth/doctor/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const normalizedEmail = email?.trim().toLowerCase() || '';
    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Please enter both physician email and password.' });
      return;
    }

    const state = store.getState();
    const user = state.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail && u.role === 'doctor'
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      store.addAuditLog({
        actorEmail: normalizedEmail,
        actorRole: 'anonymous',
        portal: 'doctor',
        action: 'DOCTOR_SIGNIN_FAILED',
        resourceType: 'Session',
        resourceId: normalizedEmail,
        outcome: 'DENIED',
        details: 'Invalid attending physician email or password.',
      });
      res.status(401).json({ error: 'Invalid physician email or password.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Physician portal account is suspended. Contact administration.' });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    const timeoutMinutes = state.systemConfig.sessionTimeoutMinutes || 30;
    const token = signSessionToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        portal: 'doctor',
        exp: Date.now() + timeoutMinutes * 60_000,
      },
      getSessionSecret()
    );

    const doctorProfile =
      state.doctors.find((d) => d.id === user.doctorId) ||
      state.doctors.find((d) => d.name.toLowerCase() === user.name.toLowerCase()) ||
      null;

    store.addAuditLog({
      actorEmail: user.email,
      actorRole: 'doctor',
      portal: 'doctor',
      action: 'DOCTOR_SIGNIN',
      resourceType: 'Session',
      resourceId: doctorProfile?.id || user.id,
      outcome: 'ALLOWED',
      details: `${user.name} signed in to MediStream Doctor Portal.`,
    });

    res.json({
      token,
      user: toUserView(user),
      doctor: doctorProfile,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const user = getRequestUser(req);
    if (user) {
      store.addAuditLog({
        actorEmail: user.email,
        actorRole: user.role,
        portal: user.role === 'admin' ? 'admin' : user.role === 'doctor' ? 'doctor' : 'user',
        action: 'PORTAL_SIGNOUT',
        resourceType: 'Session',
        resourceId: user.id,
        outcome: 'ALLOWED',
        details: `Signed out from ${
          user.role === 'admin' ? 'Admin' : user.role === 'doctor' ? 'Doctor' : 'User'
        } Portal.`,
      });
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    res.json({
      user: toUserView(user),
      patientId: user.patientId,
    });
  });

  // Public overview: departments, 10 South Indian doctors, non-PHI slot occupancy, public clinic config
  app.get('/api/public/overview', (_req, res) => {
    const state = store.getState();
    const bookedSlots = state.appointments
      .filter((a) => a.status !== 'Cancelled')
      .map((a) => ({
        doctorId: a.doctorId,
        date: a.date,
        timeSlot: a.timeSlot,
      }));

    res.json({
      departments: state.departments,
      doctors: state.doctors,
      bookedSlots,
      publicConfig: {
        hospitalName: state.systemConfig.hospitalName,
        currencySymbol: state.systemConfig.currencySymbol,
        defaultInsuranceCoveragePct: state.systemConfig.defaultInsuranceCoveragePct,
        platformProcessingFee: state.systemConfig.platformProcessingFee,
        reminderLeadHours: state.systemConfig.reminderLeadHours,
        hipaaEncryptionAlgorithm: state.systemConfig.hipaaEncryptionAlgorithm,
      },
    });
  });

  app.get('/api/public/doctors/:id/slots', (req, res) => {
    const state = store.getState();
    const doctor = state.doctors.find((d) => d.id === req.params.id);
    if (!doctor) {
      res.status(404).json({ error: 'Doctor not found.' });
      return;
    }
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const availableSlots = getAvailableSlots(doctor, date, state.appointments);
    res.json({ doctorId: doctor.id, date, availableSlots });
  });

  // Public or authenticated appointment booking + integrated payment + auto reminder queue
  app.post('/api/public/book', (req, res) => {
    const state = store.getState();
    const secret = getEncryptionSecret();
    const {
      patientName,
      patientEmail,
      patientPhone,
      dateOfBirth,
      gender,
      doctorId,
      date,
      timeSlot,
      visitType,
      reasonSummary,
      payNow,
      paymentMethod,
      paymentReference,
    } = req.body as {
      patientName?: string;
      patientEmail?: string;
      patientPhone?: string;
      dateOfBirth?: string;
      gender?: 'Female' | 'Male' | 'Other';
      doctorId?: string;
      date?: string;
      timeSlot?: string;
      visitType?: 'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video';
      reasonSummary?: string;
      payNow?: boolean;
      paymentMethod?: PaymentMethod;
      paymentReference?: string;
    };

    if (!patientName?.trim() || !patientEmail?.trim() || !patientPhone?.trim() || !doctorId || !date || !timeSlot) {
      res.status(400).json({ error: 'Please complete all required patient, doctor, date, and slot fields.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail.trim())) {
      res.status(400).json({ error: 'Please provide a valid email address for appointment reminders.' });
      return;
    }

    const doctor = state.doctors.find((d) => d.id === doctorId);
    if (!doctor) {
      res.status(404).json({ error: 'Selected doctor was not found.' });
      return;
    }

    const available = getAvailableSlots(doctor, date, state.appointments);
    if (!available.includes(timeSlot)) {
      res.status(409).json({ error: `Slot ${timeSlot} on ${date} is no longer available. Please choose another time.` });
      return;
    }

    const normalizedEmail = patientEmail.trim().toLowerCase();
    let patient = state.patients.find((p) => p.emailPlain.toLowerCase() === normalizedEmail);
    const nowIso = new Date().toISOString();

    if (!patient) {
      const mrnNum = 450 + state.patients.length + 1;
      patient = {
        id: `pat-${Date.now()}`,
        mrn: `MRN-2026-0${mrnNum}`,
        fullName: patientName.trim(),
        dateOfBirth: dateOfBirth || '1992-01-01',
        gender: gender || 'Other',
        bloodGroup: 'O+',
        phonePlain: patientPhone.trim(),
        emailPlain: normalizedEmail,
        nationalIdPlain: `ID-${Math.floor(100000 + Math.random() * 899999)}`,
        insuranceIdPlain: paymentMethod === 'Insurance Copay' && paymentReference ? paymentReference.trim() : 'SELF-PAY',
        phoneEncrypted: encryptPHI(patientPhone.trim(), secret),
        emailEncrypted: encryptPHI(normalizedEmail, secret),
        nationalIdEncrypted: encryptPHI(`ID-${Math.floor(100000 + Math.random() * 899999)}`, secret),
        insuranceIdEncrypted: encryptPHI(paymentReference?.trim() || 'SELF-PAY', secret),
        allergiesEncrypted: encryptPHI('Pending initial nursing intake screening', secret),
        medicalHistoryEncrypted: encryptPHI(reasonSummary?.trim() || 'Initial outpatient registration', secret),
        clinicalNotesEncrypted: encryptPHI('Awaiting physician consultation.', secret),
        prescriptionsEncrypted: encryptPHI('None recorded yet.', secret),
        primaryDepartment: doctor.departmentName,
        assignedDoctorId: doctor.id,
        assignedDoctorName: doctor.name,
        encryptionCipher: 'AES-256-GCM',
        encryptedAt: nowIso,
        lastUpdatedAt: nowIso,
      };
      state.patients.unshift(patient);
    }

    const bookingCode = `MS-${Math.floor(2610 + Math.random() * 7000)}`;
    const chosenMethod: PaymentMethod = paymentMethod || 'Card';
    const totals = calculateBillingTotals(
      doctor.consultationFee,
      chosenMethod,
      state.systemConfig.defaultInsuranceCoveragePct,
      state.systemConfig.platformProcessingFee
    );

    const isPaid = payNow !== false;
    const invoiceId = isPaid ? `INV-MS-${Math.floor(8810 + Math.random() * 1000)}` : undefined;

    const appointment: Appointment = {
      id: `apt-${Date.now()}`,
      bookingCode,
      patientId: patient.id,
      patientName: patient.fullName,
      patientEmail: normalizedEmail,
      doctorId: doctor.id,
      doctorName: doctor.name,
      departmentId: doctor.departmentId,
      departmentName: doctor.departmentName,
      date,
      timeSlot,
      visitType: visitType || 'In-Person Consultation',
      reasonSummary: reasonSummary?.trim() || 'Specialist outpatient consultation',
      status: 'Confirmed',
      paymentStatus: isPaid ? 'Paid' : 'Pending',
      paymentMethod: isPaid ? chosenMethod : undefined,
      amountPaid: isPaid ? totals.totalAmount : 0,
      invoiceId,
      reminderStatus: 'Scheduled',
      createdAt: nowIso,
    };

    state.appointments.unshift(appointment);

    let transaction: PaymentTransaction | undefined;
    if (isPaid && invoiceId) {
      transaction = {
        id: `pay-${Date.now()}`,
        invoiceId,
        appointmentId: appointment.id,
        bookingCode,
        patientName: patient.fullName,
        doctorName: doctor.name,
        departmentName: doctor.departmentName,
        subtotal: totals.subtotal,
        insuranceDiscount: totals.insuranceDiscount,
        platformFee: totals.platformFee,
        totalAmount: totals.totalAmount,
        method: chosenMethod,
        lastFourOrRef: paymentReference?.trim() || (chosenMethod === 'Card' ? 'Card •••• 4242' : 'REF-PAID'),
        status: 'Paid',
        paidAt: nowIso,
      };
      state.payments.unshift(transaction);
    }

    const reminder: EmailReminder = {
      id: `rem-${Date.now()}`,
      appointmentId: appointment.id,
      bookingCode,
      recipientName: patient.fullName,
      maskedRecipientEmail: maskEmailAddress(normalizedEmail),
      doctorName: doctor.name,
      departmentName: doctor.departmentName,
      visitDate: date,
      visitTime: timeSlot,
      subject: `MediStream Visit Reminder: ${doctor.name} on ${date} at ${timeSlot}`,
      bodyPreview: `Dear ${patient.fullName}, your ${doctor.departmentName} consultation (Ref ${bookingCode}) with ${doctor.name} is scheduled for ${date} at ${timeSlot} in ${doctor.roomNumber}.`,
      channel: 'Automated Scheduler',
      status: 'Queued',
      scheduledFor: `${date}T${timeSlot}:00Z`,
    };
    state.reminders.unshift(reminder);

    store.addAuditLog({
      actorEmail: normalizedEmail,
      actorRole: 'patient',
      portal: 'public',
      action: 'APPOINTMENT_BOOKED',
      resourceType: 'Appointment',
      resourceId: bookingCode,
      outcome: 'ALLOWED',
      details: `Booked ${doctor.departmentName} visit with ${doctor.name} on ${date} ${timeSlot}. Payment: ${appointment.paymentStatus}.`,
    });

    res.status(201).json({
      appointment,
      transaction,
      reminder,
      encryptionStatus: 'AES-256-GCM Protected',
    });
  });

  // Clinical & Patient Appointments
  app.get('/api/appointments', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const all = store.getState().appointments;
    if (user.role === 'patient') {
      const email = user.email.toLowerCase();
      res.json({
        appointments: all.filter(
          (a) => a.patientEmail.toLowerCase() === email || a.patientId === user.patientId
        ),
      });
      return;
    }
    res.json({ appointments: all });
  });

  app.patch('/api/appointments/:id/status', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const { status } = req.body as { status?: AppointmentStatus };
    const appt = state.appointments.find((a) => a.id === req.params.id);
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    if (!status || !['Confirmed', 'Checked-In', 'Completed', 'Cancelled'].includes(status)) {
      res.status(400).json({ error: 'Invalid appointment status.' });
      return;
    }

    if (user.role === 'patient') {
      const ownsAppt =
        appt.patientEmail.toLowerCase() === user.email.toLowerCase() ||
        appt.patientId === user.patientId;
      if (!ownsAppt || status !== 'Cancelled') {
        res.status(403).json({ error: 'Patients may only cancel their own appointments.' });
        return;
      }
    }

    appt.status = status;
    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: user.role === 'doctor' ? 'doctor' : user.role === 'admin' ? 'admin' : 'user',
      action: 'APPOINTMENT_STATUS_UPDATED',
      resourceType: 'Appointment',
      resourceId: appt.bookingCode,
      outcome: 'ALLOWED',
      details: `Appointment status changed to ${status}.`,
    });

    res.json({ appointment: appt });
  });

  app.patch('/api/appointments/:id/reschedule', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const { date, timeSlot } = req.body as { date?: string; timeSlot?: string };
    const appt = state.appointments.find((a) => a.id === req.params.id);
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    if (user.role === 'patient') {
      const ownsAppt =
        appt.patientEmail.toLowerCase() === user.email.toLowerCase() ||
        appt.patientId === user.patientId;
      if (!ownsAppt) {
        res.status(403).json({ error: 'You may only reschedule your own appointments.' });
        return;
      }
    }

    if (appt.status === 'Cancelled' || appt.status === 'Completed') {
      res.status(409).json({ error: `Cannot reschedule a ${appt.status.toLowerCase()} appointment.` });
      return;
    }

    if (!date || !timeSlot) {
      res.status(400).json({ error: 'Please select a new date and time slot.' });
      return;
    }

    const doc = state.doctors.find((d) => d.id === appt.doctorId);
    if (!doc) {
      res.status(404).json({ error: 'Attending doctor not found.' });
      return;
    }

    const available = getAvailableSlots(doc, date, state.appointments);
    if (!available.includes(timeSlot)) {
      res.status(409).json({ error: `Slot ${timeSlot} on ${date} is unavailable.` });
      return;
    }

    const previousSlot = `${appt.date} ${appt.timeSlot}`;
    appt.date = date;
    appt.timeSlot = timeSlot;
    appt.reminderStatus = 'Scheduled';
    store.save();

    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: user.role === 'doctor' ? 'doctor' : 'user',
      action: 'APPOINTMENT_RESCHEDULED',
      resourceType: 'Appointment',
      resourceId: appt.bookingCode,
      outcome: 'ALLOWED',
      details: `Rescheduled from ${previousSlot} to ${date} ${timeSlot}.`,
    });

    res.json({ appointment: appt });
  });

  // Patient Records (Encrypted PHI at rest, masked by default)
  app.get('/api/patients', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const secret = getEncryptionSecret();
    const visible =
      user.role === 'patient'
        ? state.patients.filter(
            (p) => p.id === user.patientId || p.emailPlain.toLowerCase() === user.email.toLowerCase()
          )
        : state.patients;
    res.json({
      patients: visible.map((p) => toPatientView(p, false, secret)),
    });
  });

  app.post('/api/patients', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'patient') {
      res.status(403).json({ error: 'Only clinical staff or administrators can create patient charts.' });
      return;
    }
    const state = store.getState();
    const secret = getEncryptionSecret();
    const {
      fullName,
      dateOfBirth,
      gender,
      bloodGroup,
      phone,
      email,
      nationalId,
      insuranceId,
      allergies,
      medicalHistory,
      assignedDoctorId,
    } = req.body as Record<string, string>;

    if (!fullName?.trim() || !email?.trim() || !phone?.trim()) {
      res.status(400).json({ error: 'Full name, email, and phone are required.' });
      return;
    }

    const doc = state.doctors.find((d) => d.id === assignedDoctorId) || state.doctors[0];
    const nowIso = new Date().toISOString();

    const patient: StoredPatient = {
      id: `pat-${Date.now()}`,
      mrn: `MRN-2026-0${460 + state.patients.length}`,
      fullName: fullName.trim(),
      dateOfBirth: dateOfBirth || '1990-01-01',
      gender: (gender as 'Female' | 'Male' | 'Other') || 'Other',
      bloodGroup: bloodGroup || 'O+',
      phonePlain: phone.trim(),
      emailPlain: email.trim().toLowerCase(),
      nationalIdPlain: nationalId?.trim() || 'SSN-000-00-0000',
      insuranceIdPlain: insuranceId?.trim() || 'SELF-PAY',
      phoneEncrypted: encryptPHI(phone.trim(), secret),
      emailEncrypted: encryptPHI(email.trim().toLowerCase(), secret),
      nationalIdEncrypted: encryptPHI(nationalId?.trim() || 'SSN-000-00-0000', secret),
      insuranceIdEncrypted: encryptPHI(insuranceId?.trim() || 'SELF-PAY', secret),
      allergiesEncrypted: encryptPHI(allergies?.trim() || 'No known drug allergies', secret),
      medicalHistoryEncrypted: encryptPHI(medicalHistory?.trim() || 'Initial clinical intake', secret),
      clinicalNotesEncrypted: encryptPHI('Intake completed; ready for consultation.', secret),
      prescriptionsEncrypted: encryptPHI('None', secret),
      primaryDepartment: doc.departmentName,
      assignedDoctorId: doc.id,
      assignedDoctorName: doc.name,
      encryptionCipher: 'AES-256-GCM',
      encryptedAt: nowIso,
      lastUpdatedAt: nowIso,
    };

    state.patients.unshift(patient);
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'user',
      action: 'PATIENT_RECORD_CREATED',
      resourceType: 'PatientRecord',
      resourceId: patient.mrn,
      outcome: 'ALLOWED',
      details: 'Created encrypted HIPAA patient chart (AES-256-GCM).',
    });

    res.status(201).json({ patient: toPatientView(patient, false, secret) });
  });

  // Explicit HIPAA Audit-Logged PHI Decryption Endpoint
  app.post('/api/patients/:id/decrypt', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const secret = getEncryptionSecret();
    const patient = state.patients.find((p) => p.id === req.params.id);

    if (!patient) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    if (
      user.role === 'patient' &&
      patient.id !== user.patientId &&
      patient.emailPlain.toLowerCase() !== user.email.toLowerCase()
    ) {
      res.status(403).json({ error: 'You can only decrypt your own patient record.' });
      return;
    }

    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: user.role === 'doctor' ? 'doctor' : 'user',
      action: 'PHI_DECRYPTED',
      resourceType: 'PatientRecord',
      resourceId: patient.mrn,
      outcome: 'ALLOWED',
      details: `Decrypted AES-256-GCM clinical chart for ${patient.fullName} (${patient.mrn}).`,
    });

    res.json({ patient: toPatientView(patient, true, secret) });
  });

  // Update encrypted clinical notes & prescriptions
  app.patch('/api/patients/:id/clinical', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'patient') {
      res.status(403).json({ error: 'Only attending clinical staff may modify physician chart notes.' });
      return;
    }
    const state = store.getState();
    const secret = getEncryptionSecret();
    const patient = state.patients.find((p) => p.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    const { allergies, medicalHistory, clinicalNotes, prescriptions } = req.body as {
      allergies?: string;
      medicalHistory?: string;
      clinicalNotes?: string;
      prescriptions?: string;
    };

    if (typeof allergies === 'string') patient.allergiesEncrypted = encryptPHI(allergies, secret);
    if (typeof medicalHistory === 'string') patient.medicalHistoryEncrypted = encryptPHI(medicalHistory, secret);
    if (typeof clinicalNotes === 'string') patient.clinicalNotesEncrypted = encryptPHI(clinicalNotes, secret);
    if (typeof prescriptions === 'string') patient.prescriptionsEncrypted = encryptPHI(prescriptions, secret);
    patient.lastUpdatedAt = new Date().toISOString();
    store.save();

    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: user.role === 'doctor' ? 'doctor' : 'user',
      action: 'PHI_CLINICAL_UPDATED',
      resourceType: 'PatientRecord',
      resourceId: patient.mrn,
      outcome: 'ALLOWED',
      details: `Updated & re-encrypted clinical chart for ${patient.mrn}.`,
    });

    res.json({ patient: toPatientView(patient, true, secret) });
  });

  // --- Doctor Portal & Cross-Portal Clinical Records Routes ---
  app.get('/api/doctor/workspace', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const secret = getEncryptionSecret();
    const requestedDoctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined;
    const doctorId = user.doctorId || requestedDoctorId || state.doctors[0]?.id;
    const doctor = state.doctors.find((d) => d.id === doctorId);
    if (!doctor) {
      res.status(404).json({ error: 'Doctor profile not found.' });
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const doctorAppointments = state.appointments.filter((a) => a.doctorId === doctor.id);
    const assignedPatientIds = new Set(
      state.patients
        .filter((p) => p.assignedDoctorId === doctor.id)
        .map((p) => p.id)
    );
    for (const appt of doctorAppointments) {
      assignedPatientIds.add(appt.patientId);
    }

    const metrics = computeDoctorDashboardMetrics({
      doctorId: doctor.id,
      todayIso,
      appointments: state.appointments,
      assignedPatientsCount: assignedPatientIds.size,
      prescriptions: state.prescriptions,
      labOrders: state.labOrders,
      referrals: state.referrals,
    });

    res.json({
      doctor,
      metrics,
      appointments: state.appointments,
      patients: state.patients.map((p) => toPatientView(p, false, secret)),
      encounters: state.encounters,
      prescriptions: state.prescriptions,
      labOrders: state.labOrders,
      referrals: state.referrals,
      ambulanceDispatches: state.ambulanceDispatches,
      doctors: state.doctors,
      departments: state.departments,
    });
  });

  app.get('/api/encounters', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    if (user.role === 'patient') {
      const ownPatientIds = new Set(
        state.patients
          .filter(
            (p) => p.id === user.patientId || p.emailPlain.toLowerCase() === user.email.toLowerCase()
          )
          .map((p) => p.id)
      );
      res.json({
        encounters: state.encounters.filter((e) => ownPatientIds.has(e.patientId)),
      });
      return;
    }
    res.json({ encounters: state.encounters });
  });

  app.post('/api/doctor/encounters', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const secret = getEncryptionSecret();
    const {
      patientId,
      appointmentId,
      visitType,
      vitals,
      subjective,
      objective,
      assessment,
      icdCode,
      plan,
      followUpDays,
      markAppointmentCompleted,
    } = req.body as {
      patientId?: string;
      appointmentId?: string;
      visitType?: 'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video';
      vitals?: VitalSigns;
      subjective?: string;
      objective?: string;
      assessment?: string;
      icdCode?: string;
      plan?: string;
      followUpDays?: number;
      markAppointmentCompleted?: boolean;
    };

    if (!patientId || !subjective?.trim() || !assessment?.trim() || !plan?.trim()) {
      res.status(400).json({
        error: 'Patient, subjective complaint, clinical assessment, and treatment plan are required.',
      });
      return;
    }

    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    const doctor =
      state.doctors.find((d) => d.id === user.doctorId) ||
      state.doctors.find((d) => d.id === patient.assignedDoctorId) ||
      state.doctors[0];

    const computedBmi = calculateBmi(vitals?.weightKg, vitals?.heightCm);
    const normalizedVitals: VitalSigns = {
      ...(vitals || {}),
      bmi: computedBmi ?? vitals?.bmi,
    };

    const nowIso = new Date().toISOString();
    const encounter: ClinicalEncounter = {
      id: `enc-${Date.now()}`,
      encounterCode: `ENC-${Math.floor(4010 + Math.random() * 5000)}`,
      appointmentId: appointmentId || undefined,
      patientId: patient.id,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      doctorId: doctor.id,
      doctorName: doctor.name,
      departmentName: doctor.departmentName,
      visitDate: nowIso.slice(0, 10),
      visitType: visitType || 'In-Person Consultation',
      vitals: normalizedVitals,
      subjective: subjective.trim(),
      objective: (objective || '').trim() || 'Vitals recorded and systemic examination completed.',
      assessment: assessment.trim(),
      icdCode: icdCode?.trim() || undefined,
      plan: plan.trim(),
      followUpDays: typeof followUpDays === 'number' && followUpDays > 0 ? followUpDays : undefined,
      createdAt: nowIso,
    };

    state.encounters.unshift(encounter);

    // Sync encrypted clinical note onto patient record
    const vitalsLine = [
      normalizedVitals.bloodPressureSystolic && normalizedVitals.bloodPressureDiastolic
        ? `BP ${normalizedVitals.bloodPressureSystolic}/${normalizedVitals.bloodPressureDiastolic} mmHg`
        : null,
      normalizedVitals.heartRateBpm ? `HR ${normalizedVitals.heartRateBpm} bpm` : null,
      normalizedVitals.spo2Pct ? `SpO2 ${normalizedVitals.spo2Pct}%` : null,
      normalizedVitals.bmi ? `BMI ${normalizedVitals.bmi}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const combinedNote = `[${encounter.visitDate} · ${doctor.name}] ${encounter.assessment}. ${
      vitalsLine ? `Vitals: ${vitalsLine}. ` : ''
    }Plan: ${encounter.plan}`;
    patient.clinicalNotesEncrypted = encryptPHI(combinedNote, secret);
    patient.lastUpdatedAt = nowIso;

    let updatedAppointment: Appointment | undefined;
    if (appointmentId && markAppointmentCompleted) {
      const appt = state.appointments.find((a) => a.id === appointmentId);
      if (appt && appt.status !== 'Cancelled') {
        appt.status = 'Completed';
        updatedAppointment = appt;
      }
    }

    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'CLINICAL_ENCOUNTER_RECORDED',
      resourceType: 'ClinicalEncounter',
      resourceId: encounter.encounterCode,
      outcome: 'ALLOWED',
      details: `Recorded encrypted SOAP encounter for ${patient.mrn} (${encounter.assessment}).`,
    });

    res.status(201).json({
      encounter,
      patient: toPatientView(patient, true, secret),
      appointment: updatedAppointment,
    });
  });

  app.get('/api/prescriptions', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    if (user.role === 'patient') {
      const ownPatientIds = new Set(
        state.patients
          .filter(
            (p) => p.id === user.patientId || p.emailPlain.toLowerCase() === user.email.toLowerCase()
          )
          .map((p) => p.id)
      );
      res.json({
        prescriptions: state.prescriptions.filter((rx) => ownPatientIds.has(rx.patientId)),
      });
      return;
    }
    res.json({ prescriptions: state.prescriptions });
  });

  app.post('/api/doctor/prescriptions', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const secret = getEncryptionSecret();
    const { patientId, appointmentId, encounterId, diagnosis, items, notes } = req.body as {
      patientId?: string;
      appointmentId?: string;
      encounterId?: string;
      diagnosis?: string;
      items?: PrescriptionItem[];
      notes?: string;
    };

    if (!patientId || !diagnosis?.trim() || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: 'Patient, diagnosis, and at least one medication item are required.',
      });
      return;
    }

    const cleanedItems: PrescriptionItem[] = items
      .filter((i) => i && typeof i.medication === 'string' && i.medication.trim())
      .map((i) => ({
        medication: i.medication.trim(),
        dosage: (i.dosage || '').trim() || 'As directed',
        frequency: (i.frequency || '').trim() || 'OD',
        duration: (i.duration || '').trim() || '7 days',
        instructions: (i.instructions || '').trim() || 'Take after food',
      }));

    if (cleanedItems.length === 0) {
      res.status(400).json({ error: 'Please provide at least one valid medication name.' });
      return;
    }

    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    const doctor =
      state.doctors.find((d) => d.id === user.doctorId) ||
      state.doctors.find((d) => d.id === patient.assignedDoctorId) ||
      state.doctors[0];

    const allergiesText = decryptPHI(patient.allergiesEncrypted, secret);
    const conflicts = checkMedicationAllergyConflict(
      cleanedItems.map((i) => i.medication),
      allergiesText
    );

    const nowIso = new Date().toISOString();
    const prescription: DigitalPrescription = {
      id: `rx-${Date.now()}`,
      rxCode: `RX-${Math.floor(2610 + Math.random() * 7000)}`,
      encounterId: encounterId || undefined,
      appointmentId: appointmentId || undefined,
      patientId: patient.id,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      doctorId: doctor.id,
      doctorName: doctor.name,
      departmentName: doctor.departmentName,
      diagnosis: diagnosis.trim(),
      items: cleanedItems,
      allergyWarning: conflicts.length > 0 ? conflicts.join(' ') : undefined,
      notes: notes?.trim() || undefined,
      status: 'Active',
      issuedAt: nowIso,
    };

    state.prescriptions.unshift(prescription);
    patient.prescriptionsEncrypted = encryptPHI(formatPrescriptionSummary(cleanedItems), secret);
    patient.lastUpdatedAt = nowIso;

    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'PRESCRIPTION_ISSUED',
      resourceType: 'DigitalPrescription',
      resourceId: prescription.rxCode,
      outcome: 'ALLOWED',
      details: `Issued e-prescription ${prescription.rxCode} (${cleanedItems.length} item(s)) for ${patient.mrn}.`,
    });

    res.status(201).json({
      prescription,
      allergyWarnings: conflicts,
      patient: toPatientView(patient, true, secret),
    });
  });

  app.patch('/api/doctor/prescriptions/:id', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const rx = state.prescriptions.find((p) => p.id === req.params.id);
    if (!rx) {
      res.status(404).json({ error: 'Prescription not found.' });
      return;
    }
    const { status } = req.body as { status?: 'Active' | 'Completed' | 'Discontinued' };
    if (!status || !['Active', 'Completed', 'Discontinued'].includes(status)) {
      res.status(400).json({ error: 'Invalid prescription status.' });
      return;
    }
    rx.status = status;
    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'PRESCRIPTION_UPDATED',
      resourceType: 'DigitalPrescription',
      resourceId: rx.rxCode,
      outcome: 'ALLOWED',
      details: `Prescription ${rx.rxCode} marked ${status}.`,
    });
    res.json({ prescription: rx });
  });

  app.get('/api/lab-orders', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    if (user.role === 'patient') {
      const ownPatientIds = new Set(
        state.patients
          .filter(
            (p) => p.id === user.patientId || p.emailPlain.toLowerCase() === user.email.toLowerCase()
          )
          .map((p) => p.id)
      );
      res.json({
        labOrders: state.labOrders.filter((l) => ownPatientIds.has(l.patientId)),
      });
      return;
    }
    res.json({ labOrders: state.labOrders });
  });

  app.post('/api/doctor/lab-orders', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const { patientId, testName, category, priority, clinicalIndication } = req.body as {
      patientId?: string;
      testName?: string;
      category?: LabCategory;
      priority?: 'Routine' | 'Urgent / STAT';
      clinicalIndication?: string;
    };

    if (!patientId || !testName?.trim() || !clinicalIndication?.trim()) {
      res.status(400).json({ error: 'Patient, test name, and clinical indication are required.' });
      return;
    }

    const patient = state.patients.find((p) => p.id === patientId);
    if (!patient) {
      res.status(404).json({ error: 'Patient record not found.' });
      return;
    }

    const doctor =
      state.doctors.find((d) => d.id === user.doctorId) ||
      state.doctors.find((d) => d.id === patient.assignedDoctorId) ||
      state.doctors[0];

    const nowIso = new Date().toISOString();
    const labOrder: LabOrder = {
      id: `lab-${Date.now()}`,
      orderCode: `LAB-${Math.floor(3110 + Math.random() * 6000)}`,
      patientId: patient.id,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      doctorId: doctor.id,
      doctorName: doctor.name,
      departmentName: doctor.departmentName,
      testName: testName.trim(),
      category: category || 'Biochemistry',
      priority: priority === 'Urgent / STAT' ? 'Urgent / STAT' : 'Routine',
      clinicalIndication: clinicalIndication.trim(),
      status: 'Ordered',
      orderedAt: nowIso,
      updatedAt: nowIso,
    };

    state.labOrders.unshift(labOrder);
    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'LAB_ORDER_CREATED',
      resourceType: 'LabOrder',
      resourceId: labOrder.orderCode,
      outcome: 'ALLOWED',
      details: `Ordered ${labOrder.testName} (${labOrder.priority}) for ${patient.mrn}.`,
    });

    res.status(201).json({ labOrder });
  });

  app.patch('/api/doctor/lab-orders/:id', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const order = state.labOrders.find((l) => l.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Lab order not found.' });
      return;
    }
    const { status, resultSummary, resultFlag } = req.body as {
      status?: LabOrderStatus;
      resultSummary?: string;
      resultFlag?: 'Normal' | 'Borderline' | 'Critical';
    };

    if (status && ['Ordered', 'Sample Collected', 'Results Ready', 'Reviewed'].includes(status)) {
      order.status = status;
    }
    if (typeof resultSummary === 'string') {
      order.resultSummary = resultSummary.trim();
    }
    if (resultFlag && ['Normal', 'Borderline', 'Critical'].includes(resultFlag)) {
      order.resultFlag = resultFlag;
    }
    order.updatedAt = new Date().toISOString();

    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'LAB_ORDER_UPDATED',
      resourceType: 'LabOrder',
      resourceId: order.orderCode,
      outcome: 'ALLOWED',
      details: `Updated ${order.orderCode} status to ${order.status}.`,
    });

    res.json({ labOrder: order });
  });

  app.get('/api/referrals', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    if (user.role === 'patient') {
      const ownPatientIds = new Set(
        state.patients
          .filter(
            (p) => p.id === user.patientId || p.emailPlain.toLowerCase() === user.email.toLowerCase()
          )
          .map((p) => p.id)
      );
      res.json({
        referrals: state.referrals.filter((r) => ownPatientIds.has(r.patientId)),
      });
      return;
    }
    res.json({ referrals: state.referrals });
  });

  app.post('/api/doctor/referrals', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const { patientId, toDoctorId, urgency, reason, clinicalSummary } = req.body as {
      patientId?: string;
      toDoctorId?: string;
      urgency?: 'Routine' | 'Urgent' | 'Emergency';
      reason?: string;
      clinicalSummary?: string;
    };

    if (!patientId || !toDoctorId || !reason?.trim()) {
      res.status(400).json({ error: 'Patient, receiving specialist, and referral reason are required.' });
      return;
    }

    const patient = state.patients.find((p) => p.id === patientId);
    const toDoctor = state.doctors.find((d) => d.id === toDoctorId);
    if (!patient || !toDoctor) {
      res.status(404).json({ error: 'Patient or target specialist not found.' });
      return;
    }

    const fromDoctor =
      state.doctors.find((d) => d.id === user.doctorId) ||
      state.doctors.find((d) => d.id === patient.assignedDoctorId) ||
      state.doctors[0];

    const nowIso = new Date().toISOString();
    const referral: SpecialistReferral = {
      id: `ref-${Date.now()}`,
      referralCode: `REF-${Math.floor(510 + Math.random() * 4000)}`,
      patientId: patient.id,
      patientName: patient.fullName,
      patientMrn: patient.mrn,
      fromDoctorId: fromDoctor.id,
      fromDoctorName: fromDoctor.name,
      fromDepartmentName: fromDoctor.departmentName,
      toDoctorId: toDoctor.id,
      toDoctorName: toDoctor.name,
      toDepartmentName: toDoctor.departmentName,
      urgency: urgency === 'Urgent' || urgency === 'Emergency' ? urgency : 'Routine',
      reason: reason.trim(),
      clinicalSummary: (clinicalSummary || '').trim() || reason.trim(),
      status: 'Pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    state.referrals.unshift(referral);
    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'REFERRAL_CREATED',
      resourceType: 'SpecialistReferral',
      resourceId: referral.referralCode,
      outcome: 'ALLOWED',
      details: `Referred ${patient.mrn} from ${fromDoctor.name} to ${toDoctor.name} (${referral.urgency}).`,
    });

    res.status(201).json({ referral });
  });

  app.patch('/api/doctor/referrals/:id', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const referral = state.referrals.find((r) => r.id === req.params.id);
    if (!referral) {
      res.status(404).json({ error: 'Referral not found.' });
      return;
    }
    const { status, doctorNotes } = req.body as {
      status?: ReferralStatus;
      doctorNotes?: string;
    };
    if (status && ['Pending', 'Accepted', 'Scheduled', 'Completed', 'Declined'].includes(status)) {
      referral.status = status;
    }
    if (typeof doctorNotes === 'string') {
      referral.doctorNotes = doctorNotes.trim();
    }
    referral.updatedAt = new Date().toISOString();

    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'REFERRAL_UPDATED',
      resourceType: 'SpecialistReferral',
      resourceId: referral.referralCode,
      outcome: 'ALLOWED',
      details: `Updated referral ${referral.referralCode} status to ${referral.status}.`,
    });

    res.json({ referral });
  });

  app.patch('/api/doctor/availability', requireDoctorOrAdmin, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const {
      doctorId,
      acceptingNewPatients,
      roomNumber,
      availableDays,
      dailySlots,
      blockedDates,
      telehealthEnabled,
      bio,
    } = req.body as Partial<Doctor> & { doctorId?: string };

    const targetId = user.role === 'doctor' ? user.doctorId : doctorId || user.doctorId;
    const doctor = state.doctors.find((d) => d.id === targetId);
    if (!doctor) {
      res.status(404).json({ error: 'Doctor profile not found.' });
      return;
    }

    if (typeof acceptingNewPatients === 'boolean') {
      doctor.acceptingNewPatients = acceptingNewPatients;
    }
    if (typeof roomNumber === 'string' && roomNumber.trim()) {
      doctor.roomNumber = roomNumber.trim();
    }
    if (typeof telehealthEnabled === 'boolean') {
      doctor.telehealthEnabled = telehealthEnabled;
    }
    if (typeof bio === 'string' && bio.trim()) {
      doctor.bio = bio.trim();
    }
    if (Array.isArray(availableDays)) {
      doctor.availableDays = Array.from(
        new Set(availableDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      ).sort((a, b) => a - b);
    }
    if (Array.isArray(dailySlots) && dailySlots.length > 0) {
      doctor.dailySlots = Array.from(
        new Set(
          dailySlots
            .map((s) => String(s).trim())
            .filter((s) => /^\d{2}:\d{2}$/.test(s))
        )
      ).sort();
    }
    if (Array.isArray(blockedDates)) {
      doctor.blockedDates = Array.from(
        new Set(
          blockedDates
            .map((d) => String(d).trim())
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        )
      ).sort();
    }

    store.save();
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'doctor',
      action: 'DOCTOR_SCHEDULE_UPDATED',
      resourceType: 'Doctor',
      resourceId: doctor.id,
      outcome: 'ALLOWED',
      details: `${doctor.name} updated availability (accepting=${doctor.acceptingNewPatients}, slots=${doctor.dailySlots.length}, blocked=${doctor.blockedDates?.length || 0}).`,
    });

    res.json({ doctor });
  });

  // Payments
  app.get('/api/payments', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    if (user.role === 'patient') {
      const ownApptIds = new Set(
        state.appointments
          .filter(
            (a) =>
              a.patientEmail.toLowerCase() === user.email.toLowerCase() ||
              a.patientId === user.patientId
          )
          .map((a) => a.id)
      );
      res.json({ payments: state.payments.filter((p) => ownApptIds.has(p.appointmentId)) });
      return;
    }
    res.json({ payments: state.payments });
  });

  app.post('/api/payments/settle', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    const { appointmentId, method, reference } = req.body as {
      appointmentId?: string;
      method?: PaymentMethod;
      reference?: string;
    };

    const appt = state.appointments.find((a) => a.id === appointmentId);
    if (!appt) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    if (
      user.role === 'patient' &&
      appt.patientEmail.toLowerCase() !== user.email.toLowerCase() &&
      appt.patientId !== user.patientId
    ) {
      res.status(403).json({ error: 'You may only settle payments for your own appointments.' });
      return;
    }
    if (appt.paymentStatus === 'Paid') {
      res.status(409).json({ error: 'This appointment is already paid.' });
      return;
    }

    const doc = state.doctors.find((d) => d.id === appt.doctorId);
    const fee = doc ? doc.consultationFee : 1000;
    const chosenMethod: PaymentMethod = method || 'Card';
    const totals = calculateBillingTotals(
      fee,
      chosenMethod,
      state.systemConfig.defaultInsuranceCoveragePct,
      state.systemConfig.platformProcessingFee
    );

    const nowIso = new Date().toISOString();
    const invoiceId = `INV-MS-${Math.floor(8810 + Math.random() * 1000)}`;
    appt.paymentStatus = 'Paid';
    appt.paymentMethod = chosenMethod;
    appt.amountPaid = totals.totalAmount;
    appt.invoiceId = invoiceId;

    const tx: PaymentTransaction = {
      id: `pay-${Date.now()}`,
      invoiceId,
      appointmentId: appt.id,
      bookingCode: appt.bookingCode,
      patientName: appt.patientName,
      doctorName: appt.doctorName,
      departmentName: appt.departmentName,
      subtotal: totals.subtotal,
      insuranceDiscount: totals.insuranceDiscount,
      platformFee: totals.platformFee,
      totalAmount: totals.totalAmount,
      method: chosenMethod,
      lastFourOrRef: reference?.trim() || 'Card •••• 4242',
      status: 'Paid',
      paidAt: nowIso,
    };

    state.payments.unshift(tx);
    store.addAuditLog({
      actorEmail: user.email,
      actorRole: user.role,
      portal: 'user',
      action: 'PAYMENT_PROCESSED',
      resourceType: 'PaymentTransaction',
      resourceId: invoiceId,
      outcome: 'ALLOWED',
      details: `Settled ${state.systemConfig.currencySymbol}${totals.totalAmount.toLocaleString('en-IN')} (${chosenMethod}) for ${appt.bookingCode}.`,
    });

    res.json({ appointment: appt, transaction: tx });
  });

  // Email Reminders
  app.get('/api/reminders', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const state = store.getState();
    if (user.role === 'patient') {
      const ownApptIds = new Set(
        state.appointments
          .filter(
            (a) =>
              a.patientEmail.toLowerCase() === user.email.toLowerCase() ||
              a.patientId === user.patientId
          )
          .map((a) => a.id)
      );
      res.json({ reminders: state.reminders.filter((r) => ownApptIds.has(r.appointmentId)) });
      return;
    }
    res.json({ reminders: state.reminders });
  });

  app.post('/api/reminders/dispatch', requireAuth, (req: AuthRequest, res) => {
    const user = req.authUser!;
    const { appointmentId } = req.body as { appointmentId?: string };
    const state = store.getState();
    const nowIso = new Date().toISOString();
    let count = 0;

    if (appointmentId) {
      const appt = state.appointments.find((a) => a.id === appointmentId);
      if (!appt) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      if (
        user.role === 'patient' &&
        appt.patientEmail.toLowerCase() !== user.email.toLowerCase() &&
        appt.patientId !== user.patientId
      ) {
        res.status(403).json({ error: 'Cannot dispatch reminder for another patient.' });
        return;
      }
      const existing = state.reminders.find((r) => r.appointmentId === appt.id);
      if (existing) {
        existing.status = 'Sent';
        existing.sentAt = nowIso;
        existing.channel = 'Manual Staff Trigger';
      } else {
        state.reminders.unshift({
          id: `rem-${Date.now()}`,
          appointmentId: appt.id,
          bookingCode: appt.bookingCode,
          recipientName: appt.patientName,
          maskedRecipientEmail: maskEmailAddress(appt.patientEmail),
          doctorName: appt.doctorName,
          departmentName: appt.departmentName,
          visitDate: appt.date,
          visitTime: appt.timeSlot,
          subject: `MediStream Visit Reminder: ${appt.doctorName} on ${appt.date} at ${appt.timeSlot}`,
          bodyPreview: `Dear ${appt.patientName}, your ${appt.departmentName} consultation (${appt.bookingCode}) with ${appt.doctorName} is confirmed for ${appt.date} at ${appt.timeSlot}.`,
          channel: 'Manual Staff Trigger',
          status: 'Sent',
          scheduledFor: nowIso,
          sentAt: nowIso,
        });
      }
      appt.reminderStatus = 'Sent';
      appt.reminderSentAt = nowIso;
      count = 1;
      store.addAuditLog({
        actorEmail: user.email,
        actorRole: user.role,
        portal: 'user',
        action: 'REMINDER_DISPATCHED',
        resourceType: 'EmailReminder',
        resourceId: appt.bookingCode,
        outcome: 'ALLOWED',
        details: `Triggered HIPAA email reminder for ${appt.bookingCode}.`,
      });
    } else {
      if (user.role === 'patient') {
        res.status(403).json({ error: 'Batch reminder dispatch is restricted to clinic administrators.' });
        return;
      }
      for (const rem of state.reminders) {
        if (rem.status === 'Queued') {
          rem.status = 'Sent';
          rem.sentAt = nowIso;
          rem.channel = 'Manual Staff Trigger';
          const appt = state.appointments.find((a) => a.id === rem.appointmentId);
          if (appt) {
            appt.reminderStatus = 'Sent';
            appt.reminderSentAt = nowIso;
          }
          count += 1;
        }
      }
      count += runAutomatedReminderCheck('Manual Staff Trigger', user.email, user.role);
      if (count > 0) {
        store.addAuditLog({
          actorEmail: user.email,
          actorRole: user.role,
          portal: 'user',
          action: 'REMINDER_BATCH_DISPATCHED',
          resourceType: 'EmailReminder',
          resourceId: `${count}-emails`,
          outcome: 'ALLOWED',
          details: `Batch dispatched ${count} queued visit reminder email(s).`,
        });
      }
    }

    const visibleReminders =
      user.role === 'patient'
        ? state.reminders.filter((r) =>
            state.appointments.some(
              (a) =>
                a.id === r.appointmentId &&
                (a.patientEmail.toLowerCase() === user.email.toLowerCase() ||
                  a.patientId === user.patientId)
            )
          )
        : state.reminders;

    res.json({ dispatchedCount: count, reminders: visibleReminders });
  });

  // Admin Portal Endpoints (Protected by requireAdmin)
  app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
    const state = store.getState();
    const analytics = computeHospitalAnalytics(
      state.appointments,
      state.doctors,
      state.payments,
      state.reminders,
      state.patients.length,
      state.auditLogs
    );
    res.json({ analytics });
  });

  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    const state = store.getState();
    res.json({ users: state.users.map(toUserView) });
  });

  app.post('/api/admin/users', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const state = store.getState();
    const { name, email, password, role, departmentId, doctorId, mfaEnabled } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      departmentId?: string;
      doctorId?: string;
      mfaEnabled?: boolean;
    };

    if (!name?.trim() || !email?.trim() || !role) {
      res.status(400).json({ error: 'Name, email, and role are required.' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (state.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }

    const created: StoredUser = {
      id: `usr-${Date.now()}`,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password || (role === 'doctor' ? 'Doctor@2026' : 'Clinical@2026')),
      role,
      departmentId: departmentId || undefined,
      doctorId: role === 'doctor' ? doctorId || undefined : undefined,
      mfaEnabled: Boolean(mfaEnabled),
      active: true,
      createdAt: new Date().toISOString(),
    };

    state.users.unshift(created);
    store.save();
    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'USER_ACCOUNT_CREATED',
      resourceType: 'UserAccount',
      resourceId: created.email,
      outcome: 'ALLOWED',
      details: `Created ${role} profile for ${created.name}.`,
    });

    res.status(201).json({ user: toUserView(created) });
  });

  app.patch('/api/admin/users/:id', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const state = store.getState();
    const target = state.users.find((u) => u.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const { role, mfaEnabled, active, doctorId } = req.body as {
      role?: UserRole;
      mfaEnabled?: boolean;
      active?: boolean;
      doctorId?: string;
    };

    if (role && ['patient', 'doctor', 'staff', 'admin'].includes(role)) target.role = role;
    if (typeof mfaEnabled === 'boolean') target.mfaEnabled = mfaEnabled;
    if (typeof active === 'boolean') target.active = active;
    if (typeof doctorId === 'string') target.doctorId = doctorId || undefined;

    store.save();
    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'RBAC_UPDATED',
      resourceType: 'UserAccount',
      resourceId: target.email,
      outcome: 'ALLOWED',
      details: `Updated RBAC profile: role=${target.role}, active=${target.active}.`,
    });

    res.json({ user: toUserView(target) });
  });

  app.post('/api/admin/doctors', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const state = store.getState();
    const {
      name,
      departmentId,
      specialty,
      qualifications,
      experienceYears,
      consultationFee,
      languages,
      roomNumber,
      bio,
      email,
    } = req.body as {
      name?: string;
      departmentId?: string;
      specialty?: string;
      qualifications?: string;
      experienceYears?: number;
      consultationFee?: number;
      languages?: string[];
      roomNumber?: string;
      bio?: string;
      email?: string;
    };

    if (!name?.trim() || !departmentId || !specialty?.trim()) {
      res.status(400).json({ error: 'Physician name, department, and specialty are required.' });
      return;
    }

    const dept = state.departments.find((d) => d.id === departmentId);
    if (!dept) {
      res.status(404).json({ error: 'Selected department was not found.' });
      return;
    }

    const docId = `doc-${Date.now()}`;
    const newDoctor: Doctor = {
      id: docId,
      name: name.trim().startsWith('Dr.') ? name.trim() : `Dr. ${name.trim()}`,
      departmentId: dept.id,
      departmentName: dept.name,
      specialty: specialty.trim(),
      qualifications: qualifications?.trim() || 'MBBS, MD',
      experienceYears: Math.max(1, Number(experienceYears) || 5),
      consultationFee: Math.max(0, Number(consultationFee) || 1000),
      languages: Array.isArray(languages) && languages.length > 0 ? languages : ['English', 'Tamil'],
      roomNumber: roomNumber?.trim() || 'Suite 210',
      bio: bio?.trim() || `Senior specialist in ${dept.name} at MediStream Clinical Center.`,
      availableDays: [1, 2, 3, 4, 5, 6],
      dailySlots: ['09:00', '10:00', '11:30', '14:00', '15:30', '17:00'],
      blockedDates: [],
      telehealthEnabled: true,
      acceptingNewPatients: true,
    };

    state.doctors.push(newDoctor);

    const docEmail =
      (email && email.trim().toLowerCase()) ||
      `${newDoctor.name
        .replace(/^Dr\.\s+/i, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .trim()
        .split(/\s+/)
        .join('.')}@medistream.org`;

    let createdUser: StoredUser | undefined;
    if (!state.users.some((u) => u.email.toLowerCase() === docEmail)) {
      createdUser = {
        id: `usr-doc-${Date.now()}`,
        name: newDoctor.name,
        email: docEmail,
        passwordHash: hashPassword('Doctor@2026'),
        role: 'doctor',
        departmentId: dept.id,
        doctorId: newDoctor.id,
        mfaEnabled: true,
        active: true,
        createdAt: new Date().toISOString(),
      };
      state.users.unshift(createdUser);
    }

    store.save();
    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'DOCTOR_CREATED',
      resourceType: 'Doctor',
      resourceId: newDoctor.id,
      outcome: 'ALLOWED',
      details: `Added attending specialist ${newDoctor.name} (${dept.name}) with Doctor Portal account ${docEmail}.`,
    });

    res.status(201).json({
      doctor: newDoctor,
      user: createdUser ? toUserView(createdUser) : undefined,
    });
  });

  app.patch('/api/admin/doctors/:id', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const state = store.getState();
    const doc = state.doctors.find((d) => d.id === req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Doctor not found.' });
      return;
    }

    const { consultationFee, acceptingNewPatients, roomNumber } = req.body as Partial<Doctor>;
    if (typeof consultationFee === 'number' && consultationFee >= 0) doc.consultationFee = consultationFee;
    if (typeof acceptingNewPatients === 'boolean') doc.acceptingNewPatients = acceptingNewPatients;
    if (typeof roomNumber === 'string' && roomNumber.trim()) doc.roomNumber = roomNumber.trim();
    store.save();

    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'DOCTOR_PROFILE_UPDATED',
      resourceType: 'Doctor',
      resourceId: doc.id,
      outcome: 'ALLOWED',
      details: `Updated ${doc.name}: fee=${doc.consultationFee}, accepting=${doc.acceptingNewPatients}.`,
    });

    res.json({ doctor: doc });
  });

  app.get('/api/admin/config', requireAdmin, (_req, res) => {
    res.json({ config: store.getState().systemConfig });
  });

  app.patch('/api/admin/config', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const state = store.getState();
    const updates = req.body as Partial<typeof state.systemConfig>;

    if (typeof updates.hospitalName === 'string' && updates.hospitalName.trim()) {
      state.systemConfig.hospitalName = updates.hospitalName.trim();
    }
    if (typeof updates.enforceMfaForAllPortals === 'boolean') {
      state.systemConfig.enforceMfaForAllPortals = updates.enforceMfaForAllPortals;
    }
    if (typeof updates.sessionTimeoutMinutes === 'number' && updates.sessionTimeoutMinutes >= 5) {
      state.systemConfig.sessionTimeoutMinutes = updates.sessionTimeoutMinutes;
    }
    if (typeof updates.reminderLeadHours === 'number' && updates.reminderLeadHours >= 1) {
      state.systemConfig.reminderLeadHours = updates.reminderLeadHours;
    }
    if (typeof updates.autoReminderEnabled === 'boolean') {
      state.systemConfig.autoReminderEnabled = updates.autoReminderEnabled;
    }
    if (typeof updates.smtpHost === 'string' && updates.smtpHost.trim()) {
      state.systemConfig.smtpHost = updates.smtpHost.trim();
    }
    if (typeof updates.smtpSenderEmail === 'string' && updates.smtpSenderEmail.trim()) {
      state.systemConfig.smtpSenderEmail = updates.smtpSenderEmail.trim();
    }
    if (typeof updates.defaultInsuranceCoveragePct === 'number') {
      state.systemConfig.defaultInsuranceCoveragePct = Math.min(90, Math.max(0, updates.defaultInsuranceCoveragePct));
    }
    if (typeof updates.platformProcessingFee === 'number') {
      state.systemConfig.platformProcessingFee = Math.max(0, updates.platformProcessingFee);
    }

    state.systemConfig.updatedAt = new Date().toISOString();
    state.systemConfig.updatedBy = admin.email;

    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'SYSTEM_CONFIG_UPDATED',
      resourceType: 'SystemConfig',
      resourceId: 'global-settings',
      outcome: 'ALLOWED',
      details: `Updated system settings (reminderLead=${state.systemConfig.reminderLeadHours}h, fee=${state.systemConfig.platformProcessingFee}).`,
    });

    res.json({ config: state.systemConfig });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (_req, res) => {
    res.json({ auditLogs: store.getState().auditLogs });
  });

  // --- Ambulance Fleet & Emergency Dispatch Routes ---
  app.get('/api/public/ambulances', (_req, res) => {
    const state = store.getState();
    res.json({
      units: state.ambulances,
      availableCount: state.ambulances.filter((u) => u.status === 'Available').length,
      currencySymbol: state.systemConfig.currencySymbol,
    });
  });

  app.get('/api/public/ambulances/track', (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Dispatch code is required.' });
      return;
    }
    const found = store
      .getState()
      .ambulanceDispatches.find((d) => d.dispatchCode.toUpperCase() === code);
    if (!found) {
      res.status(404).json({ error: `No dispatch found for reference ${code}.` });
      return;
    }
    res.json({
      dispatch: {
        ...found,
        patientPhone: maskPhoneNumber(found.patientPhone),
        patientEmail: found.patientEmail ? maskEmailAddress(found.patientEmail) : '',
      },
    });
  });

  app.post('/api/public/ambulances/dispatch', (req, res) => {
    const {
      patientName,
      patientPhone,
      patientEmail,
      pickupAddress,
      landmark,
      unitType,
      unitId,
      priority,
      clinicalCondition,
      distanceKm,
    } = req.body as {
      patientName?: string;
      patientPhone?: string;
      patientEmail?: string;
      pickupAddress?: string;
      landmark?: string;
      unitType?: AmbulanceUnitType;
      unitId?: string;
      priority?: AmbulancePriority;
      clinicalCondition?: string;
      distanceKm?: number;
    };

    if (!patientName?.trim() || !patientPhone?.trim() || !pickupAddress?.trim()) {
      res.status(400).json({
        error: 'Patient name, emergency contact phone, and pickup address are required.',
      });
      return;
    }

    const state = store.getState();
    let selectedUnit = unitId
      ? state.ambulances.find((u) => u.id === unitId && u.status === 'Available') || null
      : null;

    if (!selectedUnit) {
      selectedUnit = selectBestAmbulanceUnit(state.ambulances, unitType);
    }

    if (!selectedUnit) {
      res.status(409).json({
        error: 'All MediStream ambulance units are currently on active calls. Call 108 or wait for dispatch clearance.',
      });
      return;
    }

    const safePriority: AmbulancePriority =
      priority === 'Critical Emergency' ||
      priority === 'Urgent Transfer' ||
      priority === 'Scheduled Patient Transport'
        ? priority
        : 'Critical Emergency';

    const safeDistanceKm = Math.min(120, Math.max(1, Number(distanceKm) || 6));
    const calc = calculateAmbulanceDispatchMetrics(
      selectedUnit.unitType,
      safeDistanceKm,
      safePriority,
      selectedUnit.baseFeeInr,
      selectedUnit.perKmFeeInr
    );

    const nowIso = new Date().toISOString();
    const dispatchCode = `AMB-${Math.floor(1000 + Math.random() * 9000)}`;
    const dispatch: AmbulanceDispatch = {
      id: `disp-${Date.now()}`,
      dispatchCode,
      unitId: selectedUnit.id,
      vehicleNumber: selectedUnit.vehicleNumber,
      unitType: selectedUnit.unitType,
      driverName: selectedUnit.driverName,
      driverPhone: selectedUnit.contactPhone,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      patientEmail: (patientEmail || '').trim().toLowerCase(),
      pickupAddress: pickupAddress.trim(),
      landmark: (landmark || '').trim() || 'Main access road',
      priority: safePriority,
      clinicalCondition: (clinicalCondition || '').trim() || 'Emergency clinical transport',
      distanceKm: safeDistanceKm,
      estimatedEtaMinutes: calc.estimatedEtaMinutes,
      estimatedFareInr: calc.totalFare,
      status: 'Dispatched',
      requestedAt: nowIso,
      updatedAt: nowIso,
    };

    selectedUnit.status = 'Dispatched';
    state.ambulanceDispatches.unshift(dispatch);
    store.save();

    store.addAuditLog({
      actorEmail: dispatch.patientEmail || maskPhoneNumber(dispatch.patientPhone),
      actorRole: dispatch.patientEmail ? 'patient' : 'anonymous',
      portal: 'public',
      action: 'AMBULANCE_DISPATCHED',
      resourceType: 'AmbulanceDispatch',
      resourceId: dispatch.dispatchCode,
      outcome: 'ALLOWED',
      details: `Dispatched ${selectedUnit.vehicleNumber} (${selectedUnit.unitType}) for ${dispatch.priority}, ETA ${calc.estimatedEtaMinutes} mins.`,
    });

    res.status(201).json({
      dispatch,
      unit: selectedUnit,
      calculation: calc,
    });
  });

  app.get('/api/ambulances/dispatches', requireAuth, (req: AuthRequest, res) => {
    const authUser = req.authUser!;
    const all = store.getState().ambulanceDispatches;
    const dispatches =
      authUser.role === 'patient'
        ? all.filter(
            (d) =>
              d.patientEmail.toLowerCase() === authUser.email.toLowerCase() ||
              d.patientName.toLowerCase() === authUser.name.toLowerCase()
          )
        : all;
    res.json({
      dispatches,
      units: store.getState().ambulances,
    });
  });

  app.patch('/api/admin/ambulances/units/:id/status', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const { status } = req.body as { status?: AmbulanceUnitStatus };
    const unit = store.getState().ambulances.find((u) => u.id === req.params.id);
    if (!unit) {
      res.status(404).json({ error: 'Ambulance unit not found.' });
      return;
    }
    if (status !== 'Available' && status !== 'Dispatched' && status !== 'Maintenance') {
      res.status(400).json({ error: 'Invalid unit status.' });
      return;
    }
    unit.status = status;
    store.save();
    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'AMBULANCE_UNIT_UPDATED',
      resourceType: 'AmbulanceUnit',
      resourceId: unit.vehicleNumber,
      outcome: 'ALLOWED',
      details: `Updated unit ${unit.vehicleNumber} status to ${status}.`,
    });
    res.json({ unit });
  });

  app.patch('/api/admin/ambulances/dispatches/:id/status', requireAdmin, (req: AuthRequest, res) => {
    const admin = req.authUser!;
    const { status } = req.body as { status?: AmbulanceDispatchStatus };
    const allowed: AmbulanceDispatchStatus[] = [
      'Dispatched',
      'En Route',
      'Arrived at Pickup',
      'In Transit to Hospital',
      'Completed',
      'Cancelled',
    ];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid dispatch status.' });
      return;
    }
    const state = store.getState();
    const dispatch = state.ambulanceDispatches.find((d) => d.id === req.params.id);
    if (!dispatch) {
      res.status(404).json({ error: 'Dispatch record not found.' });
      return;
    }

    dispatch.status = status;
    dispatch.updatedAt = new Date().toISOString();

    const assignedUnit = state.ambulances.find((u) => u.id === dispatch.unitId);
    if (assignedUnit) {
      if (status === 'Completed' || status === 'Cancelled') {
        assignedUnit.status = 'Available';
      } else {
        assignedUnit.status = 'Dispatched';
      }
    }

    store.save();
    store.addAuditLog({
      actorEmail: admin.email,
      actorRole: 'admin',
      portal: 'admin',
      action: 'AMBULANCE_DISPATCH_UPDATED',
      resourceType: 'AmbulanceDispatch',
      resourceId: dispatch.dispatchCode,
      outcome: 'ALLOWED',
      details: `Updated dispatch ${dispatch.dispatchCode} (${dispatch.vehicleNumber}) to ${status}.`,
    });

    res.json({ dispatch, units: state.ambulances });
  });

  app.get('/api/admin/database', requireAdmin, (_req, res) => {
    const state = store.getState();
    const encSecret = getEncryptionSecret();
    let firestoreProjectId = 'gen-lang-client-0470185171';
    let firestoreDatabaseId = 'ai-studio-medistream-b370ca07-dd03-4d27-b454-3f3750fdd327';
    try {
      const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(cfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
          projectId?: string;
          firestoreDatabaseId?: string;
        };
        if (parsed.projectId) firestoreProjectId = parsed.projectId;
        if (parsed.firestoreDatabaseId) firestoreDatabaseId = parsed.firestoreDatabaseId;
      }
    } catch {
      // Ignore config read errors and use defaults
    }

    res.json({
      storageMeta: {
        firestoreProjectId,
        firestoreDatabaseId,
        serverStorePath: '.data/medistream-store.json',
      },
      collections: {
        appointments: state.appointments,
        patients: state.patients.map((p) => toPatientView(p, false, encSecret)),
        payments: state.payments,
        reminders: state.reminders,
        users: state.users.map(toUserView),
        doctors: state.doctors,
        departments: state.departments,
        ambulances: state.ambulances,
        ambulanceDispatches: state.ambulanceDispatches,
        encounters: state.encounters,
        prescriptions: state.prescriptions,
        labOrders: state.labOrders,
        referrals: state.referrals,
      },
    });
  });

  // Vite dev middleware or static dist serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`MediStream server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MediStream server:', err);
  process.exit(1);
});
