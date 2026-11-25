import React, { useEffect, useState } from 'react';
import { Ambulance, CheckCircle2, Clock, MapPin, PhoneCall, Search, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { calculateAmbulanceDispatchMetrics, formatCurrency } from '../lib/hospitalRules';
import type {
  AmbulanceDispatch,
  AmbulancePriority,
  AmbulanceUnit,
  AmbulanceUnitType,
} from '../types';

interface AmbulanceDispatchViewProps {
  currencySymbol: string;
  defaultPatientName?: string;
  defaultPatientEmail?: string;
  compact?: boolean;
  onDispatchComplete?: (dispatch: AmbulanceDispatch) => void;
}

const PRIORITY_OPTIONS: AmbulancePriority[] = [
  'Critical Emergency',
  'Urgent Transfer',
  'Scheduled Patient Transport',
];

const UNIT_TYPES: AmbulanceUnitType[] = [
  'Advanced Cardiac Life Support (ACLS)',
  'Basic Life Support (BLS)',
  'Neonatal & Pediatric ICU',
];

export const AmbulanceDispatchView: React.FC<AmbulanceDispatchViewProps> = ({
  currencySymbol,
  defaultPatientName = '',
  defaultPatientEmail = '',
  compact = false,
  onDispatchComplete,
}) => {
  const [units, setUnits] = useState<AmbulanceUnit[]>([]);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [fleetError, setFleetError] = useState<string | null>(null);

  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [unitType, setUnitType] = useState<AmbulanceUnitType>('Advanced Cardiac Life Support (ACLS)');
  const [priority, setPriority] = useState<AmbulancePriority>('Critical Emergency');
  const [distanceKm, setDistanceKm] = useState<number>(8);

  const [patientName, setPatientName] = useState(defaultPatientName);
  const [patientPhone, setPatientPhone] = useState('');
  const [patientEmail, setPatientEmail] = useState(defaultPatientEmail);
  const [pickupAddress, setPickupAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [clinicalCondition, setClinicalCondition] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedDispatch, setConfirmedDispatch] = useState<AmbulanceDispatch | null>(null);

  // Live tracker
  const [trackCode, setTrackCode] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedDispatch, setTrackedDispatch] = useState<AmbulanceDispatch | null>(null);

  const loadFleet = async () => {
    setLoadingFleet(true);
    try {
      const res = await api.getPublicAmbulances();
      setUnits(res.units);
      setFleetError(null);
      setSelectedUnitId((prevId) => {
        const stillAvailable = res.units.find((u) => u.id === prevId && u.status === 'Available');
        if (stillAvailable) return prevId;
        const firstAvail = res.units.find((u) => u.status === 'Available');
        if (firstAvail) {
          setUnitType(firstAvail.unitType);
          return firstAvail.id;
        }
        return '';
      });
    } catch (err) {
      setFleetError(err instanceof Error ? err.message : 'Unable to load ambulance fleet.');
    } finally {
      setLoadingFleet(false);
    }
  };

  useEffect(() => {
    loadFleet();
  }, []);

  useEffect(() => {
    if (defaultPatientName && !patientName) setPatientName(defaultPatientName);
    if (defaultPatientEmail && !patientEmail) setPatientEmail(defaultPatientEmail);
  }, [defaultPatientName, defaultPatientEmail]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId) || null;
  const effectiveUnitType = selectedUnit?.unitType || unitType;
  const estimate = calculateAmbulanceDispatchMetrics(
    effectiveUnitType,
    distanceKm,
    priority,
    selectedUnit?.baseFeeInr,
    selectedUnit?.perKmFeeInr
  );

  const availableUnitsCount = units.filter((u) => u.status === 'Available').length;

  const handleSelectUnit = (unit: AmbulanceUnit) => {
    if (unit.status !== 'Available') return;
    setSelectedUnitId(unit.id);
    setUnitType(unit.unitType);
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.requestAmbulanceDispatch({
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim() || undefined,
        pickupAddress: pickupAddress.trim(),
        landmark: landmark.trim() || undefined,
        unitType: effectiveUnitType,
        unitId: selectedUnit?.status === 'Available' ? selectedUnit.id : undefined,
        priority,
        clinicalCondition: clinicalCondition.trim() || undefined,
        distanceKm,
      });
      setConfirmedDispatch(res.dispatch);
      setTrackedDispatch(res.dispatch);
      setTrackCode(res.dispatch.dispatchCode);
      setTrackError(null);
      await loadFleet();
      onDispatchComplete?.(res.dispatch);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to dispatch ambulance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = trackCode.trim().toUpperCase();
    if (!trimmed) return;
    setTrackingLoading(true);
    setTrackError(null);
    try {
      const res = await api.trackAmbulanceDispatch(trimmed);
      setTrackedDispatch(res.dispatch);
    } catch (err) {
      setTrackedDispatch(null);
      setTrackError(err instanceof Error ? err.message : 'Dispatch reference not found.');
    } finally {
      setTrackingLoading(false);
    }
  };

  return (
    <div className={compact ? 'space-y-6' : 'max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium text-teal-800 tracking-wide mb-1.5">
            24/7 Rapid Emergency Response · MediStream Trauma &amp; ICU Fleet
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Emergency Ambulance Dispatch
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Request an ACLS cardiac, BLS, or Neonatal ICU ambulance with transparent INR billing, assigned paramedic crew, and live dispatch code tracking.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4 shrink-0">
          <div>
            <p className="text-xs text-slate-500">Ready Units</p>
            <p className="text-lg font-mono font-bold text-slate-900 tabular-nums">
              {availableUnitsCount} / {units.length} Available
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <p className="text-xs text-slate-500">Emergency Desk</p>
            <p className="text-sm font-mono font-semibold text-teal-800 tabular-nums">108 · +91 44 2815 0108</p>
          </div>
        </div>
      </div>

      {/* Confirmed Dispatch Receipt */}
      {confirmedDispatch && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-emerald-800">
                  Ambulance Dispatched · Ref{' '}
                  <span className="font-mono">{confirmedDispatch.dispatchCode}</span>
                </p>
                <h2 className="text-lg font-bold text-slate-900">
                  {confirmedDispatch.vehicleNumber} ({confirmedDispatch.unitType})
                </h2>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-600">Estimated Arrival</p>
              <p className="text-xl font-mono font-bold text-emerald-800 tabular-nums">
                {confirmedDispatch.estimatedEtaMinutes} mins
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-emerald-200/80 text-xs">
            <div>
              <span className="text-slate-500 block">Assigned Driver &amp; Contact</span>
              <span className="font-semibold text-slate-900">{confirmedDispatch.driverName}</span>
              <span className="block font-mono text-slate-700">{confirmedDispatch.driverPhone}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Pickup Location</span>
              <span className="font-medium text-slate-900">{confirmedDispatch.pickupAddress}</span>
              <span className="block text-slate-600">Landmark: {confirmedDispatch.landmark}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Triage Priority</span>
              <span className="font-semibold text-slate-900">{confirmedDispatch.priority}</span>
              <span className="block text-slate-600">{confirmedDispatch.clinicalCondition}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Estimated Total Fare</span>
              <span className="text-base font-mono font-bold text-slate-900 tabular-nums">
                {formatCurrency(confirmedDispatch.estimatedFareInr, currencySymbol)}
              </span>
              <span className="block text-slate-600 tabular-nums">{confirmedDispatch.distanceKm} km route</span>
            </div>
          </div>
        </div>
      )}

      {/* Main 12-Col Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Fleet Selection + Dispatch Request Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Active Fleet Grid */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">1. Select Available Ambulance Unit</h2>
              <span className="text-xs text-slate-500">Base 5 km included in unit fare</span>
            </div>

            {fleetError ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-800">
                {fleetError}
              </div>
            ) : loadingFleet ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-slate-500">
                Loading live MediStream ambulance units...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {units.map((unit) => {
                  const isAvailable = unit.status === 'Available';
                  const isSelected = selectedUnitId === unit.id && isAvailable;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => handleSelectUnit(unit)}
                      className={`text-left bg-white border rounded-xl p-5 transition-colors ${
                        isSelected
                          ? 'border-teal-700 ring-2 ring-teal-700/15'
                          : isAvailable
                          ? 'border-slate-200 hover:border-teal-600 cursor-pointer'
                          : 'border-slate-200 bg-slate-50/70 opacity-75 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-slate-800">{unit.vehicleNumber}</span>
                        <span
                          className={`font-semibold ${
                            unit.status === 'Available'
                              ? 'text-emerald-700'
                              : unit.status === 'Dispatched'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {unit.status}
                        </span>
                      </div>

                      <h3 className="mt-1.5 text-sm font-bold text-slate-900">{unit.unitName}</h3>
                      <p className="text-xs text-teal-800 font-medium mt-0.5">{unit.unitType}</p>

                      <p className="mt-2 text-xs text-slate-600">
                        {unit.baseLocation} · Crew: {unit.driverName} &amp; {unit.paramedicName}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        {unit.equipment.join(' · ')}
                      </p>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(unit.baseFeeInr, currencySymbol)} base
                          <span className="text-slate-500 font-normal">
                            {' '}
                            + {formatCurrency(unit.perKmFeeInr, currencySymbol)}/km
                          </span>
                        </span>
                        <span className="text-teal-800 font-semibold">
                          {isSelected ? 'Selected' : isAvailable ? 'Select Unit' : 'On Duty'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Dispatch Form */}
          <form
            onSubmit={handleDispatchSubmit}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">2. Pickup &amp; Clinical Triage Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirmed immediately with driver contact and live dispatch code.
                </p>
              </div>
              <Ambulance className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
            </div>

            {submitError && (
              <div
                role="alert"
                className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-lg"
              >
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="amb-patient-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Patient / Caller Full Name *
                </label>
                <input
                  id="amb-patient-name"
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Karthik Sundaram"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="amb-patient-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Emergency Contact Number *
                </label>
                <input
                  id="amb-patient-phone"
                  type="tel"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder="+91 98401 11223"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="amb-priority" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Dispatch Priority
                </label>
                <select
                  id="amb-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as AmbulancePriority)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="amb-unit-type" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Support Level Required
                </label>
                <select
                  id="amb-unit-type"
                  value={effectiveUnitType}
                  onChange={(e) => {
                    const nextType = e.target.value as AmbulanceUnitType;
                    setUnitType(nextType);
                    const match = units.find((u) => u.status === 'Available' && u.unitType === nextType);
                    setSelectedUnitId(match ? match.id : '');
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="amb-pickup" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Pickup Street Address *
                </label>
                <input
                  id="amb-pickup"
                  type="text"
                  required
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="e.g. 24 Luz Church Road, Mylapore, Chennai 600004"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="amb-landmark" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nearest Landmark
                </label>
                <input
                  id="amb-landmark"
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Opposite Kapaleeshwarar Tank"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="amb-distance" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Estimated Distance to Hospital (km)
                </label>
                <input
                  id="amb-distance"
                  type="number"
                  min={1}
                  max={120}
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(Math.min(120, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="amb-condition" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Chief Symptom / Transfer Reason
                </label>
                <input
                  id="amb-condition"
                  type="text"
                  value={clinicalCondition}
                  onChange={(e) => setClinicalCondition(e.target.value)}
                  placeholder="e.g. Chest discomfort / Oxygen support needed"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>

              <div>
                <label htmlFor="amb-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Patient Email (optional receipt)
                </label>
                <input
                  id="amb-email"
                  type="email"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  placeholder="patient@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                Dispatch logged in HIPAA trauma registry
              </p>
              <button
                type="submit"
                disabled={submitting || availableUnitsCount === 0}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {submitting
                  ? 'Dispatching Unit...'
                  : availableUnitsCount === 0
                  ? 'No Units Currently Available'
                  : 'Request Immediate Dispatch'}
              </button>
            </div>
          </form>
        </div>

        {/* Right 4 Columns: Live Estimate Card + Dispatch Status Lookup */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Dispatch Summary &amp; Fare</h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Selected Unit</span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedUnit ? selectedUnit.vehicleNumber : 'Auto-Assign'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Support Tier</span>
                <span className="font-medium text-slate-800 text-right">{effectiveUnitType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  Estimated Arrival
                </span>
                <span className="font-mono font-bold text-teal-800 tabular-nums">
                  {estimate.estimatedEtaMinutes} mins
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Base Dispatch Fee (incl. 5 km)</span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(estimate.baseFee, currencySymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">
                  Distance ({Math.max(0, distanceKm - 5)} extra km)
                </span>
                <span className="font-mono text-slate-900 tabular-nums">
                  {formatCurrency(estimate.distanceCharge, currencySymbol)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-slate-900">
                <span>Estimated Total</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(estimate.totalFare, currencySymbol)}
                </span>
              </div>
            </div>
          </div>

          {/* Live Dispatch Code Tracker */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Track Dispatch Status</h2>
              <MapPin className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </div>

            <form onSubmit={handleTrackLookup} className="flex gap-2">
              <label htmlFor="track-dispatch-code" className="sr-only">
                Dispatch code
              </label>
              <input
                id="track-dispatch-code"
                type="text"
                value={trackCode}
                onChange={(e) => setTrackCode(e.target.value)}
                placeholder="e.g. AMB-2041"
                className="flex-1 min-w-0 px-3 py-2 text-xs font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <button
                type="submit"
                disabled={trackingLoading}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shrink-0 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                Track
              </button>
            </form>

            {trackError && <p className="text-xs text-rose-700">{trackError}</p>}

            {trackedDispatch && (
              <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">
                    {trackedDispatch.dispatchCode}
                  </span>
                  <span className="font-semibold text-teal-800">{trackedDispatch.status}</span>
                </div>
                <p className="text-slate-700">
                  {trackedDispatch.vehicleNumber} · {trackedDispatch.unitType}
                </p>
                <p className="text-slate-600">
                  Driver: {trackedDispatch.driverName} ·{' '}
                  <span className="font-mono">{trackedDispatch.driverPhone}</span>
                </p>
                <p className="text-slate-600">Pickup: {trackedDispatch.pickupAddress}</p>
                <div className="flex items-center justify-between pt-1 text-slate-500 font-mono tabular-nums">
                  <span>ETA {trackedDispatch.estimatedEtaMinutes} mins</span>
                  <span>{formatCurrency(trackedDispatch.estimatedFareInr, currencySymbol)}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500 flex items-center gap-1.5 pt-2 border-t border-slate-100">
              <PhoneCall className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
              Try sample code <span className="font-mono font-semibold text-slate-700">AMB-2041</span>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
