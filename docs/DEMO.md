# Pokaz CaseCheck w 8 minut

Cel: pokazać, że umiesz przejść od problemu biznesowego przez model danych i AI do działającego, testowanego wdrożenia. Korzystaj z fikcyjnych spraw. Zapisane odczyty pozwalają prowadzić pokaz bez nowego wywołania płatnego API.

## Przygotowanie

Otwórz [panel HTTPS](https://astrologiapoludzku.com/casecheck/) i zaloguj się kontem testowym z rolą prawnika. Prywatne dane dostępu są lokalnie w `deploy/local/DOSTEP-PELNY-BOT.txt`, poza GitHubem. Miej otwarte repozytorium i materiał PDF portfolio. Sprawdź przed spotkaniem S01, S02 i S04; nie wykonuj zmian tylko po to, żeby odświeżyć ekran. Dzienny limit odczytów jest widoczny w panelu.

W razie awarii sieci pokaż PDF portfolio i zapisane przykładowe dokumenty. Zrzut panelu jest dowodem wcześniejszego działania, a nie nowym wynikiem testu.

| Czas | Ekran i czynność | Co powiedzieć |
|---|---|---|
| 0:00–1:00 | Kartoteka i jej liczniki | „Przygotowanie materiału jest rozproszone. Chcę ułatwić przekazanie sprawy kolejnej osobie, pokazując stan danych i ich źródła.” |
| 1:00–2:00 | S01 → Podsumowanie | „Klient deklaruje 120 tys. zł; dokumenty pokazują 110 tys. zł. Różnica 10 tys. zł wymaga wyjaśnienia.” |
| 2:00–3:00 | Zobowiązania → Fragment / Źródło | „Kwota ma konkretny dokument i cytat. Przegląd oznacza potwierdzenie odczytu; nie rozstrzyga roszczenia.” |
| 3:00–4:00 | Zadania → Projekty pism | „Wiem, kto ma wyjaśnić brak. Aktualne pisma są widoczne od razu, starsze wersje pozostają w historii.” |
| 4:00–5:00 | S02 → Podsumowanie i zobowiązania | „Ten sam numer umowy pojawia się w dwóch dokumentach: stary wierzyciel i cesja, dwa salda. System wyłącza obie pozycje z sumy, aż osoba przeglądająca wybierze właściwą.” |
| 5:00–6:00 | S04 → Podsumowanie i źródło sporu | „Roszczenie może być poprawnie odczytane i jednocześnie sporne. To osobne informacje.” |
| 6:00–7:00 | Repo → testy / architektura | „Testuję też błąd API, spóźniony wynik po korekcie, izolację kancelarii, wygaśnięcie linku i odtworzenie kopii.” |
| 7:00–8:00 | Rozmowa o pilotażu | „Który etap dziś wymaga najwięcej poprawek? Uzgodnijmy jedną ścieżkę, zestaw walidacyjny i pomiar czasu oraz jakości.” |

## Gdy rozmowa przejdzie w szczegóły

**Dlaczego SQLite i zwykły JS?** Mały, kompletny pilotaż działa na istniejącym VPS z niewielką liczbą zależności. Wymagania większej instalacji wyznaczą zakres migracji do Postgresa, kolejki i stosu UI zespołu. Dzisiaj można ocenić obieg danych i decyzje projektowe.

**Czy cytat gwarantuje, że AI ma rację?** Nie. Walidacja odrzuca zmyślone lub obce źródło oraz błędne typy, ale wartość może zostać źle zinterpretowana. Dlatego istnieją przegląd, korekta i testy semantyczne konkretnych przypadków.

**Czy to gotowy odpowiednik całego LegalFlow?** CaseCheck jest samodzielnym projektem przyjęcia i kontroli danych. Pokaz dotyczy tego zakresu, którego działanie można sprawdzić w kodzie i testach. Dalszy zakres ustala się z zespołem na podstawie potrzeb procesu.

**Czy przegląd testowy zrobił prawnik?** Testową rolę prawnika symulował agent AI. Niezależna weryfikacja merytoryczna jest konieczna przed rzeczywistym pilotażem. Nie podpisujemy pism jako prawnik i nie wysyłamy ich do wierzycieli ani sądu.

**Czy jest dowód oszczędności 70%?** Nie ma pomiaru na rzeczywistych sprawach. Projekt ma sprawdzić jakość i obieg danych. Czas przygotowania, czas przeglądu, korekty oraz koszt API należy zmierzyć oddzielnie.

## Proponowane pytania do zespołu

1. Jakie trzy braki najczęściej opóźniają przekazanie sprawy do prawnika?
2. Czy większy koszt tworzą pominięte dane, nieprawidłowy odczyt czy ponowny przegląd po zmianie?
3. Kto zatwierdza pytania i wzory oraz jak ogłasza ich nową wersję?
4. Jak mierzycie jakość AI i koszt obsługi jednej sprawy?
5. Która integracja usunęłaby najwięcej przepisywania: CRM, magazyn dokumentów czy księgowość?

## Opcjonalny pokaz zmiany i wersji

Na osobnej nowej fikcyjnej sprawie utwórz projekt, a następnie dodaj wiadomość. Projekt zmieni się na nieaktualny. Nie zmieniaj przygotowanej S01 podczas głównego pokazu: pozostaw dostępne przykładowe pisma. Powiązanie cesji w S02 zmienia dane i wymaga nowego przeglądu; wykonuj je świadomie jako dodatkową część pokazu.
