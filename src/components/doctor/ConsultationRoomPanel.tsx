import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  FileText,
  Pill,
  Stethoscope,
  TestTube2,
  Unlock,
  Video,
} from 'lucide-react';
import { api } from '../../api';
import { calculateBmi } from '../../lib/hospitalRules';
import type {
  Appointment,
  ClinicalEncounter,
  PatientRecordView,
  VitalSigns,
} from '../../types';

interface ConsultationRoomPanelProps {
  patient: PatientRecordView | null;
  linkedAppointment: Appointment | null;
  patientEncounters: ClinicalEncounter[];
  onPatientUpdated: (patient: PatientRecordView) => void;
  onEncounterCreated: (payload: {
    encounter: ClinicalEncounter;
    patient: PatientRecordView;
    appointment?: Appointment;
  }) => void;
  onNotify: (msg: { type: 'ok' | 'err'; text: string }) => void;
  onJumpToRx: (patientId: string, encounterId?: string) => void;
  onJumpToLab: (patientId: string) => void;
}

export const ConsultationRoomPanel: React.FC<ConsultationRoomPanelProps> = ({
  patient,
  linkedAppointment,
  patientEncounters,
  onPatientUpdated,
  onEncounterCreated,
  onNotify,
  onJumpToRx,
  onJumpToLab,
}) => {
  const [decrypting, setDecrypting] = useState(false);
  const [telehealthActive, setTelehealthActive] = useState(false);

  // Vitals form state
  const [bpSys, setBpSys] = useState('122');
  const [bpDia, setBpDia] = useState('78');
  const [hr, setHr] = useState('74');
  const [tempC, setTempC] = useState('36.8');
  const [spo2, setSpo2] = useState('98');
  const [weightKg, setWeightKg] = useState('68');
  const [heightCm, setHeightCm] = useState('170');

  // SOAP Note form state
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [icdCode, setIcdCode] = useState('');
  const [plan, setPlan] = useState('');
  const [followUpDays, setFollowUpDays] = useState('14');
  const [markCompleted, setMarkCompleted] = useState(true);
  const [submittingSoap, setSubmittingSoap] = useState(false);

  // Inline encrypted summary fields (allergies & medical history)
  const [editAllergies, setEditAllergies] = useState('');
  const [editHistory, setEditHistory] = useState('');
  const [savingChart, setSavingChart] = useState(false);

  useEffect(() => {
    setTelehealthActive(false);
    if (linkedAppointment) {
      setSubjective(linkedAppointment.reasonSummary || '');
    } else {
      setSubjective('');
    }
    if (patient?.decrypted) {
      setEditAllergies(patient.decrypted.allergies);
      setEditHistory(patient.decrypted.medicalHistory);
    }
  }, [patient?.id, linkedAppointment?.id]);

  useEffect(() => {
    if (patient?.decrypted) {
      setEditAllergies(patient.decrypted.allergies);
      setEditHistory(patient.decrypted.medicalHistory);
    }
  }, [patient?.decrypted]);

  const liveBmi = useMemo(
    () => calculateBmi(Number(weightKg) || undefined, Number(heightCm) || undefined),
    [weightKg, heightCm]
  );

  if (!patient) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
        <Stethoscope className="w-6 h-6 text-teal-700 mx-auto" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-900">Select a Patient to Open Consultation Room</p>
        <p className="text-xs text-slate-500">
          Choose an active appointment from the queue or pick a patient chart from the selector.
        </p>
      </div>
    );
  }

  const handleDecryptPhi = async () => {
    setDecrypting(true);
    try {
      const res = await api.decryptPatient(patient.id);
      onPatientUpdated(res.patient);
      onNotify({
        type: 'ok',
        text: `HIPAA Audit Logged: Decrypted AES-256-GCM clinical chart for ${res.patient.mrn}.`,
      });
    } catch (err) {
      onNotify({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to decrypt patient chart.',
      });
    } finally {
      setDecrypting(false);
    }
  };

  const handleSaveEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingSoap(true);
    try {
      const vitals: VitalSigns = {
        bloodPressureSystolic: Number(bpSys) || undefined,
        bloodPressureDiastolic: Number(bpDia) || undefined,
        heartRateBpm: Number(hr) || undefined,
        temperatureC: Number(tempC) || undefined,
        spo2Pct: Number(spo2) || undefined,
        weightKg: Number(weightKg) || undefined,
        heightCm: Number(heightCm) || undefined,
        bmi: liveBmi,
      };
      const res = await api.createDoctorEncounter({
        patientId: patient.id,
        appointmentId: linkedAppointment?.id,
        visitType: linkedAppointment?.visitType || 'In-Person Consultation',
        vitals,
        subjective,
        objective,
        assessment,
        icdCode: icdCode.trim() || undefined,
        plan,
        followUpDays: Number(followUpDays) || undefined,
        markAppointmentCompleted: Boolean(linkedAppointment && markCompleted),
      });
      onEncounterCreated(res);
      setObjective('');
      setAssessment('');
      setIcdCode('');
      setPlan('');
      onNotify({
        type: 'ok',
        text: `Encounter ${res.encounter.encounterCode} saved & clinical chart re-encrypted (AES-256-GCM).`,
      });
    } catch (err) {
      onNotify({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to record consultation encounter.',
      });
    } finally {
      setSubmittingSoap(false);
    }
  };

  const handleSaveAllergyHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChart(true);
    try {
      const res = await api.updateClinicalNotes(patient.id, {
        allergies: editAllergies,
        medicalHistory: editHistory,
      });
      onPatientUpdated(res.patient);
      onNotify({
        type: 'ok',
        text: `Updated & re-encrypted allergies and medical history for ${res.patient.mrn}.`,
      });
    } catch (err) {
      onNotify({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update allergies/history.',
      });
    } finally {
      setSavingChart(false);
    }
  };

  const hasAllergyAlert =
    patient.decrypted &&
    patient.decrypted.allergies &&
    !/^(none|nil|no known)/i.test(patient.decrypted.allergies.trim());

  return (
    <div className="space-y-5">
      {/* Patient Header & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-teal-800 tabular-nums">
            {patient.mrn} · Blood Group {patient.bloodGroup} · {patient.encryptionCipher}
          </p>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">{patient.fullName}</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            DOB <span className="font-mono tabular-nums">{patient.dateOfBirth}</span> · {patient.gender} ·{' '}
            {linkedAppointment ? (
              <span className="font-mono text-teal-800">
                Linked Visit {linkedAppointment.bookingCode} ({linkedAppointment.date} {linkedAppointment.timeSlot} ·{' '}
                {linkedAppointment.visitType})
              </span>
            ) : (
              <span>Primary Dept: {patient.primaryDepartment}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {linkedAppointment?.visitType === 'Telehealth Video' && (
            <button
              type="button"
              onClick={() => setTelehealthActive((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" aria-hidden="true" />
              {telehealthActive ? 'End Video Room' : 'Launch Telehealth Room'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onJumpToRx(patient.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            <Pill className="w-3.5 h-3.5" aria-hidden="true" />
            Issue E-Rx
          </button>
          <button
            type="button"
            onClick={() => onJumpToLab(patient.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            <TestTube2 className="w-3.5 h-3.5" aria-hidden="true" />
            Order Lab
          </button>
          {!patient.decrypted && (
            <button
              type="button"
              disabled={decrypting}
              onClick={handleDecryptPhi}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
              {decrypting ? 'Decrypting...' : 'Decrypt PHI Chart'}
            </button>
          )}
        </div>
      </div>

      {/* Telehealth Live Video Room Panel (when activated) */}
      {telehealthActive && linkedAppointment && (
        <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-mono text-teal-300">
              ENCRYPTED TELEHEALTH CONSULTATION ROOM · {linkedAppointment.bookingCode}
            </p>
            <p className="text-sm font-semibold text-white">
              Live Consultation Channel with {patient.fullName}
            </p>
            <p className="text-xs text-slate-300 font-mono">
              Room ID: ms-tele-{linkedAppointment.bookingCode.toLowerCase()} · End-to-End TLS 1.3 + AES-256 Media Stream
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onNotify({
                  type: 'ok',
                  text: `Telehealth check-in alert sent to ${patient.fullName} for room ms-tele-${linkedAppointment.bookingCode.toLowerCase()}.`,
                })
              }
              className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-teal-300 hover:bg-teal-200 rounded-lg cursor-pointer"
            >
              Notify Patient Joined
            </button>
          </div>
        </div>
      )}

      {/* Allergy Alert Banner */}
      {hasAllergyAlert && patient.decrypted && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold">Recorded Drug / Clinical Allergies: </span>
            <span className="font-medium">{patient.decrypted.allergies}</span>
          </div>
        </div>
      )}

      {/* Decrypted Demographics & Allergy Editor */}
      {patient.decrypted ? (
        <form
          onSubmit={handleSaveAllergyHistory}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pb-4 border-b border-slate-100">
            <div>
              <span className="text-slate-500 block">Phone</span>
              <span className="font-mono text-slate-900">{patient.decrypted.phone}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Email</span>
              <span className="font-mono text-slate-900">{patient.decrypted.email}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Insurance Member ID</span>
              <span className="font-mono text-slate-900">{patient.decrypted.insuranceId}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Latest Rx Summary</span>
              <span className="font-mono text-slate-900">{patient.decrypted.prescriptions}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ehr-allergies" className="block text-xs font-medium text-slate-700 mb-1">
                Allergies &amp; Contraindications
              </label>
              <input
                id="ehr-allergies"
                type="text"
                value={editAllergies}
                onChange={(e) => setEditAllergies(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ehr-history" className="block text-xs font-medium text-slate-700 mb-1">
                Chronic Conditions &amp; Medical History
              </label>
              <input
                id="ehr-history"
                type="text"
                value={editHistory}
                onChange={(e) => setEditHistory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Chart Summary: {patient.decrypted.clinicalNotes}
            </p>
            <button
              type="submit"
              disabled={savingChart}
              className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg shrink-0 cursor-pointer"
            >
              {savingChart ? 'Encrypting...' : 'Update Chart Summary'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <p className="font-semibold text-slate-900">
              Masked Contact: <span className="font-mono">{patient.maskedPhone}</span> ·{' '}
              <span className="font-mono">{patient.maskedEmail}</span>
            </p>
            <p className="mt-1">
              Click &quot;Decrypt PHI Chart&quot; to reveal allergies, past medical history, and insurance ID (audit logged).
            </p>
          </div>
        </div>
      )}

      {/* Vitals + Structured SOAP Encounter Form */}
      <form
        onSubmit={handleSaveEncounter}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900">
              Record Vitals &amp; Structured SOAP Consultation Note
            </h3>
          </div>
          {liveBmi !== undefined && (
            <span className="text-xs font-mono font-semibold text-teal-800 tabular-nums">
              Computed BMI: {liveBmi} kg/m²
            </span>
          )}
        </div>

        {/* Vitals Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label htmlFor="v-sys" className="block text-xs font-medium text-slate-600 mb-1">
              BP Sys
            </label>
            <input
              id="v-sys"
              type="number"
              value={bpSys}
              onChange={(e) => setBpSys(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="v-dia" className="block text-xs font-medium text-slate-600 mb-1">
              BP Dia
            </label>
            <input
              id="v-dia"
              type="number"
              value={bpDia}
              onChange={(e) => setBpDia(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="v-hr" className="block text-xs font-medium text-slate-600 mb-1">
              HR (bpm)
            </label>
            <input
              id="v-hr"
              type="number"
              value={hr}
              onChange={(e) => setHr(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="v-temp" className="block text-xs font-medium text-slate-600 mb-1">
              Temp (°C)
            </label>
            <input
              id="v-temp"
              type="number"
              step="0.1"
              value={tempC}
              onChange={(e) => setTempC(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="v-spo2" className="block text-xs font-medium text-slate-600 mb-1">
              SpO2 (%)
            </label>
            <input
              id="v-spo2"
              type="number"
              value={spo2}
              onChange={(e) => setSpo2(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="v-wt" className="block text-xs font-medium text-slate-600 mb-1">
              Weight (kg)
            </label>
            <input
              id="v-wt"
              type="number"
              step="0.5"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="v-ht" className="block text-xs font-medium text-slate-600 mb-1">
              Height (cm)
            </label>
            <input
              id="v-ht"
              type="number"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="soap-s" className="block text-xs font-medium text-slate-700 mb-1">
              Subjective (Chief Complaint &amp; Symptoms) *
            </label>
            <textarea
              id="soap-s"
              rows={2}
              required
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="Patient reports..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="soap-o" className="block text-xs font-medium text-slate-700 mb-1">
              Objective (Physical Exam &amp; Findings)
            </label>
            <textarea
              id="soap-o"
              rows={2}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Systemic exam, auscultation, neurological/orthopedic findings..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="soap-a" className="block text-xs font-medium text-slate-700 mb-1">
              Assessment &amp; Diagnosis *
            </label>
            <input
              id="soap-a"
              type="text"
              required
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="e.g. Essential Hypertension — well controlled"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="soap-icd" className="block text-xs font-medium text-slate-700 mb-1">
                ICD-10 Code
              </label>
              <input
                id="soap-icd"
                type="text"
                value={icdCode}
                onChange={(e) => setIcdCode(e.target.value)}
                placeholder="e.g. I10"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="soap-fup" className="block text-xs font-medium text-slate-700 mb-1">
                Follow-Up (Days)
              </label>
              <input
                id="soap-fup"
                type="number"
                min={1}
                max={365}
                value={followUpDays}
                onChange={(e) => setFollowUpDays(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="soap-p" className="block text-xs font-medium text-slate-700 mb-1">
            Clinical Plan &amp; Patient Guidance *
          </label>
          <textarea
            id="soap-p"
            rows={2}
            required
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            placeholder="Medications, diagnostic panels, lifestyle counseling, and red-flag precautions..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {linkedAppointment ? (
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={markCompleted}
                onChange={(e) => setMarkCompleted(e.target.checked)}
              />
              Mark appointment <span className="font-mono font-semibold">{linkedAppointment.bookingCode}</span> as Completed upon save
            </label>
          ) : (
            <span className="text-xs text-slate-500">
              Encounter is encrypted and synced to the patient chart.
            </span>
          )}

          <button
            type="submit"
            disabled={submittingSoap}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
          >
            {submittingSoap ? 'Saving & Encrypting...' : 'Save SOAP Encounter'}
          </button>
        </div>
      </form>

      {/* Encounter Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900">Prior Clinical Encounters</h3>
          </div>
          <span className="text-xs text-slate-500 tabular-nums">
            {patientEncounters.length} {patientEncounters.length === 1 ? 'note' : 'notes'}
          </span>
        </div>

        {patientEncounters.length === 0 ? (
          <p className="text-xs text-slate-500">No recorded encounters for this patient yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {patientEncounters.map((enc) => (
              <div key={enc.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {enc.encounterCode} · {enc.visitDate} · {enc.visitType}
                  </span>
                  <span className="text-slate-500">
                    {enc.doctorName} · {enc.departmentName}
                    {enc.icdCode ? ` · ICD ${enc.icdCode}` : ''}
                  </span>
                </div>
                <p className="font-semibold text-teal-800">{enc.assessment}</p>
                <p className="text-slate-700">
                  <span className="font-medium text-slate-900">S:</span> {enc.subjective} ·{' '}
                  <span className="font-medium text-slate-900">O:</span> {enc.objective}
                </p>
                <p className="text-slate-700">
                  <span className="font-medium text-slate-900">Plan:</span> {enc.plan}
                </p>
                {enc.vitals && (
                  <p className="font-mono text-slate-500 tabular-nums">
                    Vitals: BP {enc.vitals.bloodPressureSystolic || '--'}/{enc.vitals.bloodPressureDiastolic || '--'} mmHg · HR{' '}
                    {enc.vitals.heartRateBpm || '--'} bpm · SpO2 {enc.vitals.spo2Pct || '--'}%
                    {enc.vitals.bmi ? ` · BMI ${enc.vitals.bmi}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
