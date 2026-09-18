/**
 * Ninerdeck - panel: LISTA URZĄDZEŃ (`.session-list` z `design/panel/piloci-konto`
 * i `konto`; 2.1.0, issue #134 D4/D6).
 *
 * Jeden kształt na DWÓCH ekranach - karta członka (sesje w tym klubie) i `#/konto`
 * (własne, ze wszystkich klubów) - bo to jest jedna rzecz oglądana z dwóch stron.
 * Różnią się ZAKRESEM, o który pyta serwer, i tym, czy wśród wierszy jest ten bieżący;
 * nie różnią się niczym, co dałoby się zobaczyć na ekranie. Druga kopia rozjechałaby
 * się przy pierwszej poprawce jednej z nich.
 *
 * Komponent jest CZYSTO PREZENTACYJNY: wiersze liczy `sessionRows.ts`, a co znaczy
 * „Wyloguj", rozstrzyga ekran - tu zostaje układ i jedna reguła, której nie wolno
 * złamać po żadnej stronie: **przy sesji bieżącej nie ma przycisku**. Własnego okna
 * nie wylogowuje się z listy; od tego jest „Wyloguj" w pasku, a ekran logowania bez
 * powodu wygląda jak awaria.
 */

import { MonitorIcon, PhoneIcon } from '../../ui/components/icons';
import { Button, Pill } from '../../ui/components';
import type { SessionRow } from '../accounts/sessionRows';

interface SessionListProps {
  rows: readonly SessionRow[];
  /** `null` = lista jest wyłącznie do oglądania (brak zdolności do wylogowywania). */
  onRevoke: ((sessionId: string) => void) | null;
  pending?: boolean;
}

export function SessionList({ rows, onRevoke, pending = false }: SessionListProps) {
  return (
    <div className="session-list">
      {rows.map((row) => (
        <div key={row.id} className={row.current ? 'session-row current' : 'session-row'}>
          <span className="session-icon" aria-hidden="true">
            {row.icon === 'monitor' ? <MonitorIcon size={15} /> : <PhoneIcon size={15} />}
          </span>
          <span className="session-body">
            {/* Adres w `title`, nie w wierszu: pomaga temu, kto naprawdę szuka, i nie
                zabiera linii temu, kto tylko rozpoznaje swój tablet. */}
            <span className="session-device" title={row.ip ?? undefined}>
              {row.device}
            </span>
            <span className="session-meta">{row.meta}</span>
          </span>
          {row.current ? (
            <Pill tone="green">To urządzenie</Pill>
          ) : onRevoke == null ? null : (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRevoke(row.id)}>
              Wyloguj
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
