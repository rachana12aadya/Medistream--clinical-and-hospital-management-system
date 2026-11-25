import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { HospitalStoreData } from './store.ts';

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

export function normalizeChatHistory(
  history: unknown,
  maxTurns: number = 12
): ChatTurnInput[] {
  if (!Array.isArray(history)) return [];
  const cleaned: ChatTurnInput[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const rawRole = (item as { role?: unknown }).role;
    const rawText = (item as { text?: unknown }).text;
    if ((rawRole !== 'user' && rawRole !== 'model') || typeof rawText !== 'string') {
      continue;
    }
    const trimmed = rawText.trim().slice(0, 1500);
    if (!trimmed) continue;
    cleaned.push({ role: rawRole, text: trimmed });
  }
  return cleaned.slice(-maxTurns);
}

export function buildMediStreamSystemInstruction(state: HospitalStoreData): string {
  const currency = state.systemConfig.currencySymbol || '₹';
  const deptLines = state.departments
    .map((d) => `- ${d.name} (${d.code}, ${d.floor}): ${d.description}`)
    .join('\n');

  const doctorLines = state.doctors
    .map(
      (doc) =>
        `- ${doc.name} | ${doc.departmentName} | ${doc.specialty} | ${doc.experienceYears} yrs exp | Fee: ${currency}${doc.consultationFee} | ${doc.roomNumber} | Languages: ${doc.languages.join(', ')} | ${
          doc.acceptingNewPatients ? 'Accepting visits' : 'Temporarily paused'
        }`
    )
    .join('\n');

  const ambulanceLines = state.ambulances
    .map(
      (u) =>
        `- ${u.unitName} (${u.vehicleNumber}, ${u.unitType}): Base ${currency}${u.baseFeeInr} (includes 5 km) + ${currency}${u.perKmFeeInr}/km | Status: ${u.status} | Base: ${u.baseLocation}`
    )
    .join('\n');

  return [
    `You are the MediStream Care Assistant for ${state.systemConfig.hospitalName}.`,
    `Help visitors and patients find the right specialist department, compare doctor fees (always in ${currency}), understand outpatient appointment booking, request or track emergency ambulances, and navigate the User Portal (Google/Gmail sign-in for appointments, e-prescriptions, lab results, SOAP consultation summaries, and rescheduling), Doctor Portal (physician clinical queue, EHR/SOAP notes, e-prescriptions, lab orders, referrals, and leave calendar), or Admin Portal.`,
    '',
    'CLINICAL SAFETY & SCOPE RULES:',
    '1. Give clear, concise, practical guidance (2 to 5 short sentences or brief bullet points).',
    '2. Never diagnose medical conditions or prescribe medications; recommend booking a specialist consultation for clinical advice.',
    '3. If a user describes chest pain, severe breathing trouble, stroke symptoms, or an urgent emergency, advise calling 108 / +91 44 2815 0108 or opening the Ambulance tab for immediate ACLS dispatch.',
    '4. Never expose or request sensitive personal health identifiers (full phone, national ID, passwords).',
    '5. Only state facts grounded in the hospital directory below. If unsure, offer to connect them with the Outpatient Desk or Specialist Directory.',
    '6. Write in clean plain text without markdown syntax (do not use ** bold markers or * bullets; use simple hyphenated lines if listing items).',
    '',
    'CLINICAL DEPARTMENTS:',
    deptLines,
    '',
    'ATTENDING SPECIALISTS:',
    doctorLines,
    '',
    'AMBULANCE FLEET & INR RATES:',
    ambulanceLines,
    '',
    `BILLING & POLICIES: Insurance Copay discount ${state.systemConfig.defaultInsuranceCoveragePct}% | Platform processing fee ${currency}${state.systemConfig.platformProcessingFee} | Visit reminders sent ${state.systemConfig.reminderLeadHours}h prior | Chart security: ${state.systemConfig.hipaaEncryptionAlgorithm}.`,
  ].join('\n');
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Assistant unavailable: GEMINI_API_KEY is not configured in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateClinicChatReply(
  message: string,
  history: ChatTurnInput[],
  state: HospitalStoreData
): Promise<string> {
  const ai = createGeminiClient();
  const systemInstruction = buildMediStreamSystemInstruction(state);

  const chat = ai.chats.create({
    model: 'gemini-4-hydrogen',
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
    history: history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
  });

  const response = await chat.sendMessage({ message: message.trim() });
  const replyText = (response.text || '').trim();
  if (!replyText) {
    throw new Error('Assistant did not return a response. Please try again.');
  }
  return replyText;
}
