# Testy i dowody działania

Stan weryfikacji: 3 października 2026 czasu Europe/Bucharest. Trzy nowe wywołania API zakończyły się 2 października według czasu UTC. Testy syntetyczne i kontrola techniczna nie zastępują oceny rzeczywistych spraw przez niezależny zespół.

## Automatyczne testy bez płatnego API

`npm ci` i `npm test` uruchamiają 48 testów. W części testów aplikacji adapter AI jest zastąpiony deterministyczną odpowiedzią. Testujemy walidację, obieg danych i błędy; te wyniki nie są pomiarem trafności modeli LLM. Testy korzystają z odrębnych tymczasowych baz, a pięć nowych scenariuszy przechodzi przez rzeczywisty serwer HTTP.

| Scenariusz | Sprawdzony rezultat |
|---|---|
| Rozbieżność S01 | 120 000 zł deklaracji, 110 000 zł dokumentów, różnica 10 000 zł |
| Cesja S02 | Dwie pozycje wyłączone z sumy przed przeglądem; po powiązaniu oba źródła i jedno saldo 53 200 zł |
| Spór S04 | 19 000 zł odczytanej kwoty oraz osobne oznaczenie sporu |
| Waluty i daty S06 | Trzy grupy sald pozostają osobne; brak automatycznego przeliczania |
| Brak informacji o zabezpieczeniu | Wartość pozostaje `unknown`, nie staje się odpowiedzią „nie” |

Każdy z tych pięciu testów obejmuje konto prawnika, zapis sprawy i pliku, odczyt przez kontrolowany adapter, przegląd, projekt, zatwierdzenie i pobranie PDF. Dodanie zadania zachowuje zatwierdzenie. Nowa wiadomość unieważnia pismo. Historia pozostaje dostępna.

Pozostałe testy obejmują cytaty i typy, daty i grosze, błędy/odmowy API, brak automatycznych powtórzeń, licznik dzienny, spóźniony wynik po korekcie, role, kancelarie, zakres i wygaśnięcie linku klienta, ograniczenia plików, OCR, PDF oraz backup/odtworzenie. Nowe testy katalogu zespołu sprawdzają także brak cudzych kont, kont wyłączonych, e-maili i hashy haseł w odpowiedzi oraz brak dostępu klienta.

[GitHub Actions](https://github.com/krapcys1-maker/casecheck/actions/workflows/tests.yml) uruchamia tę samą komendę na Node 22 i 24. Wynik konkretnego uruchomienia jest widoczny w dzienniku CI; badge w README wskazuje ostatni stan.

Potwierdzony [run 37066310540](https://github.com/krapcys1-maker/casecheck/actions/runs/37066310540) zakończył się sukcesem na obu wersjach Node. VPS: 48/48 testów, Node 22.22.1; lokalnie: 48/48, Node 24.13.0. [Raport JSON](test-results-2026-10-03.json) zachowuje wybrane metadane prób, bez danych dostępu. Dalsze poprawki tekstu i materiały portfolio nie zmieniają wyników wcześniejszej próby API.

## Nowe testy z rzeczywistym OpenAI

Wykonano trzy wywołania modelu `gpt-4.1-mini-2025-04-14` na już zaimportowanych fikcyjnych dokumentach, bez przekazania modelowi oczekiwanych odpowiedzi. Sprawdzono kwotę całkowitą, walutę, datę salda, numer umowy, występowanie cytatów w źródłach i nieznane zabezpieczenie. W S04 sprawdzono również odczyt sporu.

| Dokument | Wynik odczytu | Wynik kontroli aplikacji |
|---|---|---|
| S02-D01 | 50 000 PLN, 2026-08-31, ALFA/2022/008 | Para z drugim dokumentem; kwota poza sumą do powiązania |
| S02-D02 | 53 200 PLN, 2026-09-30, ALFA/2022/008 | Ta sama umowa; zachowana informacja o cesji |
| S04-D01 | 19 000 PLN, 2026-09-30, EPS/2020/050, spór | Kwota po testowym przeglądzie i osobny sygnał sporu |

Wszystkie trzy odczyty zakończyły się statusem `completed` i przeszły wymienione asercje. Wykorzystano pozostałe trzy rezerwacje: 17 → 20 z limitu 20 na dobę UTC. Nie zwiększano limitu i nie ponawiano wywołań automatycznie. Wcześniejsze próby API/OCR dokumentują [wyniki pierwszego procesu](../WYNIKI-PELNEGO-PROCESU.md) oraz [testy trzech dostawców](../WYNIKI-TESTU-API.md).

Dodatkowy przegląd ujawnił jeden błąd interpretacji: w S04 model wpisał obecnego wierzyciela również jako poprzedniego, chociaż dokument nie wskazuje cesji ani poprzedniego wierzyciela. Ręczna korekta testowa zmieniła to pole na `unknown`, zachowując wcześniejszą wartość i uzasadnienie. Utworzono aktualny projekt karty. Korekta nie wywołała API. Ten przykład pokazuje, dlaczego poprawny cytat i status `completed` nie wystarczają do potwierdzenia całej interpretacji.

S02 pozostawiono z widoczną parą do ręcznego powiązania, aby pokazać decyzję przeglądającego. S04 zachowuje spór. Trzy pola wywiadu w każdej z tych dwóch spraw przeniesiono ręcznie z fikcyjnych wiadomości, ze źródłem i etykietą „SYMULACJA AI”; nie są przedstawione jako odczyt modelu. Projekty kart S02/S04 są projektami roboczymi, bez niezależnego zatwierdzenia.

To mała próba demonstracyjna wybranych pól na danych syntetycznych. Nie oznacza 100% trafności systemu na aktach kancelarii. Oczekiwania przygotował autor projektu z pomocą AI; nie ma niezależnej anotacji prawniczej. Miarodajny pilotaż powinien korzystać z nowego zestawu i osobnej oceny merytorycznej.

## Kontrola przeglądarki i wdrożenia

Sprawdzamy kartotekę, podsumowanie S01, filtr otwartych zadań, zapis zadania z nazwanym wykonawcą i rozdzielenie historii pism. Układ mobilny kontrolowany jest przy 390 × 844 oraz na standardowym widoku desktopowym; nie powinien mieć poziomego przepełnienia strony. Kontrola UI jest wykonana ręcznie przez agenta, poza automatycznym CI.

Przed wdrożeniem wykonujemy spójną kopię stanu i kontrolę hashy 46 załączników. Po wdrożeniu sprawdzamy HTTPS, health, logowanie, panel, plik/PDF i odrzucenie dostępu bez autoryzacji. Oryginalna strona główna i formularz kontaktowy pod tym samym hostem są kontrolowane osobno.

## Co mierzyć dalej

Przygotowanie i przegląd porównywalnych rzeczywistych spraw, błędne kwoty/datowania/wierzyciele, fałszywe połączenia dokumentów, nieuprawnione ujawnienia, ręczne korekty, koszt API oraz zachowanie po przerwaniu. Podziel dane na rozwój i odrębny test; nie poprawiaj promptu na podstawie wyników zestawu końcowego. Oczekiwania i dopuszczalną tolerancję uzgodnij przed próbą.
