# Współpraca przy CaseCheck

Pomysły, zgłoszenia błędów i propozycje zmian można dodawać przez GitHub Issues oraz pull requesty. W zgłoszeniu opisz oczekiwany wynik, rzeczywisty wynik i sposób odtworzenia na fikcyjnych danych.

Przed wysłaniem zmiany uruchom `npm test`. Testy lokalne i GitHub Actions nie potrzebują kluczy oraz nie wykonują płatnych wywołań AI. Runner `ai:smoke` wymaga własnych kluczy i świadomego uruchomienia.

Materiały testowe muszą być syntetyczne albo mieć wyraźne prawa do publikacji. Nie dodawaj rzeczywistych dokumentów klientów, danych osobowych, kluczy, pliku `.env` ani lokalnych raportów API do repozytorium lub zgłoszeń.

Kod i własna dokumentacja projektu są udostępnione na [licencji MIT](LICENSE). Zewnętrzne biblioteki, dane i materiały wskazane w researchu zachowują swoje odrębne warunki; sam link nie włącza ich do projektu.
