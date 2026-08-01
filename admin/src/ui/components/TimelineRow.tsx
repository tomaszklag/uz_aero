/**
 * UZ Aero — panel: POZYCJA OSI ZDARZEŃ (`.tl-row` z `SZABLON.html`).
 *
 * ══ `voided` PRZEKREŚLA, NIGDY NIE UKRYWA ══
 * Rejestr zdarzeń jest append-only i to właśnie te wiersze tłumaczą, dlaczego liczby
 * dnia różnią się od tego, co zapisał telefon. Ukrycie unieważnionego zdarzenia byłoby
 * najgorszą możliwą uprzejmością: karta dnia przestałaby odpowiadać na jedyne pytanie,
 * dla którego istnieje. Dlatego `voided` jest modyfikatorem WYGLĄDU (`.tl-row.voided`
 * przekreśla nazwę i czas), a nie warunkiem renderowania.
 *
 * Kropka niesie ton zdarzenia, a nie jego ważność — zielona zaczyna, czerwona kończy,
 * niebieska opisuje lot, bursztynowa wymaga uwagi. Ten sam słownik, co plakietki.
 */

import type { ReactNode } from 'react';

export type TimelineTone = 'green' | 'amber' | 'red' | 'blue' | 'dim';

interface TimelineRowProps {
  /** Czas zdarzenia w UTC, mono. Dwie linie tam, gdzie wiersz opisuje przedział. */
  time: ReactNode;
  tone: TimelineTone;
  name: string;
  /** Druga linia: co to zdarzenie niosło. Zawsze TEKST, nigdy HTML (patrz niżej). */
  meta: ReactNode;
  /** Plakietka zamykająca wiersz — rodzaj zdarzenia jednym słowem. */
  badge?: ReactNode;
  /**
   * Akcja przy wierszu (przejście do korekty tego zdarzenia, `A02b`). Osobny slot od
   * `badge`, bo czwarty tor siatki `.tl-row` przyjmuje JEDNO dziecko — dopiero razem
   * trafiają do wspólnego `.tl-act`. Wiersz bez akcji zostaje w markupie identyczny
   * jak w mockupie `A02a`.
   */
  action?: ReactNode;
  voided?: boolean;
}

export function TimelineRow({
  time,
  tone,
  name,
  meta,
  badge,
  action,
  voided = false,
}: TimelineRowProps) {
  return (
    <li className={voided ? 'tl-row voided' : 'tl-row'}>
      <span className="tl-time">{time}</span>
      <span className="tl-rail">
        <span className={tone === 'dim' ? 'tl-dot' : `tl-dot ${tone}`} />
      </span>
      <span>
        {/* Nazwa i opis idą jako DZIECI REACTA, nigdy przez `dangerouslySetInnerHTML`.
            Payloady zdarzeń pochodzą z telefonów i zawierają dowolne napisy wpisane
            przez pilota (`notes`, `client`) — to jest ta granica, na której panel
            renderujący rejestr przestaje być podatny na wstrzyknięcie. */}
        <span className="tl-name">{name}</span>
        <span className="tl-meta">{meta}</span>
      </span>
      {action == null ? (
        badge
      ) : (
        <span className="tl-act">
          {badge}
          {action}
        </span>
      )}
    </li>
  );
}
