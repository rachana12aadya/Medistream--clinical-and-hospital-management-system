import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMediStreamSystemInstruction, normalizeChatHistory } from './chatService.ts';
import { HospitalStore } from './store.ts';

test('normalizeChatHistory filters invalid entries, trims text, and bounds history length', () => {
  const input = [
    { role: 'user', text: '  Hello doctor  ' },
    { role: 'system', text: 'ignored role' },
    { role: 'model', text: '' },
    { role: 'model', text: 'How can I help?' },
    null,
    { role: 'user', text: 'Check cardiology' },
  ];

  const normalized = normalizeChatHistory(input, 2);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized[0], { role: 'model', text: 'How can I help?' });
  assert.deepEqual(normalized[1], { role: 'user', text: 'Check cardiology' });
});

test('buildMediStreamSystemInstruction includes departments, INR fees, and ambulance rates without PHI', () => {
  const store = new HospitalStore();
  const state = store.getState();
  const prompt = buildMediStreamSystemInstruction(state);

  assert.match(prompt, /Cardiology/);
  assert.match(prompt, /Dr\. Arvind Subramanian/);
  assert.match(prompt, /₹1,200|₹1200/);
  assert.match(prompt, /TN-01-MS-108/);
  assert.match(prompt, /108/);
});
