# Krótka instrukcja obsługi

Po audycie w podsumowaniu sprawy konto prawnika ma przycisk **Pobierz pakiet JSON**. Plik zawiera tylko potwierdzone wartości, źródła oraz listę braków i blokad. To przygotowanie do dalszej pracy; nie wysyła danych do zewnętrznego systemu. [Opis formatu](INTEGRACJA.md).

## Administrator

Zaloguj się kontem początkowym skonfigurowanym w prywatnym pliku środowiska. „Konta i wiedza” pozwala dodać pracownika lub prawnika oraz wyłączyć konto. Rola administratora sama nie pozwala zatwierdzać pism. Wyłączenie konta usuwa jego sesje; osoba nie będzie dostępna jako nowy wykonawca zadania.

„Wczytaj 18 testowych spraw” dodaje fikcyjne rozmowy i dokumenty. Ponowne kliknięcie pomija już zaimportowane scenariusze. Nie uruchamia AI. Katalog testów w repo zawiera także oczekiwane dane dla inżyniera; oczekiwania nie trafiają do API modelu.

## Przyjęcie sprawy

1. „Nowa sprawa”: nazwij sprawę, wybierz konsumenta lub firmę i właściwie oznacz charakter danych.
2. „Rozmowa”: wybierz obszar, wpisz odpowiedź i zdecyduj, czy uruchomić odczyt AI. Zapis bez AI zachowuje treść i kolejne pytanie; sam nie wyciąga wartości do kartoteki.
3. Wybierz dostawcę i zaakceptuj przekazanie wybranych danych, jeśli chcesz uruchomić AI. Wywołania zliczane są na dzień UTC. Zmiana dostawcy wymaga właściwej zgody dla sprawy.
4. „Załączniki”: dodaj PDF, tekst lub obraz. Odczyt tekstu jest lokalny. Pusty skan otrzyma status wymagający OCR. Osobny przycisk OCR wyświetla zakres przekazania całego pliku do OpenAI.
5. „Odczytaj roszczenie AI”: przejrzyj wysyłane fragmenty i uruchom ekstrakcję. „Dane” pozwala wybrać do pięciu pól z wiadomości na jeden odczyt.

## Przegląd przez zespół

Podsumowanie pokazuje uzupełnione pola, stan przeglądu, roszczenia, aktualne projekty i następne kroki. To liczniki techniczne, bez oceny prawnej gotowości sprawy. Filtry kartoteki pozwalają znaleźć odczyty do przeglądu, otwarte zadania i ścieżkę firmy/konsumenta.

W „Dane” sprawdź cytat i „Źródło”. „Uzupełnij / popraw” zapisuje nową wartość z własnym uzasadnieniem. Prawnik potwierdza odczyt albo odrzuca wartość. Dane nieznane i odrzucone nadal wymagają uzupełnienia.

W „Zobowiązania” sprawdź wierzyciela, numer umowy, walutę, saldo i datę oraz stanowisko klienta. Pismo wierzyciela nie dowodzi automatycznie braku sporu. Kwoty sumują się osobno dla każdej waluty i daty. Przy zgodnych numerach umów wybierz „Sprawdź i powiąż”, wskaż właściwy dokument i uzasadnij decyzję. Pozostałe źródła pozostają zachowane, a wybrana pozycja wraca do przeglądu.

## Projekty i zadania

Wybierz jeden z dostępnych wzorów. Prośba o wyjaśnienie roszczenia powstaje przy konkretnej pozycji wierzyciela; korzysta z jego zapisanego adresu, jeśli jest znany. Innych wierzycieli nie umieszcza się w tej prośbie.

„Przeczytaj” pokazuje zawartość. Edycja zapisuje nową wersję stanu sprawy i cofa przegląd pisma. Prawnik może zatwierdzić projekt po przeglądzie znanych danych i powiązaniu duplikatów. Brakujące informacje pozostają oznaczone. Aktualne pisma wyświetlają się na górze; „Poprzednie wersje” zawiera nieaktualne projekty. Pobierany PDF pokazuje charakter danych i stan projektu.

Zadanie przypisz do aktywnej osoby z listy. Termin administracyjny służy organizacji pracy. Termin prawny wymaga roli prawnika, podanej podstawy i potwierdzonego początku biegu; aplikacja nie oblicza go automatycznie. Zamknięcie sprawy wymaga prawnika oraz zakończenia otwartych zadań.

## Klient i rejestry

„Link dla klienta” tworzy dostęp na siedem dni do jednej sprawy. Przekaż go właściwej osobie. „Odwołaj linki” unieważnia wcześniejsze linki tej sprawy. Klient widzi rozmowę i własne załączniki, bez wewnętrznego przeglądu i zadań zespołu.

W ścieżce firmy „Rejestry” umożliwiają pobranie aktualnego odpisu KRS lub sprawdzenie wykazu VAT na podany dzień. Rejestr pomaga sprawdzić tożsamość podmiotu, nie ustala całej listy długów. Fikcyjne sprawy korzystają z testowego VAT MF.

## Typowe sytuacje

| Komunikat / stan | Działanie |
|---|---|
| Limit dzienny AI | Pracuj nad zadaniami i przeglądem istniejących wyników. Kolejna doba UTC otwiera budżet. |
| Sprawa zmieniła się w trakcie pracy | Panel odświeża aktualną wersję. Porównaj dane i wprowadź zmianę ponownie. |
| Błąd odczytu | Wiadomość/plik pozostają zapisane. Sprawdź status i ponów jawnie, jeśli potrzeba; błąd mógł zużyć budżet. |
| Odczyt OCR do sprawdzenia | Porównaj transkrypcję z oryginalnym obrazem. |
| Nieaktualny projekt | Przejrzyj zmienione dane i utwórz projekt na aktualnej wersji. |
| Rola prawnika wymagana | Przekaż czynność osobie z odpowiednią rolą. |

## Utrzymanie

[Instrukcja VPS](../deploy/APP.md) opisuje konfigurację HTTPS, aktualizację, backup i odtworzenie. Kluczy API i danych dostępu nie umieszcza się w repozytorium. Stan i załączniki są poza checkoutem. Kopie należy przechowywać prywatnie i objąć ustaloną retencją.
