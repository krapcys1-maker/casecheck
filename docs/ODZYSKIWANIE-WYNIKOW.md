# Odzyskiwanie zapisanych odczytów

Jeśli AI lub OCR zwróci odpowiedź, ale końcowy zapis sprawy się nie powiedzie, CaseCheck zachowuje zweryfikowany wynik w prywatnej bazie. Zespół może zastosować go bez ponownego wywołania modelu, również po restarcie aplikacji.

## W panelu

1. Otwórz sprawę. Podsumowanie wskaże oczekujący zapis.
2. Przejdź do **Historia** i wybierz **Odzyskaj zapisany wynik**.
3. Sprawdź status odczytu i przejdź przez zwykły przegląd danych. Odzyskane fakty i roszczenia czekają na człowieka; OCR nadal wymaga porównania z obrazem.

Operacja jest dostępna dla administratora, pracownika i prawnika właściwej kancelarii. Link klienta nie pokazuje zapisów i nie pozwala ich odzyskiwać. API: `POST /casecheck/api/cases/{id}/recover-job`, obiekt z `revision` i `job_id`.

Jeżeli zmieniono dane sprawy, wynik zostaje oznaczony `discarded / STALE_CASE_VERSION`; nie nadpisuje korekty i nie unieważnia nowszego zatwierdzenia pisma. Zadanie administracyjne i zmiana etapu nie zmieniają wersji danych. Powtórzenie zakończonego odzyskania z aktualną wersją sprawy niczego nie dodaje.

## Trwałość i audyt

- Start odczytu i rezerwacja budżetu są jedną transakcją.
- Po walidacji wynik, oryginalne zadanie, wersja danych, czas i metadane trafiają do `job_results` w osobnej zatwierdzonej transakcji. Zapis ma SHA-256; nie zawiera klucza API ani nagłówków autoryzacji.
- Zastosowanie wyniku do sprawy, zapis wersji/audytu i usunięcie oczekującego zapisu zatwierdzają się razem. Awaria dowolnej części cofa całość, zachowując zapis do odzyskania.
- Restart oznacza trwające odczyty jako przerwane, wskazuje dostępność zapisu i zachowuje `data_revision`. Nie powtarza żądań modelu.
- Odzyskanie sprawdza hash, powiązanie z zadaniem, kontrakt odpowiedzi i wersję danych. W dzienniku zostają `job_result_recovered`, konto, czas oraz hash wyniku.
- Dopóki zapis czeka na obsługę, kolejny odczyt tej sprawy nie ruszy. Odzyskanie nie sprawdza klucza API, nie rezerwuje budżetu i nie kontaktuje się z dostawcą.
- Prywatna kopia SQLite obejmuje oczekujące wyniki. Usunięcie sprawy usuwa je przez klucz obcy; kopie podlegają osobnej retencji.

## Granice

Ochrona zaczyna się po zatwierdzeniu zapisu wyniku w SQLite. Całkowita awaria dysku lub zakończenie procesu przed tym zapisem nadal może zgubić odpowiedź. Nie da się obiecać dokładnie jednego naliczenia po stronie dostawcy, jeżeli przerwanie nastąpi, zanim aplikacja otrzyma i zapisze odpowiedź. Brak zapisu nie powoduje automatycznego ponowienia; nowy odczyt wymaga osobnej decyzji użytkownika.

Nieprawidłowy hash lub kontrakt blokuje odzyskanie i nie zmienia sprawy. Administrator powinien sprawdzić stan i kopię przed kolejnymi działaniami. Zapisane niepowodzenie API odzyskuje się jako niepowodzenie z metadanymi, bez ponownego wywołania.

## Dowód lokalny

[11 testów odzyskiwania](../tests/job-recovery.test.mjs) przechodzi, w tym rzeczywiste zakończenie procesu przez `process.exit(77)` po zatwierdzeniu zapisu, restart oraz odzyskanie z adapterem, który odrzuciłby nowe wywołanie. Cały zestaw: **98/98**, Node 24.13.0, 3 października 2026.

[Test całej aplikacji](acceptance-2026-10-03.json) potwierdził także odzyskanie rzeczywistej płatnej odpowiedzi Anthropic przez HTTP. Trigger SQLite wymusił awarię końcowego zapisu (`503`); odzyskanie zapisało roszczenie i audyt bez dodatkowej rezerwacji API. Zweryfikowano też kopię oraz odtworzenie oddzielnej aplikacji. To weryfikacja lokalna; aktualizacja VPS i nowe CI są odrębnym etapem.
