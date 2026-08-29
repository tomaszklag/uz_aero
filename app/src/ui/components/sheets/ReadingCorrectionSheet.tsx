/**
 * UZ Aero — ReadingCorrectionSheet (mockup `design/10f` „Korekta odczytu")
 *
 * Poprawka paliwa i motogodzin przy PRZEJĘCIU albo ZDANIU samolotu. Dwa pola obok
 * siebie, bo spisuje się je jednym spojrzeniem na tablicę i poprawia zwykle razem —
 * pilot wraca do maszyny i przepisuje oba. Rozdzielone na dwa arkusze kazałyby
 * przechodzić tę samą drogę dwa razy.
 *
 * ══ CZEGO TU NIE MA I DLACZEGO ══
 *  • **czasu** — godzinę przejęcia i zdania wyznacza fakt o dwóch pilotach (kto komu
 *    oddał maszynę), a nie odczyt; domena odrzuca na tych zdarzeniach `retime`;
 *  • **unieważnienia** — sesja bez liczb przy zdaniu nie ma jak przekazać maszyny dalej.
 *    Brak przycisku jest tu decyzją, więc mówimy o niej wprost w podpisie (§6 pkt 3:
 *    nigdy „nie da się" bez powiedzenia, co zamiast tego).
 *
 * Wartość jest POLEM WPISU, nie stepperem (inaczej niż czas w `CorrectionSheet`):
 * przeskok o trzydzieści litrów krokami po jednym to trzydzieści dotknięć, a odczyt
 * przepisuje się z tarczy w całości.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { HistoryLink } from '../data/HistoryLink';
import { Banner } from '../status/Banner';
import { ReasonField } from '../input/ReasonField';
import { TextField } from '../input/Field';
import { TimeStepper } from '../input/TimeStepper';
import { toneColors } from '../tone';
import { Sheet, type SheetRow } from './Sheet';

/** Wynik korekty — pola pominięte znaczą „nie ruszaj tej wartości". */
export interface ReadingCorrection {
  fuelL?: number;
  mh?: number;
  /**
   * Pomiar / dolewka oleju (issue #60); `null` to WARTOŚĆ — „tego wpisu nie było"
   * (wyczyszczone pole kasuje omyłkowy pomiar), inaczej niż pominięcie klucza.
   */
  oilL?: number | null;
  oilAddedL?: number | null;
  /** Nowy czas zdarzenia; obecny tylko wtedy, gdy arkusz ma pole czasu i pilot go ruszył. */
  newTime?: number;
}

/** Pola oleju — TYLKO przy przejęciu (issue #60): zdanie samolotu oleju nie mierzy. */
export interface ReadingOilFields {
  /** Wartości w mocy, już sformatowane; pusty tekst = wpisu nie było. */
  levelText: string;
  addedText: string;
  /** Tekst → litry; `null` = wpis niepoprawny (pusty tekst NIE przechodzi tędy). */
  parse: (text: string) => number | null;
}

/** Pole czasu arkusza: wartość, granice i OSTRZEŻENIE zależne od wybranej godziny. */
export interface ReadingTimeField {
  value: number;
  min: number;
  max: number;
  format: (t: number) => string;
  /**
   * Co się stanie przy TEJ godzinie — `null`, gdy nic nadzwyczajnego.
   *
   * Tu mieszka ostrzeżenie o kaskadzie: przejęcie przesunięte za uruchomienie silnika
   * pociąga za sobą cały bieg. Treść liczy ekran (`logic/claimRetime.ts`), bo to jest
   * zdanie o SESJI, a nie o polu formularza.
   */
  noteFor: (value: number) => { text: string; blocking: boolean } | null;
}

export interface ReadingCorrectionSheetProps {
  visible: boolean;
  /** Nazwa korygowanego zdarzenia („Przejęcie samolotu") — pełnym stopniem, nie przypisem. */
  title: string;
  /** Druga linia karty celu: godzina i kontekst („zapisano 08:04 UTC"). */
  subtitle?: string | null;
  /**
   * Czas zdarzenia do POPRAWIENIA — dziś wyłącznie przejęcie (issue #43, uwaga
   * z urządzenia). Pominięty = arkusz nie pokazuje pola czasu.
   *
   * Zdanie samolotu go NIE MA i to jest decyzja: od `day_close` liczy się 24-godzinne
   * okno korekty, więc przesuwanie go własną poprawką pozwalałoby pilotowi przedłużyć
   * sobie termin — regułę, która ma go ograniczać.
   */
  time?: ReadingTimeField | null;
  /** Odczyty w mocy TERAZ (po wcześniejszych korektach), już sformatowane. */
  fuelText: string;
  mhText: string;
  /** Tekst → litry; `null` = wpis niepoprawny. */
  parseFuel: (text: string) => number | null;
  /** Tekst → motogodziny dziesiętne; `null` = wpis niepoprawny (obsługuje też „hh:mm"). */
  parseMh: (text: string) => number | null;
  /**
   * Maska licznika w trakcie pisania (`maskMotoHoursInput`): kropka, przecinek
   * i dwukropek znaczą TO SAMO, a znak właściwy dla formatu stawia maska. Dzięki temu
   * pole chodzi na klawiaturze numerycznej, mimo że zapis hh:mm wymaga dwukropka,
   * którego na niej nie ma.
   */
  maskMh?: (text: string) => string;
  /** Pola oleju przy przejęciu; pominięte = arkusz ich nie pokazuje (zdanie). */
  oil?: ReadingOilFields | null;
  /** Wiersze odniesienia: pojemność zbiorników, wpływ na zużycie, format licznika. */
  rows?: SheetRow[];
  /** Ostrzeżenie o skutku — łańcuch MH, przekazanie następnemu pilotowi. */
  warning?: string;
  historyCount?: number;
  onOpenHistory?: () => void;
  onSave: (fields: ReadingCorrection, reason: string | null) => void;
  onCancel: () => void;
}

/** Wynik pola olejowego: pusty tekst to legalne „wpisu nie było", nie błąd. */
function oilFieldValue(text: string, parse: (t: string) => number | null) {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true as const, value: null };
  const parsed = parse(trimmed);
  return parsed != null ? { ok: true as const, value: parsed } : { ok: false as const, value: null };
}

export function ReadingCorrectionSheet({
  visible,
  title,
  subtitle,
  time,
  fuelText,
  mhText,
  parseFuel,
  parseMh,
  maskMh,
  oil,
  rows,
  warning,
  historyCount = 0,
  onOpenHistory,
  onSave,
  onCancel,
}: ReadingCorrectionSheetProps) {
  const { theme } = useTheme();
  const amberTone = toneColors(theme, 'amber');
  const [fuel, setFuel] = useState(fuelText);
  const [mh, setMh] = useState(mhText);
  const [oilLevel, setOilLevel] = useState(oil?.levelText ?? '');
  const [oilAdded, setOilAdded] = useState(oil?.addedText ?? '');
  const [at, setAt] = useState(time?.value ?? 0);
  const [reason, setReason] = useState('');

  // Każde otwarcie startuje od wartości W MOCY — arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (!visible) return;
    setFuel(fuelText);
    setMh(mhText);
    setOilLevel(oil?.levelText ?? '');
    setOilAdded(oil?.addedText ?? '');
    setAt(time?.value ?? 0);
    setReason('');
  }, [visible, fuelText, mhText, oil?.levelText, oil?.addedText, time?.value]);

  const fuelValue = parseFuel(fuel);
  const mhValue = parseMh(mh);
  const fuelChanged = fuel.trim() !== fuelText.trim();
  const mhChanged = mh.trim() !== mhText.trim();
  const oilLevelState = oil != null ? oilFieldValue(oilLevel, oil.parse) : null;
  const oilAddedState = oil != null ? oilFieldValue(oilAdded, oil.parse) : null;
  const oilLevelChanged = oil != null && oilLevel.trim() !== oil.levelText.trim();
  const oilAddedChanged = oil != null && oilAdded.trim() !== oil.addedText.trim();
  const timeChanged = time != null && at !== time.value;
  const readable =
    (!fuelChanged || fuelValue != null) &&
    (!mhChanged || mhValue != null) &&
    (!oilLevelChanged || oilLevelState?.ok === true) &&
    (!oilAddedChanged || oilAddedState?.ok === true);
  const changed = fuelChanged || mhChanged || oilLevelChanged || oilAddedChanged || timeChanged;
  const timeNote = time != null ? time.noteFor(at) : null;
  const blocked = timeNote?.blocking === true;

  /**
   * POWÓD W PRZYCISKU, ZAMIAST ZNIKAJĄCEGO PRZYCISKU (uwaga z urządzenia, 2026-08-29:
   * „walidacja jest na przycisku, jest on disabled i na przycisku na żółto piszemy
   * czemu — taki pattern powinien być wszędzie").
   *
   * Do tej pory arkusz podawał `onConfirm: undefined`, a `Sheet` przy braku akcji nie
   * rysuje przycisku WCALE. Znikające „ZAPISZ KOREKTĘ" jest tu gorsze od wyszarzonego:
   * brak akcji ma sens tam, gdzie akcji nie ma z definicji (podgląd po oknie korekty
   * 10B, pusta flota 02G), a nie w formularzu, który pilot właśnie wypełnia — tam
   * zniknięcie czyta się jak usterka, a nie jak odpowiedź.
   *
   * Powody padają pojedynczo, w kolejności czynności: najpierw popraw to, czego nie
   * da się przeczytać, potem zmień cokolwiek, na końcu ustąp twardej regule czasu.
   */
  const blocker = !readable
    ? 'Nie rozumiem którejś z wartości — popraw wpis'
    : !changed
      ? 'Zmień którąś z wartości, żeby zapisać korektę'
      : blocked
        ? (timeNote?.text ?? 'Tej korekty nie da się zapisać')
        : null;

  const confirm = (): void => {
    const fields: ReadingCorrection = {};
    if (fuelChanged && fuelValue != null) fields.fuelL = fuelValue;
    if (mhChanged && mhValue != null) fields.mh = mhValue;
    // `null` przechodzi ŚWIADOMIE: wyczyszczone pole to korekta „pomiaru nie było".
    if (oilLevelChanged && oilLevelState?.ok) fields.oilL = oilLevelState.value;
    if (oilAddedChanged && oilAddedState?.ok) fields.oilAddedL = oilAddedState.value;
    if (timeChanged) fields.newTime = at;
    onSave(fields, reason.trim() === '' ? null : reason.trim());
  };

  return (
    <Sheet
      visible={visible}
      title="KOREKTA ODCZYTU"
      rows={rows}
      warning={warning}
      confirmLabel="ZAPISZ KOREKTĘ"
      confirmDisabledReason={blocker}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      {/* Karta celu jak w arkuszu czasu (10E): ikona, NAZWA ZDARZENIA pełnym stopniem
          i godzina pod spodem. Mono 9 px wersalikami czytało się jak przypis, a to jest
          odpowiedź na pierwsze pytanie otwierającego arkusz — co ja właściwie poprawiam. */}
      <View
        style={[
          styles.targetCard,
          {
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            borderColor: amberTone.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Icon name="fuel" size={18} color={amberTone.accent} />
        <View style={styles.targetBody}>
          <AppText variant="label">{title}</AppText>
          {subtitle != null && (
            <AppText variant="mono" tone="muted" style={styles.targetMeta}>
              {subtitle}
            </AppText>
          )}
        </View>
      </View>

      {/* CZAS zdarzenia — tylko przy przejęciu (patrz `time` w propsach). Stepper,
          nie pole tekstowe: to ta sama czynność, co korekta czasu na osi (10E), więc ma
          ten sam kształt. Ostrzeżenie pod spodem mówi, co pociągnie za sobą godzina
          wykraczająca poza uruchomienie silnika. */}
      {time != null && (
        <TimeStepper
          value={at}
          onChange={setAt}
          format={time.format}
          originalTime={time.value}
          min={time.min}
          max={time.max}
        />
      )}

      {timeNote != null && (
        <Banner
          kind="warning"
          tone={timeNote.blocking ? 'red' : 'amber'}
          icon="warning"
          title={timeNote.blocking ? 'Tej godziny nie da się zapisać' : 'Przesuniemy cały bieg silnika'}
          text={timeNote.text}
        />
      )}

      <View style={styles.grid}>
        <TextField
          label="Paliwo"
          value={fuel}
          onChangeText={setFuel}
          keyboardType="decimal-pad"
          /* Podpowiedź TYLKO po zmianie („było 171 L"). Napisy w rodzaju „litry
             z paliwomierza" opisywały pole, które i tak nazywa się „Paliwo" — i zajmowały
             linię pod każdym z dwóch pól, przez cały czas. */
          hint={fuelChanged ? `było ${fuelText}` : undefined}
          style={styles.cell}
        />
        <TextField
          label="Motogodziny"
          value={mh}
          onChangeText={(text) => setMh(maskMh ? maskMh(text) : text)}
          /* Klawiatura NUMERYCZNA także przy liczniku hh:mm — dwukropka na niej nie ma,
             ale stawia go maska (zgłoszenie z urządzenia). Pełna QWERTY zajmowała pół
             ekranu i podsuwała podpowiedzi słownikowe pod liczbę z tarczy. */
          keyboardType="decimal-pad"
          hint={mhChanged ? `było ${mhText}` : undefined}
          style={styles.cell}
        />
      </View>

      {/* OLEJ — tylko przy przejęciu (issue #60): pomiar żyje tam, gdzie powstał.
          Wyczyszczone pole jest korektą „tego wpisu nie było" — dlatego puste
          przechodzi, a podpowiedź po zmianie mówi „było —" przy braku oryginału. */}
      {oil != null && (
        <View style={styles.grid}>
          <TextField
            label="Olej — pomiar"
            value={oilLevel}
            onChangeText={setOilLevel}
            keyboardType="decimal-pad"
            hint={
              oilLevelChanged ? `było ${oil.levelText.trim() === '' ? '—' : oil.levelText}` : undefined
            }
            style={styles.cell}
          />
          <TextField
            label="Olej — dolewka"
            value={oilAdded}
            onChangeText={setOilAdded}
            keyboardType="decimal-pad"
            hint={
              oilAddedChanged ? `było ${oil.addedText.trim() === '' ? '—' : oil.addedText}` : undefined
            }
            style={styles.cell}
          />
        </View>
      )}

      {changed && !readable && (
        <AppText variant="mono" tone="red" style={styles.error}>
          Nie umiem odczytać wpisanej wartości — sprawdź format.
        </AppText>
      )}

      <ReasonField
        value={reason}
        onChangeText={setReason}
        placeholder="np. pomyłka przy przepisywaniu z tarczy"
      />

      {/* Przypis „odczytu nie da się unieważnić" USUNIĘTY (uwaga z przeglądu): tłumaczył
          BRAK przycisku, którego nikt nie szuka. Arkusz ma odpowiadać na pytanie
          zadane, a nie uprzedzać pytania, które nie padło. */}
      {onOpenHistory != null && <HistoryLink count={historyCount} onPress={onOpenHistory} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  targetCard: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  targetBody: { flex: 1, gap: 2 },
  targetMeta: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', gap: 9 },
  cell: { flex: 1 },
  error: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
