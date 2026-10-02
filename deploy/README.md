# Uruchomienie panelu testów na VPS

Panel udostępnia obecny moduł AI przez przeglądarkę. Obsługuje tylko syntetyczne scenariusze z repozytorium: nie przyjmuje plików klientów ani swobodnej treści. Pełny bot z wywiadem i bazą spraw pozostaje w [planie](../PLAN-PELNEGO-BOTA.md).

Wymagania: istniejący Node.js 22.12+, git, systemd użytkownika i istniejący nginx z HTTPS. Nie trzeba npm, Docker ani instalacji przez apt. Wszystkie wywołania AI wymagają długiego hasła dostępu; hasło pozostaje wyłącznie w pamięci otwartej strony, a klucze dostawców są po stronie serwera.

1. Pobierz repozytorium do `~/casecheck` i uruchom `node --test tests/*.test.mjs`.
2. Utwórz `~/casecheck.env` z prawami 600. Przenieś tylko klucze wybranych dostawców i ewentualne nazwy modeli z lokalnego `.env`. Nie kopiuj klucza GitHub ani danych SMTP.
3. Dodaj `CASECHECK_ACCESS_TOKEN` wygenerowany przez `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, `CASECHECK_PORT=8860`, `CASECHECK_BASE_PATH=/casecheck`, `CASECHECK_PUBLIC_ORIGIN=https://twoja-domena`, `CASECHECK_DAILY_REQUEST_LIMIT=20` oraz `CASECHECK_STATE_DIR=/home/twoj-user/casecheck-state`. Nie zapisuj wygenerowanego hasła w historii poleceń lub repozytorium.
4. Skopiuj [casecheck.service](casecheck.service) do `~/.config/systemd/user/`, wykonaj `systemctl --user daemon-reload` i `systemctl --user enable --now casecheck`. `linger` musi być włączony, żeby usługa działała bez sesji SSH.
5. Dopisz [fragment nginx](nginx-casecheck.conf) punktowo do właściwego vhosta HTTPS, zachowując istniejące trasy. Zrób kopię konfiguracji, uruchom `nginx -t`, dopiero potem przeładuj nginx. Nie zastępuj całego pliku i nie restartuj serwera.
6. Sprawdź `/casecheck/healthz`, odmowę nieautoryzowanego `/casecheck/api/config`, panel przez HTTPS i jedną próbę na fikcyjnych danych. Potwierdź także stan wcześniej działających aplikacji.

Serwer nasłuchuje tylko na `127.0.0.1:8860`. Jeden proces obsługuje najwyżej jedno wywołanie AI naraz. Licznik jest zapisany w prywatnym katalogu stanu przed żądaniem i zachowany po restarcie. Domyślny limit to 20 prób na dzień UTC; błędy API też zużywają próbę. Jest to limit żądań, nie kwotowy limit rachunku dostawcy. Limit obejmuje panel; oddzielny runner CLI ma własne ograniczenia.

Wyniki są zwracane do przeglądarki, bez zapisu treści odpowiedzi na serwerze. Trwały stan obejmuje tylko dzienny licznik. Nie uruchamiaj kilku procesów lub replik na tym samym katalogu stanu.

```bash
systemctl --user status casecheck --no-pager
systemctl --user restart casecheck
curl -fsS http://127.0.0.1:8860/casecheck/healthz
```

Aktualizacja: po `git pull --ff-only` wykonaj lokalne testy na VPS i restartuj wyłącznie usługę `casecheck`. Wycofanie: wróć do poprzedniego commita i restartuj tę usługę; przy problemie z routingiem przywróć kopię configu nginx, sprawdź `nginx -t` i przeładuj nginx. Sekrety i licznik znajdują się poza checkoutem.
