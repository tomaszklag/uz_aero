/**
 * UZ Aero — czysta decyzja adaptera GPS: co zrobić z usługą pierwszoplanową.
 *
 * Wołana przy każdym uzbrajaniu/rozbrajaniu i przy watchdogowej odbudowie nasłuchu.
 * Kluczowe rozstrzygnięcia:
 *  - `(service, started)` → `none` — ADOPCJA usługi zastanej po headless-restarcie;
 *    restart mrugałby powiadomieniem i wycinał dziurę w śladzie,
 *  - `(service, !started, !appActive)` → `retry-later` — Android pozwala wystartować
 *    usługę pierwszoplanową wyłącznie aplikacji na pierwszym planie; ponowienie
 *    przy najbliższym `AppState === 'active'`.
 */

export type GpsSourceMode = 'watch' | 'service';

export type ServiceCommand = 'start' | 'stop' | 'none' | 'retry-later';

export function serviceCommand(input: {
  desired: GpsSourceMode;
  started: boolean;
  appActive: boolean;
}): ServiceCommand {
  if (input.desired === 'service') {
    if (input.started) return 'none';
    return input.appActive ? 'start' : 'retry-later';
  }
  return input.started ? 'stop' : 'none';
}
