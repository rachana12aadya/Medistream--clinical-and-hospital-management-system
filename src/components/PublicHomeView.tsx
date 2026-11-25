import React from 'react';
import { Ambulance, ArrowRight, CalendarCheck, Lock, MailCheck, ShieldCheck, Stethoscope } from 'lucide-react';
import type { Department, Doctor } from '../types';
import { formatCurrency } from '../lib/hospitalRules';
import type { PublicRoute } from './TopBar';

interface PublicHomeViewProps {
  departments: Department[];
  doctors: Doctor[];
  currencySymbol: string;
  onNavigate: (route: PublicRoute) => void;
  onSelectDepartment: (departmentId: string) => void;
  onBookDoctor: (doctor: Doctor) => void;
}

export const PublicHomeView: React.FC<PublicHomeViewProps> = ({
  departments,
  doctors,
  currencySymbol,
  onNavigate,
  onSelectDepartment,
  onBookDoctor,
}) => {
  const featuredDoctors = doctors.slice(0, 4);

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Split Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center bg-white border border-slate-200 rounded-2xl p-8 sm:p-10">
            <p className="text-xs font-medium text-teal-800 tracking-wide mb-3">
              HIPAA-Compliant Care · AES-256-GCM Encrypted Records
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance]">
              Coordinated hospital care, specialist scheduling, and protected patient records.
            </h1>
            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-2xl">
              MediStream connects patients with senior South Indian specialists across five clinical
              departments while safeguarding every chart with AES-256-GCM encryption, streamlined
              scheduling, INR billing, and automated visit reminders.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate('book')}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Book an Appointment
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('doctors')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Browse All 10 Specialists
              </button>
              <button
                type="button"
                onClick={() => onNavigate('ambulance')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Ambulance className="w-4 h-4" aria-hidden="true" />
                Emergency Ambulance
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[280px]">
            <img
              src="/src/assets/images/hero_hospital_atrium_1794725177041.jpg"
              alt="MediStream Clinical Center sunlit atrium"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/40 to-transparent p-6">
              <p className="text-sm font-medium text-white">MediStream Clinical Center</p>
              <p className="text-xs text-slate-200 mt-1">
                5 Specialty Departments · 10 Senior Physicians · 7-Day Outpatient Coverage
              </p>
            </div>
          </div>
        </div>

        {/* 4-Column Summary Strip below Hero */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Specialty Physicians</span>
              <Stethoscope className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{doctors.length} Doctors</p>
            <p className="mt-1 text-xs text-slate-600">2 senior specialists per department</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Chart Encryption</span>
              <Lock className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">AES-256</p>
            <p className="mt-1 text-xs text-slate-600">Field-level GCM encryption at rest</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Portal Workspaces</span>
              <ShieldCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">Role-Based</p>
            <p className="mt-1 text-xs text-slate-600">Patient, Doctor &amp; Admin portals</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Automated Reminders</span>
              <MailCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">24h Notice</p>
            <p className="mt-1 text-xs text-slate-600">Email alerts queued upon booking</p>
          </div>
        </div>
      </section>

      {/* Clinical Departments */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Clinical Departments</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select a department to view attending physicians and real-time outpatient slots.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('doctors')}
            className="text-sm font-medium text-teal-800 hover:text-teal-900 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
          >
            View full specialist directory
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const deptDoctors = doctors.filter((d) => d.departmentId === dept.id);
            return (
              <div
                key={dept.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="font-mono">{dept.code}</span>
                    <span>{dept.floor}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{dept.name}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{dept.description}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    {deptDoctors.map((d) => d.name).join(' · ')}
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 tabular-nums">
                    {deptDoctors.length} Attending Specialists
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDepartment(dept.id);
                      onNavigate('doctors');
                    }}
                    className="text-xs font-semibold text-teal-800 hover:text-teal-900 cursor-pointer"
                  >
                    See doctors →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Featured Specialists & Clinical Standards Split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-slate-200 bg-white flex flex-col">
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
              <img
                src="/src/assets/images/clinic_consultation_suite_1794725176844.jpg"
                alt="Physician consultation suite at MediStream"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Dedicated Patient, Doctor &amp; Admin Portals
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Patients sign in seamlessly with Google (Gmail) for appointments and records,
                  physicians manage SOAP charts, e-prescriptions, and labs in the Doctor Portal,
                  and administrators oversee analytics, RBAC, and HIPAA compliance.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate('user-portal')}
                  className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                >
                  User Portal
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('doctor-portal')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                >
                  Doctor Portal
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-portal')}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Admin Portal
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-slate-900">Featured Attending Specialists</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('doctors')}
                  className="text-xs font-semibold text-teal-800 hover:text-teal-900 cursor-pointer"
                >
                  All 10 Doctors →
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {featuredDoctors.map((doc) => (
                  <div
                    key={doc.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{doc.name}</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {doc.departmentName} · {doc.specialty} · {doc.experienceYears} yrs exp
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {doc.qualifications} · {doc.roomNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(doc.consultationFee, currencySymbol)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onBookDoctor(doc)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        Book Visit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>Integrated Card, Insurance Copay &amp; Instant Bank Settlement</span>
              <span>HIPAA Audit Trail Enabled</span>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <p>© 2026 MediStream Clinical Center. HIPAA-aligned patient record protection.</p>
        <div className="flex items-center gap-6">
          <button type="button" onClick={() => onNavigate('doctors')} className="hover:text-slate-800 cursor-pointer">
            Specialists
          </button>
          <button type="button" onClick={() => onNavigate('book')} className="hover:text-slate-800 cursor-pointer">
            Appointments
          </button>
          <button type="button" onClick={() => onNavigate('ambulance')} className="hover:text-slate-800 cursor-pointer">
            Ambulance
          </button>
          <button type="button" onClick={() => onNavigate('user-portal')} className="hover:text-slate-800 cursor-pointer">
            User Portal
          </button>
          <button type="button" onClick={() => onNavigate('doctor-portal')} className="hover:text-slate-800 cursor-pointer">
            Doctor Portal
          </button>
          <button type="button" onClick={() => onNavigate('admin-portal')} className="hover:text-slate-800 cursor-pointer">
            Admin Portal
          </button>
        </div>
      </footer>
    </div>
  );
};
