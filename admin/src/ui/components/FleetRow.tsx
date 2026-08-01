/**
 * UZ Aero — panel: WIERSZ FLOTY NA PULPICIE (`.fleet-row` z `SZABLON.html`).
 *
 * Wiersz jest LINKIEM, a nie klikalnym `<div>`: da się go otworzyć w nowej karcie,
 * skopiować i wkleić — czyli obsługuje scenariusz, dla którego panel istnieje
 * („wklej mi link do tego dnia"). Jest też z definicji osiągalny z klawiatury.
 *
 * Struktura znaczników jest DOSŁOWNIE ta z mockupu (`<span>` z `<div>`ami w środku),
 * bo od niej zależą reguły `.fleet-nums` i `.fleet-*` — a reguła „wdrażamy 1:1" znaczy
 * technicznie właśnie tyle, że recenzent porówna DOM z plikiem HTML linia w linię.
 *
 * Komponent NIE PODEJMUJE ŻADNEJ DECYZJI: klasa wiersza, klasa świeżości, plakietka
 * i wszystkie napisy przychodzą gotowe z `screens/dashboard/dashboardFleet.ts`, który ma
 * test w Node. Tu zostaje wyłącznie układ pięciu torów siatki.
 */

import { Link } from 'react-router-dom';

import { Pill, type PillTone } from './Pill';

interface FleetRowProps {
  to: string;
  /** Gotowa klasa wiersza (`fleet-row`, `fleet-row flying`, …) — nigdy sklejana tutaj. */
  className: string;
  reg: string;
  type: string;
  who: string;
  since: string;
  mh: string;
  fuel: string;
  badge: { text: string; tone: PillTone; live?: boolean };
  /** Gotowa klasa wartości świeżości (`fresh-val`, `fresh-val amber`, …). */
  freshClass: string;
  freshText: string;
  freshNote: string;
}

export function FleetRow({
  to,
  className,
  reg,
  type,
  who,
  since,
  mh,
  fuel,
  badge,
  freshClass,
  freshText,
  freshNote,
}: FleetRowProps) {
  return (
    <Link className={className} to={to}>
      <span>
        <div className="fleet-reg">{reg}</div>
        <div className="fleet-type">{type}</div>
      </span>
      <span>
        {/* Nazwiska i opisy idą jako DZIECI REACTA, nigdy przez `dangerouslySetInnerHTML`
            — te napisy pochodzą z kont i z payloadów zdarzeń wysyłanych z telefonów. */}
        <div className="fleet-who">{who}</div>
        <div className="fleet-since">{since}</div>
      </span>
      <span className="fleet-nums">
        <div>
          <span className="k">MH</span> {mh}
        </div>
        <div>
          <span className="k">FOB</span> {fuel}
        </div>
      </span>
      <span className="fleet-state">
        <Pill tone={badge.tone} dot live={badge.live === true}>
          {badge.text}
        </Pill>
      </span>
      <span className="fresh">
        <span className={freshClass}>{freshText}</span>
        <span className="fresh-note">{freshNote}</span>
      </span>
    </Link>
  );
}
