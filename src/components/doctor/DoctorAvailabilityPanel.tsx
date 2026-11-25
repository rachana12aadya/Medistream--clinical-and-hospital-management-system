import React, { useEffect, useState } from 'react';
import { CalendarOff, Clock, Plus, X } from 'lucide-react';
import { api } from '../../api';
import type { Doctor } from '../../types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STANDARD_SLOTS = [
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:30',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
];

interface DoctorAvailabilityPanelProps {
  doctor: Doctor;
  onUpdated: (doctor: Doctor) => void;
  onNotify: (msg: { type: 'ok' | 'err'; text: string }) => void;
}

export const DoctorAvailabilityPanel: React.FC<DoctorAvailabilityPanelProps> = ({
  doctor,
  onUpdated,
  onNotify,
}) => {
  const [acceptingNewPatients, setAcceptingNewPatients] = useState(doctor.acceptingNewPatients);
  const [telehealthEnabled, setTelehealthEnabled] = useState(doctor.telehealthEnabled ?? true);
  const [roomNumber, setRoomNumber] = useState(doctor.roomNumber);
  const [bio, setBio] = useState(doctor.bio);
  const [availableDays, setAvailableDays] = useState<number[]>(doctor.availableDays);
  const [dailySlots, setDailySlots] = useState<string[]>(doctor.dailySlots);
  const [blockedDates, setBlockedDates] = useState<string[]>(doctor.blockedDates || []);
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [customSlot, setCustomSlot] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAcceptingNewPatients(doctor.acceptingNewPatients);
    setTelehealthEnabled(doctor.telehealthEnabled ?? true);
    setRoomNumber(doctor.roomNumber);
    setBio(doctor.bio);
    setAvailableDays(doctor.availableDays);
    setDailySlots(doctor.dailySlots);
    setBlockedDates(doctor.blockedDates || []);
  }, [doctor]);

  const toggleDay = (dayIdx: number) => {
    setAvailableDays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx].sort((a, b) => a - b)
    );
  };

  const toggleSlot = (slot: string) => {
    setDailySlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot].sort()
    );
  };

  const handleAddCustomSlot = () => {
    const clean = customSlot.trim();
    if (!/^\d{2}:\d{2}$/.test(clean)) {
      onNotify({ type: 'err', text: 'Enter time slot in 24-hour HH:MM format (e.g. 16:30).' });
      return;
    }
    if (!dailySlots.includes(clean)) {
      setDailySlots((prev) => [...prev, clean].sort());
    }
    setCustomSlot('');
  };

  const handleAddBlockedDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newBlockedDate)) return;
    if (!blockedDates.includes(newBlockedDate)) {
      setBlockedDates((prev) => [...prev, newBlockedDate].sort());
    }
    setNewBlockedDate('');
  };

  const handleRemoveBlockedDate = (dateStr: string) => {
    setBlockedDates((prev) => prev.filter((d) => d !== dateStr));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dailySlots.length === 0) {
      onNotify({ type: 'err', text: 'Keep at least one daily outpatient consultation slot active.' });
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateDoctorAvailability({
        doctorId: doctor.id,
        acceptingNewPatients,
        telehealthEnabled,
        roomNumber,
        bio,
        availableDays,
        dailySlots,
        blockedDates,
      });
      onUpdated(res.doctor);
      onNotify({
        type: 'ok',
        text: `Published updated schedule & blockout dates for ${res.doctor.name}. Live slot booking updated.`,
      });
    } catch (err) {
      onNotify({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save schedule.',
      });
    } finally {
      setSaving(false);
    }
  };

  const allSlotOptions = Array.from(new Set([...STANDARD_SLOTS, ...dailySlots])).sort();

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Practice Settings &amp; Availability</h2>
            <p className="text-xs text-slate-500">
              {doctor.name} · {doctor.departmentName} · {doctor.qualifications}
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptingNewPatients}
                onChange={(e) => setAcceptingNewPatients(e.target.checked)}
              />
              Accepting New Bookings
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={telehealthEnabled}
                onChange={(e) => setTelehealthEnabled(e.target.checked)}
              />
              Telehealth Video Enabled
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="doc-suite" className="block text-xs font-medium text-slate-700 mb-1">
              Consultation Room / Suite
            </label>
            <input
              id="doc-suite"
              type="text"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="doc-bio" className="block text-xs font-medium text-slate-700 mb-1">
              Clinical Profile Bio
            </label>
            <input
              id="doc-bio"
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        {/* Weekly Outpatient Days */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-800">Weekly Outpatient Clinic Days</p>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((dayName, idx) => {
              const active = availableDays.includes(idx);
              return (
                <button
                  key={dayName}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`min-h-[40px] px-4 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-teal-600'
                  }`}
                >
                  {dayName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily Slots */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-800">Active Daily Consultation Slots</p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {dailySlots.length} slots/day
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {allSlotOptions.map((slot) => {
              const active = dailySlots.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => toggleSlot(slot)}
                  className={`min-h-[38px] px-3 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer tabular-nums ${
                    active
                      ? 'bg-teal-50 text-teal-900 border-teal-700'
                      : 'bg-white text-slate-500 border-slate-200 hover:text-slate-900'
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 max-w-xs pt-1">
            <input
              type="text"
              aria-label="Custom consultation slot time"
              value={customSlot}
              onChange={(e) => setCustomSlot(e.target.value)}
              placeholder="Custom HH:MM (e.g. 16:30)"
              className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddCustomSlot}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Slot
            </button>
          </div>
        </div>

        {/* Leave / Blocked Dates */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <CalendarOff className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <p className="text-xs font-semibold text-slate-800">Leave &amp; Surgical Blockout Dates</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Blockout leave date"
              value={newBlockedDate}
              onChange={(e) => setNewBlockedDate(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddBlockedDate}
              className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
            >
              Block Date
            </button>
          </div>

          {blockedDates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {blockedDates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono bg-slate-100 text-slate-800 border border-slate-200 rounded-lg"
                >
                  {d}
                  <button
                    type="button"
                    aria-label={`Remove blocked date ${d}`}
                    onClick={() => handleRemoveBlockedDate(d)}
                    className="text-slate-500 hover:text-rose-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No leave or blockout dates scheduled.</p>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
          >
            {saving ? 'Publishing Schedule...' : 'Save Availability & Publish'}
          </button>
        </div>
      </div>
    </form>
  );
};
