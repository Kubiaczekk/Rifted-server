# Rifted Server

Backend dla Rifted (konta, ogłoszenia LFD, wiadomości, reputacja, OTP championów, panel właściciela). Wygląd aplikacji jest osobno w `../rifted-desktop`.

## Uruchomienie lokalnie
1. Zainstaluj Node.js 22.5+ (https://nodejs.org) — baza SQLite jest wbudowana w Node.
2. `npm install`
3. `npm start` → serwer na http://localhost:3001 (test: http://localhost:3001/api/health)

Ustawienia (zmienne środowiskowe, wzór w `.env.example`): `PORT`, `JWT_SECRET` (**ustaw własny długi tekst na produkcji!**), `DB_PATH`, `CORS_ORIGIN`, `OWNER_USERNAME` (domyślnie `kubvss` — ten nick oraz konto o `id` 1 mają dostęp do `/api/admin/*`).

## API
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | /api/auth/register | `{username,password}` → `{user,token}` |
| POST | /api/auth/login | `{username,password}` → `{user,token}` |
| GET | /api/me | kto jest zalogowany (nagłówek `Authorization: Bearer <token>`) |
| POST | /api/presence | heartbeat zalogowanego. Zapisuje `last_seen` (czas serwera). |
| GET | /api/users | lista graczy (zalogowany): `{ users: [{ id, username, online, last_seen, is_owner }] }`. `online` jest prawdziwe, gdy heartbeat był w ciągu ostatnich 60 s. `is_owner` dla nicku `OWNER_USERNAME` (domyślnie `kubvss`) albo konta `id` 1. |
| GET | /api/lfd | lista ogłoszeń |
| POST | /api/lfd | `{role,rank,text}` (zalogowany) |
| DELETE | /api/lfd/:id | usuń swoje ogłoszenie |
| GET | /api/conversations | lista rozmów (rozmówca, ostatnia wiadomość) |
| GET/POST | /api/messages/:userId | wiadomości (stub, bez live) |
| GET | /api/users/:id | profil publiczny: `{ user: { id, username, created_at, plus, minus } }` |
| GET | /api/users/:id/rep | `{ plus, minus, mine }` — `mine` to `1`, `-1` albo `0` (przy nagłówku Bearer; bez tokenu `0`) |
| POST | /api/users/:id/rep | `{ value: 1 \| -1 }` (zalogowany). Nie można ocenić siebie. Kolejna ocena tej samej pary nadpisuje poprzednią. |
| GET | /api/champions/:championId/otp | publiczny proxy OTP z u.gg. `championId` to numer Riot (np. `103` = Ahri). Odpowiedź: `{ players: [{ nick, tag, region, tier, rank, lp, winRate, games, iconId }] }` — max 10, sortowanie po LP malejąco. Cache w pamięci 10 minut. Błąd upstream: `502`. |
| GET | /api/admin/overview | właściciel. `{ users: [{ id, username, created_at }], lfd: { posts }, messages: { count }, rep: { plus, minus } }` |
| GET | /api/admin/users | właściciel. `{ users: [{ id, username, created_at }] }` |
| DELETE | /api/admin/users/:id | właściciel. Nie można usunąć własnego konta. Kasuje też ogłoszenia, wiadomości i oceny tego gracza. |
| GET | /api/admin/lfd | właściciel. Lista ogłoszeń (do 500). |
| DELETE | /api/admin/lfd/:id | właściciel. Usuwa dowolne ogłoszenie. |

Właściciel to użytkownik o nicku z `OWNER_USERNAME` (domyślnie `kubvss`, bez rozróżniania wielkości liter) albo konto o `id` 1. Reszta dostaje `403`.

Błędy zawsze jako `{ "error": "komunikat po polsku" }`.

## Następne kroki (wrzucenie do internetu) — dla początkujących
1. **GitHub**: załóż konto na github.com i wrzuć tam folder `rifted-server` jako repozytorium.
2. **Hosting serwera — Railway** (railway.app) lub **Render** (render.com): zaloguj się przez GitHub → „New Project” → „Deploy from GitHub repo” → wybierz `rifted-server`. Start command: `npm start`.
3. **Zmienne**: w panelu hostingu dodaj `JWT_SECRET` (losowy długi tekst), `DB_PATH=/data/rifted.db` i ewentualnie `OWNER_USERNAME` (domyślnie `kubvss`).
4. **Dysk na bazę**: dodaj „Volume” (Railway) / „Disk” (Render) podpięty pod `/data` — inaczej baza znika przy każdym restarcie.
5. Dostaniesz adres typu `https://rifted-server.up.railway.app` — sprawdź `/api/health`.
6. **Podłączenie aplikacji**: w `rifted-desktop` zamienić lokalne zapisywanie (localStorage) na zapytania do tego adresu.
7. **Front**: `rifted-desktop` wrzucić na Vercel/Netlify (strona) i/lub zbudować instalator desktop (Electron/Tauri).
8. Później: czat na żywo (WebSocket), reset hasła mailem, przy większym ruchu przejście z SQLite na PostgreSQL.
