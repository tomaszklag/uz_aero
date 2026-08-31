/// <reference types="vitest" />
/**
 * UZ Aero - panel administracyjny: konfiguracja Vite.
 *
 * Trzy rzeczy, z których każda ma powód zapisany na miejscu: `base`, `server.proxy`
 * i `test`. Poza nimi konfiguracja jest celowo pusta - panel to zwykła aplikacja
 * React w przeglądarce i nie potrzebuje niczego więcej.
 */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Port serwera UZ Aero w devie (`server/.env`, domyślnie 3000). Stała, a nie zmienna
 * środowiskowa: to jedyne miejsce, w którym panel w ogóle wie o adresie serwera,
 * bo na produkcji jedzie z TEGO SAMEGO originu (§9) i żadnego adresu nie zna.
 */
const DEV_SERVER_PORT = 3000;

export default defineConfig({
  plugins: [react()],

  // Panel stanie pod `/admin/` (statyczny build za `@fastify/static`). Bez tego
  // wszystkie zasoby wskazywałyby `/assets/*` i dostawały 404 pod podścieżką -
  // to najczęstsza awaria tego wariantu wdrożenia.
  base: '/admin/',

  server: {
    // Panel i API MUSZĄ być tym samym originem, bo ciasteczko sesji ma
    // `SameSite=Strict`. Proxy w devie jest jedynym sposobem, żeby dev zachowywał
    // się jak produkcja - bez niego pierwsza osoba zobaczy CORS i „naprawi" go,
    // dokładając nagłówki CORS do serwera, a to pojedzie na produkcję.
    proxy: {
      '/admin/api': {
        target: `http://localhost:${DEV_SERVER_PORT}`,
        changeOrigin: false,
      },
    },
  },

  // `vite preview` serwuje GOTOWY build i przydaje się do obejrzenia dokładnie tego,
  // co pojedzie na produkcję. Bez tego samego proxy pokazywałby panel, w którym nie
  // działa ani jedno żądanie - czyli mylił, zamiast sprawdzać. To ta sama reguła, co
  // wyżej: jeden origin, bo ciasteczko sesji ma `SameSite=Strict`.
  preview: {
    proxy: {
      '/admin/api': {
        target: `http://localhost:${DEV_SERVER_PORT}`,
        changeOrigin: false,
      },
    },
  },

  test: {
    // Środowisko Node, bez jsdom: testy panelu to granice warstw, kontrakt z mockupem
    // i czyste moduły ekranów (`docs/architektura-panelu-frontend.md` §8). Renderowania
    // całych drzew nie testujemy - specyfikacją jest mockup, nie migawka DOM-u.
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
