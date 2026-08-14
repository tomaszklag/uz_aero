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
  /** Nowy czas zdarzenia; obecny tylko wtedy, gdy arkusz ma pole czasu i pilot go ruszył. */
  newTime?: number;
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
  /** Wiersze odniesienia: pojemność zbiorników, wpływ na zużycie, format licznika. */
  rows?: SheetRow[];
  /** Ostrzeżenie o skutku — łańcuch MH, przekazanie następnemu pilotowi. */
  warning?: string;
  historyCount?: number;
  onOpenHistory?: () => void;
  onSave: (fields: ReadingCorrection, reason: string | null) => void;
  onCancel: () => void;
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
  const [at, setAt] = useState(time?.value ?? 0);
  const [reason, setReason] = useState('');

  // Każde otwarcie startuje od wartości W MOCY — arkusz nie pamięta porzuconej edycji.
  useEffect(() => {
    if (!visible) return;
    setFuel(fuelText);
    setMh(mhText);
    setAt(time?.value ?? 0);
    setReason('');
  }, [visible, fuelText, mhText, time?.value]);

  const fuelValue = parseFuel(fuel);
  const mhValue = parseMh(mh);
  const fuelChanged = fuel.trim() !== fuelText.trim();
  const mhChanged = mh.trim() !== mhText.trim();
  const timeChanged = time != null && at !== time.value;
  const readable = (!fuelChanged || fuelValue != null) && (!mhChanged || mhValue != null);
  const changed = fuelChanged || mhChanged || timeChanged;
  // Ostrzeżenie „blokujące" nie wyszarza przycisku, tylko odbiera mu akcję i mówi
  // powód — ta sama zasada, co przy pustym formularzu (§6 pkt 3).
  const timeNote = time != null ? time.noteFor(at) : null;
  const blocked = timeNote?.blocking === true;

  const confirm = (): void => {
    const fields: ReadingCorrection = {};
    if (fuelChanged && fuelValue != null) fields.fuelL = fuelValue;
    if (mhChanged && mhValue != null) fields.mh = mhValue;
    if (timeChanged) fields.newTime = at;
    onSave(fields, reason.trim() === '' ? null : reason.trim());
  };

  return (
    <Sheet
      visible={visible}
      title="KOREKTA ODCZYTU"
      rows={rows}
      warning={warning}
      // Bez zmiany nie ma czego zapisać; wpis nieczytelny (litery w litrach) też nie
      // zamienia się w korektę. Przycisk zostaje WIDOCZNY — powód odmowy mówi, czego
      // brakuje, zamiast zostawiać pilota z wyszarzonym prostokątem (§6 pkt 3).
      confirmLabel="ZAPISZ KOREKTĘ"
      onConfirm={changed && readable && !blocked ? confirm : undefined}
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
          tone="amber"
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
