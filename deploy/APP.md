# Wdrożenie pilotażu przyjmowania spraw

Istniejący Node.js 22.18+, git, systemd użytkownika, reverse proxy nginx i osobno wskazana domena HTTPS. Brak npm nie wymaga apt: można użyć npm CLI z oficjalnego pakietu rejestru w prywatnym katalogu użytkownika. Zależności instaluj przez `npm ci` z lockfile; pakiety platformowe muszą odpowiadać VPS.

Checkout `~/casecheck`. Stan `~/casecheck-app-state` z prawami 700, poza repo. Konfiguracja `~/casecheck-app.env` z prawami 600 zawiera wyłącznie klucze wybranych dostawców i ustawienia aplikacji. Nie przenoś SMTP ani tokenu GitHub.

`CASECHECK_ADMIN_EMAIL` i `CASECHECK_ADMIN_PASSWORD` tworzą pierwsze konto na pustej bazie. Zmiana tych pól nie zmienia hasła istniejącego konta. Pozostałe pola: `CASECHECK_APP_PORT=8861`, `CASECHECK_APP_BASE_PATH=/casecheck`, `CASECHECK_APP_STATE_DIR=/home/web/casecheck-app-state`, `CASECHECK_PUBLIC_ORIGIN=https://wybrana-domena`, `CASECHECK_DAILY_REQUEST_LIMIT=20`.

Skopiuj [casecheck-app.service](casecheck-app.service) do `~/.config/systemd/user/`, wczytaj unity i uruchom tylko `casecheck-app`. Linger zapewnia działanie bez SSH.

```bash
systemctl --user daemon-reload
systemctl --user enable --now casecheck-app
curl -fsS http://127.0.0.1:8861/casecheck/healthz
```

Publiczny routing dodaje się do wskazanego vhosta HTTPS. Zachowaj kopię nginx, istniejące trasy i strony, sprawdź `nginx -t`, następnie wykonaj reload. Nie restartuj VPS ani innych usług.

Do czasu wskazania domeny usługę można sprawdzić przez tunel SSH:

```powershell
ssh -N -L 8862:127.0.0.1:8861 -i ~/.ssh/twoj_klucz web@twoj-vps
```

Panel serwera jest wtedy pod `http://127.0.0.1:8862/casecheck/`; konfiguracja origin musi odpowiadać temu adresowi. Transmisja do VPS jest tunelem SSH. Nie wystawiaj portu z samym HTTP na publicznym interfejsie.

## Kopia i odtworzenie

```bash
node scripts/backup.mjs create /home/web/casecheck-app-state /home/web/casecheck-backups/20261002-2100
node scripts/backup.mjs verify /home/web/casecheck-backups/20261002-2100
```

Kopia zawiera spójną migawkę SQLite i pliki wskazane w tej migawce, sprawdzane po hashach. Docelowy katalog ma nie istnieć. Przy błędzie kopiowania kopia jest niekompletna. Chroni ją ten sam poziom dostępu co dane spraw. Klucze API przechowuj osobno.

Odtworzenie najpierw sprawdź w osobnym katalogu: `verify`, logowanie, liczba spraw i odczyt załącznika. Następnie zatrzymaj wyłącznie `casecheck-app`, zachowaj stary stan, skopiuj bazę i `uploads/`, nadaj prawa i uruchom tę usługę. Nie kopiuj `app.lock` z innego procesu ani aktywnych plików WAL zamiast migawki.

Kopie mogą zawierać sprawę usuniętą później z aktywnej bazy. Ustal okres ich przechowywania dla rzeczywistych spraw. Aplikacja usuwa aktywną sprawę wraz z wersjami, linkami i plikami; nie usuwa kopii automatycznie. Administrator może usuwać przez `DELETE /api/cases/{id}` z nagłówkiem aktualnej wersji.

## Aktualizacja

Kopia, `git pull --ff-only`, `npm ci`, `npm test`, restart tylko `casecheck-app`. Sprawdź health, logowanie, kartotekę i wcześniejsze aplikacje. Migracje tworzą nowe tabele bez kasowania danych. Wycofanie kodu do poprzedniego commita; zmiana modelu danych wymaga dobrania zgodnej, sprawdzonej kopii.

Pilotaż nie ma automatycznej wysyłki poczty, składania pism ani procesowego kalkulatora terminów. Logi usługi zawierają bezpieczne komunikaty techniczne.
