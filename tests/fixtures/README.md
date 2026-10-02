# Pierwsze dane testowe CaseCheck

`cases.json` zawiera 20 własnych scenariuszy syntetycznych: 14 dotyczących ekstrakcji i kontroli treści oraz 6 dotyczących zachowania aplikacji. Oczekiwania przygotowano w tej sesji; wymagają przeglądu człowieka, a reguły merytoryczne przeglądu prawnika. Nie wykorzystano danych rzeczywistych klientów ani danych z repozytoriów zewnętrznych.

Każdy scenariusz zawiera źródła wejściowe, wybrane oczekiwane fakty, wymagane zachowania i zachowania zabronione. Źródła dokumentowe są **tekstami fikcyjnych pism**, a nie rzeczywistymi plikami PDF. Scenariusz C14 sprawdza reakcję na nieczytelny tekst po OCR; nie mierzy działania OCR na obrazie.

## Jak czytać dane

- `sources`: tylko te materiały mogą trafić do ekstrakcji danego przypadku. Identyfikatory są lokalne dla scenariusza.
- `facts`: wybrane pola do porównania. Nie jest to kompletna lista wszystkich możliwych faktów z wejścia; dodatkowy fakt trzeba ocenić względem źródła, a nie automatycznie uznać za błąd.
- `source_id` i `quote`: oczekiwane źródło i dosłowny fragment, który można znaleźć w tekście.
- `minor_units`: kwota w groszach albo centach, zawsze integer. Dla przybliżenia zapisany jest dodatkowo kwalifikator `precision`.
- `computations`: wyniki deterministycznych obliczeń; nie są cytatami ani bezpośrednimi faktami źródłowymi.
- `behaviors` / `forbidden`: kryteria akceptacji do przekształcenia w asercje i procedurę przeglądu. Obecnie są opisem, nie wykonywalnymi testami.
- `initial_state` / `events`: scenariusze dla backendu i workflow. Wywołanie samego LLM nie zweryfikuje kontroli dostępu, retry ani zatwierdzeń.

## Jak wykorzystać w przyszłym runnerze

1. Przekazać źródła scenariusza do tego samego adaptera ekstrakcji, który będzie używany w aplikacji.
2. Znormalizować odpowiedź modelu do kontraktu faktów i porównać wybrane pola, kwoty, waluty, daty oraz źródła.
3. Sprawdzić istnienie cytatów kodem i niezależnie ocenić zgodność znaczenia faktów z treścią.
4. Wykonać scenariusze workflow na testowej bazie i sprawdzić stan oraz audyt po zdarzeniach.
5. Zapisać wersję promptu, schematu, modelu, źródeł, koszt i czas. Nie traktować odczytania JSON jako zaliczenia testu bota.

Przed porównywaniem modeli odłożyć osobne sprawy i rodziny wzorów, których nie używa się do poprawiania promptu. Większy, niezależnie opisany zestaw i rzeczywiste warianty skanów są następnym krokiem. Te 20 przypadków to zbiór startowy do rozwoju, nie dowód gotowości produkcyjnej.
