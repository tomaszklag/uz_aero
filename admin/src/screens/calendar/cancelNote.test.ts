/**
 * Ninerdeck - panel: test zdania o skutku odwołania (`cancelNote.ts`; §12.9).
 *
 * Każda gałąź mówi, KTO dostanie wiadomość - i nigdy nie obiecuje jej osobie, która
 * właśnie odwołuje (administrator bywa drugim pilotem).
 */

import { describe, expect, it } from 'vitest';

import { cancelNote, type CancelNoteInput } from './cancelNote';

const note = (over: Partial<CancelNoteInput> = {}) =>
  cancelNote({ kind: 'flight', status: 'confirmed', pilotId: 'PWI', dualId: null, viewerId: 'AKO', ...over });

describe('cudza rezerwacja (K2 - administrator odwołuje z powodem)', () => {
  it('dowódca bez drugiego pilota', () => {
    expect(note()).toBe('Pilot dostanie wiadomość z powodem. Termin zwolni się natychmiast.');
  });

  it('dowódca i drugi pilot', () => {
    expect(note({ dualId: 'JSE' })).toBe(
      'Pilot i drugi pilot dostaną wiadomość z powodem. Termin zwolni się natychmiast.',
    );
  });

  it('administrator w fotelu drugiego pilota nie obiecuje wiadomości sobie', () => {
    expect(note({ dualId: 'AKO' })).toBe('Pilot dostanie wiadomość z powodem. Termin zwolni się natychmiast.');
  });

  it('czekająca - do tego osoby z kroku', () => {
    expect(note({ status: 'pending', dualId: 'JSE' })).toBe(
      'Pilot i drugi pilot dostaną wiadomość z powodem, a osoby z kroku - że prośba została wycofana.',
    );
  });
});

describe('własna rezerwacja (K2b - bez pola powodu)', () => {
  it('bez drugiego pilota - samo zwolnienie terminu, jak przed §12.9', () => {
    expect(note({ viewerId: 'PWI' })).toBe('Termin zwolni się natychmiast.');
    expect(note({ viewerId: 'PWI', status: 'pending' })).toBe(
      'Osoby z kroku dostaną wiadomość, że prośba została wycofana.',
    );
  });

  it('z drugim pilotem - wiadomość do niego, bez obietnicy powodu', () => {
    expect(note({ viewerId: 'PWI', dualId: 'JSE' })).toBe(
      'Drugi pilot dostanie wiadomość. Termin zwolni się natychmiast.',
    );
    expect(note({ viewerId: 'PWI', dualId: 'JSE', status: 'pending' })).toBe(
      'Drugi pilot dostanie wiadomość, a osoby z kroku - że prośba została wycofana.',
    );
  });
});

describe('wyłączenie z użytku', () => {
  it('nie ma foteli, więc nie ma komu pisać', () => {
    expect(note({ kind: 'block', pilotId: null })).toBe(
      'Termin zwolni się natychmiast i maszyna wróci do kalendarza.',
    );
  });
});
