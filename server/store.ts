import fs from 'node:fs';
import path from 'node:path';
import type {
  AmbulanceDispatch,
  AmbulanceUnit,
  Appointment,
  AuditLogEntry,
  ClinicalEncounter,
  Department,
  DigitalPrescription,
  Doctor,
  EmailReminder,
  LabOrder,
  PaymentTransaction,
  PortalType,
  SpecialistReferral,
  SystemConfig,
  UserRole,
} from '../src/types.ts';
import { encryptPHI, getKeyFingerprint, hashPassword } from './cryptoUtils.ts';

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  departmentId?: string;
  doctorId?: string;
  patientId?: string;
  mfaEnabled: boolean;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface StoredPatient {
  id: string;
  mrn: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'Female' | 'Male' | 'Other';
  bloodGroup: string;
  phonePlain: string;
  emailPlain: string;
  nationalIdPlain: string;
  insuranceIdPlain: string;
  // Encrypted PHI fields at rest
  phoneEncrypted: string;
  emailEncrypted: string;
  nationalIdEncrypted: string;
  insuranceIdEncrypted: string;
  allergiesEncrypted: string;
  medicalHistoryEncrypted: string;
  clinicalNotesEncrypted: string;
  prescriptionsEncrypted: string;
  primaryDepartment: string;
  assignedDoctorId: string;
  assignedDoctorName: string;
  encryptionCipher: string;
  encryptedAt: string;
  lastUpdatedAt: string;
}

export interface HospitalStoreData {
  departments: Department[];
  doctors: Doctor[];
  users: StoredUser[];
  patients: StoredPatient[];
  appointments: Appointment[];
  payments: PaymentTransaction[];
  reminders: EmailReminder[];
  auditLogs: AuditLogEntry[];
  systemConfig: SystemConfig;
  ambulances: AmbulanceUnit[];
  ambulanceDispatches: AmbulanceDispatch[];
  encounters: ClinicalEncounter[];
  prescriptions: DigitalPrescription[];
  labOrders: LabOrder[];
  referrals: SpecialistReferral[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'medistream-store.json');

export function getEncryptionSecret(): string {
  return (
    process.env.HIPAA_ENCRYPTION_KEY ||
    'medistream-hipaa-aes256gcm-master-secret-2026-v1'
  );
}

export function getSessionSecret(): string {
  return (
    process.env.SESSION_SIGNING_KEY ||
    'medistream-session-hmac-sha256-signing-key-2026'
  );
}

function isoDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function createSeedPatient(
  secret: string,
  input: {
    id: string;
    mrn: string;
    fullName: string;
    dateOfBirth: string;
    gender: 'Female' | 'Male' | 'Other';
    bloodGroup: string;
    phone: string;
    email: string;
    nationalId: string;
    insuranceId: string;
    allergies: string;
    medicalHistory: string;
    clinicalNotes: string;
    prescriptions: string;
    primaryDepartment: string;
    assignedDoctorId: string;
    assignedDoctorName: string;
  }
): StoredPatient {
  const nowIso = new Date().toISOString();
  return {
    id: input.id,
    mrn: input.mrn,
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    bloodGroup: input.bloodGroup,
    phonePlain: input.phone,
    emailPlain: input.email,
    nationalIdPlain: input.nationalId,
    insuranceIdPlain: input.insuranceId,
    phoneEncrypted: encryptPHI(input.phone, secret),
    emailEncrypted: encryptPHI(input.email, secret),
    nationalIdEncrypted: encryptPHI(input.nationalId, secret),
    insuranceIdEncrypted: encryptPHI(input.insuranceId, secret),
    allergiesEncrypted: encryptPHI(input.allergies, secret),
    medicalHistoryEncrypted: encryptPHI(input.medicalHistory, secret),
    clinicalNotesEncrypted: encryptPHI(input.clinicalNotes, secret),
    prescriptionsEncrypted: encryptPHI(input.prescriptions, secret),
    primaryDepartment: input.primaryDepartment,
    assignedDoctorId: input.assignedDoctorId,
    assignedDoctorName: input.assignedDoctorName,
    encryptionCipher: 'AES-256-GCM',
    encryptedAt: nowIso,
    lastUpdatedAt: nowIso,
  };
}

function buildInitialData(): HospitalStoreData {
  const secret = getEncryptionSecret();
  const today = isoDateOffset(0);
  const tomorrow = isoDateOffset(1);
  const dayPlus2 = isoDateOffset(2);
  const dayMinus1 = isoDateOffset(-1);
  const dayMinus2 = isoDateOffset(-2);
  const nowIso = new Date().toISOString();

  const departments: Department[] = [
    {
      id: 'dept-cardiology',
      name: 'Cardiology',
      code: 'CARD',
      floor: 'Floor 2 · Cardiac Wing',
      description: 'Interventional cardiology, echocardiography, arrhythmia clinics, and preventive heart care.',
      headDoctorId: 'doc-1',
    },
    {
      id: 'dept-neurology',
      name: 'Neurology',
      code: 'NEUR',
      floor: 'Floor 3 · Neuro Center',
      description: 'Stroke rapid response, epilepsy management, neuromuscular disorders, and cognitive neurology.',
      headDoctorId: 'doc-3',
    },
    {
      id: 'dept-orthopedics',
      name: 'Orthopedics',
      code: 'ORTH',
      floor: 'Floor 1 · Ortho Pavilion',
      description: 'Minimally invasive joint replacement, spine surgery, arthroscopy, and sports injury rehabilitation.',
      headDoctorId: 'doc-5',
    },
    {
      id: 'dept-pediatrics',
      name: 'Pediatrics',
      code: 'PEDI',
      floor: 'Floor 1 · Child Care Wing',
      description: 'Neonatology, childhood immunizations, developmental pediatrics, and adolescent wellness.',
      headDoctorId: 'doc-7',
    },
    {
      id: 'dept-dermatology',
      name: 'Dermatology',
      code: 'DERM',
      floor: 'Floor 4 · Specialty Suite',
      description: 'Clinical dermatology, dermatosurgery, pediatric skin disorders, and hair restoration therapy.',
      headDoctorId: 'doc-9',
    },
  ];

  const standardSlots = ['09:00', '09:30', '10:30', '11:30', '14:00', '15:00', '16:00', '17:00'];
  const extendedSlots = ['08:30', '09:30', '10:30', '11:30', '13:30', '15:00', '16:30'];

  const doctors: Doctor[] = [
    {
      id: 'doc-1',
      name: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      specialty: 'Interventional Cardiology',
      qualifications: 'MBBS, MD, DM (Cardiology)',
      experienceYears: 16,
      consultationFee: 1200,
      languages: ['English', 'Tamil', 'Hindi'],
      roomNumber: 'Suite 204',
      bio: 'Leads complex coronary angioplasty and preventive lipid management clinics with 16 years of tertiary cardiac experience.',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      dailySlots: standardSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-2',
      name: 'Dr. Meenakshi Nair',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      specialty: 'Non-Invasive Cardiology & Heart Failure',
      qualifications: 'MBBS, MD, DNB (Cardiology)',
      experienceYears: 11,
      consultationFee: 1000,
      languages: ['English', 'Malayalam', 'Tamil'],
      roomNumber: 'Suite 208',
      bio: 'Specializes in 3D stress echocardiography, women’s cardiovascular health, and longitudinal heart failure recovery.',
      availableDays: [1, 2, 3, 4, 5, 6],
      dailySlots: extendedSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-3',
      name: 'Dr. Karthikeyan Venkataraman',
      departmentId: 'dept-neurology',
      departmentName: 'Neurology',
      specialty: 'Stroke & Neurovascular Care',
      qualifications: 'MBBS, MD, DM (Neurology)',
      experienceYears: 18,
      consultationFee: 1500,
      languages: ['English', 'Tamil', 'Telugu'],
      roomNumber: 'Suite 302',
      bio: 'Chief Neurologist overseeing acute stroke protocols, movement disorder clinics, and migraine precision therapy.',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      dailySlots: standardSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-4',
      name: 'Dr. Lakshmi Narayanan',
      departmentId: 'dept-neurology',
      departmentName: 'Neurology',
      specialty: 'Epilepsy & Neuromuscular Medicine',
      qualifications: 'MBBS, MD, DM (Neurology)',
      experienceYears: 12,
      consultationFee: 1150,
      languages: ['English', 'Tamil', 'Kannada'],
      roomNumber: 'Suite 306',
      bio: 'Focused on refractory epilepsy diagnostics, EEG telemetry interpretation, and peripheral neuropathy care.',
      availableDays: [1, 2, 3, 4, 5, 6],
      dailySlots: extendedSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-5',
      name: 'Dr. Senthil Balasubramanian',
      departmentId: 'dept-orthopedics',
      departmentName: 'Orthopedics',
      specialty: 'Joint Replacement & Spine Surgery',
      qualifications: 'MBBS, MS (Ortho), MCh',
      experienceYears: 15,
      consultationFee: 1300,
      languages: ['English', 'Tamil'],
      roomNumber: 'Suite 112',
      bio: 'Performs robotic-assisted knee and hip arthroplasty alongside minimally invasive lumbar spine decompression.',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      dailySlots: standardSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-6',
      name: 'Dr. Anitha Rajagopalan',
      departmentId: 'dept-orthopedics',
      departmentName: 'Orthopedics',
      specialty: 'Sports Medicine & Arthroscopy',
      qualifications: 'MBBS, MS (Ortho), DNB',
      experienceYears: 9,
      consultationFee: 950,
      languages: ['English', 'Telugu', 'Tamil'],
      roomNumber: 'Suite 116',
      bio: 'Treats ACL ligament reconstructions, rotator cuff injuries, and structured athletic return-to-play programs.',
      availableDays: [1, 2, 3, 4, 5, 6],
      dailySlots: extendedSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-7',
      name: 'Dr. Raghavan Krishnamurthy',
      departmentId: 'dept-pediatrics',
      departmentName: 'Pediatrics',
      specialty: 'Neonatology & General Pediatrics',
      qualifications: 'MBBS, MD (Pediatrics)',
      experienceYears: 19,
      consultationFee: 850,
      languages: ['English', 'Kannada', 'Tamil'],
      roomNumber: 'Suite 105',
      bio: 'Nearly two decades guiding newborn intensive follow-up, immunization schedules, and childhood respiratory health.',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      dailySlots: standardSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-8',
      name: 'Dr. Divya Padmanabhan',
      departmentId: 'dept-pediatrics',
      departmentName: 'Pediatrics',
      specialty: 'Pediatric Allergy & Adolescent Care',
      qualifications: 'MBBS, MD (Pediatrics), DCH',
      experienceYears: 10,
      consultationFee: 800,
      languages: ['English', 'Malayalam', 'Hindi'],
      roomNumber: 'Suite 109',
      bio: 'Dedicated to childhood asthma management, food allergy immunotherapy, and adolescent nutrition.',
      availableDays: [1, 2, 3, 4, 5, 6],
      dailySlots: extendedSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-9',
      name: 'Dr. Vijayalakshmi Natarajan',
      departmentId: 'dept-dermatology',
      departmentName: 'Dermatology',
      specialty: 'Clinical Dermatology & Dermatosurgery',
      qualifications: 'MBBS, MD (Dermatology)',
      experienceYears: 14,
      consultationFee: 900,
      languages: ['English', 'Tamil', 'Hindi'],
      roomNumber: 'Suite 401',
      bio: 'Expertise in autoimmune skin conditions, dermoscopy screening, and scar revision procedures.',
      availableDays: [0, 1, 2, 3, 4, 5, 6],
      dailySlots: standardSlots,
      acceptingNewPatients: true,
    },
    {
      id: 'doc-10',
      name: 'Dr. Harishankar Menon',
      departmentId: 'dept-dermatology',
      departmentName: 'Dermatology',
      specialty: 'Trichology & Pediatric Dermatology',
      qualifications: 'MBBS, MD, DNB (Dermatology)',
      experienceYears: 8,
      consultationFee: 850,
      languages: ['English', 'Malayalam', 'Kannada'],
      roomNumber: 'Suite 405',
      bio: 'Focuses on eczema management, alopecia diagnostics, and evidence-based phototherapy protocols.',
      availableDays: [1, 2, 3, 4, 5, 6],
      dailySlots: extendedSlots,
      acceptingNewPatients: true,
    },
  ];

  const patients: StoredPatient[] = [
    createSeedPatient(secret, {
      id: 'pat-1',
      mrn: 'MRN-2026-0412',
      fullName: 'Ananya Iyer',
      dateOfBirth: '1989-04-18',
      gender: 'Female',
      bloodGroup: 'O+',
      phone: '+1 415 890 4821',
      email: 'ananya.iyer@medistream.org',
      nationalId: 'SSN-482-91-4821',
      insuranceId: 'BCBS-CA-992104',
      allergies: 'Penicillin (mild rash)',
      medicalHistory: 'Mild hypertension controlled with lifestyle and low-dose beta-blocker.',
      clinicalNotes: 'Resting ECG normal sinus rhythm (72 bpm). Blood pressure 122/78 mmHg. Continue quarterly lipid monitoring.',
      prescriptions: 'Metoprolol Succinate 25mg OD · Atorvastatin 10mg HS',
      primaryDepartment: 'Cardiology',
      assignedDoctorId: 'doc-1',
      assignedDoctorName: 'Dr. Arvind Subramanian',
    }),
    createSeedPatient(secret, {
      id: 'pat-2',
      mrn: 'MRN-2026-0419',
      fullName: 'Vikramaditya Rao',
      dateOfBirth: '1976-11-02',
      gender: 'Male',
      bloodGroup: 'A+',
      phone: '+1 415 744 1920',
      email: 'vikram.rao@example.org',
      nationalId: 'SSN-773-12-1920',
      insuranceId: 'AETNA-884120',
      allergies: 'No known drug allergies',
      medicalHistory: 'Chronic episodic migraine with visual aura since 2021.',
      clinicalNotes: 'MRI Brain unremarkable. Frequency reduced from 6 to 2 episodes/month on preventive regimen.',
      prescriptions: 'Propranolol 40mg BD · Sumatriptan 50mg PRN',
      primaryDepartment: 'Neurology',
      assignedDoctorId: 'doc-3',
      assignedDoctorName: 'Dr. Karthikeyan Venkataraman',
    }),
    createSeedPatient(secret, {
      id: 'pat-3',
      mrn: 'MRN-2026-0425',
      fullName: 'Deepika Chandrasekhar',
      dateOfBirth: '1994-07-29',
      gender: 'Female',
      bloodGroup: 'B+',
      phone: '+1 650 321 7742',
      email: 'deepika.c@example.org',
      nationalId: 'SSN-318-55-7742',
      insuranceId: 'UHC-552019',
      allergies: 'Sulfa drugs',
      medicalHistory: 'Right knee ACL sprain from recreational badminton.',
      clinicalNotes: 'Lachman test grade I. Physical therapy strengthening quadriceps; avoid pivot sports for 6 weeks.',
      prescriptions: 'Celecoxib 100mg PRN post-PT · Vitamin D3 2000 IU daily',
      primaryDepartment: 'Orthopedics',
      assignedDoctorId: 'doc-6',
      assignedDoctorName: 'Dr. Anitha Rajagopalan',
    }),
    createSeedPatient(secret, {
      id: 'pat-4',
      mrn: 'MRN-2026-0431',
      fullName: 'Aarav Sundaram',
      dateOfBirth: '2019-02-14',
      gender: 'Male',
      bloodGroup: 'AB+',
      phone: '+1 408 552 6309',
      email: 'parent.sundaram@example.org',
      nationalId: 'SSN-194-08-6309',
      insuranceId: 'CIGNA-310944',
      allergies: 'Peanut sensitivity',
      medicalHistory: 'Mild seasonal allergic rhinitis; immunizations up to date.',
      clinicalNotes: 'Growth velocity at 65th percentile. Chest clear bilaterally. Reviewed inhaler spacer technique with parents.',
      prescriptions: 'Montelukast 4mg chewable HS · Cetirizine 5ml PRN',
      primaryDepartment: 'Pediatrics',
      assignedDoctorId: 'doc-7',
      assignedDoctorName: 'Dr. Raghavan Krishnamurthy',
    }),
    createSeedPatient(secret, {
      id: 'pat-5',
      mrn: 'MRN-2026-0440',
      fullName: 'Nandini Venugopal',
      dateOfBirth: '1984-09-09',
      gender: 'Female',
      bloodGroup: 'O-',
      phone: '+1 510 609 3188',
      email: 'nandini.v@example.org',
      nationalId: 'SSN-602-71-3188',
      insuranceId: 'KAISER-772108',
      allergies: 'Latex sensitivity',
      medicalHistory: 'Atopic dermatitis flare during winter months.',
      clinicalNotes: 'Mild flexural erythema improving on barrier repair cream and short-course topical calcineurin inhibitor.',
      prescriptions: 'Tacrolimus 0.1% ointment BD · Ceramide barrier emollient',
      primaryDepartment: 'Dermatology',
      assignedDoctorId: 'doc-9',
      assignedDoctorName: 'Dr. Vijayalakshmi Natarajan',
    }),
  ];

  function buildDoctorEmail(name: string): string {
    const clean = name
      .replace(/^Dr\.\s+/i, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .split(/\s+/)
      .join('.');
    return `${clean}@medistream.org`;
  }

  const doctorUsers: StoredUser[] = doctors.map((doc, idx) => ({
    id: `usr-doctor-${idx + 1}`,
    name: doc.name,
    email: buildDoctorEmail(doc.name),
    passwordHash: hashPassword('Doctor@2026'),
    role: 'doctor',
    departmentId: doc.departmentId,
    doctorId: doc.id,
    mfaEnabled: true,
    active: true,
    lastLoginAt: idx === 0 ? nowIso : undefined,
    createdAt: '2026-06-01T08:00:00Z',
  }));

  const users: StoredUser[] = [
    {
      id: 'usr-patient-1',
      name: 'Ananya Iyer',
      email: 'ananya.iyer@medistream.org',
      passwordHash: hashPassword('Patient@2026'),
      role: 'patient',
      patientId: 'pat-1',
      mfaEnabled: true,
      active: true,
      lastLoginAt: nowIso,
      createdAt: '2026-08-12T09:00:00Z',
    },
    ...doctorUsers,
    {
      id: 'usr-staff-1',
      name: 'Kavitha Pillai (Head Nurse)',
      email: 'kavitha.pillai@medistream.org',
      passwordHash: hashPassword('Staff@2026'),
      role: 'staff',
      departmentId: 'dept-cardiology',
      mfaEnabled: true,
      active: true,
      lastLoginAt: nowIso,
      createdAt: '2026-06-10T08:00:00Z',
    },
    {
      id: 'usr-admin-1',
      name: 'MediStream System Admin',
      email: 'admin12@gmail.com',
      passwordHash: hashPassword('123456'),
      role: 'admin',
      mfaEnabled: false,
      active: true,
      lastLoginAt: nowIso,
      createdAt: '2026-05-01T08:00:00Z',
    },
  ];

  const appointments: Appointment[] = [
    {
      id: 'apt-101',
      bookingCode: 'MS-2601',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientEmail: 'ananya.iyer@medistream.org',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: tomorrow,
      timeSlot: '09:30',
      visitType: 'In-Person Consultation',
      reasonSummary: 'Quarterly lipid & blood pressure review',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      amountPaid: 1250,
      invoiceId: 'INV-MS-8801',
      reminderStatus: 'Scheduled',
      createdAt: dayMinus1 + 'T11:20:00Z',
    },
    {
      id: 'apt-102',
      bookingCode: 'MS-2602',
      patientId: 'pat-2',
      patientName: 'Vikramaditya Rao',
      patientEmail: 'vikram.rao@example.org',
      doctorId: 'doc-3',
      doctorName: 'Dr. Karthikeyan Venkataraman',
      departmentId: 'dept-neurology',
      departmentName: 'Neurology',
      date: today,
      timeSlot: '14:00',
      visitType: 'Follow-Up Review',
      reasonSummary: 'Migraine frequency evaluation',
      status: 'Checked-In',
      paymentStatus: 'Paid',
      paymentMethod: 'Insurance Copay',
      amountPaid: 500,
      invoiceId: 'INV-MS-8802',
      reminderStatus: 'Sent',
      reminderSentAt: dayMinus1 + 'T14:00:00Z',
      createdAt: dayMinus2 + 'T09:15:00Z',
    },
    {
      id: 'apt-103',
      bookingCode: 'MS-2603',
      patientId: 'pat-3',
      patientName: 'Deepika Chandrasekhar',
      patientEmail: 'deepika.c@example.org',
      doctorId: 'doc-6',
      doctorName: 'Dr. Anitha Rajagopalan',
      departmentId: 'dept-orthopedics',
      departmentName: 'Orthopedics',
      date: tomorrow,
      timeSlot: '11:30',
      visitType: 'In-Person Consultation',
      reasonSummary: 'Right knee ACL rehabilitation check',
      status: 'Confirmed',
      paymentStatus: 'Pending',
      amountPaid: 0,
      reminderStatus: 'Scheduled',
      createdAt: today + 'T08:00:00Z',
    },
    {
      id: 'apt-104',
      bookingCode: 'MS-2604',
      patientId: 'pat-4',
      patientName: 'Aarav Sundaram',
      patientEmail: 'parent.sundaram@example.org',
      doctorId: 'doc-7',
      doctorName: 'Dr. Raghavan Krishnamurthy',
      departmentId: 'dept-pediatrics',
      departmentName: 'Pediatrics',
      date: dayPlus2,
      timeSlot: '10:30',
      visitType: 'In-Person Consultation',
      reasonSummary: 'Annual pediatric wellness & immunization',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      paymentMethod: 'Instant Bank / UPI',
      amountPaid: 900,
      invoiceId: 'INV-MS-8803',
      reminderStatus: 'Scheduled',
      createdAt: today + 'T09:10:00Z',
    },
    {
      id: 'apt-105',
      bookingCode: 'MS-2605',
      patientId: 'pat-5',
      patientName: 'Nandini Venugopal',
      patientEmail: 'nandini.v@example.org',
      doctorId: 'doc-9',
      doctorName: 'Dr. Vijayalakshmi Natarajan',
      departmentId: 'dept-dermatology',
      departmentName: 'Dermatology',
      date: dayMinus1,
      timeSlot: '15:00',
      visitType: 'Telehealth Video',
      reasonSummary: 'Dermatitis topical regimen check',
      status: 'Completed',
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      amountPaid: 950,
      invoiceId: 'INV-MS-8804',
      reminderStatus: 'Sent',
      reminderSentAt: dayMinus2 + 'T15:00:00Z',
      createdAt: dayMinus2 + 'T10:00:00Z',
    },
    {
      id: 'apt-106',
      bookingCode: 'MS-2606',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientEmail: 'ananya.iyer@medistream.org',
      doctorId: 'doc-2',
      doctorName: 'Dr. Meenakshi Nair',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: dayMinus2,
      timeSlot: '10:30',
      visitType: 'Follow-Up Review',
      reasonSummary: 'Echocardiogram review',
      status: 'Completed',
      paymentStatus: 'Paid',
      paymentMethod: 'Insurance Copay',
      amountPaid: 350,
      invoiceId: 'INV-MS-8805',
      reminderStatus: 'Sent',
      reminderSentAt: dayMinus2 + 'T07:00:00Z',
      createdAt: dayMinus2 + 'T06:00:00Z',
    },
    {
      id: 'apt-107',
      bookingCode: 'MS-2607',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientEmail: 'ananya.iyer@medistream.org',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: today,
      timeSlot: '10:30',
      visitType: 'Follow-Up Review',
      reasonSummary: 'Home BP log & beta-blocker dose check',
      status: 'Checked-In',
      paymentStatus: 'Paid',
      paymentMethod: 'Card',
      amountPaid: 1250,
      invoiceId: 'INV-MS-8806',
      reminderStatus: 'Sent',
      reminderSentAt: dayMinus1 + 'T10:30:00Z',
      createdAt: dayMinus1 + 'T08:30:00Z',
    },
    {
      id: 'apt-108',
      bookingCode: 'MS-2608',
      patientId: 'pat-2',
      patientName: 'Vikramaditya Rao',
      patientEmail: 'vikram.rao@example.org',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentId: 'dept-cardiology',
      departmentName: 'Cardiology',
      date: today,
      timeSlot: '16:00',
      visitType: 'Telehealth Video',
      reasonSummary: 'Palpitations & resting ECG clearance for migraine therapy',
      status: 'Confirmed',
      paymentStatus: 'Paid',
      paymentMethod: 'Instant Bank / UPI',
      amountPaid: 1250,
      invoiceId: 'INV-MS-8807',
      reminderStatus: 'Sent',
      reminderSentAt: dayMinus1 + 'T16:00:00Z',
      createdAt: dayMinus1 + 'T12:15:00Z',
    },
  ];

  const payments: PaymentTransaction[] = [
    {
      id: 'pay-1',
      invoiceId: 'INV-MS-8801',
      appointmentId: 'apt-101',
      bookingCode: 'MS-2601',
      patientName: 'Ananya Iyer',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      subtotal: 1200,
      insuranceDiscount: 0,
      platformFee: 50,
      totalAmount: 1250,
      method: 'Card',
      lastFourOrRef: 'Visa •••• 4242',
      status: 'Paid',
      paidAt: dayMinus1 + 'T11:21:00Z',
    },
    {
      id: 'pay-2',
      invoiceId: 'INV-MS-8802',
      appointmentId: 'apt-102',
      bookingCode: 'MS-2602',
      patientName: 'Vikramaditya Rao',
      doctorName: 'Dr. Karthikeyan Venkataraman',
      departmentName: 'Neurology',
      subtotal: 1500,
      insuranceDiscount: 1050,
      platformFee: 50,
      totalAmount: 500,
      method: 'Insurance Copay',
      lastFourOrRef: 'AETNA-884120',
      status: 'Paid',
      paidAt: dayMinus2 + 'T09:16:00Z',
    },
    {
      id: 'pay-3',
      invoiceId: 'INV-MS-8803',
      appointmentId: 'apt-104',
      bookingCode: 'MS-2604',
      patientName: 'Aarav Sundaram',
      doctorName: 'Dr. Raghavan Krishnamurthy',
      departmentName: 'Pediatrics',
      subtotal: 850,
      insuranceDiscount: 0,
      platformFee: 50,
      totalAmount: 900,
      method: 'Instant Bank / UPI',
      lastFourOrRef: 'UPI-904218',
      status: 'Paid',
      paidAt: today + 'T09:12:00Z',
    },
    {
      id: 'pay-4',
      invoiceId: 'INV-MS-8804',
      appointmentId: 'apt-105',
      bookingCode: 'MS-2605',
      patientName: 'Nandini Venugopal',
      doctorName: 'Dr. Vijayalakshmi Natarajan',
      departmentName: 'Dermatology',
      subtotal: 900,
      insuranceDiscount: 0,
      platformFee: 50,
      totalAmount: 950,
      method: 'Card',
      lastFourOrRef: 'MC •••• 8819',
      status: 'Paid',
      paidAt: dayMinus2 + 'T10:02:00Z',
    },
    {
      id: 'pay-5',
      invoiceId: 'INV-MS-8805',
      appointmentId: 'apt-106',
      bookingCode: 'MS-2606',
      patientName: 'Ananya Iyer',
      doctorName: 'Dr. Meenakshi Nair',
      departmentName: 'Cardiology',
      subtotal: 1000,
      insuranceDiscount: 700,
      platformFee: 50,
      totalAmount: 350,
      method: 'Insurance Copay',
      lastFourOrRef: 'BCBS-CA-992104',
      status: 'Paid',
      paidAt: dayMinus2 + 'T06:02:00Z',
    },
  ];

  const reminders: EmailReminder[] = [
    {
      id: 'rem-101',
      appointmentId: 'apt-101',
      bookingCode: 'MS-2601',
      recipientName: 'Ananya Iyer',
      maskedRecipientEmail: 'an*********@medistream.org',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      visitDate: tomorrow,
      visitTime: '09:30',
      subject: `MediStream Visit Reminder: Dr. Arvind Subramanian on ${tomorrow} at 09:30`,
      bodyPreview: `Dear Ananya Iyer, your Cardiology consultation (Ref MS-2601) with Dr. Arvind Subramanian is scheduled for ${tomorrow} at 09:30 in Suite 204. For HIPAA privacy, clinical notes remain encrypted inside your patient portal.`,
      channel: 'Automated Scheduler',
      status: 'Queued',
      scheduledFor: `${today}T09:30:00Z`,
    },
    {
      id: 'rem-102',
      appointmentId: 'apt-102',
      bookingCode: 'MS-2602',
      recipientName: 'Vikramaditya Rao',
      maskedRecipientEmail: 'vi********@example.org',
      doctorName: 'Dr. Karthikeyan Venkataraman',
      departmentName: 'Neurology',
      visitDate: today,
      visitTime: '14:00',
      subject: `MediStream Visit Reminder: Dr. Karthikeyan Venkataraman on ${today} at 14:00`,
      bodyPreview: `Dear Vikramaditya Rao, your Neurology follow-up (Ref MS-2602) with Dr. Karthikeyan Venkataraman is confirmed for ${today} at 14:00 in Suite 302.`,
      channel: 'Automated Scheduler',
      status: 'Sent',
      scheduledFor: `${dayMinus1}T14:00:00Z`,
      sentAt: `${dayMinus1}T14:00:00Z`,
    },
    {
      id: 'rem-103',
      appointmentId: 'apt-103',
      bookingCode: 'MS-2603',
      recipientName: 'Deepika Chandrasekhar',
      maskedRecipientEmail: 'de*******@example.org',
      doctorName: 'Dr. Anitha Rajagopalan',
      departmentName: 'Orthopedics',
      visitDate: tomorrow,
      visitTime: '11:30',
      subject: `MediStream Visit Reminder: Dr. Anitha Rajagopalan on ${tomorrow} at 11:30`,
      bodyPreview: `Dear Deepika Chandrasekhar, your Orthopedics visit (Ref MS-2603) with Dr. Anitha Rajagopalan is scheduled for ${tomorrow} at 11:30 in Suite 116.`,
      channel: 'Automated Scheduler',
      status: 'Queued',
      scheduledFor: `${today}T11:30:00Z`,
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      timestamp: nowIso,
      actorEmail: 'admin12@gmail.com',
      actorRole: 'admin',
      portal: 'admin',
      action: 'ENCRYPTION_POLICY_VERIFIED',
      resourceType: 'SystemConfig',
      resourceId: 'hipaa-aes-256-gcm',
      outcome: 'ALLOWED',
      details: 'HIPAA AES-256-GCM PHI storage encryption active across 5 patient records.',
    },
    {
      id: 'aud-2',
      timestamp: dayMinus1 + 'T14:00:05Z',
      actorEmail: 'system-mailer@medistream.org',
      actorRole: 'system',
      portal: 'system',
      action: 'REMINDER_DISPATCHED',
      resourceType: 'EmailReminder',
      resourceId: 'rem-102',
      outcome: 'ALLOWED',
      details: 'Automated 24-hour visit reminder sent with minimal PHI disclosure.',
    },
    {
      id: 'aud-3',
      timestamp: dayMinus1 + 'T11:21:00Z',
      actorEmail: 'ananya.iyer@medistream.org',
      actorRole: 'patient',
      portal: 'user',
      action: 'PAYMENT_PROCESSED',
      resourceType: 'PaymentTransaction',
      resourceId: 'INV-MS-8801',
      outcome: 'ALLOWED',
      details: 'Consultation payment (₹1,250.00 via Card) settled for booking MS-2601.',
    },
  ];

  const systemConfig: SystemConfig = {
    hospitalName: 'MediStream Clinical Center',
    hipaaEncryptionAlgorithm: 'AES-256-GCM (Authenticated PHI)',
    encryptionKeyFingerprint: getKeyFingerprint(secret),
    enforceMfaForAllPortals: false,
    sessionTimeoutMinutes: 30,
    reminderLeadHours: 24,
    autoReminderEnabled: true,
    smtpHost: 'smtp.medistream-clinical.internal',
    smtpSenderEmail: 'appointments@medistream.org',
    defaultInsuranceCoveragePct: 70,
    platformProcessingFee: 50,
    currencySymbol: '₹',
    updatedAt: nowIso,
    updatedBy: 'admin12@gmail.com',
  };

  return {
    departments,
    doctors: doctors.map((d) => ({ ...d, blockedDates: d.blockedDates || [], telehealthEnabled: true })),
    users,
    patients,
    appointments,
    payments,
    reminders,
    auditLogs,
    systemConfig,
    ambulances: buildDefaultAmbulances(),
    ambulanceDispatches: buildDefaultDispatches(nowIso),
    encounters: buildDefaultEncounters(dayMinus1, dayMinus2, nowIso),
    prescriptions: buildDefaultPrescriptions(dayMinus1, dayMinus2),
    labOrders: buildDefaultLabOrders(today, dayMinus1, nowIso),
    referrals: buildDefaultReferrals(today, nowIso),
  };
}

function buildDefaultEncounters(
  dayMinus1: string,
  dayMinus2: string,
  nowIso: string
): ClinicalEncounter[] {
  return [
    {
      id: 'enc-101',
      encounterCode: 'ENC-4001',
      appointmentId: 'apt-106',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientMrn: 'MRN-2026-0412',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      visitDate: dayMinus2,
      visitType: 'Follow-Up Review',
      vitals: {
        bloodPressureSystolic: 122,
        bloodPressureDiastolic: 78,
        heartRateBpm: 72,
        temperatureC: 36.7,
        spo2Pct: 99,
        weightKg: 61,
        heightCm: 163,
        bmi: 23.0,
      },
      subjective: 'Patient reports good tolerance to Metoprolol 25mg OD with zero orthostatic dizziness.',
      objective: 'Regular rate and rhythm, S1/S2 normal, no murmurs. Resting ECG normal sinus rhythm.',
      assessment: 'Essential hypertension, well controlled on low-dose beta-blocker & statin prophylaxis.',
      icdCode: 'I10',
      plan: 'Continue Metoprolol Succinate 25mg OD and Atorvastatin 10mg HS. Repeat fasting lipid panel in 3 months.',
      followUpDays: 90,
      createdAt: `${dayMinus2}T10:50:00Z`,
    },
    {
      id: 'enc-102',
      encounterCode: 'ENC-4002',
      appointmentId: 'apt-105',
      patientId: 'pat-5',
      patientName: 'Nandini Venugopal',
      patientMrn: 'MRN-2026-0440',
      doctorId: 'doc-9',
      doctorName: 'Dr. Vijayalakshmi Natarajan',
      departmentName: 'Dermatology',
      visitDate: dayMinus1,
      visitType: 'Telehealth Video',
      vitals: {
        bloodPressureSystolic: 116,
        bloodPressureDiastolic: 74,
        heartRateBpm: 76,
        temperatureC: 36.6,
        spo2Pct: 99,
      },
      subjective: 'Winter atopic dermatitis flare resolving on barrier repair regimen.',
      objective: 'Minimal residual antecubital erythema, no secondary impetiginization.',
      assessment: 'Atopic dermatitis, mild, resolving.',
      icdCode: 'L20.9',
      plan: 'Taper Tacrolimus 0.1% ointment to alternate nights and maintain daily ceramide emollient.',
      followUpDays: 30,
      createdAt: nowIso,
    },
  ];
}

function buildDefaultPrescriptions(dayMinus1: string, dayMinus2: string): DigitalPrescription[] {
  return [
    {
      id: 'rx-101',
      rxCode: 'RX-2601',
      encounterId: 'enc-101',
      appointmentId: 'apt-106',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientMrn: 'MRN-2026-0412',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      diagnosis: 'Essential Hypertension & Dyslipidemia Prevention',
      items: [
        {
          medication: 'Metoprolol Succinate',
          dosage: '25mg',
          frequency: 'OD (Once daily)',
          duration: '90 days',
          instructions: 'Take after breakfast; monitor pulse daily.',
        },
        {
          medication: 'Atorvastatin',
          dosage: '10mg',
          frequency: 'HS (Bedtime)',
          duration: '90 days',
          instructions: 'Take at night with water.',
        },
      ],
      notes: 'Avoid abrupt beta-blocker discontinuation.',
      status: 'Active',
      issuedAt: `${dayMinus2}T10:55:00Z`,
    },
    {
      id: 'rx-102',
      rxCode: 'RX-2602',
      encounterId: 'enc-102',
      appointmentId: 'apt-105',
      patientId: 'pat-5',
      patientName: 'Nandini Venugopal',
      patientMrn: 'MRN-2026-0440',
      doctorId: 'doc-9',
      doctorName: 'Dr. Vijayalakshmi Natarajan',
      departmentName: 'Dermatology',
      diagnosis: 'Atopic Dermatitis',
      items: [
        {
          medication: 'Tacrolimus 0.1% Ointment',
          dosage: 'Thin layer',
          frequency: 'BD (Twice daily)',
          duration: '14 days',
          instructions: 'Apply to affected flexural areas after moisturizing.',
        },
      ],
      status: 'Active',
      issuedAt: `${dayMinus1}T15:30:00Z`,
    },
  ];
}

function buildDefaultLabOrders(
  today: string,
  dayMinus1: string,
  nowIso: string
): LabOrder[] {
  return [
    {
      id: 'lab-101',
      orderCode: 'LAB-3101',
      patientId: 'pat-1',
      patientName: 'Ananya Iyer',
      patientMrn: 'MRN-2026-0412',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      testName: 'Fasting Lipid Profile & ApoB',
      category: 'Biochemistry',
      priority: 'Routine',
      clinicalIndication: 'Quarterly statin efficacy review',
      status: 'Results Ready',
      resultSummary: 'Total Cholesterol 164 mg/dL, LDL 88 mg/dL, HDL 54 mg/dL, Triglycerides 110 mg/dL.',
      resultFlag: 'Normal',
      orderedAt: `${dayMinus1}T08:30:00Z`,
      updatedAt: nowIso,
    },
    {
      id: 'lab-102',
      orderCode: 'LAB-3102',
      patientId: 'pat-2',
      patientName: 'Vikramaditya Rao',
      patientMrn: 'MRN-2026-0419',
      doctorId: 'doc-1',
      doctorName: 'Dr. Arvind Subramanian',
      departmentName: 'Cardiology',
      testName: '12-Lead Resting ECG & Holter Screen',
      category: 'Cardiac Diagnostics',
      priority: 'Urgent / STAT',
      clinicalIndication: 'Evaluate intermittent palpitations prior to beta-blocker adjustment',
      status: 'Ordered',
      orderedAt: `${today}T09:00:00Z`,
      updatedAt: nowIso,
    },
  ];
}

function buildDefaultReferrals(today: string, nowIso: string): SpecialistReferral[] {
  return [
    {
      id: 'ref-101',
      referralCode: 'REF-501',
      patientId: 'pat-2',
      patientName: 'Vikramaditya Rao',
      patientMrn: 'MRN-2026-0419',
      fromDoctorId: 'doc-3',
      fromDoctorName: 'Dr. Karthikeyan Venkataraman',
      fromDepartmentName: 'Neurology',
      toDoctorId: 'doc-1',
      toDoctorName: 'Dr. Arvind Subramanian',
      toDepartmentName: 'Cardiology',
      urgency: 'Urgent',
      reason: 'Cardiac clearance for Propranolol dose escalation',
      clinicalSummary: 'Patient with chronic migraine on Propranolol 40mg BD reports mild exertional palpitations.',
      status: 'Pending',
      createdAt: `${today}T08:15:00Z`,
      updatedAt: nowIso,
    },
  ];
}

function buildDefaultAmbulances(): AmbulanceUnit[] {
  return [
    {
      id: 'amb-1',
      vehicleNumber: 'TN-01-MS-108',
      unitName: 'MediStream Cardiac ICU-1',
      unitType: 'Advanced Cardiac Life Support (ACLS)',
      driverName: 'Muruganandam Subramanian',
      paramedicName: 'Deepak Krishnan',
      contactPhone: '+91 98401 10801',
      baseLocation: 'Cardiac Wing Gate 2',
      equipment: ['Biphasic Defibrillator', 'Transport Ventilator', '12-Lead ECG Telemetry', 'Syringe Pumps'],
      baseFeeInr: 2400,
      perKmFeeInr: 75,
      status: 'Available',
    },
    {
      id: 'amb-2',
      vehicleNumber: 'TN-01-MS-109',
      unitName: 'MediStream Neuro Trauma-2',
      unitType: 'Advanced Cardiac Life Support (ACLS)',
      driverName: 'Prakash Rajendran',
      paramedicName: 'Nithya Sundaram',
      contactPhone: '+91 98401 10802',
      baseLocation: 'Main Casualty Emergency Bay',
      equipment: ['Portable Ventilator', 'Spinal Immobilizer', 'Oxygen Manifold', 'Pulse Oximetry'],
      baseFeeInr: 2400,
      perKmFeeInr: 75,
      status: 'Available',
    },
    {
      id: 'amb-3',
      vehicleNumber: 'TN-01-MS-112',
      unitName: 'MediStream Rapid BLS-3',
      unitType: 'Basic Life Support (BLS)',
      driverName: 'Selvakumar Nair',
      paramedicName: 'Kavya Venkatesh',
      contactPhone: '+91 98401 10803',
      baseLocation: 'North Outpatient Gate',
      equipment: ['Dual Oxygen Cylinders', 'AED', 'Hydraulic Stretcher', 'First-Aid Trauma Kit'],
      baseFeeInr: 1200,
      perKmFeeInr: 45,
      status: 'Available',
    },
    {
      id: 'amb-4',
      vehicleNumber: 'TN-01-MS-115',
      unitName: 'MediStream Neonatal NICU-4',
      unitType: 'Neonatal & Pediatric ICU',
      driverName: 'Suresh Babu Karthik',
      paramedicName: 'Meenakshi Iyer',
      contactPhone: '+91 98401 10804',
      baseLocation: 'Child Care Wing Bay',
      equipment: ['Transport Incubator', 'Neonatal Ventilator', 'Phototherapy Unit', 'Pediatric Monitor'],
      baseFeeInr: 2800,
      perKmFeeInr: 85,
      status: 'Dispatched',
    },
  ];
}

function buildDefaultDispatches(nowIso: string): AmbulanceDispatch[] {
  return [
    {
      id: 'disp-101',
      dispatchCode: 'AMB-2041',
      unitId: 'amb-4',
      vehicleNumber: 'TN-01-MS-115',
      unitType: 'Neonatal & Pediatric ICU',
      driverName: 'Suresh Babu Karthik',
      driverPhone: '+91 98401 10804',
      patientName: 'Baby Aarav (Parent: Ananya Iyer)',
      patientPhone: '+91 98401 44821',
      patientEmail: 'ananya.iyer@medistream.org',
      pickupAddress: '24 Cathedral Road, Gopalapuram, Chennai',
      landmark: 'Near Semmozhi Poonga Entrance',
      priority: 'Urgent Transfer',
      clinicalCondition: 'Pediatric fever observation transfer to NICU',
      distanceKm: 6,
      estimatedEtaMinutes: 18,
      estimatedFareInr: 2885,
      status: 'En Route',
      requestedAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'disp-100',
      dispatchCode: 'AMB-2038',
      unitId: 'amb-1',
      vehicleNumber: 'TN-01-MS-108',
      unitType: 'Advanced Cardiac Life Support (ACLS)',
      driverName: 'Muruganandam Subramanian',
      driverPhone: '+91 98401 10801',
      patientName: 'Vikramaditya Rao',
      patientPhone: '+91 98402 55109',
      patientEmail: 'vikram.rao@example.org',
      pickupAddress: '118 Luz Church Road, Mylapore, Chennai',
      landmark: 'Opposite Kapaleeshwarar Tank',
      priority: 'Critical Emergency',
      clinicalCondition: 'Chest tightness & ECG monitoring transport',
      distanceKm: 8,
      estimatedEtaMinutes: 15,
      estimatedFareInr: 2625,
      status: 'Completed',
      requestedAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

export class HospitalStore {
  private data: HospitalStoreData;

  constructor() {
    this.data = this.loadOrSeed();
  }

  private loadOrSeed(): HospitalStoreData {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as HospitalStoreData;
        if (
          parsed &&
          Array.isArray(parsed.doctors) &&
          parsed.doctors.length >= 10 &&
          parsed.systemConfig?.currencySymbol === '₹'
        ) {
          // Ensure admin account credentials match admin12@gmail.com / 123456
          const existingAdmin = parsed.users?.find(
            (u) =>
              u.id === 'usr-admin-1' ||
              u.email.toLowerCase() === 'admin12@gmail.com' ||
              u.email.toLowerCase() === 'admin@medistream.com' ||
              u.email.toLowerCase() === 'admin@medistream.org'
          );
          if (existingAdmin) {
            if (existingAdmin.email.toLowerCase() !== 'admin12@gmail.com') {
              existingAdmin.email = 'admin12@gmail.com';
              existingAdmin.passwordHash = hashPassword('123456');
              existingAdmin.mfaEnabled = false;
              existingAdmin.active = true;
              existingAdmin.role = 'admin';
              if (
                parsed.systemConfig.updatedBy === 'admin@medistream.org' ||
                parsed.systemConfig.updatedBy === 'admin@medistream.com'
              ) {
                parsed.systemConfig.updatedBy = 'admin12@gmail.com';
              }
              this.persistData(parsed);
            }
          } else {
            parsed.users = parsed.users || [];
            parsed.users.unshift({
              id: 'usr-admin-1',
              name: 'MediStream System Admin',
              email: 'admin12@gmail.com',
              passwordHash: hashPassword('123456'),
              role: 'admin',
              mfaEnabled: false,
              active: true,
              createdAt: new Date().toISOString(),
            });
            this.persistData(parsed);
          }
          if (!Array.isArray(parsed.ambulances) || parsed.ambulances.length === 0) {
            parsed.ambulances = buildDefaultAmbulances();
          }
          if (!Array.isArray(parsed.ambulanceDispatches)) {
            parsed.ambulanceDispatches = buildDefaultDispatches(new Date().toISOString());
          }
          const nowIso = new Date().toISOString();
          const today = isoDateOffset(0);
          const dayMinus1 = isoDateOffset(-1);
          const dayMinus2 = isoDateOffset(-2);

          // Ensure every seeded doctor has a doctor portal account and schedule fields
          parsed.doctors = parsed.doctors.map((d) => ({
            ...d,
            blockedDates: Array.isArray(d.blockedDates) ? d.blockedDates : [],
            telehealthEnabled: d.telehealthEnabled !== false,
          }));
          for (let idx = 0; idx < parsed.doctors.length; idx += 1) {
            const doc = parsed.doctors[idx];
            const cleanEmail = `${doc.name
              .replace(/^Dr\.\s+/i, '')
              .toLowerCase()
              .replace(/[^a-z\s]/g, '')
              .trim()
              .split(/\s+/)
              .join('.')}@medistream.org`;
            const hasUser = parsed.users.some(
              (u) => u.doctorId === doc.id || u.email.toLowerCase() === cleanEmail
            );
            if (!hasUser) {
              parsed.users.push({
                id: `usr-doctor-${idx + 1}`,
                name: doc.name,
                email: cleanEmail,
                passwordHash: hashPassword('Doctor@2026'),
                role: 'doctor',
                departmentId: doc.departmentId,
                doctorId: doc.id,
                mfaEnabled: true,
                active: true,
                createdAt: '2026-06-01T08:00:00Z',
              });
            }
          }
          if (!Array.isArray(parsed.encounters)) {
            parsed.encounters = buildDefaultEncounters(dayMinus1, dayMinus2, nowIso);
          }
          if (!Array.isArray(parsed.prescriptions)) {
            parsed.prescriptions = buildDefaultPrescriptions(dayMinus1, dayMinus2);
          }
          if (!Array.isArray(parsed.labOrders)) {
            parsed.labOrders = buildDefaultLabOrders(today, dayMinus1, nowIso);
          }
          if (!Array.isArray(parsed.referrals)) {
            parsed.referrals = buildDefaultReferrals(today, nowIso);
          }
          this.persistData(parsed);
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed if corrupted
    }
    const seeded = buildInitialData();
    this.persistData(seeded);
    return seeded;
  }

  private persistData(data: HospitalStoreData): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // Ignore write error in read-only environments
    }
  }

  public save(): void {
    this.persistData(this.data);
  }

  public getState(): HospitalStoreData {
    return this.data;
  }

  public addAuditLog(entry: {
    actorEmail: string;
    actorRole: UserRole | 'anonymous' | 'system';
    portal: PortalType | 'public' | 'system';
    action: string;
    resourceType: string;
    resourceId: string;
    outcome: 'ALLOWED' | 'DENIED';
    details: string;
  }): void {
    this.data.auditLogs.unshift({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.data.auditLogs.length > 200) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 200);
    }
    this.save();
  }

  public findOrProvisionFirebaseUser(input: {
    uid: string;
    email: string;
    name: string;
  }): StoredUser {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = this.data.users.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );
    const nowIso = new Date().toISOString();

    if (existing) {
      existing.lastLoginAt = nowIso;
      if (input.name && !existing.name) {
        existing.name = input.name;
      }
      this.save();
      return existing;
    }

    const secret = getEncryptionSecret();
    let patient = this.data.patients.find(
      (p) => p.emailPlain.toLowerCase() === normalizedEmail
    );
    if (!patient) {
      const mrnNum = 460 + this.data.patients.length + 1;
      patient = createSeedPatient(secret, {
        id: `pat-${Date.now()}`,
        mrn: `MRN-2026-0${mrnNum}`,
        fullName: input.name || normalizedEmail.split('@')[0],
        dateOfBirth: '1992-01-01',
        gender: 'Other',
        bloodGroup: 'O+',
        phone: '+91 98400 00000',
        email: normalizedEmail,
        nationalId: 'Pending verification',
        insuranceId: 'SELF-PAY',
        allergies: 'None reported at Firebase sign-in',
        medicalHistory: 'Authenticated via Firebase Google Sign-In',
        clinicalNotes: 'No clinical encounters recorded yet.',
        prescriptions: 'None',
        primaryDepartment: 'Cardiology',
        assignedDoctorId: 'doc-1',
        assignedDoctorName: 'Dr. Arvind Subramanian',
      });
      this.data.patients.unshift(patient);
    }

    const created: StoredUser = {
      id: `usr-fb-${input.uid.slice(0, 24)}`,
      name: input.name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      passwordHash: hashPassword(`firebase:${input.uid}:${Date.now()}`),
      role: 'patient',
      patientId: patient.id,
      mfaEnabled: false,
      active: true,
      lastLoginAt: nowIso,
      createdAt: nowIso,
    };
    this.data.users.unshift(created);
    this.save();
    return created;
  }
}
