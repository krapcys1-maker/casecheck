# Rozmowa z Szymonem Bazanem — przygotowanie z CaseCheck

Sprawdzenie publicznych materiałów: **3 października 2026**. Pełna historia profilu LinkedIn nie była dostępna. Wnioski oparto na dostępnej publicznej publikacji autora, oficjalnej stronie firmy, stronie produktu i ogłoszeniach. Nie mamy dostępu do kodu ani wnętrza LegalFlow.

## Co jest potwierdzone

Szymon Bazan jest przedstawiony jako founder i CEO Booster. Firma opisuje budowę oprogramowania B2B, automatyzacji AI oraz wdrożeń CRM i otwartych systemów. Deklaruje podejście obejmujące mapowanie procesu, porządkowanie danych, wdrożenie i dalszy rozwój. [Oficjalna strona Booster](https://boosterai.pl/).

W publicznym wpisie o LegalFlow Bazan wskazuje wywiad, gromadzenie danych, ich pochodzenie i potwierdzanie, wzory kancelarii oraz zgodę prawnika przed wydaniem pism. Opisuje przeciążenie administracją i ręczne przepisywanie wierzycieli. Jego cel zwiększenia liczby prowadzonych spraw jest deklaracją biznesową, a nie zmierzonym wynikiem CaseCheck. [Publiczna publikacja autora](https://pl.linkedin.com/posts/szymon-bazan_dzi%C5%9B-oficjalnie-pokazujemy-legalflow-to-activity-7511358580453998592-qqoz).

Strona LegalFlow prezentuje strefę klienta, dokumentację na wzorach kancelarii i obsługę własnych należności kancelarii. Wymienia integracje z otoczeniem kancelarii; bezpośrednią integrację z KRZ oznacza jako przygotowywaną. Wartości oszczędności na tej stronie są deklaracjami dostawcy, nie niezależnym benchmarkiem. [Oficjalny opis LegalFlow](https://restrukturyzacja.boosterai.pl/).

Na stronie kariery są role Head of Delivery oraz Full-Stack Engineer Junior/Mid. Opis inżynierski wymienia TypeScript, Next.js, Postgres, pracę z agentami AI i odpowiedzialność od schematu do wdrożenia. CaseCheck używa JavaScript/Node/SQLite, więc pokazuje obieg i wdrożenie, ale nie dokumentuje znajomości całego wymienionego stosu. [Oficjalna strona kariery](https://boosterai.pl/careers). Szczegółowe podstrony ról nie były dostępne podczas odczytu.

## Co może go zainteresować — wnioski z tych materiałów

Najmocniejsza propozycja to **kontrola jakości wejścia do procesu kancelarii**: od źródła przez przegląd do pakietu danych. CaseCheck może być przykładem wykonania takiego modułu. Warto przedstawić możliwość dopasowania do ich procesu, a następnie ustalić rzeczywistą potrzebę; z publicznego opisu nie wynika, że w ich systemie tego brakuje.

| Temat rozmowy | Konkretny dowód w CaseCheck | Pytanie, które ustala wartość |
|---|---|---|
| Mniej przepisywania i poprawek | 18 fikcyjnych spraw, rzeczywiste PDF-y, cytaty i wersje | Które informacje najczęściej trzeba poprawiać ręcznie? |
| Odpowiedzialność za wynik AI | Odrzucanie wadliwych odczytów, korekty, role i unieważnienie pisma po zmianie danych | Jak rozróżniacie błąd ekstrakcji, brak danych i decyzję prawną? |
| Włączenie modułu do istniejącego obiegu | Eksport v1 z potwierdzonymi wartościami, źródłami i blokadami | Jaki system ma być źródłem prawdy i jaki kontrakt przyjmuje? |
| Umiejętność doprowadzenia wdrożenia do działania | Publiczne repo, CI, prywatny stan, kopia z odtworzeniem, VPS i HTTPS | Jak wyglądają Wasze kryteria odbioru i utrzymanie po wdrożeniu? |
| Uczciwy pomiar jakości | Raport pokazujący również błędy modelu, testy regresji napraw | Czy macie anotowany zestaw danych i krytyczne pola odbiorowe? |

## Otwarcie rozmowy — około 40 sekund

„Zbudowałem CaseCheck: moduł przyjmowania spraw i kontroli danych z dokumentów, z przeglądem człowieka i wdrożeniem na VPS. Mogę pokazać, jak wykrywa różnicę sald, zachowuje źródła po cesji i unieważnia pismo po zmianie danych. Podczas testów znalazłem także błędy modelu i dodałem zabezpieczenia oraz raport. Chciałbym sprawdzić, czy taki moduł lub sposób testowania byłby użyteczny w Waszych wdrożeniach.”

Ten tekst opisuje projekt. W CV i rozmowie należy własnymi słowami wyjaśnić, co zrobiono z pomocą AI i które decyzje umie się obronić; nie deklarować samodzielnego napisania całości ani niezależnego przeglądu prawnego.

## Pokaz w 10 minut

1. **S01, 2 min:** klient deklaruje 120 tys. zł, dokumenty 110 tys. zł. Pokazać wspólną datę i różnicę, przejść do oryginalnego źródła. Wyjaśnić, kiedy system odmawia porównania.
2. **S02, 2 min:** dwa pisma, ta sama umowa, cesja. Pokazać wyłączenie z sumy i ręczne powiązanie. Decyzję demonstracyjną wykonywać na kopii fikcyjnej sprawy, żeby utrzymać powtarzalne demo.
3. **S04, 1 min:** odczyt kwoty i stanowisko klienta to osobne informacje. Wcześniejsza ręczna korekta poprzedniego wierzyciela pokazuje ograniczenie modelu.
4. **Wersja pisma, 2 min:** aktualny projekt i zatwierdzenie; na kopii dodać nową wiadomość i pokazać unieważnienie. Dodanie zwykłego zadania pozostawia zatwierdzenie.
5. **Pakiet JSON, 1 min:** potwierdzone dane, brakujące pola, cytaty, hashe i aktualne zatwierdzenia; wskazać miejsce przyszłego adaptera do CRM.
6. **Testy, 2 min:** pokazać CI oraz audyt. W próbie z API były porażki — istotne są ich wykrycie, ślad, poprawka i sposób ponownej weryfikacji.

Nie opierać całego spotkania na świeżym wywołaniu API. Zachowane przykłady pozwalają przejść obieg niezależnie od limitu, sieci i powtarzalności modelu. Szczegóły: [demo](DEMO.md), [audyt](AUDYT.md), [kontrakt eksportu](INTEGRACJA.md).

## Jak odpowiedzieć na trudne pytania

**„Czy to cały LegalFlow?”** Zakres CaseCheck obejmuje intake, dokumenty i przegląd. Pełne postępowanie, CRM, podpisy, automatyczna korespondencja i należności kancelarii to dalsze moduły. Porównanie opiera się na publicznym opisie; nie testowaliśmy ich produktu.

**„Jak dobra jest AI?”** 70 testów oprogramowania nie mierzy trafności modelu. Próba 7 dokumentów przed ostatnimi poprawkami ujawniła nieprecyzyjne cytaty i błąd stanowiska klienta. Potrzebny jest większy zamrożony zestaw; można pokazać rzeczywisty raport i konkretne zabezpieczenia.

**„Czy kancelaria może już wrzucić prawdziwe sprawy?”** Najpierw potrzebne są zatwierdzone pytania i wzory, ustalone zasady przetwarzania oraz niezależny przegląd. Demo korzysta z danych fikcyjnych. Konto testowe prawnika nie stanowi akceptacji kancelarii.

**„Ile oszczędzamy?”** Tego jeszcze nie zmierzono. Proponowany pilot porównuje czas ręcznego przygotowania i wspomaganego przeglądu tych samych dokumentów, razem z poprawkami i kosztem API. Nie wystarczy czas samej odpowiedzi modelu.

**„Dlaczego nie TypeScript/Next/Postgres?”** Obecny moduł ma mało zależności i prosty stan na jednym VPS. Dla ich produktu adaptacja wymaga ustalenia kontraktu, migracji danych i uprawnień; nie trzeba przenosić całej aplikacji, aby ocenić moduł.

## Propozycja małego pilotażu do uzgodnienia

Wybrać jeden rodzaj dokumentu i uzgodnić 100–200 przykładów z prawami do użycia. Prawnik i druga osoba niezależnie opisują kwoty, daty, wierzycieli, spory oraz braki; rozbieżności anotacji są rozstrzygane. Oddzielić zestaw rozwojowy i odbiorowy przed zmianami promptu. Testy obejmują skany, cesje, sprzeczne daty, nieczytelne cyfry i instrukcje w dokumentach.

Mierzyć: poprawność krytycznych pól, bezpodstawne znane wartości przy oczekiwanym `unknown`, poprawność cytatów, błąd/odmowę API, poprawki człowieka, czas całego przeglądu, koszt na dokument, izolację kancelarii i nieaktualne wersje. Uzgodnić progi przed próbą. W pierwszym odbiorze żadna niepotwierdzona wartość nie może przejść do danych oznaczonych jako potwierdzone.

Najlepszy kolejny krok na spotkaniu: wybrać jeden problem, odbiorcę pakietu i osobę zatwierdzającą. Ten dokument nie został wysłany Szymonowi ani firmie i nie rezerwuje spotkania.
