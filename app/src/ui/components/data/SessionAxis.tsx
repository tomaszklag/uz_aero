/**
 * UZ Aero — SessionAxis (`.axis` z mockupu `10-statystyki.html`).
 *
 * Oś czasu jednej sesji: przejęcie → uruchomienie → starty, zrzuty i lądowania →
 * wyłączenie → zdanie, w jednej kolumnie, z pionową kreską łączącą punkty.
 *
 * ══ CZYM RÓŻNI SIĘ OD `EventLog` (04, 05) ══
 * Log kokpitu jest POTWIERDZENIEM ZAPISU w czasie rzeczywistym: ma szynę cykli, chipy
 * z licznikiem i paliwem, znacznik outboxa, ton `live` dla stanu trwającego. Ta oś opisuje
 * sesję ZAMKNIĘTĄ i odpowiada na jedno pytanie — co i o której. Stąd inny inwentarz:
 * bez chipów, bez szyny, za to z podpisem odczytów przy końcach i czasem lotu przy
 * lądowaniu. Wspólny komponent musiałby obsłużyć obie role przełącznikami, a wtedy
 * przestałby pilnować którejkolwiek.
 *
 * ══ KRESKA RYSUJE SIĘ Z WIERSZY ══
 * Pion osi to `::before` każdego wiersza, a nie jedna linia w tle: wiersze mają różną
 * wysokość (jedne z podpisem, inne bez), więc linia rysowana osobno rozjeżdżałaby się
 * z kropkami przy pierwszej zmianie treści. Pierwszy i ostatni wiersz obcinają ją do
 * połowy, żeby oś zaczynała się i kończyła na kropce.
 *
 * ══ W TRYBIE ODCZYTU OŚ NICZEGO NIE URUCHAMIA (issue #40 pkt 1) ══
 * Do issue #40 każdy wiersz kończył się ołówkiem korekty. Dwanaście identycznych celów
 * w jednej kolumnie czytało się jak szum — a korekta ma jedne drzwi: „EDYTUJ DANE" pod
 * ekranem. Bez `onCorrect` komponent jest więc czysto opisowy: bez `Pressable`, bez
 * plakietki „RĘCZNIE" (pkt 6) i bez wiedzy o oknie korekty.
 *
 * ══ …ALE W TRYBIE EDYCJI JEST PRZYCISKIEM (issue #43) ══
 * Podany `onCorrect` zamienia każdy KORYGOWALNY wiersz w cel dotknięcia: ołówek w stałej
 * kolumnie po prawej i wysokość 44 px. To nie jest cofnięcie decyzji z #40, tylko jej
 * druga połowa — tam wiersz NIE BYŁ przyciskiem i rytm 44 px marnował kolumnę, tutaj
 * jest, więc cel poniżej progu rękawic byłby wadą.
 *
 * ══ WIERSZ JEST KOMPAKTOWY, BO MOŻE BYĆ ══
 * Brak celów dotknięcia zdejmuje z osi rytm 44 px, a numer lotu przeniesiony na PRAWĄ
 * stronę zdejmuje drugą linię z połowy wierszy. Zostaje 28 px na wiersz i cała sesja
 * skokowa na jednym ekranie. Warunkiem są jawne `lineHeight`: wariant `mono` niesie
 * domyślnie 18 px, więc jednolinijkowy wiersz zajmował tyle, co dwulinijkowy.
 *
 * Prawa krawędź niesie DOKŁADNIE JEDNĄ rzecz na wiersz — numer lotu przy starcie albo
 * czas trwania przy lądowaniu i kołowaniu — więc wszystko dosuwa się do prawej i stoi
 * w jednej linii pionowej, bez rezerwowania miejsca na to, czego w wierszu nie ma.
 */

import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Tag } from '../status/Tag';
import type { Tone } from '../tone';
import { toneColors } from '../tone';

/** Rodzaj punktu — steruje kolorem kropki i tonem napisu. */
export type SessionAxisKind =
  | 'claim'
  | 'engineStart'
  | 'taxi'
  | 'takeoff'
  | 'drop'
  | 'landing'
  | 'engineStop'
  | 'release';

export interface SessionAxisRow {
  id: string;
  kind: SessionAxisKind;
  time: string;
  name: string;
  /** Druga linia — TYLKO tam, gdzie treść jest opisem: odczyty, skład zrzutu. */
  sub?: string | null;
  /** Numer lotu („lot 1") — po PRAWEJ, przed czasem trwania. */
  flight?: string | null;
  /** Czas lotu przy lądowaniu („00:41") — jedyna liczba tej kolumny, stąd zieleń. */
  duration?: string | null;
  /**
   * Wiersz był poprawiany — plakietka „popr." przy nazwie (issue #43).
   *
   * Widoczna TAKŻE w trybie odczytu: to fakt o danych, nie akcja. Liczba obok nie jest
   * tą, którą zapisał przyrząd, i pilot ma prawo to widzieć, nie wchodząc w edycję.
   */
  corrected?: boolean;
  /**
   * Wiersz ma NIESPÓJNOŚĆ — kropka i podpis w tonie amber (issue #43).
   * Baner nad osią wymienia je wszystkie; ten znacznik mówi, którego wiersza dotyczą.
   */
  warned?: boolean;
  /**
   * Czy wiersz da się poprawić. Domyślnie tak — wyjątkiem jest wiersz bez zdarzenia
   * w rejestrze (np. przejęcie sesji odtworzonej bez `preflight_confirm`).
   */
  editable?: boolean;
}

export interface SessionAxisFootItem {
  key: string;
  value: string;
  accent?: boolean;
}

export interface SessionAxisProps {
  rows: SessionAxisRow[];
  foot?: SessionAxisFootItem[];
  emptyText?: string;
  /**
   * Tryb edycji (issue #43): wiersz staje się przyciskiem z ołówkiem. Pominięty — oś
   * jest czysto opisowa i nie ma ani jednego celu dotknięcia (issue #40 pkt 1).
   */
  onCorrect?: (rowId: string) => void;
  style?: ViewStyle;
}

/**
 * Kolor kropki. Przejęcie i zdanie są PUSTE (obrys, nie wypełnienie), bo nie są pracą
 * silnika — a nie szare-wypełnione, bo wtedy zlewałyby się z uruchomieniem.
 */
const KIND_TONE: Record<SessionAxisKind, Tone> = {
  claim: 'neutral',
  engineStart: 'neutral',
  taxi: 'neutral',
  takeoff: 'green',
  drop: 'blue',
  landing: 'red',
  engineStop: 'neutral',
  release: 'neutral',
};

/** Które punkty rysujemy obrysem — końce sesji, czyli to, co nie jest pracą silnika. */
const HOLLOW: Record<SessionAxisKind, boolean> = {
  claim: true,
  engineStart: false,
  taxi: false,
  takeoff: false,
  drop: false,
  landing: false,
  engineStop: false,
  release: true,
};

export function SessionAxis({ rows, foot, emptyText, onCorrect, style }: SessionAxisProps) {
  const { theme } = useTheme();
  const editing = onCorrect != null;

  if (rows.length === 0) {
    return (
      <View style={[{ padding: theme.spacing.lg }, style]}>
        <AppText variant="mono" tone="muted">
          {emptyText ?? 'Brak zdarzeń w tej sesji.'}
        </AppText>
      </View>
    );
  }

  return (
    <View style={style}>
      {rows.map((row, index) => {
        const c = toneColors(theme, KIND_TONE[row.kind]);
        const hollow = HOLLOW[row.kind];
        const dimmed = row.kind === 'claim' || row.kind === 'release' || row.kind === 'taxi';

        const first = index === 0;
        const last = index === rows.length - 1;
        const warned = row.warned === true;
        const editable = editing && row.editable !== false;

        const content = (
          <>
            <AppText
              variant="mono"
              tone={dimmed ? 'secondary' : 'primary'}
              style={styles.time}
            >
              {row.time}
            </AppText>

            <View style={styles.rail}>
              <View
                style={[
                  styles.railLine,
                  {
                    backgroundColor: theme.colors.borderStrong,
                    top: index === 0 ? '50%' : 0,
                    bottom: last ? '50%' : 0,
                  },
                ]}
              />
              {/*
                Kropka ZAWSZE przecina kreskę osi, także pusta w środku.

                Wypełniona robi to sama: jej 2 px obramowania jest w kolorze karty, więc
                linia urywa się kawałek PRZED nią. Pusta nie miała ani tej otoczki, ani
                wypełnienia — kreska wchodziła jej do środka i wychodziła drugą stroną,
                co przy PRZEJĘCIU i ZDANIU (jedyne puste punkty osi) wyglądało jak
                przekłuta obrączka. Stąd dwie warstwy: zewnętrzny krążek w kolorze karty
                ucina linię, wewnętrzny rysuje sam obrys.
              */}
              {hollow ? (
                <View style={[styles.dotHalo, { backgroundColor: theme.colors.surface }]}>
                  <View
                    style={[
                      styles.dotRing,
                      {
                        borderColor: warned ? theme.colors.amber : theme.colors.textMuted,
                        backgroundColor: theme.colors.surface,
                      },
                    ]}
                  />
                </View>
              ) : (
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: warned ? theme.colors.amber : c.accent,
                      borderColor: theme.colors.surface,
                    },
                  ]}
                />
              )}
            </View>

            <View style={styles.label}>
              <View style={styles.nameRow}>
                <AppText
                  variant="mono"
                  tone={dimmed ? 'secondary' : 'primary'}
                  style={styles.name}
                >
                  {row.name.toUpperCase()}
                </AppText>
                {/* „popr." zostaje przy NAZWIE, nie w prawej kolumnie: prawa niesie
                    liczbę (czas trwania), a plakietka odbierałaby jej miejsce. */}
                {row.corrected === true && <Tag label="popr." tone="amber" size="sm" />}
              </View>
              {row.sub != null && (
                <AppText
                  variant="mono"
                  tone={warned ? 'amber' : 'muted'}
                  style={styles.sub}
                >
                  {row.sub}
                </AppText>
              )}
            </View>

            {/* Prawa krawędź niesie DOKŁADNIE JEDNĄ rzecz na wiersz: numer lotu przy
                starcie albo czas lotu przy lądowaniu. Dlatego nic tu nie trzeba
                rezerwować — wszystko dosuwa się do prawej i stoi w jednej linii
                pionowej przez całą oś. */}
            {row.flight != null && (
              <AppText variant="mono" tone="muted" style={styles.flight}>
                {row.flight}
              </AppText>
            )}
            {row.duration != null && (
              <AppText
                variant="mono"
                style={{ color: theme.colors.green, fontSize: 11, lineHeight: 14 }}
              >
                {row.duration}
              </AppText>
            )}

            {/* Ołówek jest KOLUMNĄ, nie ozdobą wiersza — stoi w tym samym pionie przez
                całą oś, więc kciuk wie, gdzie celować, zanim przeczyta wiersz. Wiersz
                nieedytowalny zostawia ją PUSTĄ zamiast przesuwać treść w prawo. */}
            {editing && (
              <View style={styles.pen}>
                {editable && <Icon name="edit" size={13} color={theme.colors.textMuted} />}
              </View>
            )}
          </>
        );

        // Oba końce osi oddychają: górny, żeby PRZEJĘCIE nie kleiło się do śladu
        // (albo do linii nagłówka karty), dolny, żeby ZDANIE nie czytało się jak
        // pierwszy wiersz stopki z sumami. Kreska osi zaczyna się i kończy na
        // kropce niezależnie od tego — jest dzieckiem wiersza, więc padding jej
        // nie wydłuża.
        const rowStyle = [
          styles.row,
          editing ? styles.rowEditing : null,
          first ? styles.firstRow : null,
          last ? styles.lastRow : null,
        ];

        if (!editable) {
          return (
            <View key={row.id} style={rowStyle} accessibilityRole="text">
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`Popraw: ${row.name} ${row.time}`}
            onPress={() => onCorrect?.(row.id)}
            style={({ pressed }) => [
              ...rowStyle,
              pressed ? { backgroundColor: theme.colors.surfaceHover } : null,
            ]}
          >
            {content}
          </Pressable>
        );
      })}

      {foot != null && foot.length > 0 && (
        <View
          style={[
            styles.foot,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceRaised,
            },
          ]}
        >
          {foot.map((item) => (
            <View key={item.key} style={styles.footItem}>
              <AppText
                variant="display"
                style={[
                  styles.footValue,
                  item.accent === true ? { color: theme.colors.green } : null,
                ]}
              >
                {item.value}
              </AppText>
              <AppText variant="mono" tone="muted" style={styles.footKey}>
                {item.key.toUpperCase()}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Wiersz jest NISKI (28 px zamiast 40) i to jest możliwe dopiero od issue #40: oś
   * nie ma już celów dotknięcia, więc nie musi trzymać rytmu 44 px. Wysokość biorą
   * jawne `lineHeight` — wariant `mono` niesie domyślnie 18 px, przez co pojedyncza
   * linia zajmowała tyle, co dwie. Sesja skokowa (kilkanaście wierszy) mieści się
   * dzięki temu na ekranie zamiast wymuszać przewijanie.
   */
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 8, minHeight: 28 },
  /** 44 px = próg rękawic. Obowiązuje TYLKO w edycji, gdzie wiersz jest przyciskiem. */
  rowEditing: { minHeight: 44 },
  // Padding, nie margines: kreska osi jest dzieckiem wiersza i ma się zaczynać oraz
  // kończyć na kropce, a nie ciągnąć przez wolne miejsce nad nią i pod nią.
  firstRow: { paddingTop: 12 },
  lastRow: { paddingBottom: 12 },
  time: { width: 46, fontSize: 11, lineHeight: 14 },
  rail: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  railLine: { position: 'absolute', width: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  /**
   * Otoczka pustej kropki — te same 2 px, którymi wypełniona ucina kreskę osi
   * (9 + 2 × 2 = 13). Rysowana kolorem karty, więc jest niewidoczna i robi jedno:
   * odsuwa linię od obrysu.
   */
  dotHalo: { width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dotRing: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  label: { flex: 1, minWidth: 0, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 10, letterSpacing: 1.4, lineHeight: 13 },
  pen: { width: 18, alignItems: 'center', justifyContent: 'center' },
  sub: { fontSize: 8.5, letterSpacing: 0.5, lineHeight: 11 },
  flight: { fontSize: 8.5, letterSpacing: 0.5, lineHeight: 11 },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  footItem: { gap: 2 },
  footValue: { fontSize: 20, letterSpacing: 1.5, lineHeight: 20 },
  footKey: { fontSize: 7, letterSpacing: 1.2 },
});
