import React, { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, CreditCard, Lock, MailCheck } from 'lucide-react';
import { api } from '../api';
import { calculateBillingTotals, formatCurrency } from '../lib/hospitalRules';
import type {
  Appointment,
  Department,
  Doctor,
  EmailReminder,
  PaymentMethod,
  PaymentTransaction,
} from '../types';

interface BookingWizardProps {
  departments: Department[];
  doctors: Doctor[];
  currencySymbol: string;
  insuranceCoveragePct: number;
  platformFee: number;
  preselectedDoctor?: Doctor | null;
  preselectedDate?: string;
  preselectedSlot?: string;
  defaultPatientName?: string;
  defaultPatientEmail?: string;
  onBookingComplete?: (created?: {
    appointment: Appointment;
    transaction?: PaymentTransaction;
    reminder: EmailReminder;
  }) => void;
}

export const BookingWizard: React.FC<BookingWizardProps> = ({
  departments,
  doctors,
  currencySymbol,
  insuranceCoveragePct,
  platformFee,
  preselectedDoctor,
  preselectedDate,
  preselectedSlot,
  defaultPatientName,
  defaultPatientEmail,
  onBookingComplete,
}) => {
  const defaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const [departmentId, setDepartmentId] = useState<string>(
    preselectedDoctor?.departmentId || departments[0]?.id || ''
  );
  const [doctorId, setDoctorId] = useState<string>(
    preselectedDoctor?.id || doctors[0]?.id || ''
  );
  const [date, setDate] = useState<string>(preselectedDate || defaultDate());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>(preselectedSlot || '');
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [visitType, setVisitType] = useState<'In-Person Consultation' | 'Follow-Up Review' | 'Telehealth Video'>(
    'In-Person Consultation'
  );
  const [patientName, setPatientName] = useState(defaultPatientName || '');
  const [patientEmail, setPatientEmail] = useState(defaultPatientEmail || '');
  const [patientPhone, setPatientPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('1991-06-15');
  const [gender, setGender] = useState<'Female' | 'Male' | 'Other'>('Female');
  const [reasonSummary, setReasonSummary] = useState('');

  const [payNow, setPayNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Card');
  const [paymentReference, setPaymentReference] = useState('Visa •••• 4242');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    appointment: Appointment;
    transaction?: PaymentTransaction;
    reminder: EmailReminder;
    encryptionStatus: string;
  } | null>(null);

  useEffect(() => {
    if (preselectedDoctor) {
      setDepartmentId(preselectedDoctor.departmentId);
      setDoctorId(preselectedDoctor.id);
    }
    if (preselectedDate) setDate(preselectedDate);
    if (preselectedSlot) setSelectedSlot(preselectedSlot);
  }, [preselectedDoctor, preselectedDate, preselectedSlot]);

  const deptDoctors = doctors.filter((d) => !departmentId || d.departmentId === departmentId);
  const activeDoctor = doctors.find((d) => d.id === doctorId) || deptDoctors[0];

  useEffect(() => {
    if (deptDoctors.length > 0 && !deptDoctors.some((d) => d.id === doctorId)) {
      setDoctorId(deptDoctors[0].id);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!activeDoctor || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    api
      .getDoctorSlots(activeDoctor.id, date)
      .then((res) => {
        if (cancelled) return;
        setAvailableSlots(res.availableSlots);
        if (preselectedSlot && res.availableSlots.includes(preselectedSlot)) {
          setSelectedSlot(preselectedSlot);
        } else if (!res.availableSlots.includes(selectedSlot)) {
          setSelectedSlot(res.availableSlots[0] || '');
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDoctor?.id, date]);

  const billing = calculateBillingTotals(
    activeDoctor?.consultationFee || 0,
    paymentMethod,
    insuranceCoveragePct,
    platformFee
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!activeDoctor) {
      setErrorMsg('Please select an attending physician.');
      return;
    }
    if (!selectedSlot) {
      setErrorMsg('Please pick an available appointment time slot.');
      return;
    }
    if (!patientName.trim() || !patientEmail.trim() || !patientPhone.trim()) {
      setErrorMsg('Patient full name, email, and phone number are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.bookAppointment({
        patientName: patientName.trim(),
        patientEmail: patientEmail.trim(),
        patientPhone: patientPhone.trim(),
        dateOfBirth,
        gender,
        doctorId: activeDoctor.id,
        date,
        timeSlot: selectedSlot,
        visitType,
        reasonSummary: reasonSummary.trim() || 'Specialist outpatient consultation',
        payNow,
        paymentMethod,
        paymentReference: paymentReference.trim(),
      });
      setReceipt(res);
      onBookingComplete?.({
        appointment: res.appointment,
        transaction: res.transaction,
        reminder: res.reminder,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to complete booking.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-emerald-700">
                Appointment Confirmed · {receipt.encryptionStatus}
              </p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">
                Booking Reference {receipt.appointment.bookingCode}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Your consultation with {receipt.appointment.doctorName} ({receipt.appointment.departmentName}) is confirmed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-y border-slate-100 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Patient</span>
              <span className="font-medium text-slate-900">{receipt.appointment.patientName}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Date &amp; Time</span>
              <span className="font-mono font-medium text-slate-900 tabular-nums">
                {receipt.appointment.date} · {receipt.appointment.timeSlot}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Visit Format</span>
              <span className="font-medium text-slate-900">{receipt.appointment.visitType}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Payment Status</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {receipt.appointment.paymentStatus}
                {receipt.transaction
                  ? ` · ${formatCurrency(receipt.transaction.totalAmount, currencySymbol, 2)} (${receipt.transaction.invoiceId})`
                  : ' · Due at Clinic Desk'}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <MailCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
              Automated Email Reminder Queued
            </div>
            <p className="text-xs text-slate-600">
              Recipient: <span className="font-mono">{receipt.reminder.maskedRecipientEmail}</span> · Subject: {receipt.reminder.subject}
            </p>
            <p className="text-xs text-slate-500">{receipt.reminder.bodyPreview}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setReceipt(null);
                setPatientName(defaultPatientName || '');
                setPatientEmail(defaultPatientEmail || '');
                setPatientPhone('');
                setReasonSummary('');
              }}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
            >
              Book Another Appointment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Appointment Booking &amp; Payment</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Schedule a specialist visit, encrypt your intake details with AES-256-GCM, and queue an automated email reminder.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Department, Doctor & Slot */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">01. Select Specialist &amp; Slot</h2>
              <span className="text-xs text-slate-500">Real-time clinic schedule</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="booking-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Department
                </label>
                <select
                  id="booking-dept"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="booking-doctor" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Attending Physician
                </label>
                <select
                  id="booking-doctor"
                  value={activeDoctor?.id || ''}
                  onChange={(e) => setDoctorId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {deptDoctors.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} — {formatCurrency(doc.consultationFee, currencySymbol)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="booking-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Appointment Date
                </label>
                <input
                  id="booking-date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="booking-visit-type" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Consultation Format
                </label>
                <select
                  id="booking-visit-type"
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value as typeof visitType)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="In-Person Consultation">In-Person Consultation</option>
                  <option value="Follow-Up Review">Follow-Up Review</option>
                  <option value="Telehealth Video">Telehealth Video</option>
                </select>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-2">Available Time Slots</span>
              {loadingSlots ? (
                <p className="text-xs text-slate-500">Checking live schedule...</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  No open slots on {date} for {activeDoctor?.name}. Please pick another date or specialist.
                </p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {availableSlots.map((slot) => {
                    const isPicked = selectedSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-2 px-2 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer tabular-nums ${
                          isPicked
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-600'
                        }`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Step 2: Patient Intake Details */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">02. Patient Details (HIPAA Encrypted)</h2>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Lock className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                AES-256-GCM Protected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="patient-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Patient Full Name *
                </label>
                <input
                  id="patient-name"
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Priya Subramanyam"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="patient-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email Address (for Visit Reminders) *
                </label>
                <input
                  id="patient-email"
                  type="email"
                  required
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  placeholder="priya@example.org"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="patient-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Mobile Number *
                </label>
                <input
                  id="patient-phone"
                  type="tel"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="+1 415 555 0198"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="patient-dob" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    id="patient-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
                <div>
                  <label htmlFor="patient-gender" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Gender
                  </label>
                  <select
                    id="patient-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as typeof gender)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="visit-reason" className="block text-xs font-medium text-slate-700 mb-1.5">
                Reason for Visit / Clinical Notes
              </label>
              <textarea
                id="visit-reason"
                rows={2}
                value={reasonSummary}
                onChange={(e) => setReasonSummary(e.target.value)}
                placeholder="Briefly describe symptoms or consultation goals..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
          </section>

          {/* Step 3: Payment Processing */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">03. Payment Settlement</h2>
              <CreditCard className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPayNow(true)}
                className={`px-4 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                  payNow
                    ? 'bg-teal-50 text-teal-900 border-teal-700'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Pay Online Now
              </button>
              <button
                type="button"
                onClick={() => setPayNow(false)}
                className={`px-4 py-2 text-xs font-medium rounded-lg border cursor-pointer ${
                  !payNow
                    ? 'bg-teal-50 text-teal-900 border-teal-700'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Pay at Clinic Front Desk
              </button>
            </div>

            {payNow && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label htmlFor="payment-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Payment Method
                  </label>
                  <select
                    id="payment-method"
                    value={paymentMethod}
                    onChange={(e) => {
                      const next = e.target.value as PaymentMethod;
                      setPaymentMethod(next);
                      setPaymentReference(
                        next === 'Card'
                          ? 'Visa •••• 4242'
                          : next === 'Insurance Copay'
                          ? 'BCBS-991042'
                          : 'UPI-884120'
                      );
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  >
                    <option value="Card">Credit / Debit Card</option>
                    <option value="Insurance Copay">Insurance Copay ({insuranceCoveragePct}% covered)</option>
                    <option value="Instant Bank / UPI">Instant Bank / UPI</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="payment-ref" className="block text-xs font-medium text-slate-700 mb-1.5">
                    {paymentMethod === 'Insurance Copay' ? 'Policy Member ID' : 'Card / Payment Reference'}
                  </label>
                  <input
                    id="payment-ref"
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Booking Summary Sidebar */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-slate-900">Visit Summary</h2>

          {activeDoctor && (
            <div className="space-y-3 text-sm border-b border-slate-100 pb-4">
              <div>
                <p className="font-semibold text-slate-900">{activeDoctor.name}</p>
                <p className="text-xs text-slate-600">
                  {activeDoctor.departmentName} · {activeDoctor.roomNumber}
                </p>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Scheduled Date</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">{date}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Time Slot</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {selectedSlot || 'Not selected'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Format</span>
                <span className="font-medium text-slate-900">{visitType}</span>
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Consultation Fee</span>
              <span className="font-mono tabular-nums">{formatCurrency(billing.subtotal, currencySymbol, 2)}</span>
            </div>
            {payNow && billing.insuranceDiscount > 0 && (
              <div className="flex justify-between text-xs text-emerald-700">
                <span>Insurance Coverage ({insuranceCoveragePct}%)</span>
                <span className="font-mono tabular-nums">-{formatCurrency(billing.insuranceDiscount, currencySymbol, 2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-600">
              <span>Digital Records &amp; Processing</span>
              <span className="font-mono tabular-nums">{formatCurrency(billing.platformFee, currencySymbol, 2)}</span>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
              <span className="text-sm font-semibold text-slate-900">
                {payNow ? 'Total Due Today' : 'Due at Clinic Desk'}
              </span>
              <span className="text-xl font-mono font-bold text-slate-900 tabular-nums">
                {formatCurrency(billing.totalAmount, currencySymbol, 2)}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedSlot}
            className="w-full py-3 px-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4" aria-hidden="true" />
            {submitting
              ? 'Confirming & Encrypting...'
              : payNow
              ? `Pay ${formatCurrency(billing.totalAmount, currencySymbol, 2)} & Confirm Visit`
              : 'Confirm Appointment'}
          </button>

          <p className="text-xs text-slate-500 leading-relaxed">
            An automated HIPAA-compliant email reminder is scheduled immediately upon confirmation.
          </p>
        </aside>
      </form>
    </div>
  );
};
