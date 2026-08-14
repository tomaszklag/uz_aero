/**
 * UZ Aero — CorrectionHistorySheet (mockup `design/10i` „Historia zmian")
 *
 * Lista poprawek jednego zdarzenia: „było → jest", kto, kiedy i z jakim powodem, a na
 * dole kotwica — zapis pierwotny. Arkusz jest WYŁĄCZNIE do czytania: cofnięcie korekty
 * robi się kolejną korektą, nie kasowaniem wiersza z tej listy (rejestr jest append-only,
 * więc taki przycisk obiecywałby operację, której model nie zna).
 *
 * Kolejność: NAJNOWSZA na górze. Domena zwraca chronologiczną — bo tak wychodzi ze
 * składania „było → jest" — a ekran odwraca ją u siebie, żeby stan aktualny czytało się
 * bez przewijania do końca.
 *
 * Otwiera się także w trybie PODGLĄDU (10B): zamknięte okno korekty odbiera prawo do
 * zmiany danych, nie do ich zrozumienia.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Tag } from '../status/Tag';
import { Sheet } from './Sheet';

/** Jeden wiersz historii — złożony przez `logic/sessionEdit.ts` z wpisów domeny. */
export interface CorrectionHistoryItem {
  id: string;
  /** „07 SIE · 12:05 UTC". */
  when: string;
  /** Kod albo nazwisko autora. */
  who: string;
  /** `true` = korektę zapisał administrator w panelu, nie pilot na telefonie. */
  byAdmin?: boolean;
  /** Nazwa pola („czas", „paliwo") — `null` przy unieważnieniu i przywróceniu. */
  field: string | null;
  /** Wartość przed; `null` = nie było czego zastąpić. */
  from: string | null;
  /** Wartość po; `null` przy wpisach o samym FAKCIE (unieważnienie). */
  to: string | null;
  /** Zdanie zamiast pary wartości — „unieważnione", „przywrócone". */
  verdict?: string | null;
  /** Ton werdyktu: czerwień dla unieważnienia. */
  verdictTone?: 'red' | 'green';
  reason: string | null;
}

export interface CorrectionHistorySheetProps {
  visible: boolean;
  /** Cel („Lądowanie · lot 1"). */
  title: string;
  /** Wpisy — najnowszy PIERWSZY (ekran dostaje je już odwrócone). */
  items: CorrectionHistoryItem[];
  /** Zapis pierwotny jako kotwica pod listą — kiedy i co, bez podpisu o źródle. */
  origin: { when: string; value: string } | null;
  onClose: () => void;
}

export function CorrectionHistorySheet({
  visible,
  title,
  items,
  origin,
  onClose,
}: CorrectionHistorySheetProps) {
  const { theme } = useTheme();

  return (
    <Sheet visible={visible} title="HISTORIA ZMIAN" cancelLabel="ZAMKNIJ" onCancel={onClose}>
      <AppText variant="mono" tone="muted" style={styles.target}>
        {title.toUpperCase()}
      </AppText>

      {items.length === 0 && origin == null && (
        <AppText variant="body" tone="muted" style={styles.empty}>
          Tego zdarzenia nikt nie poprawiał.
        </AppText>
      )}

      {items.map((item) => (
        <View
          key={item.id}
          style={[styles.item, { borderTopColor: theme.colors.border }]}
        >
          <AppText variant="mono" tone="muted" style={styles.when}>
            {item.when.toUpperCase()}
          </AppText>

          {item.verdict != null ? (
            <AppText
              variant="mono"
              style={{
                fontSize: 11,
                letterSpacing: 0.5,
                color: item.verdictTone === 'red' ? theme.colors.red : theme.colors.green,
              }}
            >
              {item.verdict}
            </AppText>
          ) : (
            <View style={styles.change}>
              {item.field != null && <Tag label={item.field} tone="neutral" />}
              {item.from != null && (
                <AppText variant="mono" tone="muted" style={styles.from}>
                  {item.from}
                </AppText>
              )}
              {item.from != null && (
                <AppText variant="mono" tone="muted" style={styles.arrow}>
                  →
                </AppText>
              )}
              <AppText variant="mono" style={[styles.to, { color: theme.colors.textPrimary }]}>
                {item.to ?? '—'}
              </AppText>
            </View>
          )}

          <View style={styles.whoRow}>
            <AppText variant="mono" tone="secondary" style={styles.who}>
              {item.who}
            </AppText>
            {item.byAdmin === true && <Tag label="administrator" tone="amber" />}
          </View>

          {/* Brak powodu widać jako BRAK, a nie jako pustą linię — pole jest opcjonalne
              i pilot ma prawo wiedzieć, że nikt go nie wypełnił. */}
          <AppText
            variant={item.reason != null ? 'body' : 'mono'}
            tone={item.reason != null ? 'secondary' : 'muted'}
            style={item.reason != null ? styles.reason : styles.noReason}
          >
            {item.reason != null ? `„${item.reason}"` : 'bez powodu'}
          </AppText>
        </View>
      ))}

      {/* KOTWICA: co niosło zdarzenie, zanim ktokolwiek je poprawił. Sama para
          „kiedy → co", bez podpisu o źródle („autodetekcja · GPS", „zapis sesji"):
          prowenienecja nie jest pytaniem pilota — ta sama reguła, przez którą issue #40
          zdjęło plakietki „AUTO" i „RĘCZNIE" z osi sesji. */}
      {origin != null && (
        <View style={[styles.item, { borderTopColor: theme.colors.border }]}>
          <AppText variant="mono" tone="muted" style={styles.when}>
            {origin.when.toUpperCase()}
          </AppText>
          <View style={styles.change}>
            <Tag label="zapis pierwotny" tone="neutral" />
            <AppText variant="mono" style={[styles.to, { color: theme.colors.textPrimary }]}>
              {origin.value}
            </AppText>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  target: { fontSize: 9, letterSpacing: 1.5 },
  empty: { fontSize: 12, lineHeight: 18 },
  item: { gap: 4, paddingTop: 10, borderTopWidth: 1 },
  when: { fontSize: 8.5, letterSpacing: 1.2 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  from: { fontSize: 13, textDecorationLine: 'line-through' },
  arrow: { fontSize: 13 },
  to: { fontSize: 13, fontWeight: '700' },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  who: { fontSize: 9, letterSpacing: 0.5 },
  reason: { fontSize: 11, lineHeight: 16, fontStyle: 'italic' },
  noReason: { fontSize: 9, letterSpacing: 0.5 },
});
