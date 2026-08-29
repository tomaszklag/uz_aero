/**
 * UZ Aero - panel: zegar UTC w topbarze (`.utc-clock` z `SZABLON.html`).
 *
 * **LT w panelu nie występuje w ogóle.** W aplikacji pilota czas lokalny bywa
 * wartością drugorzędną przy meldunku; w back-offisie nie ma powodu, dla którego
 * miałby się pojawić - a dwa czasy obok siebie w narzędziu do rozstrzygania
 * rozbieżności to zaproszenie do pomyłki (`CLAUDE.md`, „Strefa czasowa").
 *
 * Format napisów pochodzi z `@uzaero/format`, czyli z tego samego kodu, którym
 * pisze czasy telefon i karta arkusza. Panel nie ma własnego formatowania czasu.
 */

import { dateUtcShort } from '@uzaero/format';
import { useEffect, useState } from 'react';

/** „14:22:07" - sekundy są tu celowo: to zegar, a nie znacznik czasu. */
function hhmmss(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
}

export function UtcClock() {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="utc-clock">
      <i>UTC</i> <b>{hhmmss(now)}</b> · {dateUtcShort(now.getTime())}
    </span>
  );
}
