# Rifted Server

Backend dla Rifted (konta, ogłoszenia LFD, wiadomości). Wygląd aplikacji jest osobno w `../rifted-desktop`.

## Uruchomienie lokalnie
1. Zainstaluj Node.js 22.5+ (https://nodejs.org) — baza SQLite jest wbudowana w Node.
2. `npm install`
3. `npm start` → serwer na http://localhost:3001 (test: http://localhost:3001/api/health)

Ustawienia (zmienne środowiskowe, wzór w `.env.example`): `PORT`, `JWT_SECRET` (**ustaw własny długi tekst na produkcji!**), `DB_PATH`, `CORS_ORIGIN`.

## API
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | /api/auth/register | `{username,password}` → `{user,token}` |
| POST | /api/auth/login | `{username,password}` → `{user,token}` |
| GET | /api/me | kto jest zalogowany (nagłówek `Authorization: Bearer <token>`) |
| GET | /api/lfd | lista ogłoszeń |
| POST | /api/lfd | `{role,rank,text}` (zalogowany) |
| DELETE | /api/lfd/:id | usuń swoje ogłoszenie |
| GET/POST | /api/messages/:userId | wiadomości (stub, bez live) |

Błędy zawsze jako `{ "error": "komunikat po polsku" }`.

## Następne kroki (wrzucenie do internetu) — dla początkujących
1. **GitHub**: załóż konto na github.com i wrzuć tam folder `rifted-server` jako repozytorium.
2. **Hosting serwera — Railway** (railway.app) lub **Render** (render.com): zaloguj się przez GitHub → „New Project” → „Deploy from GitHub repo” → wybierz `rifted-server`. Start command: `npm start`.
3. **Zmienne**: w panelu hostingu dodaj `JWT_SECRET` (losowy długi tekst) i `DB_PATH=/data/rifted.db`.
4. **Dysk na bazę**: dodaj „Volume” (Railway) / „Disk” (Render) podpięty pod `/data` — inaczej baza znika przy każdym restarcie.
5. Dostaniesz adres typu `https://rifted-server.up.railway.app` — sprawdź `/api/health`.
6. **Podłączenie aplikacji**: w `rifted-desktop` zamienić lokalne zapisywanie (localStorage) na zapytania do tego adresu.
7. **Front**: `rifted-desktop` wrzucić na Vercel/Netlify (strona) i/lub zbudować instalator desktop (Electron/Tauri).
8. Później: czat na żywo (WebSocket), reset hasła mailem, przy większym ruchu przejście z SQLite na PostgreSQL.
