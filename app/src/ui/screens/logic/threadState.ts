/**
 * Ninerdeck - STAN OTWARTEJ ROZMOWY ZLECENIA (4.0.0, epik Z-C #247; makiety 29, 29A).
 *
 * Rozmowa składa się z trzech źródeł naraz: pierwszej strony czytanej przy wejściu i przy
 * każdym powitaniu łącza, starszych stron dociąganych przy przewijaniu i ramek kanału
 * klubu (wiadomość, odczyt). Ta sama wiadomość przychodzi często dwiema drogami - ramką
 * i w odpowiedzi na wysyłkę - więc o tożsamości rozstrzyga identyfikator, nie kolejność.
 *
 * Kursor starszych stron przeżywa odświeżenie pierwszej: inaczej pilot, który przewinął
 * rozmowę do początku, po powrocie łącza dostałby z powrotem jedną stronę.
 */

import type { RemoteThreadMessage, RemoteThreadPage } from '../../../application';

export type ThreadState = Pick<RemoteThreadPage, 'role' | 'closed' | 'participants' | 'messages' | 'next'>;

/** Wiadomość dopisana albo podmieniona po identyfikatorze - ta sama nie staje dwa razy. */
export function upsertMessage(messages: readonly RemoteThreadMessage[], message: RemoteThreadMessage): RemoteThreadMessage[] {
  return [...messages.filter((m) => m.id !== message.id), message];
}

/** Suma dwóch zbiorów wiadomości; przy tym samym identyfikatorze wygrywa druga. */
export function unionMessages(a: readonly RemoteThreadMessage[], b: readonly RemoteThreadMessage[]): RemoteThreadMessage[] {
  const byId = new Map<string, RemoteThreadMessage>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()];
}

/** Odczyt uczestnika z ramki `read` - nowa chwila w miejsce starej. */
export function withRead(
  participants: RemoteThreadPage['participants'],
  pilotId: string,
  at: string,
): RemoteThreadPage['participants'] {
  return participants.some((p) => p.pilotId === pilotId)
    ? participants.map((p) => (p.pilotId === pilotId ? { ...p, lastReadAt: at } : p))
    : [...participants, { pilotId, lastReadAt: at }];
}

/** Starsza strona dopisana do rozmowy - kursor idzie dalej w przeszłość. */
export function withOlderPage(state: ThreadState, page: Pick<RemoteThreadPage, 'messages' | 'next'>): ThreadState {
  return { ...state, messages: unionMessages(state.messages, page.messages), next: page.next };
}

/**
 * Pierwsza strona dopisana do tego, co już było. Kursor starszych stron zostaje stary,
 * jeśli pilot zdążył je dociągnąć (rozmowa ma wiadomości starsze niż najstarsza na stronie).
 */
export function withFirstPage(previous: ThreadState | null | undefined, page: RemoteThreadPage): ThreadState {
  const fresh = { role: page.role, closed: page.closed, participants: page.participants };
  if (previous == null) return { ...fresh, messages: [...page.messages], next: page.next };
  const oldestOnPage = page.messages.reduce<string | null>(
    (min, m) => (min == null || m.createdAt < min ? m.createdAt : min),
    null,
  );
  const hasOlder = oldestOnPage != null && previous.messages.some((m) => m.createdAt < oldestOnPage);
  return { ...fresh, messages: unionMessages(previous.messages, page.messages), next: hasOlder ? previous.next : page.next };
}
