import React, { useEffect, useRef, useState } from 'react';
import { Ambulance, CalendarCheck, MessageSquare, Send, X } from 'lucide-react';
import { api } from '../api';
import type { PublicRoute } from './TopBar';

interface ChatItem {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface ClinicChatbotProps {
  onNavigate?: (route: PublicRoute) => void;
}

const INITIAL_MESSAGE: ChatItem = {
  id: 'welcome',
  role: 'model',
  text: 'Welcome to MediStream. Ask me about our 5 clinical departments, specialist consultation fees in ₹, appointment booking, or 24/7 ambulance dispatch.',
};

const QUICK_PROMPTS = [
  'Which cardiologists are available?',
  'How much is an ACLS ambulance?',
  'How do I book a visit?',
];

function renderCleanMessageText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const cleanLine = line.replace(/^\s*\*\s+/, '• ');
    const segments = cleanLine.split(/(\*\*[^*]+\*\*)/g);
    return (
      <React.Fragment key={lineIdx}>
        {segments.map((seg, segIdx) => {
          if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
            return (
              <strong key={segIdx} className="font-semibold">
                {seg.slice(2, -2)}
              </strong>
            );
          }
          return <React.Fragment key={segIdx}>{seg}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export const ClinicChatbot: React.FC<ClinicChatbotProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages.length, loading]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const userTurn: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const historyPayload = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userTurn]);
    setInput('');
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await api.sendChatMessage(trimmed, historyPayload);
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: res.reply,
        },
      ]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to reach MediStream Care Assistant.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <section
          aria-label="MediStream Care Assistant"
          className="w-[calc(100vw-2.5rem)] sm:w-[390px] max-h-[76vh] bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">MediStream Care Assistant</p>
              <p className="text-xs text-slate-300 truncate">
                Specialists · Appointments · Ambulance 108
              </p>
            </div>
            <button
              type="button"
              aria-label="Close MediStream assistant"
              onClick={() => setOpen(false)}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Quick Navigation Strip */}
          {onNavigate && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs shrink-0">
              <span className="text-slate-500">Quick actions:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('book');
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-teal-800 bg-white border border-slate-200 hover:border-teal-600 rounded-md cursor-pointer"
                >
                  <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  Book Visit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate('ambulance');
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-teal-800 bg-white border border-slate-200 hover:border-teal-600 rounded-md cursor-pointer"
                >
                  <Ambulance className="w-3.5 h-3.5" aria-hidden="true" />
                  Ambulance
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-teal-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-800'
                  }`}
                >
                  {msg.role === 'model' ? renderCleanMessageText(msg.text) : msg.text}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[11px] font-medium text-slate-500">Suggested questions</p>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void sendMessage(q)}
                      className="text-left text-xs text-teal-800 bg-white border border-slate-200 hover:border-teal-600 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2 rounded-xl text-xs bg-white border border-slate-200 text-slate-500">
                  Checking MediStream directory...
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2 rounded-lg"
              >
                {errorMsg}
              </div>
            )}

            <div ref={listEndRef} />
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="medistream-chat-input" className="sr-only">
                Ask MediStream Care Assistant
              </label>
              <input
                ref={inputRef}
                id="medistream-chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about doctors, fees, or ambulance..."
                maxLength={1000}
                className="flex-1 min-w-0 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send chat message"
                className="inline-flex items-center justify-center px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-lg shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              General hospital info only · Emergencies: Ambulance tab or 108
            </p>
          </form>
        </section>
      )}

      {/* Floating Toggle Button */}
      <button
        type="button"
        aria-label={open ? 'Minimize Care Assistant' : 'Open MediStream Care Assistant'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-xl shadow-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <MessageSquare className="w-4 h-4" aria-hidden="true" />
        <span>{open ? 'Close Assistant' : 'Care Assistant'}</span>
      </button>
    </div>
  );
};
