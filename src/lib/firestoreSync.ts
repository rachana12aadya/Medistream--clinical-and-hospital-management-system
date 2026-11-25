import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '../firebase';
import type {
  AmbulanceDispatch,
  Appointment,
  Department,
  Doctor,
  EmailReminder,
  PatientRecordView,
  PaymentTransaction,
  SystemConfig,
  UserAccountView,
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function clamp(value: string, max: number, fallback = '-'): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

export async function syncFirebaseUserProfileToFirestore(
  firebaseUser: FirebaseUser,
  userAccount: UserAccountView,
  patientId?: string
): Promise<void> {
  if (!firebaseUser.emailVerified) return;

  const userPath = `users/${firebaseUser.uid}`;
  const userRef = doc(db, 'users', firebaseUser.uid);

  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        displayName: clamp(userAccount.name || firebaseUser.displayName || 'MediStream User', 120),
        role: 'patient',
        mfaEnabled: Boolean(userAccount.mfaEnabled),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        displayName: clamp(userAccount.name || firebaseUser.displayName || 'MediStream User', 120),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const privatePath = `users/${firebaseUser.uid}/private/info`;
  const privateRef = doc(db, 'users', firebaseUser.uid, 'private', 'info');
  try {
    const privateSnap = await getDoc(privateRef);
    const payload: Record<string, unknown> = {
      uid: firebaseUser.uid,
      email: clamp(firebaseUser.email || userAccount.email, 160),
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (patientId && /^[a-zA-Z0-9_-]+$/.test(patientId)) {
      payload.patientId = patientId;
    }

    if (!privateSnap.exists()) {
      await setDoc(privateRef, payload);
    } else {
      await updateDoc(privateRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export async function syncBookingToFirestore(
  firebaseUser: FirebaseUser,
  appointment: Appointment,
  transaction?: PaymentTransaction,
  reminder?: EmailReminder
): Promise<void> {
  if (!firebaseUser.emailVerified) return;

  const batch = writeBatch(db);
  const aptPath = `appointments/${appointment.id}`;

  try {
    const aptDoc: Record<string, unknown> = {
      id: appointment.id,
      ownerUid: firebaseUser.uid,
      bookingCode: clamp(appointment.bookingCode, 32),
      patientId: appointment.patientId,
      patientName: clamp(appointment.patientName, 120),
      doctorId: appointment.doctorId,
      doctorName: clamp(appointment.doctorName, 120),
      departmentId: appointment.departmentId,
      departmentName: clamp(appointment.departmentName, 80),
      date: clamp(appointment.date, 20),
      timeSlot: clamp(appointment.timeSlot, 16),
      visitType: appointment.visitType,
      reasonSummary: clamp(appointment.reasonSummary, 500, 'Specialist consultation'),
      status: appointment.status,
      paymentStatus: appointment.paymentStatus,
      amountPaid: Number(appointment.amountPaid) || 0,
      reminderStatus: appointment.reminderStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (appointment.invoiceId) {
      aptDoc.invoiceId = clamp(appointment.invoiceId, 64);
    }
    batch.set(doc(db, 'appointments', appointment.id), aptDoc);

    if (transaction) {
      batch.set(doc(db, 'payments', transaction.id), {
        id: transaction.id,
        ownerUid: firebaseUser.uid,
        invoiceId: clamp(transaction.invoiceId, 64),
        appointmentId: transaction.appointmentId,
        bookingCode: clamp(transaction.bookingCode, 32),
        patientName: clamp(transaction.patientName, 120),
        doctorName: clamp(transaction.doctorName, 120),
        departmentName: clamp(transaction.departmentName, 80),
        subtotal: Number(transaction.subtotal) || 0,
        insuranceDiscount: Number(transaction.insuranceDiscount) || 0,
        platformFee: Number(transaction.platformFee) || 0,
        totalAmount: Number(transaction.totalAmount) || 0,
        method: transaction.method,
        lastFourOrRef: clamp(transaction.lastFourOrRef, 80),
        status: transaction.status,
        paidAt: clamp(transaction.paidAt, 40),
        createdAt: serverTimestamp(),
      });
    }

    if (reminder) {
      batch.set(doc(db, 'reminders', reminder.id), {
        id: reminder.id,
        ownerUid: firebaseUser.uid,
        appointmentId: reminder.appointmentId,
        bookingCode: clamp(reminder.bookingCode, 32),
        recipientName: clamp(reminder.recipientName, 120),
        maskedRecipientEmail: clamp(reminder.maskedRecipientEmail, 160),
        doctorName: clamp(reminder.doctorName, 120),
        departmentName: clamp(reminder.departmentName, 80),
        visitDate: clamp(reminder.visitDate, 20),
        visitTime: clamp(reminder.visitTime, 16),
        subject: clamp(reminder.subject, 200),
        bodyPreview: clamp(reminder.bodyPreview, 600),
        channel: reminder.channel,
        status: reminder.status,
        scheduledFor: clamp(reminder.scheduledFor, 40),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, aptPath);
  }
}

export async function syncPatientRecordsToFirestore(
  firebaseUser: FirebaseUser,
  patients: PatientRecordView[]
): Promise<void> {
  if (!firebaseUser.emailVerified || patients.length === 0) return;

  for (const patient of patients) {
    const path = `patients/${patient.id}`;
    try {
      const ref = doc(db, 'patients', patient.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          id: patient.id,
          ownerUid: firebaseUser.uid,
          mrn: clamp(patient.mrn, 40),
          fullName: clamp(patient.fullName, 120),
          dateOfBirth: clamp(patient.dateOfBirth, 20),
          gender: patient.gender,
          bloodGroup: clamp(patient.bloodGroup, 10, 'O+'),
          maskedPhone: clamp(patient.maskedPhone, 40),
          maskedEmail: clamp(patient.maskedEmail, 160),
          primaryDepartment: clamp(patient.primaryDepartment, 80),
          assignedDoctorId: patient.assignedDoctorId,
          assignedDoctorName: clamp(patient.assignedDoctorName, 120),
          encryptionCipher: clamp(patient.encryptionCipher, 40, 'AES-256-GCM'),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export async function syncAppointmentCancelToFirestore(
  firebaseUser: FirebaseUser,
  appointmentId: string
): Promise<void> {
  if (!firebaseUser.emailVerified) return;
  const path = `appointments/${appointmentId}`;
  try {
    const ref = doc(db, 'appointments', appointmentId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data()?.ownerUid === firebaseUser.uid) {
      await updateDoc(ref, {
        status: 'Cancelled',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncCatalogToFirestoreIfAdmin(
  firebaseUser: FirebaseUser,
  departments: Department[],
  doctors: Doctor[],
  config?: SystemConfig
): Promise<void> {
  if (
    !firebaseUser.emailVerified ||
    (firebaseUser.email !== 'rachana12aadya@gmail.com' &&
      firebaseUser.email !== 'mogow881@gmail.com')
  ) {
    return;
  }

  const batch = writeBatch(db);
  try {
    for (const dept of departments) {
      batch.set(doc(db, 'departments', dept.id), {
        id: dept.id,
        name: clamp(dept.name, 80),
        code: clamp(dept.code, 16),
        floor: clamp(dept.floor, 80),
        description: clamp(dept.description, 400),
        headDoctorId: dept.headDoctorId,
        updatedAt: serverTimestamp(),
      });
    }

    for (const docItem of doctors) {
      batch.set(doc(db, 'doctors', docItem.id), {
        id: docItem.id,
        name: clamp(docItem.name, 120),
        departmentId: docItem.departmentId,
        departmentName: clamp(docItem.departmentName, 80),
        specialty: clamp(docItem.specialty, 160),
        qualifications: clamp(docItem.qualifications, 160),
        experienceYears: Number(docItem.experienceYears) || 1,
        consultationFee: Number(docItem.consultationFee) || 0,
        languages: docItem.languages.slice(0, 10),
        roomNumber: clamp(docItem.roomNumber, 40),
        bio: clamp(docItem.bio, 600),
        acceptingNewPatients: Boolean(docItem.acceptingNewPatients),
        updatedAt: serverTimestamp(),
      });
    }

    if (config) {
      batch.set(doc(db, 'system', 'config'), {
        hospitalName: clamp(config.hospitalName, 120),
        hipaaEncryptionAlgorithm: clamp(config.hipaaEncryptionAlgorithm, 80),
        currencySymbol: clamp(config.currencySymbol, 8, '₹'),
        platformProcessingFee: Number(config.platformProcessingFee) || 0,
        defaultInsuranceCoveragePct: Number(config.defaultInsuranceCoveragePct) || 0,
        reminderLeadHours: Number(config.reminderLeadHours) || 24,
        enforceMfaForAllPortals: Boolean(config.enforceMfaForAllPortals),
        sessionTimeoutMinutes: Number(config.sessionTimeoutMinutes) || 30,
        updatedBy: clamp(config.updatedBy, 160),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'departments');
  }
}

export async function fetchUserFirestoreRecordCount(firebaseUser: FirebaseUser): Promise<number> {
  if (!firebaseUser.emailVerified) return 0;
  const path = 'appointments';
  try {
    const q = query(collection(db, path), where('ownerUid', '==', firebaseUser.uid));
    const snap = await getDocs(q);
    return snap.size;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function syncPaymentToFirestore(
  firebaseUser: FirebaseUser,
  transaction: PaymentTransaction
): Promise<void> {
  if (!firebaseUser.emailVerified) return;
  const path = `payments/${transaction.id}`;
  try {
    await setDoc(doc(db, 'payments', transaction.id), {
      id: transaction.id,
      ownerUid: firebaseUser.uid,
      invoiceId: clamp(transaction.invoiceId, 64),
      appointmentId: transaction.appointmentId,
      bookingCode: clamp(transaction.bookingCode, 32),
      patientName: clamp(transaction.patientName, 120),
      doctorName: clamp(transaction.doctorName, 120),
      departmentName: clamp(transaction.departmentName, 80),
      subtotal: Number(transaction.subtotal) || 0,
      insuranceDiscount: Number(transaction.insuranceDiscount) || 0,
      platformFee: Number(transaction.platformFee) || 0,
      totalAmount: Number(transaction.totalAmount) || 0,
      method: transaction.method,
      lastFourOrRef: clamp(transaction.lastFourOrRef, 80),
      status: transaction.status,
      paidAt: clamp(transaction.paidAt, 40),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncAmbulanceDispatchToFirestore(
  firebaseUser: FirebaseUser,
  dispatch: AmbulanceDispatch
): Promise<void> {
  if (!firebaseUser.emailVerified) return;
  const path = `ambulanceDispatches/${dispatch.id}`;
  try {
    await setDoc(doc(db, 'ambulanceDispatches', dispatch.id), {
      id: dispatch.id,
      ownerUid: firebaseUser.uid,
      dispatchCode: clamp(dispatch.dispatchCode, 32),
      unitId: dispatch.unitId,
      vehicleNumber: clamp(dispatch.vehicleNumber, 40),
      unitType: dispatch.unitType,
      driverName: clamp(dispatch.driverName, 120),
      driverPhone: clamp(dispatch.driverPhone, 40),
      patientName: clamp(dispatch.patientName, 120),
      pickupAddress: clamp(dispatch.pickupAddress, 300),
      landmark: clamp(dispatch.landmark, 160),
      priority: dispatch.priority,
      clinicalCondition: clamp(dispatch.clinicalCondition, 300),
      distanceKm: Number(dispatch.distanceKm) || 1,
      estimatedEtaMinutes: Number(dispatch.estimatedEtaMinutes) || 10,
      estimatedFareInr: Number(dispatch.estimatedFareInr) || 0,
      status: dispatch.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
