import express from 'express'; import cors from 'cors';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken';
import { db } from './db.js';
const SECRET = process.env.JWT_SECRET || 'dev-secret-zmien';
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' })); app.use(express.json({ limit: '100kb' }));
const err = (res, code, msg) => res.status(code).json({ error: msg });
const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!t) return err(res, 401, 'Musisz być zalogowany.');
  try { req.user = jwt.verify(t, SECRET); next(); } catch { err(res, 401, 'Sesja wygasła lub token jest nieprawidłowy. Zaloguj się ponownie.'); }
};
const tok = u => jwt.sign({ id: u.id, username: u.username }, SECRET, { expiresIn: '30d' });
const numId = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const OWNER_USERNAME = () => String(process.env.OWNER_USERNAME || 'kubvss');
const isOwner = u => !!u && (Number(u.id) === 1 || String(u.username).toLowerCase() === OWNER_USERNAME().toLowerCase());
const ownerOnly = (req, res, next) => { if (!isOwner(req.user)) return err(res, 403, 'Tylko właściciel ma dostęp.'); next(); };
const bearer = req => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!t) return null;
  try { return jwt.verify(t, SECRET); } catch { return false; }
};
const repOf = (toId, fromId = 0) => {
  const row = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN value=1 THEN 1 ELSE 0 END),0) AS plus,
    COALESCE(SUM(CASE WHEN value=-1 THEN 1 ELSE 0 END),0) AS minus
    FROM reps WHERE to_id=?`).get(toId);
  let mine = 0;
  if (fromId) { const m = db.prepare('SELECT value FROM reps WHERE from_id=? AND to_id=?').get(fromId, toId); if (m) mine = m.value; }
  return { plus: Number(row.plus), minus: Number(row.minus), mine };
};

const OTP_TTL = 10 * 60 * 1000;
const otpCache = new Map();
const OTP_QUERY = 'query($id:Int!){ getChampionOtpStats(championId:$id){ riotUserName riotTagLine regionId tier rank lp winRate gamesPlayed iconId } }';
const winPct = v => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const pct = n >= 0 && n <= 1 ? n * 100 : n;
  return Math.round(pct * 10) / 10;
};

app.get('/api/health', (_q, r) => r.json({ ok: true }));
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return err(res, 400, 'Podaj nazwę użytkownika i hasło.');
  if (!/^[\w.-]{3,20}$/.test(username)) return err(res, 400, 'Nazwa: 3–20 znaków (litery, cyfry, _ . -).');
  if (password.length < 6) return err(res, 400, 'Hasło musi mieć co najmniej 6 znaków.');
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return err(res, 409, 'Ta nazwa jest już zajęta.');
  const r = db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(username, bcrypt.hashSync(password, 10));
  const u = { id: Number(r.lastInsertRowid), username };
  res.status(201).json({ user: u, token: tok(u) });
});
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return err(res, 400, 'Podaj nazwę użytkownika i hasło.');
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return err(res, 401, 'Nieprawidłowa nazwa użytkownika lub hasło.');
  res.json({ user: { id: u.id, username: u.username }, token: tok(u) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.get('/api/users/:id/rep', (req, res) => {
  const id = numId(req.params.id);
  if (!id) return err(res, 400, 'Nieprawidłowy identyfikator użytkownika.');
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) return err(res, 404, 'Nie ma takiego użytkownika.');
  const who = bearer(req);
  if (who === false) return err(res, 401, 'Sesja wygasła lub token jest nieprawidłowy. Zaloguj się ponownie.');
  res.json(repOf(id, who ? who.id : 0));
});
app.post('/api/users/:id/rep', auth, (req, res) => {
  const id = numId(req.params.id);
  if (!id) return err(res, 400, 'Nieprawidłowy identyfikator użytkownika.');
  const { value } = req.body || {};
  if (value !== 1 && value !== -1) return err(res, 400, 'Ocena musi być 1 albo -1.');
  if (id === req.user.id) return err(res, 400, 'Nie możesz ocenić samego siebie.');
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) return err(res, 404, 'Nie ma takiego użytkownika.');
  db.prepare(`INSERT INTO reps(from_id,to_id,value) VALUES(?,?,?)
    ON CONFLICT(from_id,to_id) DO UPDATE SET value=excluded.value`).run(req.user.id, id, value);
  res.json(repOf(id, req.user.id));
});
app.get('/api/users/:id', (req, res) => {
  const id = numId(req.params.id);
  if (!id) return err(res, 400, 'Nieprawidłowy identyfikator użytkownika.');
  const u = db.prepare('SELECT id, username, created_at FROM users WHERE id=?').get(id);
  if (!u) return err(res, 404, 'Nie ma takiego użytkownika.');
  const { plus, minus } = repOf(id);
  res.json({ user: { ...u, plus, minus } });
});

// Poradniki: publiczny proxy na OTP / top graczy z u.gg (cache 10 min na championId)
app.get('/api/champions/:championId/otp', async (req, res) => {
  const id = numId(req.params.championId);
  if (!id) return err(res, 400, 'Nieprawidłowy identyfikator bohatera.');
  const hit = otpCache.get(id);
  if (hit && hit.exp > Date.now()) return res.json({ players: hit.players });
  try {
    const upstream = await fetch('https://u.gg/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://u.gg', Referer: 'https://u.gg/', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ query: OTP_QUERY, variables: { id } }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await upstream.json().catch(() => null);
    const raw = data?.data?.getChampionOtpStats;
    if (!upstream.ok || !Array.isArray(raw)) {
      console.error('u.gg OTP', upstream.status);
      return err(res, 502, 'Nie udało się pobrać statystyk OTP.');
    }
    const players = raw.map(p => ({
      nick: p.riotUserName ?? '', tag: p.riotTagLine ?? '', region: p.regionId ?? '',
      tier: p.tier ?? '', rank: p.rank ?? '', lp: Number(p.lp) || 0, winRate: winPct(p.winRate),
      games: Number(p.gamesPlayed) || 0, iconId: p.iconId ?? null,
    })).sort((a, b) => b.lp - a.lp).slice(0, 10);
    otpCache.set(id, { exp: Date.now() + OTP_TTL, players });
    res.json({ players });
  } catch (e) { console.error(e); err(res, 502, 'Nie udało się pobrać statystyk OTP.'); }
});

app.get('/api/admin/overview', auth, ownerOnly, (_q, res) => {
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY id').all();
  const lfd = Number(db.prepare('SELECT COUNT(*) AS n FROM lfd_posts').get().n);
  const messages = Number(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n);
  const rep = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN value=1 THEN 1 ELSE 0 END),0) AS plus,
    COALESCE(SUM(CASE WHEN value=-1 THEN 1 ELSE 0 END),0) AS minus FROM reps`).get();
  res.json({ users, lfd: { posts: lfd }, messages: { count: messages }, rep: { plus: Number(rep.plus), minus: Number(rep.minus) } });
});
app.get('/api/admin/users', auth, ownerOnly, (_q, res) => res.json({ users: db.prepare('SELECT id, username, created_at FROM users ORDER BY id').all() }));
app.delete('/api/admin/users/:id', auth, ownerOnly, (req, res) => {
  const id = numId(req.params.id);
  if (!id) return err(res, 400, 'Nieprawidłowy identyfikator użytkownika.');
  if (id === req.user.id) return err(res, 400, 'Nie możesz usunąć własnego konta.');
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) return err(res, 404, 'Nie ma takiego użytkownika.');
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM reps WHERE from_id=? OR to_id=?').run(id, id);
    db.prepare('DELETE FROM messages WHERE from_id=? OR to_id=?').run(id, id);
    db.prepare('DELETE FROM lfd_posts WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} console.error(e); return err(res, 500, 'Błąd serwera. Spróbuj ponownie później.'); }
  res.json({ ok: true });
});
app.get('/api/admin/lfd', auth, ownerOnly, (_q, res) => res.json({ posts: db.prepare(
  `SELECT p.*, u.username FROM lfd_posts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 500`).all() }));
app.delete('/api/admin/lfd/:id', auth, ownerOnly, (req, res) => {
  const id = numId(req.params.id);
  if (!id) return err(res, 400, 'Nieprawidłowy identyfikator ogłoszenia.');
  if (!db.prepare('SELECT 1 FROM lfd_posts WHERE id=?').get(id)) return err(res, 404, 'Nie znaleziono ogłoszenia.');
  db.prepare('DELETE FROM lfd_posts WHERE id=?').run(id);
  res.json({ ok: true });
});

app.get('/api/lfd', (_q, res) => res.json({ posts: db.prepare(
  `SELECT p.*, u.username FROM lfd_posts p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 100`).all() }));
app.post('/api/lfd', auth, (req, res) => {
  const { role = null, rank = null, text, extra = null } = req.body || {};
  if (!text || !String(text).trim()) return err(res, 400, 'Ogłoszenie nie może być puste.');
  if (String(text).length > 500) return err(res, 400, 'Ogłoszenie może mieć maks. 500 znaków.');
  const r = db.prepare('INSERT INTO lfd_posts(user_id,role,rank,text,extra) VALUES(?,?,?,?,?)').run(req.user.id, role, rank, String(text).trim(), extra ? JSON.stringify(extra).slice(0, 1000) : null);
  res.status(201).json({ post: db.prepare('SELECT * FROM lfd_posts WHERE id=?').get(r.lastInsertRowid) });
});
app.delete('/api/lfd/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM lfd_posts WHERE id=?').get(req.params.id);
  if (!p) return err(res, 404, 'Nie znaleziono ogłoszenia.');
  if (p.user_id !== req.user.id) return err(res, 403, 'Możesz usuwać tylko swoje ogłoszenia.');
  db.prepare('DELETE FROM lfd_posts WHERE id=?').run(p.id); res.json({ ok: true });
});

// Lista rozmów zalogowanego użytkownika (ostatnia wiadomość; brak flag przeczytania → bez unread)
app.get('/api/conversations', auth, (req, res) => res.json({ conversations: db.prepare(`
  SELECT c.other_id AS user_id, u.username, m.text AS last_text, m.created_at AS last_at, m.from_id = ? AS last_from_me
  FROM (SELECT CASE WHEN from_id=? THEN to_id ELSE from_id END AS other_id, MAX(id) AS last_id
        FROM messages WHERE from_id=? OR to_id=? GROUP BY other_id) c
  JOIN messages m ON m.id=c.last_id JOIN users u ON u.id=c.other_id
  ORDER BY c.last_id DESC LIMIT 100`).all(req.user.id, req.user.id, req.user.id, req.user.id)
  .map(r => ({ ...r, last_from_me: !!r.last_from_me })) }));

// Wiadomości – stub (bez czasu rzeczywistego; później WebSocket)
app.get('/api/messages/:userId', auth, (req, res) => res.json({ messages: db.prepare(
  `SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id LIMIT 200`)
  .all(req.user.id, req.params.userId, req.params.userId, req.user.id) }));
app.post('/api/messages/:userId', auth, (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return err(res, 400, 'Wiadomość nie może być pusta.');
  if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(req.params.userId)) return err(res, 404, 'Nie ma takiego użytkownika.');
  const r = db.prepare('INSERT INTO messages(from_id,to_id,text) VALUES(?,?,?)').run(req.user.id, req.params.userId, String(text).trim());
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.use((_q, res) => err(res, 404, 'Nie znaleziono.'));
app.use((e, _q, res, _n) => { if (e.type === 'entity.parse.failed') return err(res, 400, 'Nieprawidłowy JSON.'); console.error(e); err(res, 500, 'Błąd serwera. Spróbuj ponownie później.'); });
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Rifted server: http://localhost:${PORT}`));
