# Funkcje CaseCheck i zakres weryfikacji

Stan 3.10.2026. [Prezentacja 22 slajdy](../output/presentation/README.md), [instrukcja obsługi](OBSLUGA.md), [status kodu i wdrożenia](STATUS-PROJEKTU.md).

„Ręcznie” oznacza działania agenta w rzeczywistym interfejsie i czytanie wyników. Testy HTTP przechodzą przez działający serwer, ale nie są klikaniem ekranu. Weryfikacja kodu, ręczny przegląd i niezależna ocena prawna mają różny zakres. Nie deklarujemy bezbłędności dowolnego dokumentu ani wykonania każdej możliwej kombinacji działań.

| Funkcja | Działanie | Dowód i granica |
|---|---|---|
| Konta i role | Administrator, pracownik, prawnik, klient | Testy HTTP dostępu, ręczne sesje prawnika i klienta |
| Izolacja kancelarii | Rozdzielenie spraw i źródeł | Testy negatywnych uprawnień i wersji |
| Kartoteka | Wyszukiwanie, filtry, liczniki i etapy | Ręcznie: firma, otwarte zadanie, zniknięcie po wykonaniu |
| Wywiad | Konsument/firma, obszary i kolejne braki | Ręczna lektura, sześć scenariuszy HTTP |
| Rozmowa i przekazanie człowiekowi | Zapis bez AI lub odczyt wybranych informacji | Testy HTTP, ręczny obieg wiadomości klienta i zespołu |
| Upload | PDF, TXT, PNG/JPEG, oryginały i hashe | Ręczny portal, pliki i odczyty w odbiorze HTTP |
| Tekst PDF/TXT | Parser lokalny i źródła per strona | Odbiór na rzeczywistych plikach z fikcyjną treścią |
| AI przez API | Trzech dostawców, jawne źródła i zgoda | Historyczne rzeczywiste odpowiedzi, opis porażek; brak nowego modelu po ostatnich poprawkach |
| Odczyt hybrydowy | Reguły lokalne oraz pola dla API | Testy reguł, historyczny zestaw 200 krótkich tekstów |
| OCR | Cały wybrany plik do OpenAI, strony do przeglądu | Rzeczywiste wcześniejsze OCR S11/S12, ręczny widok i korekty |
| Fakty i źródła | Cytat, dokument, strona, typ, status | Ręczny przegląd S01/S02/S04 i sprawy brzegowej |
| Korekty | Nowa wartość lub jawne wycofanie, historia | Ręczny test wycofania adresu i restartu |
| Roszczenia | Wierzyciele, umowy, kwoty, daty i spór | Ręczna lektura i korekty, regresje semantyczne |
| Zależności pól | Nowy wierzyciel wycofuje stary adres | Ręczne trzy zmiany, kontrolowana częściowa odpowiedź AI |
| Kwoty i duplikaty | Waluty/daty osobno, porównanie i powiązanie | S01 różnica 10 tys., S02 cesja, testy HTTP |
| Wzory wbudowane | Pięć projektów pomocniczych | Pięć eksportów i pełna lektura wcześniej opisanych stron |
| Własne wzory | Sekcje, pola, wersje, akceptacja | Ręcznie: kilka wersji, zatwierdzenie, utrata aktualności pisma |
| Edycja i akceptacja pisma | Kontrola źródeł, treści i wersji | Ręczny pusty formularz, widoczny błąd, brak utraty treści |
| PDF/DOCX | Pobranie i wersja zatwierdzenia | Ręczne pobranie i obejrzenie obu końcowych plików |
| Portal | Wiadomości, prośby, odpowiedzi i pliki | Ręczny pełny obieg S01 z ponowieniem i przyjęciem |
| Wydanie pisma klientowi | Aktualny PDF i potwierdzenie odczytu | Ręczny portal i HTTP 409 dla nieaktualnej wersji |
| Zadania i zamknięcie | Osoba, termin, wykonanie i blokady | Ręczne utworzenie, blokada, wykonanie i zamknięcie |
| Terminy prawne | Ręczna podstawa i początek biegu | Testy uprawnień i dat; brak automatycznej oceny terminu |
| KRS / VAT | Publiczny odpis lub wynik wykazu | Ręczny rzeczywisty KRS, rzeczywisty testowy MF, błędny numer |
| Pakiet JSON | Dane po przeglądzie, źródła i blokady | Odbiór HTTP oraz raporty eksportów |
| Historia i odzyskiwanie | Audyt, zapis wyniku, powrót po awarii | Ręczny przycisk odzyskania, testy transakcji i restartu |
| Kopia i odtworzenie | Stan, pliki, wersje, licznik API | Odtworzenie w osobnej aplikacji i porównanie hashy |
| Limity i obsługa błędów | Trwała liczba wywołań, brak cichego ponawiania | Limit AI 20/20 zachowany, testy awarii i błędów HTTP |
| Baza pytań i wzorów | Wersja oraz akceptacja przez właściwą rolę | Ręczny odczyt panelu prawnika, test zmiany hasha |
| GitHub / CI | Kod, fixtures, raporty, testy Node 22/24 | Potwierdzone wykonania Actions podlinkowane w statusie |

Dokładne obserwacje: [korekty i eksporty](RECZNE-TESTY-KOREKT.md), [zadania i rejestry](REJESTRY-I-ZADANIA-PRZEGLAD.md), [portal](RECZNY-PRZEGLAD-PORTALU.md), [OCR](PRZEGLAD-OCR.md), [odzyskanie](ODZYSKIWANIE-WYNIKOW.md), [200 tekstów](RECZNY-PRZEGLAD-200.md).

Brakuje m.in. audio, importu dowolnego wzoru Word, podpisu elektronicznego, gotowego CRM/SharePoint/KSeF, pełnej obsługi postępowania i wyszukiwarki przepisów. Priorytety oraz warunki wykazania przewagi opisuje [porównanie z LegalFlow](POROWNANIE-LEGALFLOW.md).
