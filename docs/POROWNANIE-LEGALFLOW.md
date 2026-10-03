# CaseCheck i LegalFlow — porównanie z 3 października 2026

CaseCheck ma wdrożony na VPS obieg dokumentów z kontrolą źródeł. LegalFlow ma szerszy deklarowany zakres obsługi kancelarii. Nie mamy dostępu do ich panelu, kodu, umów z dostawcami ani wyników badań. Nie można zatem uczciwie stwierdzić, że nasz system jest lepszy we wszystkim, dokładniejszy lub bezpieczniejszy.

## Co robi ich produkt, a co nasz

Kolumna LegalFlow opisuje ofertę, nie nasze pomiary. Podstawą jest [oficjalna strona LegalFlow](https://restrukturyzacja.boosterai.pl/), sprawdzona 3.10.2026. Pierwotny adres legal-flow.pl był niedostępny podczas tego przeglądu.

| Obszar | LegalFlow: deklaracja producenta | CaseCheck: stan i dowód |
|---|---|---|
| Proces kancelarii | Obsługa od pozyskania klienta do archiwizacji | Przyjęcie sprawy, wywiad, dokumenty, przegląd, projekty, zadania i etapy. Bez pełnego prowadzenia postępowania. |
| Portal | Status, komunikacja, dwustronne pliki, powiadomienia | Status, wiadomości zespołu i klienta, prośby o uzupełnienie, odpowiedzi z plikami, przyjęcie/ponowienie. Ręcznie przeszliśmy obieg S01. Brak zewnętrznych powiadomień. |
| Pisma | Własne wzory, wersje, projekty Word/PDF, akceptacja | Pięć wzorów wbudowanych oraz edytor własnych, historia wersji, podstawianie potwierdzonych danych i cytatów, eksport PDF/DOCX. Zmiana wzoru wycofuje zależne pisma. |
| Podpis | Podpis elektroniczny | Brak podpisu. Potwierdzenie przeczytania jest wyłącznie zapisem zapoznania się. |
| Integracje | CRM, SharePoint, GUS/REGON, poczta, SMS, KSeF | KRS/VAT oraz eksport pakietu JSON po przeglądzie. Brak gotowych połączeń z CRM, SharePoint i KSeF. |
| Należności kancelarii | Monitoring faktur i automatyczne monity | Brak modułu własnych należności kancelarii. Kartoteka zobowiązań klienta służy innemu celowi. |
| KRZ | Integracja w przygotowaniu | Brak integracji. Nie uznajemy zapowiedzi za dostępną funkcję. |
| Kontrola jakości AI | Brak publicznej, porównywalnej próby | Publikujemy również porażki: wadliwy JSON, błędną interpretację braku danych i adres poprzedniego wierzyciela. Wyniki na fikcyjnych materiałach nie określają jakości na realnych aktach. |
| Oryginał a OCR | Szczegółowy mechanizm nieznany | Widok oryginału i strony OCR, korekty z historią, hashe i blokowanie zależnych nieaktualnych danych. |
| Awaria po opłaconym odczycie | Szczegółowy mechanizm nieznany | Trwały zapis odpowiedzi i odzyskanie bez ponownego API. Sprawdzone również po restarcie. |

Na [stronie agencji Booster AI](https://boosterai.pl/pl) opisano również przetwarzanie wywiadów audio do projektów prawnych oraz pracę z wieloma modelami. CaseCheck przyjmuje obecnie tekst, PDF i obrazy, bez nagrywania/transkrypcji audio. Sama lista technologii agencji nie dowodzi architektury konkretnego wdrożenia LegalFlow.

## Co możemy pokazać jako naszą mocną stronę

Nie wiemy, czy konkurent ma takie same zabezpieczenia. Wiemy natomiast, że u nas da się pokazać je w działającym ekranie:

1. **Adres nie staje się adresem wierzyciela tylko dlatego, że istnieje w dokumencie.** W S02 model wskazał adres banku zbywającego wierzytelność. Filtr wymaga jawnego powiązania z właściwym podmiotem, w innym przypadku pozostawia brak do weryfikacji. To zachowawcza reguła obsługiwanych układów tekstu, nie pełne rozumienie dowolnego dokumentu.
2. **„Nie wiem” pozostaje „nie wiem”.** Brak informacji o zabezpieczeniu nie oznacza braku zabezpieczenia; brak stanowiska nie oznacza braku sporu. Szacunkowa kwota pozostaje szacunkowa również po ręcznej korekcie.
3. **Da się prześledzić podstawienie do pisma.** Końcowy przykład ma 11 odwołań do informacji źródłowych dla klienta, deklaracji, kwot, nazw wierzycieli i umów.
4. **Stare zatwierdzenie nie daje dostępu do zmienionego pisma.** Odpowiedź klienta, zmiana danych, OCR lub wzoru wycofują zależną wersję. Stary adres pobrania zwrócił HTTP 409.
5. **Działa powrót po awarii.** Kopia odtworzyła sześć spraw, 12 plików, historię wzoru i portal; licznik API pozostał 20/20.

[Ręczny przegląd i wykryte błędy](RECZNY-PRZEGLAD-PORTALU.md) opisuje dokładnie, co sprawdzono. Symulacja konta prawnika przez agenta nie jest niezależnym przeglądem prawnym.

## Co trzeba zrobić, żeby wykazać przewagę

Przewagę określamy mierzalnym zadaniem. Proponowany odbiór z kancelarią:

| Cel | Praca do wykonania | Dowód potrzebny do uznania celu |
|---|---|---|
| Mniej błędnych znanych wartości | Osobny, zamrożony zestaw rzeczywistych lub wiarygodnie zanonimizowanych dokumentów; anotacje dwóch osób | Porównanie tych samych pól, braków i błędów obu narzędzi; rozdzielenie OCR od ekstrakcji |
| Krótszy przegląd | Pomiar pracy człowieka z dokumentem i ze wspomaganiem | Mediana i p95 czasu, czas poprawek, liczba błędów i koszt API; ten sam zakres spraw |
| Lepsza współpraca | Jeden uzgodniony CRM i próbny odbiorca danych | Dostarczenie zatwierdzonego pakietu, ponowienia, brak duplikatów, historia transmisji |
| Gotowość kancelaryjna | Podpis u wybranego dostawcy, docelowe wzory, dostęp i procedury kancelarii | Weryfikowalny podpis, odbiór procesu przez uprawnioną osobę, odtworzenie kopii i test dostępu |
| Większa skala | Kolejka, paginacja i pomiar równoczesnych spraw | Wyniki obciążenia na uzgodnionej liczbie spraw, limity i czasy, bez zgadywania wydajności |

Nie budujemy fikcyjnych przycisków „integracja” bez połączenia z docelowym systemem. Nie mamy jeszcze podstaw do deklarowania przewagi w żadnej z powyższych miar.

## Propozycja rozmowy freelance

„Zbudowałem moduł przyjęcia i kontroli dokumentów: cytaty, przegląd OCR, kontrola wierzyciela po cesji, wersjonowane wzory i portal klienta. Mogę pokazać znalezione błędy rzeczywistych odpowiedzi API oraz ich obsługę. Proponuję małe zlecenie: dopasowanie tego modułu do jednego procesu i eksport potwierdzonych danych do Waszego systemu, z ustalonym pomiarem jakości.”

Taki zakres można wycenić i odebrać. Deklaracja zastąpienia całego LegalFlow nie byłaby poparta obecnym stanem projektu.

## Ponowny odbiór po wdrożeniu

[Ręczny odbiór VPS](RECZNY-ODBIOR-VPS.md) z 3.10.2026 potwierdził na kopii istniejącej bazy obieg prośby i odpowiedzi klienta, wydanie oraz wycofanie pisma, eksporty i własny wzór. Po publikacji sprawdzono też S02 i S04 w publicznym panelu. Nie dowodzi to równoważności z całym LegalFlow. Otwarte karty wymagają odświeżenia po zmianie przez drugą osobę; brak automatycznych powiadomień pozostaje istotną luką.
