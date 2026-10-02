# Pełne sprawy syntetyczne

Zestaw uzupełnia wcześniejsze testy pojedynczych pól. Zawiera 18 spraw: 12 konsumenckich i 6 firmowych, wywiady, pisma wierzycieli oraz oświadczenia dłużników. Wszystkie dane są stworzone do testów; identyfikatory i adresy nie są danymi rzeczywistych klientów.

`cases.json` zawiera źródła i oczekiwania. `manifest.json` zawiera hashe plików. `documents/` zawiera rzeczywiste PDF-y z tekstem, a dwa przypadki także PDF-y obrazowe i PNG do testowania odczytu skanów. Materiały nie udają dokumentów wydanych przez sąd lub urząd.

Pisma zachowują role nadawcy i odbiorcy, datę pisma, identyfikator umowy, datę salda, składniki kwoty i stanowisko klienta. Termin wskazany w wezwaniu nie jest automatycznie terminem procesowym. Informacja o cesji nie tworzy nowego, niezależnego długu bez oceny powiązania. Zbiorcza deklaracja o zaległych wynagrodzeniach wymaga ustalenia poszczególnych wierzycieli.

14 przypadków służy do rozwoju, 4 mają oznaczenie `holdout`. Oczekiwania przygotowano w tej sesji; nie są niezależnym badaniem skuteczności ani oceną prawnika. Zestaw nie potwierdza poprawności merytorycznych decyzji prawnych. Formularze sądowe i podstawy prawne są opisane osobno w `legal/`.

Regeneracja: `node scripts/generate-synthetic-cases.mjs`, następnie `scripts/render-synthetic-documents.py` w środowisku z ReportLab, Pillow i Poppler. Przy tworzeniu nowych PDF-ów należy wykonać kontrolę renderów. Skrypt nie używa danych oczekiwanych do wywołań modelu.
