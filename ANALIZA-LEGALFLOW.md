# Legal Flow — analiza i projekt rekrutacyjny

Data analizy: 2 października 2026 r. Informacje pochodzą z publicznych stron; funkcjonalność produkcyjna nie była testowana.

## 1. Firma i rekrutacja

Legal Flow to system dla kancelarii restrukturyzacyjnych i upadłościowych. Produkt jest powiązany z Booster AI. Polityka prywatności Legal Flow wskazuje Sales Booster sp. z o.o., KRS 0001068572, NIP 8992976718, ul. Koreańska 31A/2, Wrocław. Stopka Booster używa nazwy Booster AI sp. z o.o.; na podstawie stron nie rozstrzygamy relacji prawnej tych nazw.

Szymon Bazan prowadzi demo Legal Flow i jest przedstawiony jako CEO Booster. Kontakt produktowy: kontakt@boosterai.pl.

Booster publikuje oferty Full-Stack Engineer (Junior / Mid) oraz Head of Delivery. Dla projektu programistycznego najbardziej bezpośrednia jest pierwsza. Aplikacja: hello@boosterai.pl, temat Full-Stack Engineer. Wymagają CV/LinkedIn, przykładu zbudowanego rozwiązania oraz kilku zdań o rozwiązanym problemie biznesowym. Rozmowa obejmuje praktyczne budowanie małej funkcji z agentem AI.

Ogłoszenie wymienia TypeScript, React (Next.js lub Vite), Postgres, Drizzle, TanStack i shadcn/ui; dodatkowo integracje LLM, RAG, n8n i generowanie dokumentów. Podkreśla modelowanie danych, SQL, samodzielność od schematu do wdrożenia oraz zrozumienie problemu klienta.

## 2. Co sprzedaje produkt

Obietnica marketingowa: większa liczba postępowań obsługiwanych przez ten sam zespół. Nie jest to potwierdzony wynik badania.

Proces opisany na stronie:

1. Asystent prowadzi wywiad z klientem; dla firmy sprawdza NIP w rejestrach MF i KRS.
2. Tworzy sprawę i zapisuje dane z pochodzeniem oraz poziomem pewności.
3. Przygotowuje projekty dokumentów na wzorach kancelarii.
4. Prawnik przegląda, poprawia i zatwierdza; system zapisuje osobę i czas zatwierdzenia.
5. Zmiana etapu uruchamia projekty pism, zadania z terminami i skonfigurowaną komunikację do klienta.

Dokumenty przykładowe: karta sprawy, spis wierzycieli, lista kontrolna otwarcia sprawy, notatka z przyjęcia sprawy.

Ścieżka firmowa: przyjęcie sprawy → spis wierzytelności i plan → propozycje układowe → złożenie wniosku. Bezpośrednia integracja KRZ jest według FAQ w przygotowaniu, mimo że monitoring KRZ występuje w wizualizacji etapów.

Ścieżka konsumencka zawiera dziesięć obszarów przedstawionych na stronie: tożsamość/sąd/COMI, dokumenty, wierzyciele, wierzytelności sporne, majątek, zabezpieczenia, przychody/koszty, czynności prawne z ostatnich 12 miesięcy, uzasadnienie, przegląd/oświadczenie. To opis produktu, nie zweryfikowana prawnie lista wymagań aktualnego wniosku.

Dostosowanie obejmuje pytania i ton asystenta, wzory dokumentów, etapy pracy, e-maile i szkolenie zespołu. Cena jest ustalana po demo; brak publicznego cennika kwotowego.

## 3. Problem klienta

Strona wskazuje trzy sytuacje: odejście osoby posiadającej wiedzę o sprawach, ryzyko przeoczenia terminu podczas urlopu i wzrost liczby zgłoszeń szybszy niż zatrudnienie. Wspólny problem to ręczne zbieranie, przepisywanie i kontrolowanie informacji.

Wartość demonstracji powinna więc wynikać z jakości przekazania sprawy do prawnika: jakie dane zebrano, czego brakuje, co wymaga wyjaśnienia i skąd pochodzi każda wartość.

## 4. Co wiadomo, a czego nie

Polityka prywatności wprost określa rozmowę na landing page jako odtwarzany przykład na fikcyjnych danych. Nie jest to publiczny test produkcyjnego LLM.

Strona deklaruje polską chmurę dla dokumentów i korespondencji, umowę powierzenia, informację przed rozmową oraz zatwierdzanie pism. Nie ujawnia modelu LLM, dostawcy infrastruktury aplikacji, zasad retencji rozmów, izolacji kancelarii, mechanizmu kalibracji pewności ani szczegółów kontroli dostępu. Deklaracji tych nie traktujemy jako audytu bezpieczeństwa.

Polityka strony marketingowej wymienia Vercel, Cal.com i ClickUp oraz narzędzia analityczne. Nie wynika z tego architektura systemu przetwarzającego sprawy kancelarii.

Nie znamy jakości ekstrakcji, obsługi sprzeczności, rzeczywistej skuteczności integracji ani kompletności produkcyjnych dokumentów. Nie można na tej podstawie twierdzić, że produkt tych funkcji nie ma.

## 5. Proponowany projekt: asystent przyjęcia i kontroli sprawy

Samodzielny projekt portfolio z własną nazwą i identyfikacją. Inspiracja procesem, bez sugerowania współpracy lub oficjalnej integracji z Legal Flow.

Cel: zamienić rozmowę o zadłużeniu w kartę zgłoszenia, którą prawnik może szybko i świadomie sprawdzić.

Pierwsza wersja powinna pokazać jeden kompletny scenariusz:

- Rozmowa w języku polskim, jedno zrozumiałe pytanie na raz.
- Ekstrakcja kilku informacji z jednej odpowiedzi, bez ponownego pytania o podane dane.
- Karta sprawy obok czatu: osoba, wierzyciele, kwoty, dochody, koszty, majątek i opis sytuacji.
- Każde pole połączone z konkretną wiadomością źródłową.
- Statusy informacji: deklaracja klienta, brak, sprzeczność, potwierdzone przez prawnika. Bez nieuzasadnionych procentów pewności.
- Wykrycie rozbieżności i pytanie wyjaśniające, bez cichego nadpisania.
- Lista braków przed przekazaniem do przeglądu.
- Projekt karty sprawy i spisu wierzycieli z oznaczeniem brakujących danych.
- Panel przeglądu: prawnik poprawia dane i zatwierdza konkretną wersję projektu; zmiana danych wymaga ponownego przeglądu.
- Eksport podsumowania i rejestru zmian.

Bot zbiera informacje i przygotowuje materiał. Nie orzeka o upadłości, właściwości sądu ani dopuszczalności postępowania. Merytoryczne reguły prawne wymagają osobno aktualnych źródeł i przeglądu specjalisty.

## 6. Scenariusz prezentacji

Wyłącznie fikcyjne dane:

1. Klient podaje łączne zadłużenie 120 tys. zł.
2. Wskazuje trzech wierzycieli z kwotami 50, 40 i 20 tys. zł.
3. System pokazuje sumę 110 tys. zł i pyta o różnicę 10 tys. zł; nie uznaje automatycznie żadnej wartości za prawdziwą.
4. Klient wyjaśnia dodatkowe zobowiązanie; karta i historia zmian aktualizują się.
5. Brak danych o zabezpieczeniu pozostaje widoczny jako brak, zamiast zamieniać się w „brak zabezpieczenia”.
6. Prawnik klika źródło wartości, sprawdza odpowiedź i zatwierdza projekt.

Ten przykład pokazuje konkretną umiejętność projektowania niezawodnego procesu, nie tylko wywołania API modelu.

## 7. Architektura dopasowana do ogłoszenia

Propozycja, nie rozpoznany stos produkcyjny Legal Flow:

- TypeScript + Next.js dla UI i backendu.
- Postgres + Drizzle dla danych i migracji.
- Walidowane wyjście strukturalne modelu; model proponuje ekstrakcję, backend zatwierdza format.
- Reguły deterministyczne dla sum, obowiązkowych pól i przejść statusów.
- Adapter dostawcy LLM i jawny tryb demonstracyjny bez API, umożliwiający uruchomienie repozytorium bez klucza.
- Tabele: sprawy, wiadomości, fakty, źródła faktów, wierzyciele, projekty dokumentów, zatwierdzenia i zdarzenia audytowe.
- Kwoty jako dokładne wartości pieniężne, nie obliczenia na zmiennoprzecinkowych liczbach JS.
- Zatwierdzenie związane z wersją dokumentu i użytkownikiem, wykonywane na backendzie.

W docelowej wersji: logowanie, role, izolacja kancelarii, limity kosztów, obsługa awarii dostawcy i zasady przechowywania danych. MVP nie powinno udawać, że wszystkie te elementy już wdrożono.

Nie dokładamy RAG wyłącznie dla efektu. Przy zbieraniu danych lepiej najpierw pokazać ekstrakcję, walidację, źródła i workflow. RAG jest kolejnym krokiem dla zatwierdzonej bazy procedur kancelarii.

## 8. Co sprawdzić

- Brak zgadywania niepodanych wartości.
- Zachowanie historii przy korekcie kwoty.
- Wykrycie niespójnej sumy zobowiązań.
- Pominięcie pytań o już podane informacje.
- Wiadomość klienta próbująca zmienić instrukcje nie zatwierdza dokumentu.
- Brak dostępu do innej sprawy lub kancelarii.
- Awaria LLM nie usuwa rozmowy i nie tworzy fałszywie kompletnej karty.
- Edycja po zatwierdzeniu wymaga nowego zatwierdzenia.

Ocena ekstrakcji na małym zbiorze fikcyjnych rozmów: poprawność wartości, kompletność połączeń ze źródłem i liczba wymyślonych faktów. Osobno pomiar czasu przeglądu. Nie publikujemy oszczędności procentowych bez pomiaru.

## 9. Pakiet rekrutacyjny

Repozytorium z instrukcją uruchomienia, fikcyjną sprawą, schematem danych i opisem ograniczeń. Krótkie nagranie pokazujące ścieżkę od rozmowy do przeglądu. Kilka sensownych testów, lista decyzji architektonicznych i uczciwy opis wkładu agentów AI.

Po zbudowaniu projektu wiadomość aplikacyjna może opisywać: problem ręcznego porządkowania zgłoszeń, działający scenariusz wykrywania sprzeczności, decyzje dotyczące danych i to, co zostało przetestowane. Nie deklarujemy wdrożenia ani wyników, których jeszcze nie ma.

## Źródła

- https://legal-flow.pl/
- https://legal-flow.pl/polityka-prywatnosci.html
- https://legal-flow.pl/obowiazek-informacyjny.html
- https://boosterai.pl/
- https://boosterai.pl/careers
- https://boosterai.pl/careers/full-stack-engineer

Pobrane pliki lokalne: `legal-flow-source.html` i `legal-flow-text.txt`; kopie źródłowej strony nie są częścią publicznego repozytorium. Analiza nie obejmuje dostępu do prywatnej aplikacji ani kodu serwera.
