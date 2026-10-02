# Pierwszy pilotaż całego procesu — 2 października 2026

39 lokalnych testów przeszło bez kluczy i sieci AI. Sprawdzają role, kancelarie, linki klienta, wersje, ponowny odczyt dokumentu, błędy API, PDF/skan, kopię i odtworzenie oraz kwoty i duplikaty. Próby silnika nie zastępują audytu bezpieczeństwa i oceny merytorycznej kancelarii.

Wykonano rzeczywiste wywołania OpenAI w aplikacji na wyraźnie fikcyjnych danych. Końcowy proces przeszedł:

- S01: nazwa i adres klienta, dochód 3900 PLN, koszty 3400 PLN, deklarowane saldo 120 000 PLN; trzy dokumenty 50 000 + 40 000 + 20 000 PLN na 30 września 2026 r. Po przeglądzie kontem testowym suma wyniosła 110 000 PLN, różnica 10 000 PLN.
- S11: odczyt obrazowego PDF przez OpenAI, osobne źródło OCR i ekstrakcja kwoty 9876,54 PLN. Kwota zgadzała się z materiałem testowym; OCR nadal ma status wymagający porównania z obrazem.
- S12: odczyt skanu zawierającego nieczytelną kwotę i instrukcję zatwierdzania. W ekstrakcji kwota pozostała nieznana; dokumenty nie zostały zatwierdzone.
- Pięć PDF-ów wynikowych: polskie znaki, oznaczenia fikcyjności, braki, wersje i czytelne stopki. Łącznie sześć stron, obejrzane po renderowaniu. Pismo do jednego wierzyciela pomija informacje o pozostałych roszczeniach.
- Panel w przeglądarce: logowanie, wybór sprawy, kwoty, projekty i role. Konto używane do kontroli wyglądu zostało wyłączone.

Podczas budowy zużyto 17 żądań nowego procesu, w tym powtórzenia po poprawkach. Pierwsza próba ujawniła kolizję dwóch procesów testowych na tym samym stanie; dodano blokadę właściciela katalogu. Ponowny odczyt pliku zachowuje jedną aktywną wersję roszczenia. Dalsze sprawdzanie layoutu i wznowienie wykorzystały zapisane wyniki, bez nowych żądań API.

Raporty z odpowiedziami i zużyciem tokenów pozostają lokalne w ignorowanym katalogu. W repo znajdują się własne dane syntetyczne, oczekiwania i próbki PDF. Oczekiwania nie zostały sprawdzone niezależnie przez prawnika. Nie zmierzono skuteczności na rzeczywistych sprawach ani porównania z Legal Flow. Inni dostawcy przeszli wcześniejsze próby modułu opisane osobno; pełny proces OCR testowano z OpenAI.
