/**
 * UZ Aero - LeaveCockpitSheet (`design/04d-wyjscie-z-kokpitu.html`)
 *
 * Arkusz, który wyjaśnia, dlaczego „wstecz" nie wyprowadził pilota z kokpitu: kokpit jest
 * stanem modalnym, a maszyna jest w jego rękach (decyzja 2026-08-10, `CLAUDE.md` →
 * „Kokpit jest stanem modalnym").
 *
 * DLACZEGO ARKUSZ, A NIE CICHE ZIGNOROWANIE GESTU. Reguła „nigdy cichy błąd" (§6 pkt 3)
 * obowiązuje też blokady: przycisk sprzętowy, który nic nie robi, wygląda jak zawieszona
 * aplikacja - a pilot naciśnie go jeszcze trzy razy. Arkusz mówi, co trzyma go na tym
 * ekranie i którędy jest wyjście.
 *
 * DLACZEGO WYJŚCIE JEST TU AKCJĄ POTWIERDZAJĄCĄ (szerszy przycisk), a nie odwrotnie:
 * pilot właśnie zasygnalizował, że chce opuścić kokpit. „ZDAJ SAMOLOT" prowadzi na 09B,
 * czyli do FORMULARZA z własnym potwierdzeniem - nie oddaje maszyny jednym tapnięciem,
 * więc pomyłka nic nie kosztuje. Bezpieczne wyjście jest za to domyślne przy KAŻDYM
 * porzuceniu arkusza: „wstecz" i tapnięcie w tło zostawiają pilota w kokpicie
 * (`Sheet` stoi na `Modal` z RN, więc drugie „wstecz" zamyka arkusz, nie ekran).
 */

import React from 'react';

import { flightsLine } from '../../screens/logic/claimStrip';
import { Sheet } from './Sheet';

export interface LeaveCockpitSheetProps {
  visible: boolean;
  /** Rejestracja trzymanej maszyny - tytuł mówi wprost, o co chodzi. */
  aircraftId: string;
  /** Godzina przejęcia („09:11 UTC") albo `null`, gdy strumień jej nie zna. */
  since: string | null;
  /** Liczba LOTÓW sesji - ile pracy jest już w tej sesji zapisane. */
  flightCount: number;
  /** Zostaw pilota w kokpicie (anuluj, „wstecz", tapnięcie w tło). */
  onStay: () => void;
  /** Przejdź do zdania samolotu (09B) - jedyne wyjście z kokpitu. */
  onRelease: () => void;
}

export function LeaveCockpitSheet({
  visible,
  aircraftId,
  since,
  flightCount,
  onStay,
  onRelease,
}: LeaveCockpitSheetProps) {
  return (
    <Sheet
      visible={visible}
      title={`TRZYMASZ ${aircraftId}`}
      rows={[
        // Godzinę pomijamy, gdy jej nie znamy, zamiast pokazywać „-": wiersz odniesienia
        // ma przypominać kontekst sesji, a kreska niczego nie przypomina.
        ...(since != null ? [{ label: 'W Twoich rękach od', value: since }] : []),
        { label: 'Zapisane w tej operacji', value: flightsLine(flightCount) },
      ]}
      warning={
        'Dopóki maszyna jest przejęta, ekranem pracy jest kokpit - „Mój dzień" otworzy się ' +
        'po jej oddaniu. Zdanie samolotu to odczyt liczników i przekazanie następnemu ' +
        'pilotowi; Twój dzień biegnie dalej - kolejna maszyna dopisze się do listy operacji.'
      }
      warningTone="amber"
      confirmLabel="ZDAJ SAMOLOT"
      confirmTone="red"
      onConfirm={onRelease}
      cancelLabel="ZOSTAŃ"
      onCancel={onStay}
    />
  );
}
