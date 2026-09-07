import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Każdy test podnosi WŁASNY Postgres (PGlite/WASM) - zimny start kilku instancji
    // równolegle potrafi przekroczyć domyślne 5 s. To koszt świadomej decyzji
    // „prawdziwy silnik zamiast atrap"; podnosimy limit zamiast współdzielić bazę,
    // bo izolacja per test jest warta więcej niż sekundy.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
