import React from 'react';

export type PublicRoute =
  | 'overview'
  | 'doctors'
  | 'book'
  | 'ambulance'
  | 'user-portal'
  | 'doctor-portal'
  | 'admin-portal';

interface TopBarProps {
  activeRoute: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeRoute, onNavigate }) => {
  const navItems: Array<{ id: PublicRoute; label: string }> = [
    { id: 'doctors', label: 'Doctors' },
    { id: 'book', label: 'Book Visit' },
    { id: 'ambulance', label: 'Ambulance' },
    { id: 'user-portal', label: 'User Portal' },
    { id: 'doctor-portal', label: 'Doctor Portal' },
  ];

  const mobileItems: Array<{ id: PublicRoute; label: string }> = [
    { id: 'overview', label: 'Overview' },
    ...navItems,
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 rounded"
        >
          MediStream
        </button>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav aria-label="Primary" className="hidden md:flex items-center gap-7">
          {navItems.map((item) => {
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'text-teal-800 border-b-2 border-teal-700'
                    : 'text-slate-600 hover:text-slate-900 border-b-2 border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('admin-portal')}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            Admin Portal
          </button>
        </div>
      </div>

      {/* Mobile compact secondary nav row */}
      <nav aria-label="Mobile Navigation" className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
        {mobileItems.map((item) => {
          const isActive = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`text-xs font-medium whitespace-nowrap shrink-0 px-2.5 py-1.5 rounded-md transition-colors ${
                isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
