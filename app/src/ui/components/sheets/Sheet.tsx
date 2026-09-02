/**
 * UZ Aero - Sheet (`.modal-overlay` / `.modal-sheet` z mockupów)
 *
 * Arkusz wysuwany od dołu: uchwyt, tytuł display, wiersze odniesienia, ostrzeżenie,
 * dwie akcje w proporcji 1:2 (anuluj węższy niż potwierdź).
 *
 * Używamy go tam, gdzie decyzja ma **konsekwencje dla innych** i wymaga świadomego
 * potwierdzenia - przejęcie samolotu odbiera poprzedniemu PIC prawo zapisu (§4.4).
 * Zwykłe formularze arkusza nie dostają: dodatkowa warstwa spowalnia pracę bez powodu.
 *
 * `Modal` z RN, nie własna nakładka - dzięki temu przycisk „wstecz" Androida zamyka
 * arkusz, a nie cały ekran.
 *
 * DOLNA KRAWĘDŹ (zgłoszenia z urządzenia, 2026-07-30 - arkusz godziny meldunku). Przyciski
 * ANULUJ / POTWIERDŹ nie mogą ani wpaść pod klawiaturę, ani wejść pod pasek nawigacji:
 * arkusza nie da się wtedy zatwierdzić, a zamknąć tylko w ciemno (tapnięcie w tło).
 * Trzeba przy tym uważać, żeby nie zapłacić za to samo dwa razy - bo pasek nawigacji
 * należy do dwóch różnych miar:
 *   1. klawiatura WYSUNIĘTA - `useKeyboardHeight` mierzy do dołu okna, czyli razem
 *      z paskiem nawigacji, nad którym klawiatura stoi (patrz `keyboardBottomOffset`).
 *      Dolny inset jest już w tej liczbie; dodany osobno dawał pas martwego powietrza
 *      między arkuszem a klawiaturą (pierwsza wersja tej poprawki);
 *   2. klawiatura ZWINIĘTA - nic nie chroni dolnej krawędzi, więc bierzemy dolny inset
 *      wprost. Stałe 32 dp nie wystarczały: pasek trzech przycisków ma ~48 dp i ucinał
 *      dolny skraj POTWIERDŹ;
 *   3. wysokość arkusza ograniczona do miejsca NAD klawiaturą, przy czym skraca się
 *      przewijana treść, nie rząd akcji - przyciski zostają widoczne zawsze.
 *
 * GÓRNA KRAWĘDŹ (zgłoszenie z urządzenia, 2026-08-14 - arkusz korekty zdarzenia). Arkusz
 * z dużą treścią dobijał do samej góry telefonu i przestawał wyglądać jak wstawka NAD
 * ekranem: bez pasa przyciemnionego tła czytał się jak nowy ekran, a jedyną poszlaką
 * został uchwyt, którego nikt nie szuka. Sufit zostawia więc `SHEET_TOP_GAP` ponad
 * bezpiecznym obszarem - reguła jest w `sheetMaxHeight`, wspólna dla WSZYSTKICH arkuszy,
 * bo to własność komponentu, nie pojedynczego ekranu.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { AppText } from '../foundation/AppText';
import { ActionButton } from '../data/ActionButton';
import { InlineNote } from '../status/InlineNote';
import { Trail, type TrailRow } from '../readouts/Trail';
import { SheetSurface } from './SheetSurface';
import { toneColors, type Tone } from '../tone';

export interface SheetRow {
  label: string;
  value: string;
  /**
   * Ton WARTOŚCI (issue #60: „Po dolewce · 9,2 L" zielone od minimum w górę).
   * Kolor niesie werdykt o liczbie, nie ozdobę - bez tonu wiersz zostaje neutralny.
   */
  tone?: Tone;
}

export interface SheetProps {
  visible: boolean;
  title: string;
  /** Wiersze „klucz - wartość" pod ostrzeżeniem i szlakiem (konfiguracja, rachunki). */
  rows?: SheetRow[];
  /** Treść ostrzeżenia - co dokładnie się stanie po potwierdzeniu. */
  warning?: string;
  warningTone?: Tone;
  /**
   * SZLAK PODPOWIEDZI między ostrzeżeniem a wierszami odniesienia - kropka, tytuł
   * ze stemplem, linia szczegółów (`Trail`, ten sam co przy odczytach na ekranie).
   * Uwagi z urządzenia (2026-09-02): historia odczytu mieszka w arkuszu, czyli tam,
   * gdzie pilot wpisuje liczbę do porównania - najpierw olej, potem „podobnie
   * przenieśmy paliwo i motogodziny". Szlak jest domknięty od dołu taką samą kreską,
   * jaką się otwiera (podpowiedź stoi we własnej ramce), a ostrzeżenie go WYPRZEDZA -
   * pilot najpierw dostaje odpowiedź o swojej liczbie, potem kontekst.
   */
  trail?: TrailRow[];
  /**
   * Napis akcji potwierdzającej. **Opcjonalny**: arkusz wyszukiwarki (`AirfieldSheet`)
   * kończy się w chwili wyboru pozycji z listy, więc nie ma czego potwierdzać -
   * przycisk „WYBIERZ" obok wybranego już wiersza pytałby o zgodę na to, co pilot
   * właśnie zrobił. Bez tego pola zostaje sam rząd z „ANULUJ".
   */
  confirmLabel?: string;
  confirmTone?: Tone;
  /**
   * Powód, dla którego potwierdzenie nie zadziała - bursztynem WEWNĄTRZ przycisku
   * (issue #55). Arkusz, który sam waliduje treść (`FlightTimesSheet`), mówi tu
   * o odwróconej parze godzin zamiast pozwolić odmówić dopiero bramce kroku,
   * gdy pilot nie widzi już żadnej z tych liczb.
   */
  confirmDisabledReason?: string | null;
  /**
   * Blokada BEZ powodu - dla stanu, który widać z KONTROLKI NAD PRZYCISKIEM
   * (uwaga z urządzenia, 2026-08-29: puste pole wymagane). Nowego użycia nie dokładaj
   * bez tego rachunku: jeśli powodu blokady nie widać z arkusza, właściwym polem
   * jest `confirmDisabledReason`.
   */
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  /** Okno modala już istnieje - arkusz z polem wpisu robi tu `focus()` (patrz `SheetSurface`). */
  onShow?: () => void;
  /**
   * Treść PRZYPIĘTA nad rzędem akcji, poza obszarem przewijania.
   *
   * Powstała dla wyszukiwarki lotnisk (zgłoszenie z urządzenia): arkusz jest przyklejony
   * do dolnej krawędzi i rośnie w górę, więc każdy wynik dokładany do listy przesuwał pole
   * wpisu - pisało się do celu, który skacze pod palcem. Element w stopce ma stałą odległość
   * od dołu: lista rośnie i kurczy się NAD nim, a pole zostaje tam, gdzie pilot je zostawił.
   */
  footer?: React.ReactNode;
  /**
   * Akcja w linii TYTUŁU, po prawej - dziś wyłącznie kosz (unieważnienie zdarzenia).
   *
   * Od 2026-08-14 to jest miejsce akcji destrukcyjnej: pełnowymiarowy czerwony przycisk
   * pod rzędem akcji miał być „daleko od Zapisz", a wychodził na najgłośniejszy element
   * arkusza - choć intencją wchodzącego w korektę jest poprawka, nie kasowanie
   * (uwaga z urządzenia). Ikona jest dostępna, nie eksponowana.
   */
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
}

export function Sheet({
  visible,
  title,
  rows = [],
  warning,
  warningTone = 'amber',
  trail = [],
  confirmLabel,
  confirmTone = 'green',
  confirmDisabledReason = null,
  confirmDisabled = false,
  onConfirm,
  cancelLabel = 'ANULUJ',
  onCancel,
  onShow,
  footer,
  headerAction,
  children,
}: SheetProps) {
  const { theme } = useTheme();
  const keyboardHeight = useKeyboardHeight();

  return (
    <SheetSurface
      visible={visible}
      onCancel={onCancel}
      onShow={onShow}
      keyboardHeight={keyboardHeight}
      designPad={theme.spacing.xxxl}
      /* Treść przewijana, akcje poza nią: gdy miejsca jest mało, skraca się to, co pilot
         może doczytać przewinięciem, a nie to, czym arkusz się zamyka. */
      pinned={
        <>
          {footer}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {/* Mockup: `.modal-actions` = siatka 1 : 2 z mniejszymi napisami niż CTA ekranu. */}
            <ActionButton
              label={cancelLabel}
              tone="neutral"
              variant="secondary"
              size="md"
              onPress={onCancel}
              style={{ flex: 1 }}
            />
            {confirmLabel != null && onConfirm != null && (
              <ActionButton
                label={confirmLabel}
                tone={confirmTone}
                variant="solid"
                size="md"
                disabledReason={confirmDisabledReason}
                disabled={confirmDisabled}
                onPress={onConfirm}
                style={{ flex: 2 }}
              />
            )}
          </View>

        </>
      }
    >
      {/* `.modal-title` - mniejszy niż tytuł ekranu: arkusz jest wstawką, nie ekranem.
          Akcja destrukcyjna (kosz) stoi w tej samej linii, po prawej - patrz `headerAction`. */}
      <View style={styles.titleRow}>
        <AppText variant="display" style={styles.title}>
          {title}
        </AppText>
        {headerAction}
      </View>

      {/* Treść własna arkusza idzie zaraz pod tytułem - w mockupach 02b/02c to pole
          edycji, a wiersze odniesienia stoją POD nim jako kontekst dla wpisywanej
          wartości. */}
      {children}

      {/* Ostrzeżenie arkusza ZARAZ POD POLAMI wpisu, przed szlakiem i wierszami
          odniesienia (uwaga z urządzenia, 2026-09-02, trzecia tura: na końcu treści
          ginęło pod wysuniętą klawiaturą, a przypięte nad akcjami stało za daleko
          od pola - pilot patrzy tam, gdzie pisze, i tam ma dostać odpowiedź).
          Liczy się na każdą zmianę pola, więc pod polem jest „live" naprawdę.
          Kształt = `.modal-warning` z mockupów: trójkąt + JEDNO zdanie mono
          w kolorze tonu, bez tytułu (wcześniejszy `Banner` z tytułem „Zanim
          potwierdzisz" miał szary tekst i brak ikony; nazwa wzorca z issue #55
          zostaje w docblokach). */}
      {warning != null && <InlineNote icon="warning" tone={warningTone} text={warning} />}

      {/* Szlak podpowiedzi + kreska domykająca (patrz nota przy propie `trail`);
          kreska tylko, gdy pod szlakiem COŚ stoi - inaczej wisiałaby nad akcjami. */}
      <Trail rows={trail} />
      {trail.length > 0 && rows.length > 0 && (
        <View
          style={{ borderTopWidth: theme.borderWidth, borderTopColor: theme.colors.border }}
        />
      )}

      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          {/* Etykieta ustępuje wartości i zawija się (`flexShrink`): wiersz „Ostatni
              pomiar · 21 CZE 07:02 · J. Kowalski" jest dłuższy niż dotychczasowe,
              a wartość ma zostać przy prawej krawędzi w całości. */}
          <AppText variant="mono" tone="muted" style={[styles.rowLabel, styles.rowKey]}>
            {row.label}
          </AppText>
          <AppText
            variant="mono"
            tone="secondary"
            style={[
              styles.rowLabel,
              row.tone != null ? { color: toneColors(theme, row.tone).accent } : null,
            ]}
          >
            {row.value}
          </AppText>
        </View>
      ))}

    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: -8 },
  title: { flex: 1, fontSize: 22, lineHeight: 24, letterSpacing: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 10, letterSpacing: 0.5 },
  rowKey: { flexShrink: 1 },
});
