# Firma po NIP i pakiety etapów — 3.10.2026

## Obsługa

1. W rozmowie firmowej rozwiń **Firma po NIP z rozmowy** i włącz pobieranie. Po podaniu jednoznacznego NIP zgłaszającej firmy asystent zapisze go, a aplikacja zapyta MF. Gdy MF wskazuje poprawny KRS, aplikacja dopyta KRS. Sprawy fikcyjne korzystają z testowego MF bez łączenia z produkcyjnym KRS. Do rejestrów trafia numer, nie treść rozmowy.
2. Sprawdź nazwę i adres. **To moja firma — zapisz dane** zapisuje propozycje ze źródłem do przeglądu. Ręczne i zatwierdzone wartości są zachowywane. Błędny lub niejednoznaczny NIP nie uruchamia pobrania. Brak wyniku nie oznacza, że firma nie istnieje: zakres danych MF jest ograniczony. Dalsza rozmowa po błędzie nie ponawia zapytania automatycznie; można ponowić przyciskiem.
3. **Zakończ wywiad i przekaż do przeglądu** jest dostępne dla klienta i kancelarii. Domyślnie tworzy kartę sprawy, pomocniczy wykaz wierzycieli, prośbę o uzupełnienie oraz dwa zadania. Projekty powstają lokalnie, bez nowego wywołania modelu, i czekają na zwykły przegląd. Braki pozostają jawne.
4. W **Zadania → Ustaw automatyzację etapów** wybierz wbudowane wzory, do pięciu zadań na etap, osoby i opóźnienia 0–30 dni. Reguły dotyczą jednej sprawy i etapów Przegląd/Dokumenty. Daty są administracyjne, w dniach kalendarzowych UTC. Zapis reguł nie wykonuje ich od razu; uruchamia je zapis odpowiedniego etapu.

Ponowny zapis nie dubluje bieżących projektów ani identycznych reguł zadań. Zmiana tytułu, osoby lub liczby dni tworzy inną regułę, bez usuwania starego zadania. Zadania wykonane nie są automatycznie otwierane ponownie. Po uzupełnieniu danych stare pisma są nieaktualne; ponowne przekazanie lub zapis etapu tworzy nowe wersje. Ręczna edycja aktualnego pisma pozostaje zachowana. Klient widzi komunikat o przekazaniu, a nie wewnętrzne projekty i zadania kancelarii.

## Ręczny odbiór lokalny

Na dostarczonej fikcyjnej rozmowie (bez lokalnego API AI) pobrano testową firmę MF, potwierdzono dane, zakończono wywiad i przeczytano całe trzy projekty. Zmieniono regułę Dokumentów: własny tytuł, cztery dni, przypisany administrator. Zapis etapu utworzył zadanie na 7.10.2026; powtórzenie nie zwiększyło liczby czterech zadań.

Ręczny odczyt ujawnił zbyt długi KRS w oficjalnym rekordzie testowym MF. Dodano walidację długości i ponowiono pełne pobranie w przeglądarce: niepoprawny KRS nie trafił do pól, a oryginalna odpowiedź została zachowana. Dane z rejestru pozostały do przeglądu, bez nadawania procentowego poziomu pewności.

Osobno rzeczywiście sprawdzono adaptery produkcyjne MF → KRS na publicznym wpisie PKO BP (NIP 5250007738, KRS 0000026438), bez przypisywania banku do fikcyjnej sprawy i bez wywołania AI. Zgodne były NIP, nazwa i odpis; adres to ul. Świętokrzyska 36, Warszawa. To sprawdzenie pobierania, nie ocena sytuacji banku.

149/149 testów lokalnie. Nowe scenariusze obejmują świadome włączenie rejestru, kontrolę identyfikatorów i źródła, błąd KRS z częściowym wynikiem MF, zmianę danych podczas zapytania, restart, ochronę ręcznych danych, brak ujawnienia prywatnych źródeł, przypisanie zadań, atomowy zapis pakietu i brak duplikatów. Kopia stanu obejmuje także rejestr kosztów API.

## Granice tej zmiany

Wykaz wierzycieli korzysta z rekordów zobowiązań. Samo wymienienie kilku wierzycieli w czacie nie tworzy jeszcze odrębnych, uzgodnionych rekordów; mogą pozostać braki wymagające dokumentów i pracy kancelarii. Nie ma automatycznej wysyłki e-mail/SMS, urzędowego wniosku, własnych wzorów w regułach etapów ani bezpośredniego KRZ. Zakończenie wywiadu nie oznacza kompletności ani zatwierdzenia prawnego sprawy.

Źródła adapterów: [API MF](https://www.gov.pl/web/kas/api-wykazu-podatnikow-vat), [otwarte API KRS](https://prs.ms.gov.pl/krs/openApi). Pobieranie nie wymaga płatnego modelu. Limit ochronny publicznych rejestrów jest oddzielny od kwotowego budżetu DeepSeek.
