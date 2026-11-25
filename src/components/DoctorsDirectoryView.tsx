import React, { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Search, UserCheck } from 'lucide-react';
import { api } from '../api';
import { formatCurrency } from '../lib/hospitalRules';
import type { Department, Doctor } from '../types';

interface DoctorsDirectoryViewProps {
  departments: Department[];
  doctors: Doctor[];
  currencySymbol: string;
  initialDepartmentId?: string;
  onStartBooking: (doctor: Doctor, date?: string, slot?: string) => void;
}

export const DoctorsDirectoryView: React.FC<DoctorsDirectoryViewProps> = ({
  departments,
  doctors,
  currencySymbol,
  initialDepartmentId = 'all',
  onStartBooking,
}) => {
  const [selectedDept, setSelectedDept] = useState<string>(initialDepartmentId);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDoctor, setActiveDoctor] = useState<Doctor | null>(doctors[0] ?? null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    setSelectedDept(initialDepartmentId);
  }, [initialDepartmentId]);

  const filteredDoctors = doctors.filter((doc) => {
    const matchesDept = selectedDept === 'all' || doc.departmentId === selectedDept;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      doc.name.toLowerCase().includes(q) ||
      doc.departmentName.toLowerCase().includes(q) ||
      doc.specialty.toLowerCase().includes(q) ||
      doc.languages.some((l) => l.toLowerCase().includes(q));
    return matchesDept && matchesSearch;
  });

  useEffect(() => {
    if (!activeDoctor || !filteredDoctors.some((d) => d.id === activeDoctor.id)) {
      setActiveDoctor(filteredDoctors[0] ?? null);
    }
  }, [selectedDept, searchQuery, doctors]);

  useEffect(() => {
    if (!activeDoctor || !selectedDate) {
      setAvailableSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    api
      .getDoctorSlots(activeDoctor.id, selectedDate)
      .then((res) => {
        if (!cancelled) setAvailableSlots(res.availableSlots);
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
  }, [activeDoctor?.id, selectedDate]);

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Medical Specialists Directory</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Browse our {doctors.length} South Indian physicians across {departments.length} departments and check live consultation slots.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="doctor-search" className="sr-only">
            Search doctors, specialty, or language
          </label>
          <input
            id="doctor-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, specialty, language..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700"
          />
        </div>
      </div>

      {/* Department Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto" role="tablist" aria-label="Filter by department">
        <button
          type="button"
          role="tab"
          aria-selected={selectedDept === 'all'}
          onClick={() => setSelectedDept('all')}
          className={`px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
            selectedDept === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          All Departments ({doctors.length})
        </button>
        {departments.map((dept) => {
          const count = doctors.filter((d) => d.departmentId === dept.id).length;
          return (
            <button
              key={dept.id}
              type="button"
              role="tab"
              aria-selected={selectedDept === dept.id}
              onClick={() => setSelectedDept(dept.id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedDept === dept.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {dept.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Directory Grid + Dedicated Doctor Profile / Slot Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-3">
          {filteredDoctors.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="text-sm font-medium text-slate-900">No specialists match your current filter.</p>
              <p className="text-xs text-slate-500 mt-1">Try clearing the search box or choosing another department.</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedDept('all');
                  setSearchQuery('');
                }}
                className="mt-4 px-4 py-2 text-xs font-medium text-teal-800 bg-teal-50 rounded-lg cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredDoctors.map((doc) => {
              const isSelected = activeDoctor?.id === doc.id;
              return (
                <div
                  key={doc.id}
                  className={`bg-white rounded-xl p-5 border transition-colors ${
                    isSelected ? 'border-teal-700 ring-1 ring-teal-700/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500">
                        {doc.departmentName} · {doc.roomNumber} · {doc.experienceYears} years experience
                      </p>
                      <h2 className="text-lg font-semibold text-slate-900">{doc.name}</h2>
                      <p className="text-sm text-slate-700">{doc.specialty}</p>
                      <p className="text-xs text-slate-500">
                        {doc.qualifications} · Languages: {doc.languages.join(', ')}
                      </p>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                      <span className="text-base font-mono font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(doc.consultationFee, currencySymbol)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveDoctor(doc)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartBooking(doc, selectedDate)}
                          disabled={!doc.acceptingNewPatients}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg cursor-pointer"
                        >
                          Book Slot
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Dedicated Doctor Detail & Live Slot Picker */}
        <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 lg:sticky lg:top-24">
          {activeDoctor ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium text-teal-800">
                  Attending Physician Profile · {activeDoctor.departmentName}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{activeDoctor.name}</h2>
                <p className="text-sm text-slate-600">{activeDoctor.specialty}</p>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">{activeDoctor.bio}</p>

              <div className="grid grid-cols-2 gap-3 py-4 border-y border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500 block">Qualifications</span>
                  <span className="font-medium text-slate-900">{activeDoctor.qualifications}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Consultation Fee</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(activeDoctor.consultationFee, currencySymbol)}
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-slate-500 block">Location</span>
                    <span className="font-medium text-slate-900">{activeDoctor.roomNumber}</span>
                  </div>
                </div>
                <div className="flex items-start gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-slate-500 block">Status</span>
                    <span className={`font-medium ${activeDoctor.acceptingNewPatients ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {activeDoctor.acceptingNewPatients ? 'Accepting Visits' : 'On Leave'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label htmlFor="doctor-profile-date" className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    Check Live Availability
                  </label>
                  <input
                    id="doctor-profile-date"
                    type="date"
                    min={minDate}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="text-xs font-mono border border-slate-200 rounded-md px-2.5 py-1 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  />
                </div>

                {loadingSlots ? (
                  <p className="text-xs text-slate-500 py-4">Loading available slots...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    No outpatient slots available on this date. Select another weekday or doctor.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => onStartBooking(activeDoctor, selectedDate, slot)}
                        className="inline-flex items-center justify-center gap-1 py-2 px-2 text-xs font-mono font-medium text-teal-800 bg-teal-50 hover:bg-teal-700 hover:text-white border border-teal-200 rounded-lg transition-colors cursor-pointer tabular-nums"
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onStartBooking(activeDoctor, selectedDate, availableSlots[0])}
                disabled={!activeDoctor.acceptingNewPatients}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                Schedule with {activeDoctor.name}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a physician to view details and schedule slots.</p>
          )}
        </aside>
      </div>
    </div>
  );
};
