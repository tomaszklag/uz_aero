/**
 * UZ Aero - metryka pola DUŻEJ WARTOŚCI w arkuszach odczytu (`ReadingSheet`,
 * `OilSheet`).
 *
 * JEDNO miejsce, bo to bliźniacze pola i już raz się rozjechały (30 px / padding 12
 * kontra 32 px / padding 14) - nikt tego nie widział, dopóki arkusz oleju z DWOMA
 * polami nie urósł ponad miarę. Zmniejszone ~30% uwagą z urządzenia (2026-09-02):
 * „input zajmuje strasznie dużo miejsca".
 *
 * Hierarchia z issue #58 zostaje: pole ARKUSZA (22) nadal większe niż kontrolka
 * formularza (mono 16) - tam się wpisuje, tu się czyta. Podłogą wysokości jest
 * CEL DOTYKOWY 46 dp, ten sam próg co w `TimeStepper` - niżej zejść nie wolno,
 * niezależnie od tego, o ile jeszcze poprosi oszczędność miejsca.
 */
export const VALUE_FIELD = {
  /** Próg celu dotykowego (rękawice) - dolna granica wysokości ramki. */
  minHeight: 46,
  paddingVertical: 8,
  paddingHorizontal: 16,
  /** Stopień cyfr wartości - 22 zamiast 30–32 sprzed 2026-09-02. */
  fontSize: 22,
  letterSpacing: 2,
  /** Jednostka przy wartości. */
  unitFontSize: 14,
} as const;
