# Audyt CaseCheck — 3 października 2026

Projekt ma działający obieg od zgłoszenia do przeglądu i projektu PDF. Największa słabość dotyczy trafności odczytów AI: walidacja cytatów wykrywa część błędów, ale nie potwierdza znaczenia odczytanej informacji. Na rozmowę można pokazać działający moduł wraz z dowodami napraw; dopuszczenie rzeczywistych spraw wymaga osobnego pilotażu i przeglądu kancelarii.

Zakres: oba serwery, aplikacja HTTP, role i sesje, SQLite, wersje, upload i parser, OCR, adaptery rejestrów, kontrakt AI, interfejs, wzory, fixtures, kopie, CI i konfiguracja wdrożenia. To audyt kodu i testy funkcjonalne, bez niezależnego pentestu, certyfikacji RODO lub opinii prawnej.

## Naprawione problemy

Pierwsze siedem regresji odtworzono na wcześniejszym kodzie: **7/7 testów nie przeszło**. Po zmianach przechodzą. Dalsze testy sprawdzają granice transakcji, źródeł, zatwierdzeń i nowego eksportu.

| Problem i skutek | Zmiana | Dowód |
|---|---|---|
| Przycisk „kontakt z człowiekiem” nie rozpoznawał odmiany „człowiekiem / prawnikiem” | Jawne żądanie przejęcia, obsługa polskiej odmiany, jedno otwarte zadanie kontaktowe | HTTP: rzeczywista treść przycisku i powtórna prośba |
| Różnica wobec całej deklaracji była liczona z jednej grupy przy wielu datach lub walutach | Porównanie dopiero przy jednym wspólnym kontekście i bez wyłączonych pozycji; powód braku porównania | Różne daty, odrzucona deklaracja, granica bezpiecznego integera |
| Odrzucone dane wchodziły do nowych projektów; odrzucony wierzyciel nadal tworzył duplikat | Brak odrzuconych wartości w nowych pismach, brak odrzuconych roszczeń w sumach i parach; historia zostaje | Generator karty i blokada pisma do odrzuconego adresata |
| Nieprawidłowa data powodowała 500 | Walidacja daty bez wyjątku `RangeError`, także w rejestrach | HTTP 400 dla nieistniejących dat |
| Dodanie zadania podczas AI/OCR odrzucało poprawny wynik | Porównanie wersji danych; wersja operacyjna nadal chroni edycje | Odczyt i zadanie zachowane; późna odpowiedź nadal nie nadpisuje korekty |
| Nieudany odczyt unieważniał zatwierdzone pisma mimo braku nowych danych | Start i porażka zadania nie zmieniają wersji danych | Awaria AI zachowuje zatwierdzenie; rzeczywista zmiana danych je unieważnia |
| Częściowy odczyt gubił listę źródeł ręcznej korekty | Zachowanie źródeł i historii przy zastąpieniu roszczenia | Korekta wierzyciela pozostaje po odczycie adresu |
| Awaria zapisu startu zadania mogła zużyć rezerwację i zablokować AI | Rezerwacja i start w jednej transakcji; blokada dopiero po udanym zapisie | Wymuszony błąd SQLite: 0 wydanych rezerwacji, kolejne AI działa |
| Limit źródeł zostawiał upload/OCR jako działające | Jawny zapis niepowodzenia przed dodaniem stron | Granica 240 źródeł: brak częściowego zapisu i brak wiszącego zadania |
| Zatwierdzenie starej bazy wiedzy mogło autoryzować nowy zestaw pytań i pism | Sprawdzanie hasha aktualnego pakietu | Zmieniony pakiet wymaga nowej akceptacji, bez płatnego wywołania |

## Jakość odczytu — znalezione ograniczenie

[Raport próby API](quality-bench-2026-10-03.json) dokumentuje **7 wywołań i 49 zaplanowanych sprawdzeń pól** na faktycznie odczytanych tekstowych PDF-ach. Przed poprawkami cytowania trzy odpowiedzi zablokowano przez `INVALID_EVIDENCE`. Cztery przyjęte odpowiedzi pozwoliły sprawdzić 28 pól; 25 zgadzało się dokładnie z anotacjami. Dwa odstępstwa były formatowaniem nazw; jedno było błędem znaczenia — „brak stanowiska” odczytano jako „brak sporu”. Nie należy prezentować 25/28 jako ogólnej skuteczności bota. W próbie były tylko dwa przypadki oznaczone holdout, a anotacje są inżynierskie.

Dodane zabezpieczenia:

- Cytat z odmiennymi odstępami lub łamaniem linii można przypisać wyłącznie do jednego fragmentu źródła zgodnego znakami po ujednoliceniu białych znaków. W zapisie pozostaje **oryginalny, dosłowny fragment**, z hashami zmiany. Inne liczby, słowa, znaki i niejednoznaczne dopasowania nadal są odrzucane.
- `unknown` bez cytatu nie udaje źródła. Usuwane jest tylko puste odwołanie; żadna znana wartość nie może stracić wymaganego dowodu.
- `disputed=false` bez obsługiwanej jawnej wypowiedzi o braku sporu wraca do `unknown`. Reguła jest zachowawcza: inne poprawne sformułowania mogą wymagać ręcznej korekty.
- Poprzedni wierzyciel wymaga kontekstu poprzednika lub przelewu. To filtr częstego błędu, nie potwierdzenie następstwa prawnego.
- Nazwy mogą mieć ujednolicone odstępy; źródła i cytaty pozostają oryginalne. Odczyty nadal czekają na człowieka.

Te poprawki przeszły testy bez API, w tym zakaz naprawiania innej kwoty i niejednoznacznego cytatu. **Końcowej wersji nie zmierzono ponownie w pełnej próbie API**: wykorzystano 9/9 rezerwacji osobnego runnera na dzień UTC, wliczając dwie wcześniejsze próby diagnostyczne. Raport nie przypisuje późniejszym poprawkom niezmierzonej skuteczności. Limit aplikacji na VPS jest odrębny: 20/dzień.

## Nowy element do pokazania

[Pakiet danych po przeglądzie](INTEGRACJA.md) jest dostępnym dla prawnika eksportem JSON. Oddziela potwierdzone dane od blokad i braków, zachowuje cytaty, strony, hashe oryginalnych plików, wersję danych oraz aktualne zatwierdzenia pism. To konkretny punkt podłączenia do CRM lub obiegu kancelarii; eksport nie wysyła danych automatycznie.

## Pozostałe słabe punkty i kolejność rozwoju

| Priorytet | Ograniczenie | Następny krok i kryterium odbioru |
|---|---|---|
| P0: przed realnymi sprawami | Brak niezależnej oceny wzorów, procesu i danych | Prawnik kancelarii sprawdza pytania, pisma i zakazy działania; akceptacja konkretnego pakietu z hashem |
| P0 | Mała, syntetyczna próba nie określa trafności AI/OCR | 100–200 dokumentów z prawami do użycia, podwójne anotacje; osobno kwoty, daty, role wierzycieli, spory i unknown; zamrożony test bez zmieniania promptu pod wyniki |
| P0 | Same cytaty nie potwierdzają semantyki; reguły językowe są niepełne | Przegląd każdego odczytu, testy kontrprzykładów; zero bezpodstawnych potwierdzeń w zestawie odbiorowym |
| P0 | Konta bez MFA/SSO i samodzielnego odzyskiwania hasła; link klienta jest tokenem dostępu | OIDC/SSO, MFA, rotacja i unieważnianie sesji, link związany z adresatem; test całej macierzy uprawnień |
| P0 | Zewnętrzne API i backupy wymagają zasad kancelarii | Uzgodniona podstawa i informacja o przetwarzaniu, umowy, dostawcy/regiony/retencja; szyfrowana kopia poza VPS i sprawdzone odtworzenie |
| P1 | Wywiad wybiera do pięciu pól i ostatnie trzy wiadomości; długie rozmowy mogą gubić kontekst | Jawny stan wywiadu i podsumowanie potwierdzone przez klienta; test korekty po kilkunastu turach |
| P1 | Duplikaty opierają się na równych numerach umów | Kandydaci uwzględniają podmioty i cesję, różne faktury o tym samym numerze, aliasy; zawsze decyzja człowieka |
| P1 | Jedno AI naraz, pełne JSON-y spraw i kopie każdej wersji | Paginacja, znormalizowane metadane, kolejka i idempotencja; pomiar na 100/1000 spraw, bez zgadywania wydajności |
| P1 | Brak pomiaru rzeczywistej oszczędności i kosztu pieniężnego | Zmierzyć ręczny i wspomagany przegląd tych samych dokumentów, medianę/p95, czas poprawek i koszt tokenów; limit liczby wywołań nie jest limitem rachunku |
| P1 | Przy udanym wywołaniu, ale awarii końcowego zapisu, możliwa utrata wyniku | Trwałe zapisanie odpowiedzi przed zastosowaniem i odzyskiwanie bez powtórnego wywołania; test crash/restart |
| P1 | OCR wymaga porównania z obrazem; 5 stron/3 MB | Zatwierdzanie transkrypcji per strona, rozbieżności cyfr, mieszane PDF-y i wiele stron; osobne miary OCR i ekstrakcji |
| P1 | Wspólny limit logowania może utrudnić dostęp innym kontom | Limity per źródło/konto w zaufanym reverse proxy, alerty; test blokady bez ujawniania istnienia konta |
| P2 | Wzory są stałe i nie obejmują pełnego cyklu postępowania | Import zatwierdzonych wzorów kancelarii, DOCX i mapa wymaganych pól; wersje i test aktualizacji |
| P2 | KRS/VAT są osobnymi sprawdzeniami; brak wdrożonych CRM/SharePoint/KRZ/podpisu | Pierwszy adapter do uzgodnionego systemu na pakiecie v1; kontrakt, odbiorca, ponowienia i audyt transmisji |

`npm audit --omit=dev` w dniu audytu: **0 zgłoszonych podatności** w zainstalowanych zależnościach. Nie oznacza to braku nieznanych luk. Dla produkcji potrzebne są również testy obciążenia, przegląd konfiguracji dostawców i niezależny test bezpieczeństwa.

## Jak to teraz sprawdzać

1. `npm ci && npm test` — regresje, izolacja, role, race conditions, pliki, kopie, eksport, cytaty i semantyczne filtry; bez API.
2. `npm run ai:bench` — plan 7 syntetycznych dokumentów, bez wywołań. `node scripts/quality-bench.mjs --run` — płatna próba, maksymalnie 9 prób/dzień UTC w osobnej trwałej bazie, bez automatycznego ponowienia.
3. [Demo](DEMO.md): S01 różnica → źródła → zadanie → pismo; S02 ręczne powiązanie; S04 odczyt sporu; pakiet JSON pokazuje braki i blokady.
4. Po wdrożeniu: logowanie, izolacja, hash oryginalnego pliku, PDF zatwierdzonej wersji, eksport i brak zmiany istniejącej strony/formularza.
