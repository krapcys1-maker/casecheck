# Tymczasowy adres CaseCheck na stronie portfolio

Docelowy adres: `https://inproduction.dev/casecheck/`.

Stan przygotowania, 3 października 2026: **migracja nie została aktywowana**. Konto serwerowe `web` może sprawdzić i przeładować nginx, ale konfiguracja `/etc/nginx/sites-available/inproduction` należy do `root` i nie jest dla niego zapisywalna. Nie zmieniano uprawnień ani nie obchodzono tego ograniczenia.

## Przygotowane zmiany

- [Fragment nginx](nginx-casecheck-inproduction.conf) dodaje wyłącznie `/casecheck` i `/casecheck/` do istniejącego hosta HTTPS. Alias `www` kieruje panel do kanonicznego adresu.
- [Skrypt migracji](move-to-inproduction.py) pokazuje różnicę bez zmian przy uruchomieniu bez parametrów. Opcja `--apply` wymaga administratora serwera.
- Aplikacja zachowuje istniejącą usługę, port, kod, bazę, konta i załączniki. Zmienia się tylko `CASECHECK_PUBLIC_ORIGIN`.
- Stare trasy panelu na domenie astrologicznej otrzymują tymczasowe przekierowanie 307, zachowujące dalszą ścieżkę. Pozostałe trasy starej strony i kontaktu pozostają bez zmian.
- Pliki portfolio, jego menu, strona główna, pozostałe podstrony, certyfikaty i przekierowania HTTP nie są edytowane.

To przeniesienie obecnie wdrożonej wersji. Nie stanowi aktualizacji aplikacji do najnowszego kodu w repozytorium.

## Weryfikacja przed przeniesieniem

Wykonano i zweryfikowano prywatną kopię SQLite oraz 46 załączników na VPS. Kontrola publicznego panelu potwierdziła: logowanie, 18 spraw, zgodność SHA-256 wszystkich 46 plików źródłowych, działający eksport PDF, odmowę anonimowego API (401) i obcego origin (403). Sprawdzono odpowiedzi oraz hashe 10 adresów obu stron, w tym podstron portfolio, arkusza CSS i kontaktu. Nie wykonywano nowych wywołań AI.

Prywatne raporty znajdują się w `deploy/local/inproduction-migration/`; nie są publikowane. Próba przygotowania różnicy konfiguracji na VPS zakończyła się poprawnie. Składnia nginx dla nowej konfiguracji będzie sprawdzana podczas aktywacji, przed przeładowaniem usługi.

## Aktywacja przez administratora

Pliki zostały przygotowane w `/home/web/casecheck-migration/`. Na tym VPS, w sesji administratora:

```sh
sudo python3 /home/web/casecheck-migration/move-to-inproduction.py --apply
```

Skrypt najpierw sprawdza aktualny nginx, zapisuje prywatne kopie konfiguracji i env w nowym katalogu `/var/backups/casecheck-domain-*`, a potem sprawdza zmieniony nginx. Restartuje wyłącznie `casecheck-app` i przeładowuje nginx. Kontroluje HTTPS panelu oraz niezmienność plików i odpowiedzi stron. W razie błędu aktywacji przywraca wcześniejsze konfiguracje i origin oraz ponownie uruchamia wyłącznie aplikację i przeładowanie nginx. Nie instaluje pakietów i nie restartuje VPS.

Po aktywacji należy jeszcze sprawdzić przez nowy adres logowanie, wcześniejsze sprawy, wszystkie źródła, PDF i przekierowania. Dopiero po takim potwierdzeniu można oznaczyć migrację jako zakończoną oraz zmienić publiczne odnośniki do panelu. Istniejące sesje w przeglądarce korzystają z innego origin, więc użytkownik loguje się pod nowym adresem tymi samymi danymi.
