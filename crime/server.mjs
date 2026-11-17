// Servidor do jogo de crime (vida sem rondas: um mundo só, com épocas de 28 dias).
// API JSON em 127.0.0.1:PORT; o Caddy serve o site e envia /api/* para aqui.
// Estado em SQLite (node:sqlite). O Node trata um pedido de cada vez, por isso cada ação é atómica.

import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { CFG, T } from './engine/config.js';
import * as E from './engine/engine.js';
import { cryptoRng, seededRng } from './engine/rng.js';
import { localParts, lisbonToUtc, seasonAt, seasonBounds } from './engine/time.js';
import * as MW from './engine/mundo.js';
import * as GV from './engine/governo.js';
import * as NW from './engine/noticias.js';

const PORT = +(process.env.PORT || 3170);
const DATA = process.env.DATA || process.env.STATE_DIRECTORY || './dados';
const STATIC = process.env.STATIC || '';           // só para testes locais
const SECURE = process.env.COOKIE_INSEGURO ? '' : '; Secure';
// O mundo é um só e não acaba (base nova, 16/11/2026). As tabelas continuam com a coluna «ronda»: as rondas antigas
// (0, 1, …) ficam lá guardadas e o mundo permanente é a «ronda» MUNDO. O mundo começa no dia em que esta versão arranca
// pela primeira vez (PRIMEIRA_RONDA=AAAA-MM-DD põe-no às 21:00 desse dia, para testes).
const MUNDO = 1000, FIM = Number.MAX_SAFE_INTEGER;
const dataDe = (x) => { const [y, m, d] = x.split('-').map(Number); return { y, m, d }; };
const RONDA_TESTE = process.env.PRIMEIRA_RONDA ? dataDe(process.env.PRIMEIRA_RONDA) : null;
// Épocas de 28 dias a contar da sexta 13/11/2026 às 21:00 de Lisboa (PRIMEIRA_EPOCA=AAAA-MM-DD muda-a, para testes)
const ANCORA = dataDe(process.env.PRIMEIRA_EPOCA || process.env.PRIMEIRA_RONDA || '2026-11-13');
const rng = process.env.TESTE_SEMENTE ? seededRng(+process.env.TESTE_SEMENTE) : cryptoRng();   // nos testes, a sorte pode ser sempre a mesma
const VERSAO = 88;   // sobe quando o servidor muda, para se confirmar de fora que a versão nova já está a correr
const ATOS_3S = +(process.env.ATOS_3S || 15), ATOS_MIN = +(process.env.ATOS_MIN || 400); // ações por conta: 15 em 3 s, 400 por minuto

// ---------- relógio que nunca anda para trás ----------
let lastNow = 0;
const clock = () => { const t = Date.now(); lastNow = Math.max(lastNow, t); return lastNow; };

// ---------- base de dados ----------
mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(join(DATA, 'jogo.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS contas (id TEXT PRIMARY KEY, nome TEXT NOT NULL, nome_lc TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL, criada INTEGER NOT NULL, lingua TEXT NOT NULL DEFAULT 'en');
CREATE TABLE IF NOT EXISTS sessoes (hash TEXT PRIMARY KEY, conta TEXT NOT NULL, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jogadores (ronda INTEGER NOT NULL, conta TEXT NOT NULL, estado TEXT NOT NULL,
  atualizado INTEGER NOT NULL, PRIMARY KEY (ronda, conta));
CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, conta TEXT NOT NULL, t INTEGER NOT NULL, dados TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS eventos_conta ON eventos (conta, id);
CREATE TABLE IF NOT EXISTS noticias (id INTEGER PRIMARY KEY AUTOINCREMENT, ronda INTEGER NOT NULL, t INTEGER NOT NULL, dados TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS noticias_ronda ON noticias (ronda, id);
CREATE TABLE IF NOT EXISTS diario (ronda INTEGER NOT NULL, dia TEXT NOT NULL, conta TEXT NOT NULL,
  resp INTEGER NOT NULL DEFAULT 0, crimes INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, busts INTEGER NOT NULL DEFAULT 0,
  money INTEGER NOT NULL DEFAULT 0, best INTEGER NOT NULL DEFAULT 0, beaten INTEGER NOT NULL DEFAULT 0, mugged INTEGER NOT NULL DEFAULT 0,
  mugloss INTEGER NOT NULL DEFAULT 0, fights INTEGER NOT NULL DEFAULT 0, sick INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ronda, dia, conta));
`);
// caixa do jogo: quanto dinheiro entrou e saiu, por dia de Lisboa e por fonte (o que cada ação deu ou tirou a quem a fez,
// e a quem a sofreu). Serve para ver de onde vem e para onde vai o dinheiro, e afinar a economia com números reais.
db.exec(`CREATE TABLE IF NOT EXISTS caixa (dia TEXT NOT NULL, fonte TEXT NOT NULL, entra INTEGER NOT NULL DEFAULT 0, sai INTEGER NOT NULL DEFAULT 0,
  n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, fonte))`);
// colunas novas em bases de dados que já existiam
try { db.exec('ALTER TABLE contas ADD COLUMN email TEXT'); } catch { /* já existe */ }
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS contas_email ON contas(email) WHERE email IS NOT NULL');   // um email, uma conta (guardado em minúsculas)
for (const col of ['cwin', 'cnet']) { try { db.exec(`ALTER TABLE diario ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`); } catch { /* já existe */ } }
const q = {
  contaPorNome: db.prepare('SELECT id, nome, nome_lc, hash, criada, lingua FROM contas WHERE nome_lc = ?'),   // sem o email: esse nunca entra num pedido
  contaPorId: db.prepare('SELECT id, nome, lingua, criada FROM contas WHERE id = ?'),
  novaConta: db.prepare('INSERT INTO contas (id, nome, nome_lc, hash, criada, lingua, email) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  contaPorEmail: db.prepare('SELECT id FROM contas WHERE email = ?'),
  lingua: db.prepare('UPDATE contas SET lingua = ? WHERE id = ?'),
  novaSessao: db.prepare('INSERT INTO sessoes (hash, conta, expira) VALUES (?, ?, ?)'),
  sessao: db.prepare('SELECT conta, expira FROM sessoes WHERE hash = ?'),
  apagarSessao: db.prepare('DELETE FROM sessoes WHERE hash = ?'),
  limparSessoes: db.prepare('DELETE FROM sessoes WHERE expira < ?'),
  guardar: db.prepare('INSERT OR REPLACE INTO jogadores (ronda, conta, estado, atualizado) VALUES (?, ?, ?, ?)'),
  daRonda: db.prepare('SELECT conta, estado FROM jogadores WHERE ronda = ?'),
  novoEvento: db.prepare('INSERT INTO eventos (conta, t, dados) VALUES (?, ?, ?)'),
  eventos: db.prepare('SELECT id, t, dados FROM eventos WHERE conta = ? ORDER BY id DESC LIMIT 30'),
  limparEventos: db.prepare('DELETE FROM eventos WHERE t < ?'),
  novaNoticia: db.prepare('INSERT INTO noticias (ronda, t, dados) VALUES (?, ?, ?)'),
  noticias: db.prepare('SELECT t, dados FROM noticias WHERE ronda = ? ORDER BY id DESC LIMIT 40'),
  diario: db.prepare(`INSERT INTO diario (ronda, dia, conta, resp, crimes, wins, busts, money, best, beaten, mugged, mugloss, fights, sick, cwin, cnet)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (ronda, dia, conta) DO UPDATE SET cwin = max(cwin, excluded.cwin), cnet = cnet + excluded.cnet,
    resp = resp + excluded.resp, crimes = crimes + excluded.crimes, wins = wins + excluded.wins, busts = busts + excluded.busts,
    money = money + excluded.money, best = max(best, excluded.best), beaten = beaten + excluded.beaten, mugged = mugged + excluded.mugged,
    mugloss = mugloss + excluded.mugloss, fights = fights + excluded.fights, sick = sick + excluded.sick RETURNING *`),   // v77: devolve o dia todo, para as manchetes
  doDia: db.prepare('SELECT * FROM diario WHERE ronda = ? AND dia = ?'),
  meuDia: db.prepare('SELECT * FROM diario WHERE ronda = ? AND dia = ? AND conta = ?'),
  caixa: db.prepare(`INSERT INTO caixa (dia, fonte, entra, sai, n) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (dia, fonte) DO UPDATE SET entra = entra + excluded.entra, sai = sai + excluded.sai, n = n + 1`),
  limparNoticias: db.prepare('DELETE FROM noticias WHERE t < ?'),
};

// ---------- estado do jogador (Map <-> JSON) ----------
const toJson = (p) => JSON.stringify(p, (k, v) => (v instanceof Map ? { __map: [...v] } : v));
const fromJson = (s) => JSON.parse(s, (k, v) => (v && v.__map ? new Map(v.__map) : v));

// ---------- jornal da cidade ----------
// última hora: o que os jogadores fazem, guardado na base de dados (sobrevive a reinícios)
const jornal = [];
// v77: a última hora tem um travão por categoria (engine/noticias.js): com muita gente passam só as maiores, ao mesmo ritmo
const SEM_TRAVAO = new Set(['season', 'stockBust']);
const nw = () => (bolsa && bolsa.w ? NW.newsUp(bolsa.w) : null);
function noticia(now, o) {
  const s = nw();
  if (s && !SEM_TRAVAO.has(o.k)) { const ok = NW.livePass(s, o.k, o.money || 0, now); bolsaSuja = true; if (!ok) { if (process.env.DBG_NEWS) console.error('travão', o.k, o.money); return; } }
  const e = { t: now, ...o };
  jornal.push(e); if (jornal.length > 40) jornal.shift();
  q.novaNoticia.run(ronda, now, JSON.stringify(o));
}
const ultimas = () => jornal.slice(-20).reverse();
// tudo o que tem valor entra nas contas do jornal (o que é normal, e as 3 maiores da edição); a última hora só a partir do mínimo
function amostra(now, cat, v, item, o) {
  if (!(v > 0)) return;
  if (o && v >= CFG.news.cats[cat].min) noticia(now, o);   // primeiro a última hora (medida contra o que já se sabia), depois as contas
  const s = nw(); if (s) { NW.sample(s, cat, v, item); bolsaSuja = true; }   // sem o mundo carregado (raro), fica só a última hora
}
const casinoNet = (r) => (r.g === 'slot' ? Math.trunc((r.winC - r.betC) / 100) : r.win - (r.g === 'bj' ? r.hand.bet : r.bet));   // slots: ao cêntimo; contas e jornal em euros inteiros
function noticiar(now, a, r, p, alvo) {
  const name = nomeDe(p.id), k = int(a.k);
  if (a.type === 'casino' && (r.g !== 'bj' || r.done)) {
    const net = casinoNet(r);
    if (net > 0) amostra(now, 'casino', net, { name, g: r.g }, { k: 'casino', name, g: r.g, money: net });
    else if (net < 0) amostra(now, 'casinoLoss', -net, { name, g: r.g }, { k: 'casinoLoss', name, g: r.g, money: -net });
  }
  // golpes de rua: o jornal fala das sortes grandes (2 000 € ou mais num só golpe), das séries cheias e de quem é apanhado nos assaltos
  // (desde o passo 4 conta o valor todo do que se levou, dinheiro e objetos)
  // v77: todos os golpes contam para o que é normal; o jornal fala dos que passam o mínimo e o triplo da mediana
  const spree = a.type === 'crimeAll' && r.wins >= 10 && (r.value || 0) > 0;
  if (spree) amostra(now, 'spree', r.value, { name, c: k, n: r.n }, { k: 'spree', name, c: k, n: r.n, money: r.value });
  if (a.type === 'crime' || a.type === 'crimeAll') {
    const job = a.type === 'crimeAll' ? { ok: r.wins > 0, money: r.best } : { ok: r.success, money: r.value };
    if (job.ok) amostra(now, 'job', job.money, { name, c: k }, spree ? null : { k: 'job', name, c: k, money: job.money });
  }
  if ((a.type === 'crime' || a.type === 'crimeAll') && r.busted && k >= 3) noticia(now, { k: 'jail', name, c: k });
  if (a.type === 'opGo') {
    const o = CFG.ops[r.i].id;
    if (r.success) amostra(now, 'op', r.money, { name, o }, { k: 'op', name, o, money: r.money });
    if (r.busted || r.linked) noticia(now, { k: 'opJail', name, o });
  }
  if (a.type === 'jailEscape' && r.free) noticia(now, { k: 'escape', name });
  if (a.type === 'classChange') noticia(now, { k: 'cls', name, from: r.from, to: r.cls });
  if (a.type === 'stockSell' && r.profit) { const kk = r.profit > 0 ? 'stockWin' : 'stockLoss', co = CFG.stocks.list[r.k].id; amostra(now, kk, Math.abs(r.profit), { name, co }, { k: kk, name, c: co, money: Math.abs(r.profit) }); }
  if (a.type === 'airCollect') { const to = CFG.air.routes[r.r].id; if (r.seized) amostra(now, 'airLost', r.amount, { name, to }, { k: 'airLost', name, to, money: r.amount }); else amostra(now, 'air', r.got - r.amount, { name, to }, { k: 'air', name, to, money: r.got - r.amount }); }
  if (a.type === 'house') noticia(now, { k: 'house', name, h: p.house });
  else if (a.type === 'luxury') noticia(now, { k: 'lux', name, i: p.luxuries - 1 });
  else if ((a.type === 'hooker' || a.type === 'broVisit') && r.sick) noticia(now, { k: 'sick', name });
  else if (a.type === 'venueBuy' && r.lvl === 1) noticia(now, { k: 'venue', name, v: r.kind });
  else if (a.type === 'attack') {
    const b = nomeDe(alvo.id);
    if (r.win && r.mode === 'mug') { if (r.money > 0) amostra(now, 'mug', r.money, { name, target: b }, { k: 'mug', name, target: b, money: r.money }); }
    else if (r.win) noticia(now, { k: 'beat', name, target: b });
    else noticia(now, { k: 'fail', name, target: b });
  }
  // com 100 níveis, o jornal só fala de quem muda de título (de 5 em 5 níveis)
  if (r.levelUp && r.levelUp.to >= 6 && Math.floor((r.levelUp.to - 1) / 5) > Math.floor((r.levelUp.from - 1) / 5)) noticia(now, { k: 'lvl', name, n: r.levelUp.to });
}

// manchetes: contas do dia de cada jogador (dia de Lisboa), para «o mais procurado», «saco de pancada», etc.
const diaDe = (t) => { const d = localParts(t); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; };
const ontemDe = (t) => { const d = localParts(t); const x = new Date(Date.UTC(d.y, d.m - 1, d.d - 1)); return x.toISOString().slice(0, 10); };
// regista no caixa o que entrou (entra) e saiu (sai) de uma fonte; uma linha por dia e por fonte
function caixa(now, fonte, entra, sai) {
  if (!(entra > 0) && !(sai > 0)) return;
  q.caixa.run(diaDe(now), fonte, Math.max(0, entra | 0), Math.max(0, sai | 0));
}
const dinheiro = (x) => x.cash + x.bank;
function contarDia(now, conta, v) {
  const dia = diaDe(now);
  const row = q.diario.get(ronda, dia, conta, v.resp || 0, v.crimes || 0, v.wins || 0, v.busts || 0, v.money || 0, v.best || 0,
    v.beaten || 0, v.mugged || 0, v.mugloss || 0, v.fights || 0, v.sick || 0, v.cwin || 0, v.cnet || 0);
  const T = topDia.get(dia); if (T && row) noTopo(T, row);   // v77: os melhores do dia vão-se sabendo sem ler a tabela toda
  if (row) { meusDias.set(conta, row); if (meusDias.size > 5000) meusDias.delete(meusDias.keys().next().value); }
}
function contarAcao(now, a, r, p, alvo, resp0, alvoResp0) {
  const v = { resp: p.respect - resp0 };
  if (a.type === 'crime') Object.assign(v, { crimes: 1, wins: r.success ? 1 : 0, busts: r.busted ? 1 : 0, money: r.success ? r.value : 0, best: r.success ? r.value : 0 });
  else if (a.type === 'crimeAll') Object.assign(v, { crimes: r.n, wins: r.wins, busts: r.busted ? 1 : 0, money: r.value || 0, best: r.best });
  else if (a.type === 'opGo') Object.assign(v, { crimes: 1, wins: r.success ? 1 : 0, busts: r.busted || r.linked ? 1 : 0, money: r.success ? r.money : 0, best: r.success ? r.money : 0 });
  else if ((a.type === 'hooker' || a.type === 'broVisit') && r.sick) v.sick = 1;
  else if (a.type === 'casino' && (r.g !== 'bj' || r.done)) { const net = casinoNet(r); v.cnet = net; v.cwin = Math.max(0, net); }
  else if (a.type === 'attack') {
    if (r.win) v.fights = 1; else v.beaten = 1;
    const w = { resp: alvo.respect - alvoResp0 };
    if (r.win && r.mode === 'mug') Object.assign(w, { mugged: 1, mugloss: r.money }); else if (r.win) w.beaten = 1;
    contarDia(now, alvo.id, w);
  }
  if (Object.values(v).some((x) => x)) contarDia(now, p.id, v);
}
// mundo ligado: a stamina gasta na rua conta para a criminalidade de Lisboa; o dinheiro gasto conta para a receita da empresa do ramo
const GASTO = { detox: 'farma', cure: 'farma', medic: 'farma', medicFor: 'farma', buy: 'armas', gear: 'armas', repair: 'armas',
  refill: 'noite', drug: 'noite', hooker: 'noite', broVisit: 'noite', clubBuy: 'noite', broVisitAt: 'noite', clubBuyAt: 'noite' };
// a droga comprada, vendida, desembarcada ou mudada de região conta para a criminalidade dessa região (1 ponto por cada 20 €)
const MEXE_MUNDO = new Set(['stockBuy', 'stockSell', 'mktBuy', 'mktSell', 'stockDump', 'mvSend', 'portOpen', 'collect', 'airCollect']);
const pontos = (r, v) => { if (r && v > 0) mundoAcc(r, v / CFG.regions.ptsEur); };
function contarMundo(a, r, delta, p) {
  // v76: conta quem jogou nesta edição, uma vez cada (é a gente do mundo; a edição não percorre os jogadores)
  if (p && bolsa && bolsa.w && a.type !== 'avatar' && p.edA !== bolsa.w.ed) { p.edA = bolsa.w.ed; mundoAcc('n', 1); }
  // o que foi para o Estado nesta ação: fianças, comissões da bolsa e impostos das leis (os cofres contam-no na edição)
  const imposto = (a.type === 'bail' || a.type === 'bailFor' ? r.cost || 0 : 0) + (a.type === 'stockBuy' || a.type === 'stockSell' ? r.fee || 0 : 0) + (r.tax || 0);
  if (imposto > 0) mundoAcc('tax', imposto);
  if (a.type === 'mktBuy' || a.type === 'mktSell') pontos(r.r, r.v);
  else if (a.type === 'stockDump') pontos('lx', r.v);
  else if (a.type === 'mvSend') { pontos(r.a, r.v); pontos(r.b, r.v); }
  else if (a.type === 'portOpen' && r.item) pontos(r.item.rg, r.item.v);
  else if (a.type === 'collect') for (const x of r.port || []) pontos(x.rg, x.v);
  else if (a.type === 'airCollect') pontos(r.rg, r.v);
  if (a.type === 'crime' || a.type === 'crimeAll') { const c = CFG.crimes[int(a.k)]; if (c) mundoAcc('lx', c.e * (a.type === 'crimeAll' ? r.n || 0 : 1)); }
  else if (a.type === 'attack') mundoAcc('lx', CFG.world.lx.fight);
  else if (a.type === 'deal') mundoAcc('lx', CFG.deal.step);
  else if (a.type === 'casino' && (r.g !== 'bj' || r.done)) mundoAcc('casino', -casinoNet(r));
  else if (a.type === 'port' && delta < 0) mundoAcc('docas', Math.round((-delta * CFG.world.portBp) / 10000));
  else if (GASTO[a.type] && delta < 0) mundoAcc(GASTO[a.type], -delta);
}
// caixa: o golpe separa o que se levou das balas; o resto conta pela diferença no dinheiro de quem agiu
// A lavagem fica numa linha própria (saída): a fonte conta o que entrou antes dela.
function contarCaixa(now, a, r, delta) {
  const tipo = typeof a.type === 'string' ? a.type.slice(0, 24) : '?', lav = r && r.lav > 0 ? r.lav : 0;
  if (lav) caixa(now, 'lavagem', 0, lav);
  if (tipo === 'crime' || tipo === 'crimeAll') {
    const c = CFG.crimes[int(a.k)], fonte = 'golpe:' + (c ? c.id : '?');
    caixa(now, fonte, r.success || r.wins ? r.money + lav : 0, 0);
    return;
  }
  delta += lav;
  if (tipo === 'attack' && r.win && r.mode === 'mug') { caixa(now, 'assalto', r.money, 0); caixa(now, 'assaltado', 0, r.money); return; }
  if (tipo === 'hitman' && r.success) caixa(now, 'assassino:alvo', 0, r.cashLoss);
  if (tipo === 'workDone' && r && r.shift) { caixa(now, 'shift', delta > 0 ? delta : 0, 0); return; }   // o turno vai para o banco: conta como os turnos de antes
  if (tipo === 'workDone' && r && r.id) { caixa(now, 'trabalho:' + r.id, delta > 0 ? delta : 0, delta < 0 ? -delta : 0); return; }
  caixa(now, tipo, delta > 0 ? delta : 0, delta < 0 ? -delta : 0);
}
// regras das manchetes: [tipo, valor, mínimo para aparecer, dinheiro a mostrar]
const MANCHETES = [['wanted', (r) => r.resp, 10], ['bigjob', (r) => r.best, 1500, (r) => r.best], ['lucky', (r) => r.cwin, 5000, (r) => r.cwin], ['fighter', (r) => r.fights, 2],
  ['mugged', (r) => r.mugged, 1, (r) => r.mugloss], ['broke', (r) => -r.cnet, 5000, (r) => -r.cnet], ['beaten', (r) => r.beaten, 2], ['hustler', (r) => r.crimes, 30], ['unlucky', (r) => r.busts, 2], ['sick', (r) => r.sick, 1]];
const cacheManchetes = new Map();
// v77: os 12 melhores de cada manchete, por dia, em memória (chegam: cada jogador só aparece numa, e há 10 manchetes).
// Lê-se a tabela do dia uma vez (ao arrancar ou na primeira vez que se pede esse dia); depois cada ação acerta só a sua linha.
const topDia = new Map();
const meusDias = new Map();   // o dia de cada jogador (para «a tua página»), o último que se contou
function meuDia(conta, now) {
  const dia = diaDe(now), c = meusDias.get(conta);
  if (c && c.dia === dia && c.ronda === ronda) return c;
  const r = q.meuDia.get(ronda, dia, conta) || null; if (r) meusDias.set(conta, r);
  return r;
}
function noTopo(T, r) {
  for (const [k, val, min, din] of MANCHETES) {
    const v = val(r), L = T[k] || (T[k] = []), i = L.findIndex((x) => x.conta === r.conta);
    if (i >= 0) L.splice(i, 1);
    if (!(v >= min)) continue;
    L.push({ conta: r.conta, n: v, m: din ? din(r) : 0 }); L.sort((a, b) => b.n - a.n); if (L.length > 12) L.length = 12;
  }
}
function topoDoDia(dia) {
  let T = topDia.get(dia);
  if (!T || T.ronda !== ronda) {
    T = { ronda }; for (const r of q.doDia.all(ronda, dia)) noTopo(T, r);
    topDia.set(dia, T);
    while (topDia.size > 3) topDia.delete(topDia.keys().next().value);   // hoje, ontem e pouco mais
  }
  return T;
}
function manchetes(dia, now) {
  const c = cacheManchetes.get(dia);
  if (c && c.ronda === ronda && now - c.t < 30_000) return c.lista;
  const T = topoDoDia(dia), usados = new Set(), lista = [];
  for (const [k] of MANCHETES) {
    const best = (T[k] || []).find((x) => !usados.has(x.conta));
    if (!best) continue;
    usados.add(best.conta);                       // cada jogador aparece numa manchete só, para haver mais nomes
    const p = jogadores.get(best.conta);
    lista.push({ k, name: nomeDe(best.conta), av: p?.av || 0, cls: p?.cls || '', level: p ? E.level(p) : 1, respect: p?.respect || 0,
      n: best.n, m: best.m });
  }
  cacheManchetes.set(dia, { t: now, ronda, lista });
  return lista;
}

// jogadores do mundo, em memória
let ronda = -1;
const jogadores = new Map(); // conta -> estado
const nomes = new Map();     // conta -> nome

let INICIO = null;   // quando o mundo permanente abriu (ver abrirMundo)
let EPOCA = null;    // a época aberta: { n, start, end }
const cacheEpoca = new Map();   // classificação da época por divisão -> { t, n, size, lista }
// playEnd e nextStart ficam no fim dos tempos: o motor e as versões antigas do site ainda os leem
function mundo(now) {
  return { phase: now >= INICIO ? 'play' : 'before', n: MUNDO, start: INICIO, playEnd: FIM, nextStart: FIM };
}

function carregarRonda(n) {
  if (n === ronda) return;
  ronda = n;
  jogadores.clear(); jornal.length = 0;
  const devolvidos = [];
  for (const r of q.daRonda.all(n)) {
    const p = fromJson(r.estado), antigo = p.eco !== 2, d0 = (p.cash || 0) + (p.bank || 0);
    try { E.upgrade(p); } catch (e) { console.error('estado antigo por atualizar', r.conta, e.message); }   // quem não entra há muito fica já com os campos novos
    if (antigo && p.eco === 2) devolvidos.push([p, dinheiro(p) - d0]);
    if (EPOCA) E.seasonJoin(p, EPOCA.n);   // (ao voltar a ler depois de um erro: quem ainda não estava gravado na época entra outra vez, igual)
    jogadores.set(r.conta, p);
  }
  // economia nova (passo 2): grava já quem recebeu de volta o que tinha comprado aos preços antigos, e conta-o no caixa
  if (devolvidos.length) {
    const t = clock();
    // sem transação própria: isto pode correr dentro da de outra ação; o estado é o mesmo se for gravado duas vezes
    try { for (const [p, d] of devolvidos) { q.guardar.run(n, p.id, toJson(p), Math.max(t, p.t || 0)); caixa(t, 'devolucao', d, 0); } }
    catch (e) { console.error('devolução da economia antiga', e.message); }
  }
  for (const r of q.noticias.all(n).reverse()) jornal.push({ t: r.t, ...JSON.parse(r.dados) });
  carregarGangues();
}

function nomeDe(id) {
  if (!nomes.has(id)) { const c = q.contaPorId.get(id); nomes.set(id, c ? c.nome : '?'); }
  return nomes.get(id);
}

function guardar(p, now) { q.guardar.run(ronda, p.id, toJson(p), now); }

function jogadorDe(conta, now, w) {
  carregarRonda(w.n);
  let p = jogadores.get(conta);
  if (!p) {
    if (w.phase !== 'play') return null;
    // sem rondas, quem chega começa como toda a gente (já não há stats de compensação para quem entra tarde)
    p = E.newPlayer(conta, now, { start: w.start, playEnd: w.playEnd });
    E.seasonJoin(p, epocaEmDia(now).n);
    jogadores.set(conta, p);
    guardar(p, now);
  }
  return p;
}

// ---------- bolsa e mundo ligado (passo 6) ----------
// Um mercado igual para todos, com o mundo dentro (bolsa.w): Lisboa, empresas, histórias e o que os jogadores fizeram desde a
// última edição. Duas coisas fazem o tempo andar, pela ordem em que acontecem: os passos de 10 em 10 minutos (o preço anda para
// a abertura) e as edições do jornal (03h, 09h, 15h e 21h). Se o servidor esteve parado, faz o que faltou, pela mesma ordem.
db.exec('CREATE TABLE IF NOT EXISTS bolsa (ronda INTEGER PRIMARY KEY, dados TEXT NOT NULL)');
const qb = { ler: db.prepare('SELECT dados FROM bolsa WHERE ronda = ?'), gravar: db.prepare('INSERT INTO bolsa (ronda, dados) VALUES (?, ?) ON CONFLICT(ronda) DO UPDATE SET dados = excluded.dados') };
let bolsa = null, bolsaRonda = null, bolsaSuja = false;
function bolsaDe(w, now) {
  if (bolsaRonda !== w.n) {
    const row = qb.ler.get(w.n);
    bolsa = row ? JSON.parse(row.dados) : { ...E.newMarket(), hist: [] };
    if (!Array.isArray(bolsa.hist) || !bolsa.hist.length) bolsa.hist = [bolsa.prices.slice()];
    // o mercado antigo (preços ao acaso) passa a ter empresas: cada uma começa no preço a que estava, e quem tinha ações fica com elas
    if (!bolsa.w) { bolsa.w = MW.newWorld(bolsa.prices, Math.max(now, w.start)); bolsaSuja = true; }
    if (bolsa.w.v !== 2) { MW.worldUp(bolsa.w); bolsaSuja = true; }   // o mundo da parte 1 ganha as regiões e o mercado
    bolsaRonda = w.n;
  }
  const S = CFG.stocks, alvo = Math.max(0, Math.floor((Math.min(now, w.playEnd) - w.start) / S.tickMs));
  let mexeu = false;
  for (;;) {
    const tt = bolsa.tick < alvo ? w.start + (bolsa.tick + 1) * S.tickMs : Infinity, te = MW.edStart(bolsa.w.ed + 1);
    if (te <= now && te <= tt) {
      const ed = bolsa.w.ed + 1;
      if (w.n === ronda) { try { guardadoNasRegioes(); } catch (e) { console.error('regiões', e.message); } }
      const r = MW.runEdition(bolsa, ed, rng);
      { const feats = NW.closeEdition(NW.newsUp(bolsa.w), ed), L = bolsa.w.arts[bolsa.w.arts.length - 1]; if (feats.length && L) L.a.push(...feats); }   // v77
      if (w.n === ronda) { try { dividendos(r.div, te, now); } catch (e) { console.error('dividendos', e.message); } }
      E.setGov(GV.govSnapshot(bolsa.w.gov));   // as leis que a edição acabou de pôr em vigor contam já nas rusgas
      if (w.n === ronda) { try { rusgas(te, now); } catch (e) { console.error('rusgas', e.message); } }
      if (w.n === ronda && now - te < T.HOUR) for (const k of r.bust) noticia(te, { k: 'stockBust', c: S.list[k].id });
      mexeu = true; continue;
    }
    if (tt === Infinity || tt > now) break;
    MW.priceTick(bolsa, rng);
    if (w.n === ronda) { try { limitesDaBolsa(tt, now); } catch (e) { console.error('limites da bolsa', e.message); } }   // nunca trava o mercado nem o pedido de quem o fez avançar
    bolsa.hist.push(bolsa.prices.slice()); if (bolsa.hist.length > S.histMax + 1) bolsa.hist.shift();
    mexeu = true;
  }
  if (mexeu || bolsaSuja) { qb.gravar.run(w.n, JSON.stringify(bolsa)); bolsaSuja = false; }
  return bolsa;
}
// o que os jogadores fazem entra nas contas da edição (fica em memória e grava-se de 30 em 30 segundos e em cada edição)
function mundoAcc(kind, x) { if (!bolsa || !bolsa.w || !x) return; MW.accAdd(bolsa.w, kind, x); bolsaSuja = true; }
const gravarBolsa = () => { try { if (bolsa && bolsaSuja && bolsaRonda !== null) { qb.gravar.run(bolsaRonda, JSON.stringify(bolsa)); bolsaSuja = false; } } catch (e) { console.error('gravar bolsa', e.message); } };
setInterval(gravarBolsa, 30_000).unref();
// ao desligar (atualização do servidor), as contas da edição a meio não se perdem
for (const sinal of ['SIGTERM', 'SIGINT']) process.once(sinal, () => { gravarBolsa(); process.exit(0); });
// dividendos: em cada edição, a quem tem ações das empresas que pagaram (também a quem está fora do jogo)
function dividendos(div, t, now) {
  if (!div.some((x) => x > 0)) return;
  for (const [conta, p] of jogadores) {
    try {
      if (!Array.isArray(p.stk)) continue;
      let cents = 0; const list = [];
      p.stk.forEach((h, k) => { if (h && h.n > 0 && h.gen === bolsa.gen[k] && div[k] > 0) { cents += h.n * div[k]; list.push(S_ID(k)); } });
      const money = Math.floor(cents / 100);
      if (money <= 0) continue;
      p.cash += money;
      guardar(p, now); caixa(t, 'dividendos', money, 0);
      evento(conta, t, { k: 'stDiv', money, cs: list });
    } catch (e) { console.error('dividendos', conta, e.message); }
  }
}
const S_ID = (k) => CFG.stocks.list[k].id;
// antes de cada edição: a droga guardada à vista em cada região conta para a criminalidade de lá (1 ponto por cada 500 €)
function guardadoNasRegioes() {
  const tot = {};
  for (const [, p] of jogadores) { if (!p.wh) continue; const st = E.whStoredEur(p); for (const r in st) tot[r] = (tot[r] || 0) + st[r]; }
  for (const r in tot) if (tot[r] > 0) mundoAcc(r, tot[r] / CFG.regions.storeEur);
}
// depois de cada edição: rusgas e calor em todos os armazéns (também de quem está fora do jogo). Cada rusga fica nos eventos do
// jogador e no caixa; uma apreensão recorde é notícia, baixa a criminalidade da região e encarece a droga apreendida.
function rusgas(t, now) {
  for (const [conta, p] of jogadores) {
    try {
      if (!p.wh || !E.REG_IDS.some((r) => p.wh[r] && (p.wh[r].h > 0 || p.wh[r].f > 0 || E.whVisEur(p, r) > 0))) continue;
      const rz = E.whEdition(p, bolsa, t, rng);
      for (const x of rz) {
        evento(conta, t, { k: 'raid', r: x.r, took: x.took, money: x.v, fine: x.fine, jail: x.jail });
        if (x.fine) { caixa(t, 'rusga', 0, x.fine); mundoAcc('tax', x.fine); }   // a multa vai para os cofres do Estado
        if (x.v >= CFG.market.record.min) { MW.recordSeizure(bolsa.w, x.r, x.took.map(([d]) => d)); if (now - t < T.HOUR) noticia(t, { k: 'raidRecord', r: x.r, money: x.v, d: x.took.length ? x.took.reduce((a, b) => (b[1] * CFG.drugs[b[0]].price > a[1] * CFG.drugs[a[0]].price ? b : a))[0] : -1 }); }
      }
      guardar(p, now);
    } catch (e) { console.error('rusgas', conta, e.message); }
  }
}
// limites de venda (alvo de lucro e travão de perda): a seguir a cada passo vendem-se as posições que os tocaram, ao preço desse passo,
// também de quem está fora do jogo. Grava-se logo e fica um aviso nos eventos do jogador.
function limitesDaBolsa(t, now) {
  for (const [conta, p] of jogadores) {
    try {
      if (!Array.isArray(p.stk) || !p.stk.some((h) => h && (h.tp || h.sl))) continue;
      const vendas = E.stockAuto(p, bolsa);
      if (!vendas.length) continue;
      for (const v of vendas) evento(conta, t, { k: 'stAuto', c: CFG.stocks.list[v.k].id, why: v.why, n: v.n, money: v.got, profit: v.profit });
      guardar(p, now);
    } catch (e) { console.error('limites da bolsa', conta, e.message); }   // um jogador com o estado estragado não pode travar os outros
  }
}
function vistaBolsa(w, now) {
  const m = bolsaDe(w, now), S = CFG.stocks;
  return { now, tick: m.tick, nextAt: w.start + (m.tick + 1) * S.tickMs, prices: m.prices, gen: m.gen, hist: S.list.map((_, k) => m.hist.map((row) => row[k])),
    ed: m.w.ed, edNext: MW.edStart(m.w.ed + 1), co: MW.companyView(m).map((c) => (c.st ? { ...c, st: { ...c.st, dueAt: MW.edStart(c.st.due), rum: c.st.rum.map(([ed, said, rel]) => [MW.edStart(ed), said, rel]) } } : c)) };
}
// o mundo para o jornal: as notícias das últimas edições e Lisboa
function vistaMundo(w, now) {
  if (w.phase !== 'play') return null;
  const m = bolsaDe(w, now);
  // v77: cada notícia leva o peso (a manchete é a mais pesada) e as horas das votações e das leis
  const hora = (x) => (x.due ? { ...x, dueAt: MW.edStart(x.due) } : x.to ? { ...x, toAt: MW.edStart(x.to + 1) } : x.k === 'govBill' ? { ...x, voteAt: MW.edStart(x.vote) } : x.k === 'govVote' && x.at ? { ...x, atAt: MW.edStart(x.at) } : x);
  const arts = m.w.arts.slice(-8).map((e) => ({ ed: e.ed, at: MW.edStart(e.ed), a: e.a.map((x) => ({ ...hora(x), w: Math.round(NW.weight(x) * 10) / 10 })) }));
  MW.worldUp(m.w);
  const rg = Object.fromEntries(Object.entries(m.w.rg).map(([r, g]) => [r, { crime: g.crime, press: g.press, hist: g.hist }]));
  const crimes = [m.w.lx.crime, ...Object.values(m.w.rg).map((g) => g.crime)];
  const gov = GV.govView(m.w, MW.popOf(m.w), { crime: crimes.reduce((a, b) => a + b, 0) / crimes.length });
  if (gov.bill) { gov.bill.voteAt = MW.edStart(gov.bill.vote); gov.bill.ed0At = MW.edStart(gov.bill.ed0); }
  gov.pend = gov.pend.map((x) => ({ ...x, atAt: MW.edStart(x.at) }));
  const ep = epocaEmDia(now).n, mw = m.w.mus && m.w.mus.ep === ep ? m.w.mus : {};   // v79: a placa do museu (só a da época que corre)
  const mus = Object.fromEntries(Object.keys(CFG.col.sets).map((k) => [k, mw[k] || { n: 0, top: [] }]));
  return { mus, ed: m.w.ed, edNext: MW.edStart(m.w.ed + 1), edAt: MW.edStart(m.w.ed), lx: { crime: m.w.lx.crime, press: MW.pressOf(m.w, 'lx'), hist: m.w.lx.hist }, rg, bustBp: CFG.bustBp, arts, gov, pop: Math.round(MW.popOf(m.w)) };
}

// ---------- vista do jogador para o browser ----------
function vista(p, now) {
  const L = E.level(p);
  const stored = E.bizStored(p, now), vv = E.venueView(p, Math.max(now, p.t));
  const wm = mundo(now), mk = wm.phase === 'play' ? bolsaDe(wm, now) : null;
  return {
    stk: mk ? E.stockView(p, mk) : CFG.stocks.list.map(() => ({ n: 0, cost: 0, value: 0, tp: 0, sl: 0 })), stockCap: E.stockCap(p),
    wh: E.whView(p), mv: E.mvView(p), mvLog: p.mvLog, rz: p.rz, mk: mk ? MW.marketView(mk.w, now) : null,   // regiões e armazéns (passo 6, parte 2)
    bustBp: E.bustChanceBp(p, now, mk ? MW.pressOf(mk.w, 'lx') : 50), lx: mk ? { crime: mk.w.lx.crime, press: MW.pressOf(mk.w, 'lx'), ed: mk.w.ed, edNext: MW.edStart(mk.w.ed + 1) } : null,
    cd: { est: E.consumWait(p, 'est', now), med: E.consumWait(p, 'med', now) },   // v78: quanto falta na espera de cada família
    mt: p.mt, cf: p.cf, maq: p.maq,   // v83: depósito, bancada e máquinas
    dg: E.digView(p, now), dgc: p.dgc, arq: E.stLevel(p, 'arqueologia'),   // v85: a escavação aberta (sem a grelha), os sítios vigiados, o nível de Arqueologia
    feira: { levantar: qf.nParaMim.get(ronda, p.id).n },   // v84: o que está à espera de ser levantado na feira
    col: p.col, mus: p.mus, musEp: p.musEp || {},   // v79: a vitrine, as entregas ao museu e em que época entrou na placa
    dia: (() => { const d = meuDia(p.id, now); if (!d) return null; const { ronda: _r, conta: _c, dia: _d, ...x } = d; return x; })(),   // v77: «a tua página»
    gv: mk && mk.w.gov ? { laws: Object.keys(mk.w.gov.laws), voted: !!(mk.w.gov.bill && p.gv === mk.w.gov.bill.ed0), yes: !!p.gvY, corr: mk.w.gov.corr, novo: now - (p.joinedAt || now) < CFG.gov.vote.minAgeMs } : null,
    name: nomeDe(p.id),
    stats: p.stats, energy: p.energy, energyT: p.energyT, energyMax: E.energyMax(p), vigor: p.vigor, vigorT: p.vigorT,
    addiction: p.addiction, addictionT: p.addictionT, addictionCap: E.addictionCap(p),
    refill: E.refillPlan(p, now), refillBars: E.refillUsed(p, now), street: E.streetView(p, now), work: E.workView(p, now),
    deal: { dst: p.dst, used: E.dealUsed(p, now), cap: E.dealCap(p) },
    job: p.job, shifts: E.shiftsToday(p, now), course: p.course, done: p.done, sk: p.sk, jt: Array.isArray(p.jt) ? p.jt : [], detox: p.addiction > 0 ? E.detoxCost(p, now) : 0, detoxUses: E.detoxUses(p, now),
    mission: E.mission(p), wk: p.wk, counters: p.c,
    xp: p.xp, xpNeed: { F: E.practiceNeed(p, 'F'), I: E.practiceNeed(p, 'I'), C: E.practiceNeed(p, 'C') },
    cash: p.cash, cent: p.cent || 0, bank: p.bank, bankFeeBp: E.bankFeeBp(p), bj: E.bjPublic(p), casinoMax: E.casinoMax(p), gang: p.gang && gangues.get(p.gang) ? { id: p.gang, name: gangues.get(p.gang).nome, tag: gangues.get(p.gang).tag, bot: p.gang === BOT.id } : null, gb: p.gb || null, gangWait: p.gangLeft ? p.gangLeft + CFG.gang.rejoinMs : 0, clsCost: E.classChangeCost(p), clsWait: p.clsAt ? p.clsAt + CFG.classChange.coolMs : 0, portSeizeBp: E.portSeizeBp(p), respect: p.respect, peakRespect: p.peakRespect,
    level: L, levelFrom: CFG.levels[L - 1], levelTo: CFG.levels[L] ?? null,
    titles: p.titles, ep: p.ep ? { n: p.ep.n, div: p.ep.div, score: E.seasonScore(p, p.ep.n) } : null,
    jailUntil: p.jailUntil, jailTier: p.jailTier, bail: E.bailCost(p, now),
    hospUntil: p.hospUntil, medic: E.medicCost(p, now),
    protectUntil: p.protectUntil, capUntil: p.capUntil, shieldUntil: p.shieldUntil,
    eq: p.eq, inv: p.inv, invCap: E.invCap(p), invUsed: E.invUsed(p), atkBp: E.atkBp(p), defBp: E.defBp(p),
    op: p.op ? { ...p.op, chanceBp: E.opChanceBp(p, CFG.ops[p.op.i]), rasto: E.opRasto(p, CFG.ops[p.op.i]), miss: E.opMissing(p, CFG.ops[p.op.i]),
      cost: { recon: E.opStepCost(CFG.ops[p.op.i], 'recon'), crew: E.opStepCost(CFG.ops[p.op.i], 'crew'), bribe: E.opStepCost(CFG.ops[p.op.i], 'bribe') } } : null,
    opsPrev: CFG.ops.map((o) => ({ chanceBp: E.opChanceBp(p, o, null), rasto: E.opRasto(p, o, null) })), opPause: p.opPause, contacts: p.contacts,
    avenca: p.avenca, avD: p.avD, ilegal: p.ilegal, jf: p.jf, jailT0: p.jailT0, streetBar: E.streetPerBar(p), yardBet: E.yardBet(p), jc: p.jc && p.jc.d === E.dayOf(now) ? { n: p.jc.n, w: p.jc.w } : { n: 0, w: 0 }, repair: { mao: E.repairCost(p, 'mao'), principal: E.repairCost(p, 'principal') }, guard: p.guard, tool: p.tool, gweapon: p.gweapon, toolNext: E.toolPreview(p, now), hitmanLeft: E.hitmanLeft(p, now), hmSafe: p.hmSafe, luxuries: p.luxuries, luxuryPrice: E.luxuryPrice(p),
    attack: E.attackPower(p, now), defense: E.defensePower(p, now),
    crimes: CFG.crimes.map((c, k) => ({ chance: E.crimeChanceBp(p, k, now), unlocked: E.crimeUnlocked(p, k) })),
    sick: p.sick, cure: E.cureCost(p), hookers: CFG.hookers.list.map((_, i) => E.hookerPrice(p, i, now)), hkUses: E.hookerUses(p, now),
    house: p.house, hu: p.hu, housePrice: E.housePrice(p), huPrices: CFG.house.ups.map((_, u) => E.upgradePrice(p, u)),
    luxuryRespect: E.luxuryPrice(p) === null ? 0 : E.luxuryRespect(E.luxuryPrice(p)),
    cls: p.cls, av: p.av, fx: E.activeFx(p, now), drugPrices: CFG.drugs.map((_, d) => E.drugPrice(p, d)),
    acct: p.acct,
    biz: p.biz.map((s, i) => ({ n: s.n, stored: stored[i].money, fee: stored[i].fee, g: s.g === true, perH: E.bizRates(p, i, now).perH, price: s.n < CFG.bizMax ? E.bizPrice(i, s.n) : null, t: s.t })),
    stock: vv.stock, hold: Array.isArray(p.hold) ? p.hold : [], portRisk: CFG.port.ships.map((_, k) => E.portSeizeBp(p, k)),
    club: vv.club ? { lvl: vv.club.lvl, till: vv.club.till, pi: vv.club.pi, gd: vv.club.gd, perH: E.clubRate(p), cap: CFG.venue.club.perH[vv.club.lvl - 1] * (CFG.venue.tillMs / T.HOUR), next: CFG.venue.club.cost[vv.club.lvl] ?? null } : null,
    bro: vv.bro ? { lvl: vv.bro.lvl, till: vv.bro.till, pi: vv.bro.pi, gd: vv.bro.gd, girls: vv.bro.girls, perH: E.broRate(p), cap: E.broRate(p) * (CFG.venue.tillMs / T.HOUR), rooms: CFG.venue.bro.rooms[vv.bro.lvl - 1], next: CFG.venue.bro.cost[vv.bro.lvl] ?? null } : null,
    port: p.port, portCap: E.portCap(p), portSlots: E.portSlots(p), air: p.air, airCap: E.airCap(p), airSeize: CFG.air.routes.map((_, i) => E.airSeizeBp(p, i, false)),
  };
}

const FEIRA_REFS = E.feiraRefs();   // v84: preço de referência de cada coisa que se vende na feira (banda: 0,3× a 3×)
function cfgPublica() {
  return {
    energy: CFG.energy, vigor: CFG.vigor, street: CFG.street, refillBar: CFG.refillBar, deal: CFG.deal, work: CFG.work, jobs: CFG.jobs, courses: CFG.courses, skills: CFG.skills, addiction: CFG.addiction, train: CFG.train, crimes: CFG.crimes, drugs: CFG.drugs,
    biz: CFG.biz.map(({ id, price, perH, resp, stat, raid, toBank, drug }) => ({ id, price, perH, resp, stat, raid, toBank, drug: drug ? CFG.drugs.findIndex((x) => x.id === drug) : -1 })), accountant: CFG.accountant,
    bizMax: CFG.bizMax, storageMs: CFG.storageMs, port: { ...CFG.port, ships: CFG.port.ships.map((s) => ({ ...s, drug: CFG.drugs.findIndex((x) => x.id === s.drug) })) }, air: CFG.air, goods: CFG.goods, venue: CFG.venue, detox: CFG.detox, stocks: CFG.stocks, slots: CFG.slots, gear: CFG.gear, gunSideBp: CFG.gunSideBp, bullets: CFG.bullets, loot: CFG.loot, ops: CFG.ops, opSteps: CFG.opSteps, retainer: CFG.retainer, jail: CFG.jail, launder: CFG.launder, world: CFG.world, regions: CFG.regions, market: CFG.market, wh: CFG.wh, mv: CFG.mv, tools: CFG.tools, gweapons: CFG.gweapons, guards: CFG.guards, hitman: CFG.hitman,
    pvp: CFG.pvp, bank: CFG.bank, luxury: CFG.luxury, levels: CFG.levels, crit: CFG.crit, unlockBp: CFG.unlockBp,
    bustBp: CFG.bustBp, crimeAllMax: CFG.crimeAllMax, casino: { minBet: CFG.casino.minBet, limits: CFG.casino.limits, slotMinC: CFG.casino.slotMinC, red: CFG.casino.red, dice: CFG.casino.dice, wheel: { segs: CFG.casino.wheel.segs, spots: CFG.casino.wheel.spots, topMult: CFG.casino.wheel.topMult.map(([m]) => m), louca: CFG.casino.wheel.louca }, slots: Object.fromEntries(Object.entries(CFG.casino.slots).map(([k, g]) => [k, { kind: g.kind, cols: g.cols, rows: g.rows, min: g.min, nsym: g.nsym, trig: g.trig, pay: g.pay, scatPay: g.scatPay, free: g.free, fs: g.fs, retrig: g.retrig, buy: g.buy, superBuy: g.superBuy, max: g.max, accFree: g.accFree, accAll: g.accAll, orbBase: g.orbBase }])) }, gang: CFG.gang, classes: CFG.classes, classChange: CFG.classChange, avatars: CFG.avatars, hookers: CFG.hookers, house: CFG.house, mastery: CFG.mastery, missions: CFG.missions.length, start: CFG.start,
    round: { playDays: CFG.round.playDays, noPvpMs: CFG.round.noPvpMs }, season: CFG.season,
    consum: CFG.consum, col: CFG.col,
    mat: CFG.mat, craft: CFG.craft, feira: { ...CFG.feira, refs: FEIRA_REFS }, dig: CFG.dig,   // v83, v84
    exam: (({ ans: _a, ...x }) => x)(CFG.exam), studies: CFG.studies,   // v81: a Universidade   // v80: as regras do exame, sem as respostas certas
    gov: { vote: CFG.gov.vote, laws: CFG.gov.laws, cof: CFG.gov.cof, parties: Object.fromEntries(Object.entries(CFG.gov.parties).map(([k, x]) => [k, { pos: x.pos, wOp: x.wOp, wLob: x.wLob }])) },   // v76: o parlamento
  };
}

// ---------- contas e sessões ----------
const NOME_RE = /^[A-Za-z0-9_]{3,16}$/;
// email: só a forma (algo@algo.algo, sem espaços, até 254 letras). Fica guardado em minúsculas e nunca sai em resposta nenhuma.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const emailLimpo = (x) => { const e = typeof x === 'string' ? x.trim().toLowerCase() : ''; return e.length <= 254 && EMAIL_RE.test(e) ? e : null; };
function hashSenha(senha) {
  const sal = randomBytes(16);
  const h = scryptSync(senha, sal, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `s1$${sal.toString('base64')}$${h.toString('base64')}`;
}
function confereSenha(senha, guardado) {
  const [v, s, h] = guardado.split('$');
  if (v !== 's1') return false;
  const calc = scryptSync(senha, Buffer.from(s, 'base64'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const esperado = Buffer.from(h, 'base64');
  return esperado.length === calc.length && timingSafeEqual(esperado, calc);
}
const sha = (x) => createHash('sha256').update(x).digest('hex');
const SESSAO_MS = 30 * T.DAY;

function criarSessao(res, conta, now) {
  const token = randomBytes(32).toString('base64url');
  q.novaSessao.run(sha(token), conta, now + SESSAO_MS);
  res.setHeader('Set-Cookie', `cr_s=${token}; HttpOnly${SECURE}; SameSite=Lax; Path=/; Max-Age=${SESSAO_MS / 1000}`);
}

function lerCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.match(/(?:^|;\s*)cr_s=([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : null;
}

function contaDoPedido(req, now) {
  const t = lerCookie(req);
  if (!t) return null;
  const s = q.sessao.get(sha(t));
  if (!s || s.expira < now) return null;
  return s.conta;
}

// ---------- limites de pedidos ----------
const baldes = new Map();
function limite(chave, max, janelaMs, now) {
  let b = baldes.get(chave);
  if (!b || b.ate < now) { b = { n: 0, ate: now + janelaMs }; baldes.set(chave, b); }
  b.n += 1;
  return b.n <= max;
}
setInterval(() => {
  const now = clock();
  for (const [k, b] of baldes) if (b.ate < now) baldes.delete(k);
  // respostas guardadas para toques repetidos: só de quem jogou na última hora
  for (const k of recentes.keys()) { const p = jogadores.get(k); if (!p || p.t < now - T.HOUR) recentes.delete(k); }
}, 60_000).unref();

// ---------- respostas ----------
function enviar(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const partes = [];
    req.on('data', (c) => { n += c.length; if (n > 8192) { reject(new Error('GRANDE')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { const o = n ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {}; resolve(o && typeof o === 'object' && !Array.isArray(o) ? o : {}); } catch { reject(new Error('JSON')); } });
    req.on('error', reject);
  });
}

// o Caddy põe o IP real em X-Real-IP (e no fim do X-Forwarded-For); o que vem antes pode ser inventado pelo cliente.
// O servidor só escuta em 127.0.0.1, por isso estes cabeçalhos só podem vir do Caddy.
const ip = (req) => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || req.socket.remoteAddress || '').trim();
const int = (x) => (Number.isSafeInteger(x) ? x : NaN);
// só os campos que cada jogo usa, com os tipos certos (o resto do pedido não chega ao motor)
function limpaAposta(a) {
  const bets = Array.isArray(a.bets) ? a.bets.slice(0, 13).map((b) => ({ t: String(b && b.t), s: String(b && b.s), n: b && b.n !== undefined ? int(b.n) : undefined, amt: int(b && b.amt) })) : undefined;
  return { bets, amt: int(a.amt), bc: a.bc !== undefined ? int(a.bc) : undefined, pick: String(a.pick), op: String(a.op || 'deal'), game: String(a.game || 'chefao'), buy: int(a.buy ?? 0) };
}

// ---------- Feira da Ladra (v84) ----------
// Os anúncios vivem aqui (o que está à venda já saiu de quem vende; o dinheiro de quem vai à frente num leilão já saiu de
// quem licitou). Estados: 'aberto' (à venda ou em leilão) e 'levantar' (à espera de quem o vai buscar: quem vendeu, se
// não se vendeu ou cancelou; quem ganhou, num leilão). Tudo por índice: nada percorre todos os jogadores.
db.exec(`CREATE TABLE IF NOT EXISTS feira (id INTEGER PRIMARY KEY AUTOINCREMENT, ronda INTEGER NOT NULL, vendedor TEXT NOT NULL, tipo TEXT NOT NULL,
  kind TEXT NOT NULL, item TEXT NOT NULL, obj TEXT, n INTEGER NOT NULL, preco INTEGER NOT NULL, lance INTEGER NOT NULL DEFAULT 0, licitante TEXT,
  criado INTEGER NOT NULL, fim INTEGER NOT NULL, estado TEXT NOT NULL, dono TEXT);
CREATE INDEX IF NOT EXISTS feira_fim ON feira (ronda, estado, fim);
CREATE INDEX IF NOT EXISTS feira_item ON feira (ronda, estado, tipo, item, preco);
CREATE INDEX IF NOT EXISTS feira_vend ON feira (ronda, vendedor, estado);
CREATE INDEX IF NOT EXISTS feira_dono ON feira (ronda, dono, estado);
CREATE INDEX IF NOT EXISTS feira_lic ON feira (ronda, licitante, estado);
CREATE TABLE IF NOT EXISTS feira_vendas (ronda INTEGER NOT NULL, item TEXT NOT NULL, t INTEGER NOT NULL, unit INTEGER NOT NULL, n INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS feira_vendas_item ON feira_vendas (ronda, item, t);
CREATE TABLE IF NOT EXISTS feira_lances (lid INTEGER NOT NULL, conta TEXT NOT NULL, PRIMARY KEY (lid, conta));`);
// (colunas que vieram depois: quem comprou, quem vendeu e a diferença para a referência; quanto do lance saiu do banco)
for (const sql of ['ALTER TABLE feira_vendas ADD COLUMN a TEXT', 'ALTER TABLE feira_vendas ADD COLUMN b TEXT', 'ALTER TABLE feira_vendas ADD COLUMN dif INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE feira ADD COLUMN lbanco INTEGER NOT NULL DEFAULT 0']) { try { db.exec(sql); } catch {} }
db.exec('CREATE INDEX IF NOT EXISTS feira_vendas_par ON feira_vendas (ronda, a, b, t); CREATE INDEX IF NOT EXISTS feira_vendas_b ON feira_vendas (ronda, b, t)');
const qf = {
  nova: db.prepare("INSERT INTO feira (ronda, vendedor, tipo, kind, item, obj, n, preco, criado, fim, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto')"),
  um: db.prepare('SELECT * FROM feira WHERE id = ? AND ronda = ?'),
  // os 10 contam o que está à venda e o que ainda está à espera de ser levantado (a feira não é um armazém sem teto)
  abertosDe: db.prepare("SELECT COUNT(*) n FROM feira WHERE ronda = ? AND ((vendedor = ? AND estado = 'aberto') OR (dono = ? AND estado = 'levantar'))"),
  denovo: db.prepare("UPDATE feira SET vendedor = ?, tipo = ?, preco = ?, lance = 0, licitante = NULL, lbanco = 0, criado = ?, fim = ?, estado = 'aberto', dono = NULL WHERE id = ?"),
  vencidos: db.prepare("SELECT * FROM feira WHERE ronda = ? AND estado = 'aberto' AND fim <= ? ORDER BY fim LIMIT 200"),
  apaga: db.prepare('DELETE FROM feira WHERE id = ?'),
  menos: db.prepare('UPDATE feira SET n = n - ? WHERE id = ?'),
  lance: db.prepare('UPDATE feira SET lance = ?, licitante = ?, fim = ?, lbanco = ? WHERE id = ?'),
  levantar: db.prepare("UPDATE feira SET estado = 'levantar', dono = ? WHERE id = ?"),
  venda: db.prepare('INSERT INTO feira_vendas (ronda, item, t, unit, n, a, b, dif) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  // o que já passou entre duas contas (nos dois sentidos) e os leilões em que uma vai à frente no da outra
  par: db.prepare('SELECT COALESCE(SUM(dif), 0) s FROM feira_vendas WHERE ronda = ? AND t > ? AND ((a = ? AND b = ?) OR (a = ? AND b = ?))'),
  parLeil: db.prepare("SELECT kind, item, obj, n, lance, id FROM feira WHERE ronda = ? AND estado = 'aberto' AND tipo = 'leilao' AND ((licitante = ? AND vendedor = ?) OR (licitante = ? AND vendedor = ?))"),
  conta: db.prepare('SELECT COALESCE(SUM(dif), 0) s FROM feira_vendas WHERE ronda = ? AND t > ? AND (a = ? OR b = ?)'),
  contaLeil: db.prepare("SELECT kind, item, obj, n, lance, id FROM feira WHERE ronda = ? AND estado = 'aberto' AND tipo = 'leilao' AND licitante IS NOT NULL AND (licitante = ? OR vendedor = ?)"),
  guardados: db.prepare("SELECT COUNT(*) n FROM feira WHERE ronda = ? AND ((dono = ? AND estado = 'levantar') OR (licitante = ? AND estado = 'aberto'))"),
  licNovo: db.prepare('INSERT OR IGNORE INTO feira_lances (lid, conta) VALUES (?, ?)'),
  licFora: db.prepare('DELETE FROM feira_lances WHERE lid = ?'),
  passados: db.prepare("SELECT f.* FROM feira_lances l JOIN feira f ON f.id = l.lid WHERE l.conta = ? AND f.ronda = ? AND f.estado = 'aberto' AND f.tipo = 'leilao' AND f.licitante != ? AND f.fim > ? ORDER BY f.fim LIMIT 40"),
  catalogo: db.prepare("SELECT kind, item, MIN(preco) preco, SUM(n) n, COUNT(*) c FROM feira WHERE ronda = ? AND estado = 'aberto' AND tipo = 'fixo' AND fim > ? GROUP BY kind, item"),
  doItem: db.prepare("SELECT * FROM feira WHERE ronda = ? AND estado = 'aberto' AND tipo = 'fixo' AND item = ? AND fim > ? ORDER BY preco, id LIMIT 30"),
  leiloes: db.prepare("SELECT * FROM feira WHERE ronda = ? AND estado = 'aberto' AND tipo = 'leilao' AND fim > ? ORDER BY fim, id LIMIT ? OFFSET ?"),
  meus: db.prepare("SELECT * FROM feira WHERE ronda = ? AND vendedor = ? AND estado = 'aberto' ORDER BY fim"),
  paraMim: db.prepare("SELECT * FROM feira WHERE ronda = ? AND dono = ? AND estado = 'levantar' ORDER BY id"),
  nParaMim: db.prepare("SELECT COUNT(*) n FROM feira WHERE ronda = ? AND dono = ? AND estado = 'levantar'"),
  lancesMeus: db.prepare("SELECT * FROM feira WHERE ronda = ? AND licitante = ? AND estado = 'aberto' ORDER BY fim"),
  precos: db.prepare('SELECT unit FROM feira_vendas WHERE ronda = ? AND item = ? ORDER BY t DESC LIMIT 20'),
};
const objDe = (L) => (L.obj ? JSON.parse(L.obj) : null);
const descDe = (L, n = L.n) => ({ kind: L.kind, id: L.item, n, o: objDe(L) });
const bandaDe = (L) => E.feiraBand(L.kind, L.item, objDe(L));   // (uma arma: pelos usos que tem)
// a diferença de um negócio para o preço de referência (para cima ou para baixo)
const feiraDif = (kind, id, n, total, o) => Math.abs(total - E.feiraRef(kind, id, o) * n);
const difLeil = (Ls, semLid) => Ls.filter((L) => L.id !== semLid).reduce((t, L) => t + feiraDif(L.kind, L.item, L.n, L.lance, objDe(L)), 0);
// quanto já passou entre duas contas nas últimas 24 h, mais os leilões em que uma vai à frente no da outra (menos o que se vai mudar)
const feiraPar = (x, y, now, semLid) => qf.par.get(ronda, now - CFG.feira.pairMs, x, y, y, x).s + difLeil(qf.parLeil.all(ronda, x, y, y, x), semLid);
// e o que passou por uma conta com toda a gente (várias contas alternativas, triângulos)
const feiraConta = (x, now, semLid) => qf.conta.get(ronda, now - CFG.feira.pairMs, x, x).s + difLeil(qf.contaLeil.all(ronda, x, x), semLid);
// quanto ainda pode passar (acima ou abaixo da referência) num negócio entre «eu» e «outro», e qual dos tetos aperta
function feiraFolga(eu, outro, now, semLid, cache) {
  const F = CFG.feira, c = (x) => { if (cache && cache.has(x)) return cache.get(x); const v = feiraConta(x, now, semLid); if (cache) cache.set(x, v); return v; };
  const t = [['PAIR_CAP', F.pairMax - feiraPar(eu, outro, now, semLid), F.pairMax], ['MY_CAP', F.acctMax - c(eu), F.acctMax], ['THEIR_CAP', F.acctMax - c(outro), F.acctMax]];
  return t.reduce((m, x) => (x[1] < m[1] ? x : m));
}
// os anúncios que acabaram: leilão com lance -> paga-se a quem vendeu e o objeto fica à espera de quem ganhou;
// o resto volta para quem vendeu (fica à espera de ser levantado)
function resolverFeira(now) {
  const L = qf.vencidos.all(ronda, now);
  if (!L.length) return;
  db.exec('BEGIN');
  try {
    for (const x of L) {
      if (x.tipo === 'leilao' && x.licitante) {
        const fee = E.feiraFee(x.lance), net = x.lance - fee, s = jogadores.get(x.vendedor);
        if (s) { s.bank += net; guardar(s, now); caixa(now, 'feira:venda', net, 0); }
        qf.levantar.run(x.licitante, x.id);
        qf.venda.run(ronda, x.item, x.fim, Math.floor(x.lance / x.n), x.n, x.licitante, x.vendedor, feiraDif(x.kind, x.item, x.n, x.lance, objDe(x)));
        evento(x.vendedor, now, { k: 'fSold', kind: x.kind, item: x.item, n: x.n, money: net, auc: true });
        evento(x.licitante, now, { k: 'fWon', kind: x.kind, item: x.item, n: x.n, money: x.lance });
        if (!s) console.error('feira: quem vendeu não está carregado', x.vendedor, x.id);
      } else {
        qf.levantar.run(x.vendedor, x.id);
        evento(x.vendedor, now, { k: 'fBack', kind: x.kind, item: x.item, n: x.n });
      }
      qf.licFora.run(x.id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); ronda = -1; throw e; }
}
function agirFeira(a, p, conta, now, world, ctx) {
  const F = CFG.feira, err = (c, x) => { throw new E.GameError(c, x); };
  const anuncio = () => { const L = Number.isSafeInteger(a.lid) ? qf.um.get(a.lid, ronda) : null; return L && L.estado === 'aberto' && L.fim > now ? L : err('NO_LISTING'); };
  const nivel = () => { if (E.level(p) < F.minLvl) err('LOW_LEVEL', { need: F.minLvl }); };
  // preço dentro da banda: a preço fixo, por unidade; em leilão, o lance inicial pelo lote todo
  const preco = (tipo, kind, id, n, o) => {
    const v = int(a.preco), B = E.feiraBand(kind, id, o), k = tipo === 'fixo' ? 1 : n, min = B.lo * k, max = B.hi * k;
    if (!Number.isSafeInteger(v) || v < min || v > max || (tipo === 'fixo' && v * n > F.maxPrice)) err('BAD_PRICE', { min, max });
    return v;
  };
  const tipoDe = () => (a.tipo === 'leilao' ? 'leilao' : 'fixo');
  // um objeto que pede nível (o capacete balístico, as perneiras...): na feira também
  const nivelDe = (L) => { const g = L.kind === 'inv' ? CFG.gear.find((x) => x.id === L.item) : null; if (g && g.level && E.level(p) < g.level) err('LOW_LEVEL', { need: g.level }); };
  // a diferença para a referência tem teto por dia: entre as mesmas duas contas e por conta
  const par = (outro, dif, semLid) => { const [code, left, max] = feiraFolga(conta, outro, now, semLid); if (dif > left) err(code, { max, left: Math.max(0, left) }); };
  if (a.type === 'feiraList') {
    nivel();
    const tipo = tipoDe(), kind = String(a.kind || ''), i = int(a.i);
    // o que vai à venda (sem mexer no jogador): no inventário, o objeto daquele lugar; no resto, o id e quantos
    const id = kind === 'inv' ? (Number.isInteger(i) && p.inv[i] ? p.inv[i].id : '') : String(a.id || '').slice(0, 24);
    const n = kind === 'inv' ? 1 : a.n === undefined ? 1 : int(a.n);
    if (!E.feiraDesc(kind, id)) err('NO_ITEM');
    if (!Number.isSafeInteger(n) || n < 1 || n > F.maxN) err('BAD_AMOUNT');
    if (kind !== 'inv' && !(((kind === 'mt' ? p.mt : p.col)[id] || 0) >= n)) err('NO_ITEM', { have: (kind === 'mt' ? p.mt : p.col)[id] || 0 });   // primeiro: tens isso?
    const v = preco(tipo, kind, id, n, kind === 'inv' ? p.inv[i] : null);
    if (qf.abertosDe.get(ronda, conta, conta).n >= F.maxOpen) err('FEIRA_FULL', { max: F.maxOpen });
    const d = E.feiraTake(p, now, world, kind, kind === 'inv' ? (typeof a.id === 'string' ? a.id : id) : id, n, i);
    const fim = now + (tipo === 'leilao' ? F.auctionMs : F.listMs);
    ctx.ops.push(() => qf.nova.run(ronda, conta, tipo, d.kind, d.id, d.o ? JSON.stringify(d.o) : null, d.n, v, now, fim));
    return { ok: true, tipo, kind: d.kind, id: d.id, n: d.n, preco: v, fim };
  }
  if (a.type === 'feiraRelist') {   // voltar a pôr à venda o que está à espera de ser levantado (não se vendeu, ou ganhou-se)
    nivel();
    const L = Number.isSafeInteger(a.lid) ? qf.um.get(a.lid, ronda) : null;
    if (!L || L.estado !== 'levantar' || L.dono !== conta) err('NO_LISTING');
    const tipo = tipoDe(), v = preco(tipo, L.kind, L.item, L.n, objDe(L));
    E.feiraBegin(p, now, world);   // só confere que pode agir (preso, no hospital, ocupado)
    const fim = now + (tipo === 'leilao' ? F.auctionMs : F.listMs);
    ctx.ops.push(() => { qf.denovo.run(conta, tipo, v, now, fim, L.id); qf.licFora.run(L.id); });
    return { ok: true, tipo, kind: L.kind, id: L.item, n: L.n, preco: v, fim, lid: L.id };
  }
  if (a.type === 'feiraBuy') {
    nivel();
    const L = anuncio();
    if (L.tipo !== 'fixo') err('NO_LISTING');
    if (L.vendedor === conta) err('OWN_LISTING');
    const s = jogadores.get(L.vendedor);
    if (!s) err('NO_LISTING');   // (quem vendeu tem sempre estado nesta ronda; sem ele, o dinheiro não tinha para onde ir)
    nivelDe(L);
    const k = a.n === undefined ? L.n : int(a.n);
    if (!Number.isSafeInteger(k) || k < 1 || k > L.n) err('BAD_AMOUNT', { max: L.n });
    const total = L.preco * k, dif = feiraDif(L.kind, L.item, k, total, objDe(L));
    par(L.vendedor, dif);
    const r = E.feiraBuy(p, now, world, descDe(L, k), total);
    const fee = E.feiraFee(total), net = total - fee;
    s.bank += net; ctx.outros.push(s);
    ctx.ops.push(() => {
      if (k === L.n) qf.apaga.run(L.id); else qf.menos.run(k, L.id);
      qf.venda.run(ronda, L.item, now, L.preco, k, conta, L.vendedor, dif);
      evento(L.vendedor, now, { k: 'fSold', kind: L.kind, item: L.item, n: k, money: net });
      caixa(now, 'feira:venda', net, 0);
    });
    return { ...r, lid: L.id };
  }
  if (a.type === 'feiraBid') {
    nivel();
    const L = anuncio();
    if (L.tipo !== 'leilao') err('NO_LISTING');
    if (L.vendedor === conta) err('OWN_LISTING');
    if (L.licitante === conta) err('LEADING');
    const cap = bandaDe(L).hi * L.n, min = E.feiraNext(L.lance, L.preco, cap), v = int(a.valor);
    if (!min) err('BID_TOP', { max: cap });
    if (!Number.isSafeInteger(v) || v < min) err('BID_LOW', { min });
    if (v > cap) err('BID_HIGH', { max: cap });
    nivelDe(L);
    // a feira não é um armazém: o que está por levantar mais os leilões em que vais à frente não passam de maxOpen
    if (qf.guardados.get(ronda, conta, conta).n >= F.maxOpen) err('FEIRA_FULL', { max: F.maxOpen });
    par(L.vendedor, feiraDif(L.kind, L.item, L.n, v, objDe(L)), L.id);   // (o lance de quem ia à frente sai das contas)
    E.feiraBegin(p, now, world);   // primeiro o que corre sozinho (a avença, os juros...): depois mede-se quanto sai do banco
    const banco = v - Math.min(Math.max(0, p.cash), v);   // pay() tira primeiro da mão: o resto sai do banco
    E.feiraLock(p, now, world, v);
    const prev = L.licitante ? jogadores.get(L.licitante) : null;
    // quem ia à frente recebe o dinheiro de onde saiu (a parte do banco volta ao banco, sem taxa; a da mão, à mão)
    if (prev) { const b = Math.min(L.lbanco || 0, L.lance); prev.bank += b; prev.cash += L.lance - b; ctx.outros.push(prev); }
    const fim = Math.max(L.fim, now + F.bidEndMs);
    ctx.ops.push(() => {
      qf.lance.run(v, conta, fim, banco, L.id);
      qf.licNovo.run(L.id, conta);
      if (L.licitante) { evento(L.licitante, now, { k: 'fOutbid', kind: L.kind, item: L.item, n: L.n, money: L.lance }); if (prev) caixa(now, 'feira:devolve', L.lance, 0); }
    });
    return { ok: true, lid: L.id, kind: L.kind, id: L.item, n: L.n, valor: v, fim, next: E.feiraNext(v, L.preco, cap) };
  }
  if (a.type === 'feiraCancel') {   // tirar da feira: volta logo, ou fica à espera de ser levantado se não couber; leilão só sem lances
    const L = anuncio();
    if (L.vendedor !== conta) err('NO_LISTING');
    if (L.licitante) err('HAS_BIDS');
    const d = descDe(L);
    E.feiraBegin(p, now, world);
    if (E.feiraFits(p, d)) { ctx.ops.push(() => qf.levantar.run(conta, L.id)); return { ok: true, kind: L.kind, id: L.item, n: L.n, lid: L.id, parked: true }; }
    const r = E.feiraGive(p, now, world, d);
    ctx.ops.push(() => qf.apaga.run(L.id));
    return { ...r, lid: L.id, back: true };
  }
  if (a.type === 'feiraTake') {   // levantar o que não se vendeu ou o que se ganhou
    const L = Number.isSafeInteger(a.lid) ? qf.um.get(a.lid, ronda) : null;
    if (!L || L.estado !== 'levantar' || L.dono !== conta) err('NO_LISTING');
    const r = E.feiraGive(p, now, world, descDe(L));
    ctx.ops.push(() => qf.apaga.run(L.id));
    return { ...r, lid: L.id, won: L.dono !== L.vendedor };
  }
  err('BAD_ACTION');
}
// lim: quanto ainda pode passar (acima ou abaixo da referência) num negócio com este anúncio, para o site o dizer antes do toque
const linhaFeira = (L, conta, now, cache) => {
  const cap = L.tipo === 'leilao' ? bandaDe(L).hi * L.n : undefined, o = objDe(L);
  const lim = cache && L.vendedor !== conta && L.estado === 'aberto' ? Math.max(0, feiraFolga(conta, L.vendedor, now, L.tipo === 'leilao' ? L.id : undefined, L.tipo === 'leilao' ? null : cache)[1]) : undefined;
  return { lid: L.id, tipo: L.tipo, kind: L.kind, id: L.item, n: L.n, u: o ? o.u : undefined, preco: L.preco, lance: L.lance, ref: E.feiraRef(L.kind, L.item, o), lim,
    next: L.tipo === 'leilao' ? E.feiraNext(L.lance, L.preco, cap) : undefined, max: cap,
    fim: L.fim, quem: nomeDe(L.vendedor), meu: L.vendedor === conta, frente: L.licitante === conta, lances: !!L.licitante, won: L.estado === 'levantar' && L.dono !== L.vendedor };
};
let cacheCat = { t: 0, r: -1, lista: [] };
// aoff: a partir de que leilão (página seguinte); an: quantos (para recarregar sem perder as páginas já abertas)
function vistaFeira(conta, now, item, aoff = 0, an = 40) {
  resolverFeira(now);
  if (cacheCat.r !== ronda || now - cacheCat.t > 5000) cacheCat = { t: now, r: ronda, lista: qf.catalogo.all(ronda, now) };
  const off = Number.isSafeInteger(aoff) && aoff > 0 ? Math.min(aoff, 10_000) : 0, k = Number.isSafeInteger(an) ? Math.max(40, Math.min(200, an)) : 40;
  const leil = qf.leiloes.all(ronda, now, k + 1, off), cache = new Map();
  const out = {
    now, cat: cacheCat.lista.map((x) => ({ kind: x.kind, id: x.item, preco: x.preco, n: x.n, c: x.c })),
    leiloes: leil.slice(0, k).map((L) => linhaFeira(L, conta, now, cache)), aoff: off, maisLeiloes: leil.length > k,
    passados: qf.passados.all(conta, ronda, conta, now).map((L) => linhaFeira(L, conta, now, cache)),   // leilões em que licitaste e te passaram à frente
    meus: qf.meus.all(ronda, conta).map((L) => linhaFeira(L, conta, now)),
    levantar: qf.paraMim.all(ronda, conta).map((L) => linhaFeira(L, conta, now)),
    lances: qf.lancesMeus.all(ronda, conta).map((L) => linhaFeira(L, conta, now)),
  };
  if (typeof item === 'string' && item.length <= 24) {
    const u = qf.precos.all(ronda, item).map((x) => x.unit).sort((x, y) => x - y);
    out.item = { id: item, lista: qf.doItem.all(ronda, item, now).map((L) => linhaFeira(L, conta, now, cache)), med: u.length ? u[Math.floor(u.length / 2)] : 0, vendas: u.length };
  }
  return out;
}

// ---------- gangues ----------
// O registo das gangues (quem é de qual, o cofre e os níveis) vive aqui; o bónus de cada membro é escrito no jogador.
db.exec(`CREATE TABLE IF NOT EXISTS gangues (ronda INTEGER NOT NULL, id TEXT NOT NULL, nome TEXT NOT NULL, nome_lc TEXT NOT NULL, tag TEXT NOT NULL, lider TEXT NOT NULL,
  cofre INTEGER NOT NULL DEFAULT 0, sede INTEGER NOT NULL DEFAULT 1, armaria INTEGER NOT NULL DEFAULT 0, aberta INTEGER NOT NULL DEFAULT 1, criada INTEGER NOT NULL, PRIMARY KEY (ronda, id));
CREATE TABLE IF NOT EXISTS gangue_membros (ronda INTEGER NOT NULL, conta TEXT NOT NULL, gangue TEXT NOT NULL, entrou INTEGER NOT NULL, dado INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ronda, conta));
CREATE TABLE IF NOT EXISTS gangue_pedidos (ronda INTEGER NOT NULL, gangue TEXT NOT NULL, conta TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (ronda, gangue, conta));
CREATE TABLE IF NOT EXISTS gangue_chat (id INTEGER PRIMARY KEY AUTOINCREMENT, ronda INTEGER NOT NULL, gangue TEXT NOT NULL, conta TEXT NOT NULL, t INTEGER NOT NULL, txt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS gangue_chat_g ON gangue_chat (ronda, gangue, id);`);
try { db.exec('ALTER TABLE gangue_membros ADD COLUMN cargo INTEGER NOT NULL DEFAULT 0'); } catch { /* já existe */ }   // 0 membro, 1 capitão, 2 subchefe (o chefe está em gangues.lider)
const qg = {
  todas: db.prepare('SELECT * FROM gangues WHERE ronda = ?'),
  membros: db.prepare('SELECT * FROM gangue_membros WHERE ronda = ?'),
  pedidos: db.prepare('SELECT * FROM gangue_pedidos WHERE ronda = ?'),
  nova: db.prepare('INSERT INTO gangues (ronda, id, nome, nome_lc, tag, lider, cofre, sede, armaria, aberta, criada) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 0, 1, ?)'),
  grava: db.prepare('UPDATE gangues SET lider = ?, cofre = ?, sede = ?, armaria = ?, aberta = ? WHERE ronda = ? AND id = ?'),
  apaga: db.prepare('DELETE FROM gangues WHERE ronda = ? AND id = ?'),
  entra: db.prepare('INSERT OR REPLACE INTO gangue_membros (ronda, conta, gangue, entrou, dado, cargo) VALUES (?, ?, ?, ?, ?, ?)'),
  cargo: db.prepare('UPDATE gangue_membros SET cargo = ? WHERE ronda = ? AND conta = ?'),
  sai: db.prepare('DELETE FROM gangue_membros WHERE ronda = ? AND conta = ?'),
  pede: db.prepare('INSERT OR REPLACE INTO gangue_pedidos (ronda, gangue, conta, t) VALUES (?, ?, ?, ?)'),
  despede: db.prepare('DELETE FROM gangue_pedidos WHERE ronda = ? AND conta = ?'),
  despedeUm: db.prepare('DELETE FROM gangue_pedidos WHERE ronda = ? AND gangue = ? AND conta = ?'),
  apagaPedidos: db.prepare('DELETE FROM gangue_pedidos WHERE ronda = ? AND gangue = ?'),
  fala: db.prepare('INSERT INTO gangue_chat (ronda, gangue, conta, t, txt) VALUES (?, ?, ?, ?, ?)'),
  chat: db.prepare('SELECT id, conta, t, txt FROM gangue_chat WHERE ronda = ? AND gangue = ? ORDER BY id DESC LIMIT 40'),
  apagaChat: db.prepare('DELETE FROM gangue_chat WHERE ronda = ? AND gangue = ?'),
  limpaChat: db.prepare('DELETE FROM gangue_chat WHERE t < ?'),
};
const BOT = CFG.gang.bot, eBot = (g) => !!g && g.id === BOT.id;
const gangues = new Map();   // id -> { id, nome, tag, lider, cofre, sede, armaria, aberta, criada, membros: Map(conta -> { entrou, dado, cargo }), pedidos: Map(conta -> t) }
function carregarGangues() {
  gangues.clear();
  for (const g of qg.todas.all(ronda)) gangues.set(g.id, { id: g.id, nome: g.nome, tag: g.tag, lider: g.lider, cofre: g.cofre, sede: g.sede, armaria: g.armaria, aberta: !!g.aberta, criada: g.criada, membros: new Map(), pedidos: new Map(), op: null, opCool: 0, last: null });
  for (const m of qg.membros.all(ronda)) gangues.get(m.gangue)?.membros.set(m.conta, { entrou: m.entrou, dado: m.dado, cargo: m.cargo || 0 });
  for (const r of qg.pedidos.all(ronda)) gangues.get(r.gangue)?.pedidos.set(r.conta, r.t);
  for (const r of qo.todas.all(ronda)) { const g = gangues.get(r.gangue); if (g) g.op = JSON.parse(r.dados); }
  // a gangue da rua (chefiada por um bot) existe em todas as rondas, mesmo vazia
  if (!gangues.has(BOT.id)) {
    qg.nova.run(ronda, BOT.id, BOT.name, BOT.name.toLowerCase(), BOT.tag, '', Date.now());
    gangues.set(BOT.id, { id: BOT.id, nome: BOT.name, tag: BOT.tag, lider: '', cofre: 0, sede: 1, armaria: 0, aberta: true, criada: Date.now(), membros: new Map(), pedidos: new Map(), op: null, opCool: 0, last: null });
  }
  // manda o registo das gangues: o bónus escrito em cada jogador acerta-se por ele
  const de = new Map(); for (const g of gangues.values()) for (const c of g.membros.keys()) de.set(c, g);
  for (const p of jogadores.values()) { const g = de.get(p.id); if (g) E.gangSet(p, g.id, g.sede, g.armaria); else if (p.gang) E.gangOrphan(p); }
}
const gangueDe = (conta) => { const p = jogadores.get(conta); return p && p.gang ? gangues.get(p.gang) || null : null; };
const tagDe = (conta) => gangueDe(conta)?.tag || '';
const NOME_G = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{1,18}[\p{L}\p{N}]$/u, TAG_G = /^[A-Z0-9]{2,4}$/;
const gravaG = (g) => qg.grava.run(g.lider, g.cofre, g.sede, g.armaria, g.aberta ? 1 : 0, ronda, g.id);
// ---- golpes e tareias em grupo: um pedido aberto por gangue; quem alinha fica gravado, para um reinício não perder a stamina de ninguém ----
// O pedido não tem prazo: fica aberto até haver gente que chegue ou até ser cancelado (por quem o abriu, pelo chefe ou por quem tem cargo).
// Quando a equipa fica completa começa a última chamada (op.vai = a hora a que se vai); quem manda no pedido pode avançar logo.
db.exec('CREATE TABLE IF NOT EXISTS gangue_ops (ronda INTEGER NOT NULL, gangue TEXT NOT NULL, dados TEXT NOT NULL, PRIMARY KEY (ronda, gangue))');
const qo = {
  todas: db.prepare('SELECT * FROM gangue_ops WHERE ronda = ?'),
  grava: db.prepare('INSERT OR REPLACE INTO gangue_ops (ronda, gangue, dados) VALUES (?, ?, ?)'),
  apaga: db.prepare('DELETE FROM gangue_ops WHERE ronda = ? AND gangue = ?'),
};
const OP_MS = (kind) => (process.env.GANG_OP_MS ? +process.env.GANG_OP_MS : kind === 'hit' ? CFG.gang.hitMs : CFG.gang.opMs);   // a última chamada
const BOT_OP_MAX = process.env.GANG_BOT_OP_MS ? +process.env.GANG_BOT_OP_MS : BOT.opMaxMs;
const gravaOp = (g) => (g.op ? qo.grava.run(ronda, g.id, JSON.stringify(g.op)) : qo.apaga.run(ronda, g.id));
const opNeed = (op) => (op.kind === 'hit' ? CFG.gang.hitNeed : CFG.gang.heists[op.k].need);
const devolveOp = (op, p, now) => (op.kind === 'hit' ? E.hitRefund(p, now) : E.heistRefund(p, now, op.k));
// cargos: 0 membro, 1 capitão, 2 subchefe; o chefe (g.lider) vale 3. Na gangue da rua ninguém tem cargo.
const cargoDe = (g, conta) => (g.lider === conta ? 3 : g.membros.get(conta)?.cargo || 0);
const mandaOp = (g, conta) => g.op.by === conta || cargoDe(g, conta) >= CFG.gang.roles.ops;
// Como está um pedido aberto: quem alinhou e está em condições, se já chega e (nas tareias) se o alvo está à mão.
function opEstado(g, now) {
  const op = g.op, todos = op.parts.map((c) => jogadores.get(c)).filter(Boolean), ps = todos.filter((p) => E.opReady(p, now));
  const d = op.kind === 'hit' ? jogadores.get(op.alvo) : null, need = opNeed(op);
  const gone = op.kind === 'hit' && (!d || d.gang === g.id);                    // o alvo já não existe ou entrou para a gangue: fica sem efeito
  const hold = op.kind === 'hit' && !gone && !E.hitCanResolve(d, now, g.id);    // no hospital, preso ou protegido: espera-se por ele
  return { todos, ps, d, need, gone, hold, pronto: ps.length >= need && !gone && !hold };
}
// A última chamada começa quando a equipa fica completa e pára se deixar de estar. Devolve true se mudou (para gravar).
function acertaVai(g, now, s = opEstado(g, now)) {
  const op = g.op;
  if (s.pronto && !op.vai) { op.vai = now + OP_MS(op.kind); return true; }
  if (!s.pronto && op.vai) { op.vai = 0; return true; }
  return false;
}
// Fecha um pedido: faz o golpe (ou a tareia) com quem está em condições, ou cancela-o (cancela = o motivo) e devolve a stamina a todos.
function resolverOp(g, now, s, cancela = null) {
  const op = g.op, { todos, ps, d } = s, antes = new Map(todos.map((p) => [p.id, p.respect]));
  const fora = todos.filter((p) => !ps.includes(p)), dAntes = d ? d.respect : 0;
  for (const p of fora) devolveOp(op, p, now);
  let res;
  if (cancela) {
    for (const p of ps) devolveOp(op, p, now);
    res = { kind: op.kind, ...(op.kind === 'hit' ? { target: nomeDe(op.alvo) } : { k: op.k }), cancelled: true, n: ps.length, need: s.need, ...cancela };
  } else if (op.kind === 'heist') {
    const r = E.heistResolve(ps, now, op.k, rng);
    res = { kind: 'heist', k: op.k, success: r.success, chanceBp: r.chanceBp, parts: r.parts.map((x) => ({ name: nomeDe(x.id), money: x.money, respect: x.respect, share: x.share, busted: !!x.busted })) };
  } else {
    const r = E.hitResolve(ps, d, now, rng);
    res = { kind: 'hit', target: nomeDe(op.alvo), win: r.win, chanceBp: r.chanceBp, targetLoss: r.targetLoss || 0, parts: r.parts.map((x) => ({ name: nomeDe(x.id), money: 0, respect: x.respect, busted: false })) };
  }
  g.op = null; g.last = { t: now, ...res };
  if (!res.cancelled) g.opCool = now + CFG.gang.opCoolMs;
  db.exec('BEGIN');
  try {
    for (const p of todos) {
      guardar(p, now);
      const dentro = ps.includes(p), eu = dentro ? (res.parts || []).find((x) => x.name === nomeDe(p.id)) : null;
      if (dentro && !res.cancelled) contarDia(now, p.id, { resp: p.respect - antes.get(p.id), money: eu?.money || 0, best: eu?.money || 0, fights: res.kind === 'hit' && res.win ? 1 : 0, beaten: res.kind === 'hit' && !res.win ? 1 : 0, busts: eu?.busted ? 1 : 0 });
      evento(p.id, now, { k: 'gop', gang: g.nome, kind: res.kind, c: res.kind === 'heist' ? CFG.gang.heists[res.k].id : null, target: res.target || null, cancelled: !!res.cancelled, gone: !!res.gone, stale: !!res.stale, out: !dentro && !res.cancelled, need: res.need || 0,
        ok: res.kind === 'heist' ? !!res.success : !!res.win, n: ps.length, money: eu?.money || 0, respect: eu?.respect || 0, busted: !!eu?.busted });
    }
    if (d && !res.cancelled) {
      guardar(d, now); contarDia(now, d.id, { resp: d.respect - dAntes, beaten: res.win ? 1 : 0 });
      evento(d.id, now, { k: 'attacked', by: `[${g.tag}] ${g.nome}`, mode: 'beat', win: res.win, respect: d.respect - dAntes, money: 0, crew: ps.length });
    }
    qo.apaga.run(ronda, g.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); const n = ronda; ronda = -1; carregarRonda(n); console.error('op', e.message); return; }   // volta ao que estava gravado; tenta outra vez no segundo seguinte
  if (!res.cancelled) {
    if (res.kind === 'heist') {
      const o = { k: res.success ? 'gangHeist' : 'gangHeistFail', gang: g.nome, tag: g.tag, c: CFG.gang.heists[res.k].id, n: ps.length, money: res.parts.reduce((x, y) => x + y.money, 0) };
      if (res.success) amostra(now, 'gangHeist', o.money, { name: g.nome, tag: g.tag, c: o.c, n: o.n }, o); else noticia(now, o);
    }
    else noticia(now, { k: res.win ? 'gangHit' : 'gangHitFail', gang: g.nome, tag: g.tag, target: res.target, n: ps.length });
  }
}
// Um passo de um pedido aberto: equipa completa → começa a última chamada; acabou a última chamada → vai-se;
// alvo que já não dá → fica sem efeito. Sem prazo para juntar gente (menos na gangue da rua, onde não há quem cancele).
function andarOp(g, now) {
  const op = g.op; if (!op) return;
  const w = mundo(now);
  if (w.n !== ronda || w.phase !== 'play') { g.op = null; qo.apaga.run(ronda, g.id); return; }   // a ronda fechou com o pedido aberto: fica sem efeito
  const s = opEstado(g, now);
  if (s.gone) return resolverOp(g, now, s, { gone: true });
  if (acertaVai(g, now, s)) { gravaOp(g); return; }
  if (op.vai && now >= op.vai) return resolverOp(g, now, s);
  if (eBot(g) && !op.vai && now >= op.abre + BOT_OP_MAX) resolverOp(g, now, s, { stale: true });
}
// os pedidos acertam-se a cada segundo e antes de qualquer ação ou vista
function resolverOps(now) { for (const g of [...gangues.values()]) if (g.op) andarOp(g, now); }
setInterval(() => {
  const now = clock();
  if (ronda < 0) return;
  try { resolverOps(now); } catch (e) { console.error('op', e.message); }
}, 1000).unref();
// Cancelar à mão (dentro de uma ação): a stamina volta a todos e os outros ficam a saber quem cancelou.
function cancelarOp(g, now, ctx, p, quem) {
  const op = g.op, nome = nomeDe(quem), base = { kind: op.kind, cancelled: true, by: nome, n: op.parts.length, need: opNeed(op) };
  for (const c of op.parts) {
    const o = jogadores.get(c); if (!o) continue;
    devolveOp(op, o, now); if (o !== p && !ctx.outros.includes(o)) ctx.outros.push(o);
    if (c !== quem) ctx.ops.push(() => evento(c, now, { k: 'gop', gang: g.nome, ...base, c: op.kind === 'heist' ? CFG.gang.heists[op.k].id : null, target: op.kind === 'hit' ? nomeDe(op.alvo) : null }));
  }
  g.last = { t: now, ...base, ...(op.kind === 'hit' ? { target: nomeDe(op.alvo) } : { k: op.k }) };
  g.op = null; ctx.ops.push(() => gravaOp(g));
}
// Tira alguém de um pedido aberto (saiu do pedido, saiu da gangue ou foi expulso): a stamina dele volta.
// Se era quem o abriu, o pedido passa para quem alinhou a seguir; se não fica ninguém, fecha.
function tirarDaOp(g, o, now, ctx, p) {
  const op = g.op; if (!op || !op.parts.includes(o.id)) return;
  devolveOp(op, o, now); op.parts.splice(op.parts.indexOf(o.id), 1);
  if (o !== p && !ctx.outros.includes(o)) ctx.outros.push(o);
  if (!op.parts.length) g.op = null; else { if (op.by === o.id) op.by = op.parts[0]; acertaVai(g, now); }
  ctx.ops.push(() => gravaOp(g));
}
// abrir, alinhar, sair, mandar avançar ou cancelar um pedido da gangue
function agirOp(a, p, conta, now, world, ctx, g) {
  const err = (c, x) => { throw new E.GameError(c, x); };
  if (a.type === 'gangOp') {
    if (g.op) err('OP_OPEN');
    if (g.opCool > now) err('OP_WAIT', { until: g.opCool });
    let op, r;
    if (a.kind === 'hit') {
      const c = q.contaPorNome.get(String(a.target || '').toLowerCase()), d = c && jogadores.get(c.id);
      if (!d) err('NO_TARGET');
      r = E.hitJoin(p, d, now, world, a.drop === true);
      op = { kind: 'hit', alvo: d.id, by: conta, abre: now, vai: 0, parts: [conta] };
    } else {
      const k = int(a.k), H = CFG.gang.heists[k];
      if (!H) err('NO_CRIME');
      if (g.sede < H.sede) err('NEED_SEDE', { need: H.sede });
      r = E.heistJoin(p, now, world, k);
      op = { kind: 'heist', k, by: conta, abre: now, vai: 0, parts: [conta] };
    }
    g.op = op; acertaVai(g, now); ctx.ops.push(() => gravaOp(g));
    return { ...r, opened: true };
  }
  const op = g.op || err('NO_OP');
  if (a.type === 'gangOpJoin') {
    if (op.parts.includes(conta)) err('IN_OP');
    if (op.parts.length >= CFG.gang.opMax) err('GANG_FULL');
    const r = op.kind === 'hit' ? E.hitJoin(p, jogadores.get(op.alvo) || err('NO_TARGET'), now, world, a.drop === true) : E.heistJoin(p, now, world, op.k);
    op.parts.push(conta); acertaVai(g, now); ctx.ops.push(() => gravaOp(g));
    return { ...r, joined: true };
  }
  if (a.type === 'gangOpLeave') {   // quem alinhou muda de ideias: sai e fica com a stamina de volta
    if (!op.parts.includes(conta)) err('NOT_IN_OP');
    E.touch(p, now); tirarDaOp(g, p, now, ctx, p);
    return { ok: true, left: true };
  }
  if (a.type === 'gangOpGo') {      // a equipa está completa: não se espera pelo fim da última chamada
    if (!mandaOp(g, conta)) err('NO_RANK');
    const s = opEstado(g, now);
    if (!s.pronto) err('OP_NOT_READY', { n: s.ps.length, need: s.need });
    E.touch(p, now); op.vai = now; ctx.ops.push(() => gravaOp(g));   // resolve-se no passo seguinte (no máximo 1 s) ou na vista que vem a seguir
    return { ok: true, go: true };
  }
  if (a.type === 'gangOpCancel') {
    if (!mandaOp(g, conta)) err('NO_RANK');
    E.touch(p, now); cancelarOp(g, now, ctx, p, conta);
    return { ok: true, cancelled: true };
  }
  err('BAD_ACTION');
}
function vistaOp(g, conta, now) {
  const op = g.op; if (!op) return null;
  const s = opEstado(g, now), manda = mandaOp(g, conta), d = s.d, ps = s.todos, vai = s.pronto ? op.vai || 0 : 0;
  return { kind: op.kind, k: op.k ?? null, target: op.kind === 'hit' ? nomeDe(op.alvo) : null, by: nomeDe(op.by), mine: op.by === conta, mineToCancel: manda, canGo: manda && s.pronto,
    openedAt: op.abre, goAt: vai, hold: s.hold, away: s.todos.length - s.ps.length, staleAt: eBot(g) && !vai ? op.abre + BOT_OP_MAX : 0,
    closesAt: vai || now + 24 * 3600_000,   // só para quem ainda tem a versão antiga do jogo aberta, que conta com um prazo
    parts: op.parts.map(nomeDe), joined: op.parts.includes(conta),
    need: s.need, e: op.kind === 'hit' ? CFG.pvp.energy : CFG.gang.heists[op.k].e,
    chance: !ps.length ? 0 : op.kind === 'hit' ? (d ? E.hitChanceBp(ps, d, now) : 0) : E.heistChanceBp(ps, op.k, now),
    // a parte do saque de quem está a ver, com o grupo como está agora (muda quando entra mais gente)
    share: op.kind === 'heist' && op.parts.includes(conta) && ps.length === op.parts.length ? E.heistShares(ps, op.k, now)[op.parts.indexOf(conta)] : null };
}

// todas as ações de gangue. ctx junta o que tem de ser gravado no mesmo passo: outros jogadores, escritas na base de dados e o que se faz depois
function agirGangue(a, p, conta, now, world, ctx) {
  const err = (c, x) => { throw new E.GameError(c, x); };
  const minha = () => gangueDe(conta) || err('NO_GANG');
  const chefe = () => { const g = minha(); if (g.lider !== conta) err('NOT_LEADER'); return g; };
  const R = CFG.gang.roles, comCargo = (min) => { const g = minha(); if (cargoDe(g, conta) < min) err('NO_RANK', { need: min }); return g; };   // o chefe vale 3, o subchefe 2, o capitão 1
  const outro = (g, nome) => { const c = q.contaPorNome.get(String(nome || '').toLowerCase()); const o = c && jogadores.get(c.id); if (!o) err('NO_TARGET'); return o; };
  const entrar = (g, o) => {
    E.gangSet(o, g.id, g.sede, g.armaria); g.membros.set(o.id, { entrou: now, dado: 0, cargo: 0 });
    for (const x of gangues.values()) x.pedidos.delete(o.id);
    ctx.ops.push(() => { qg.entra.run(ronda, o.id, g.id, now, 0, 0); qg.despede.run(ronda, o.id); });
  };
  // negócios da gangue: o bónus de grupo de cada membro depende do que os outros lá têm; acerta-se sempre que alguém investe ou sai
  const acertaNegocios = (g) => { const ms = [...g.membros.keys()].map((c) => jogadores.get(c)).filter(Boolean); for (const o of E.gangBizSync(ms, now)) if (o !== p && !ctx.outros.includes(o)) ctx.outros.push(o); };
  const sair = (g, o) => {
    tirarDaOp(g, o, now, ctx, p);   // se tinha alinhado num pedido aberto, sai dele e a stamina volta
    const back = E.gangLeave(o, now); g.membros.delete(o.id);
    if (back.invested > 0 && g.membros.size) acertaNegocios(g);
    ctx.ops.push(() => qg.sai.run(ronda, o.id));
    if (eBot(g)) { /* fica sempre aberta, com ou sem gente */ }
    else if (!g.membros.size) { gangues.delete(g.id); ctx.ops.push(() => { qo.apaga.run(ronda, g.id); qg.apaga.run(ronda, g.id); qg.apagaPedidos.run(ronda, g.id); qg.apagaChat.run(ronda, g.id); }); }
    else if (g.lider === o.id) {   // a chefia passa para o cargo mais alto (subchefe, depois capitão); entre iguais, para o mais antigo
      const [c, m] = [...g.membros].sort((x, y) => (y[1].cargo || 0) - (x[1].cargo || 0) || x[1].entrou - y[1].entrou)[0];
      g.lider = c; ctx.ops.push(() => gravaG(g));
      if (m.cargo) { m.cargo = 0; ctx.ops.push(() => qg.cargo.run(0, ronda, c)); }
      ctx.depois.push(() => evento(c, now, { k: 'gangRole', gang: g.nome, role: 3 }));
    }
    return back;
  };
  if (['gangOp', 'gangOpJoin', 'gangOpLeave', 'gangOpGo', 'gangOpCancel'].includes(a.type)) return agirOp(a, p, conta, now, world, ctx, minha());
  if (a.type !== 'gangCreate' && a.type !== 'gangDonate') E.touch(p, now);
  switch (a.type) {
    case 'gangCreate': {
      const nome = String(a.name || '').trim().replace(/\s+/g, ' '), tag = String(a.tag || '').trim().toUpperCase();
      if (!NOME_G.test(nome)) err('BAD_GANG_NAME');
      if (!TAG_G.test(tag)) err('BAD_GANG_TAG');
      for (const g of gangues.values()) { if (g.nome.toLowerCase() === nome.toLowerCase()) err('GANG_NAME_TAKEN'); if (g.tag === tag) err('GANG_TAG_TAKEN'); }
      const r = E.gangCreate(p, now, world), id = randomBytes(6).toString('base64url');
      E.gangSet(p, id, 1, 0);
      gangues.set(id, { id, nome, tag, lider: conta, cofre: 0, sede: 1, armaria: 0, aberta: true, criada: now, membros: new Map([[conta, { entrou: now, dado: 0, cargo: 0 }]]), pedidos: new Map(), op: null, opCool: 0, last: null });
      for (const x of gangues.values()) x.pedidos.delete(conta);
      ctx.ops.push(() => { qg.nova.run(ronda, id, nome, nome.toLowerCase(), tag, conta, now); qg.entra.run(ronda, conta, id, now, 0, 0); qg.despede.run(ronda, conta); });
      ctx.depois.push(() => noticia(now, { k: 'gangNew', name: nomeDe(conta), gang: nome, tag }));
      return { ...r, id, name: nome, tag };
    }
    case 'gangJoin': {
      const g = gangues.get(String(a.id)) || err('NO_GANG');
      if (eBot(g)) { E.gangBotCanJoin(p, now); entrar(g, p); return { ok: true, joined: true, name: g.nome, bot: true }; }   // entra quem quiser, sem limite de lugares
      E.gangCanJoin(p, now);
      if (g.membros.size >= E.gangSlots(g.sede)) err('GANG_FULL');
      if (g.aberta) { entrar(g, p); return { ok: true, joined: true, name: g.nome }; }
      if (g.pedidos.size >= 20) err('GANG_FULL');
      let meus = 0; for (const x of gangues.values()) if (x.pedidos.has(conta)) meus++;
      if (!g.pedidos.has(conta) && meus >= 3) err('TOO_MANY_ASKS');
      g.pedidos.set(conta, now); ctx.ops.push(() => qg.pede.run(ronda, g.id, conta, now));
      return { ok: true, asked: true, name: g.nome };
    }
    case 'gangAccept': case 'gangReject': {
      const g = comCargo(R.asks), o = outro(g, a.name);
      if (!g.pedidos.has(o.id)) err('NO_ASK');
      if (a.type === 'gangAccept') { E.gangCanJoin(o, now); if (g.membros.size >= E.gangSlots(g.sede)) err('GANG_FULL'); }   // primeiro confirma-se tudo, só depois se mexe
      g.pedidos.delete(o.id); ctx.ops.push(() => qg.despedeUm.run(ronda, g.id, o.id));
      if (a.type === 'gangReject') return { ok: true };
      entrar(g, o); ctx.outros.push(o);
      ctx.depois.push(() => evento(o.id, now, { k: 'gangIn', gang: g.nome }));
      return { ok: true, joined: true };
    }
    case 'gangLeave': { const g = minha(), back = sair(g, p); return { ok: true, left: g.nome, back: back.refund + back.stored }; }
    case 'gangBail': case 'gangMedic': {
      const g = minha(), o = outro(g, a.name);
      if (o.id === conta || !g.membros.has(o.id)) err('NO_TARGET');
      const r = a.type === 'gangBail' ? E.bailFor(p, o, now, world) : E.medicFor(p, o, now, world);
      ctx.outros.push(o);
      ctx.depois.push(() => evento(o.id, now, { k: a.type === 'gangBail' ? 'gangBail' : 'gangMedic', by: nomeDe(conta), money: r.cost }));
      return r;
    }
    case 'gangKick': {
      const g = comCargo(R.kick), o = outro(g, a.name);
      if (o.id === conta || !g.membros.has(o.id)) err('NO_TARGET');
      if (cargoDe(g, o.id) >= cargoDe(g, conta)) err('NO_RANK');   // só se expulsa quem está abaixo
      const back = sair(g, o); if (!ctx.outros.includes(o)) ctx.outros.push(o);
      ctx.depois.push(() => evento(o.id, now, { k: 'gangOut', gang: g.nome, money: back.refund + back.stored }));
      return { ok: true };
    }
    case 'gangLeader': {
      const g = chefe(), o = outro(g, a.name);
      if (o.id === conta || !g.membros.has(o.id)) err('NO_TARGET');
      const m = g.membros.get(o.id);
      g.lider = o.id; ctx.ops.push(() => gravaG(g));
      if (m.cargo) { m.cargo = 0; ctx.ops.push(() => qg.cargo.run(0, ronda, o.id)); }   // o chefe não tem outro cargo; quem passou a chefia fica como membro
      ctx.depois.push(() => evento(o.id, now, { k: 'gangRole', gang: g.nome, role: 3 }));
      return { ok: true };
    }
    case 'gangRole': {   // o chefe dá ou tira um cargo: 2 subchefe, 1 capitão, 0 membro
      const g = chefe(), o = outro(g, a.name), role = int(a.role), m = g.membros.get(o.id);
      if (o.id === conta || !m) err('NO_TARGET');
      if (![0, 1, 2].includes(role)) err('BAD_ACTION');
      const tem = m.cargo || 0;
      if (role === tem) return { ok: true, role };
      if (role) { let n = 0; for (const x of g.membros.values()) if ((x.cargo || 0) === role) n++; if (n >= R.max[role]) err('ROLE_FULL', { max: R.max[role] }); }
      m.cargo = role; ctx.ops.push(() => qg.cargo.run(role, ronda, o.id));
      ctx.depois.push(() => evento(o.id, now, { k: 'gangRole', gang: g.nome, role, was: tem }));
      return { ok: true, role };
    }
    case 'gangOpen': { const g = chefe(); g.aberta = a.open === true; ctx.ops.push(() => gravaG(g)); return { ok: true, open: g.aberta }; }
    case 'gangDonate': {
      const g = minha(); if (eBot(g)) err('BOT_GANG_NO');   // a gangue da rua não tem cofre nem melhorias
      const r = E.gangDonate(p, now, world, int(a.amount)), m = g.membros.get(conta);
      g.cofre += r.amount; m.dado += r.amount;
      ctx.ops.push(() => { gravaG(g); qg.entra.run(ronda, conta, g.id, m.entrou, m.dado, m.cargo || 0); });
      return { ...r, fund: g.cofre };
    }
    case 'gangUp': {
      const g = chefe(), what = a.what === 'armaria' ? 'armaria' : a.what === 'sede' ? 'sede' : err('BAD_ACTION');
      if (g[what] >= CFG.gang.maxLevel) err('GANG_MAX');
      const cost = what === 'sede' ? CFG.gang.sede[g.sede - 1] : CFG.gang.armaria[g.armaria];
      if (!Number.isSafeInteger(cost) || g.cofre < cost) err('NO_GANG_MONEY', { need: cost, have: g.cofre });
      g.cofre -= cost; g[what] += 1;
      for (const c of g.membros.keys()) { const o = jogadores.get(c); if (o) { E.gangSet(o, g.id, g.sede, g.armaria); if (o !== p) ctx.outros.push(o); } }
      ctx.ops.push(() => gravaG(g));
      ctx.depois.push(() => noticia(now, { k: 'gangUp', gang: g.nome, tag: g.tag, what, n: g[what] }));
      return { ok: true, what, level: g[what], cost, fund: g.cofre };
    }
    case 'gangBiz': {
      const g = minha(), r = E.gangBizInvest(p, now, world, int(a.k), int(a.amount), g.sede);
      acertaNegocios(g);
      return { ...r, coop: p.gbz[r.k].coop };
    }
    case 'gangBizCollect': { minha(); return E.gangBizCollect(p, now, world); }
    case 'gangChat': {
      const g = minha(), txt = String(a.txt || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim().slice(0, CFG.gang.chatMax);
      if (!txt) err('BAD_ACTION');
      if (!limite('gchat:' + conta, 8, 20_000, now)) err('SLOW_DOWN');
      ctx.ops.push(() => qg.fala.run(ronda, g.id, conta, now, txt));
      return { ok: true };
    }
  }
  err('BAD_ACTION');
}
function vistaGangue(conta, now) {
  resolverOps(now);
  const resumo = (g) => { let resp = 0; for (const c of g.membros.keys()) resp += jogadores.get(c)?.respect || 0;
    return { id: g.id, name: g.nome, tag: g.tag, members: g.membros.size, slots: eBot(g) ? Math.max(g.membros.size + 1, E.gangSlots(g.sede)) : E.gangSlots(g.sede), sede: g.sede, armaria: g.armaria, open: g.aberta, respect: resp, leader: eBot(g) ? 'Bot' : nomeDe(g.lider), bot: eBot(g) }; };
  const list = [...gangues.values()].filter((g) => !eBot(g)).map(resumo).sort((a, b) => b.respect - a.respect || a.name.localeCompare(b.name)).slice(0, 50).map((x, i) => ({ ...x, pos: i + 1, asked: gangues.get(x.id).pedidos.has(conta) }));
  const mine = gangueDe(conta), eu0 = jogadores.get(conta), gb = gangues.get(BOT.id);
  const out = { now, list, mine: null, bot: gb ? { id: gb.id, members: gb.membros.size, wait: eu0 && eu0.gbotLeft ? eu0.gbotLeft + BOT.rejoinMs : 0 } : null };
  if (mine) {
    const quem = (c) => { const o = jogadores.get(c); if (o) E.touch(o, now); return { name: nomeDe(c), av: o?.av || 0, level: o ? E.level(o) : 1, respect: o?.respect || 0,
      jail: o && o.jailUntil > now ? o.jailUntil : 0, bail: o ? E.bailCost(o, now) : 0, hosp: o && o.hospUntil > now ? o.hospUntil : 0, medic: o ? E.medicCost(o, now) : 0 }; };
    const meu = cargoDe(mine, conta), R = CFG.gang.roles;
    out.mine = { ...resumo(mine), pos: list.find((x) => x.id === mine.id)?.pos || null, fund: mine.cofre, leaderMe: mine.lider === conta,
      // o meu cargo (3 chefe, 2 subchefe, 1 capitão, 0 membro) e o que posso fazer com ele
      role: meu, can: { asks: meu >= R.asks, ops: meu >= R.ops, kick: meu >= R.kick, roles: meu === 3 },
      // a hipótese de cada golpe com uma equipa do tamanho mínimo, toda igual a ti: o risco que se vê antes de abrir o pedido
      heistPrev: eu0 ? CFG.gang.heists.map((H, k) => E.heistChanceBp(Array(H.need).fill(eu0), k, now)) : [],
      roster: (() => { const r = [...mine.membros].map(([c, m]) => ({ ...quem(c), given: m.dado, stake: (jogadores.get(c)?.gbz || []).reduce((x, y) => x + (y.inv || 0), 0), leader: c === mine.lider, role: cargoDe(mine, c), me: c === conta })).sort((a, b) => b.respect - a.respect);
        return eBot(mine) && r.length > BOT.roster ? [...r.slice(0, BOT.roster), ...r.slice(BOT.roster).filter((x) => x.me)] : r; })(),   // na gangue da rua pode haver muita gente: mostram-se os 40 com mais respeito (e tu)
      biz: (() => { const eu = jogadores.get(conta), meu = E.gangBizView(eu, now);
        return CFG.gang.biz.map((b, k) => { let total = 0, n = 0, full = 0;
          for (const c of mine.membros.keys()) { const v = jogadores.get(c)?.gbz?.[k]?.inv || 0; total += v; if (v > 0) n++; if (c !== conta && meu[k].inv > 0 && v >= meu[k].inv) full++; }
          return { id: b.id, open: mine.sede >= b.sede, total, investors: n, full, ...meu[k] }; }); })(),
      asks: meu >= R.asks ? [...mine.pedidos.keys()].map(quem) : [],
      op: vistaOp(mine, conta, now), last: mine.last, opCool: mine.opCool,
      chat: qg.chat.all(ronda, mine.id).reverse().map((m) => ({ id: m.id, t: m.t, name: nomeDe(m.conta), me: m.conta === conta, txt: m.txt })) };
  }
  return out;
}

// ---------- mesas ao vivo (roleta e roda) ----------
// Uma ronda de cada vez por mesa, igual para todos: apostas abertas, fecha, sai um resultado, paga-se a toda a gente
// e abre a seguinte. As apostas ficam na base de dados no mesmo passo em que o dinheiro sai da mão do jogador.
db.exec(`CREATE TABLE IF NOT EXISTS mesa_apostas (mesa TEXT NOT NULL, id INTEGER NOT NULL, conta TEXT NOT NULL, ronda INTEGER NOT NULL,
  bets TEXT NOT NULL, total INTEGER NOT NULL, win INTEGER, PRIMARY KEY (mesa, id, conta))`);
// os resultados de cada mesa ficam gravados: o histórico é o mesmo para toda a gente e sobrevive a um reinício
db.exec('CREATE TABLE IF NOT EXISTS mesa_hist (mesa TEXT NOT NULL, id INTEGER NOT NULL, t INTEGER NOT NULL, res TEXT NOT NULL, PRIMARY KEY (mesa, id))');
const qm = {
  aposta: db.prepare('INSERT OR REPLACE INTO mesa_apostas (mesa, id, conta, ronda, bets, total, win) VALUES (?, ?, ?, ?, ?, ?, NULL)'),
  tirar: db.prepare('DELETE FROM mesa_apostas WHERE mesa = ? AND id = ? AND conta = ?'),
  paga: db.prepare('UPDATE mesa_apostas SET win = ? WHERE mesa = ? AND id = ? AND conta = ?'),
  porPagar: db.prepare('SELECT * FROM mesa_apostas WHERE win IS NULL'),
  limpar: db.prepare('DELETE FROM mesa_apostas WHERE win IS NOT NULL AND id < ?'),
  hist: db.prepare('INSERT OR REPLACE INTO mesa_hist (mesa, id, t, res) VALUES (?, ?, ?, ?)'),
  histUlt: db.prepare('SELECT res FROM mesa_hist WHERE mesa = ? ORDER BY id DESC LIMIT 24'),
  histLimpa: db.prepare('DELETE FROM mesa_hist WHERE mesa = ? AND t < ?'),
};
const MESA_BET = (g) => (process.env.MESA_BET_MS ? +process.env.MESA_BET_MS : g === 'wheel' ? 8_000 : 12_000);   // tempo para apostar (roleta: 12 s; eram 20)
const MESA_SPIN = process.env.MESA_SPIN_MS ? () => +process.env.MESA_SPIN_MS
  : (g, r) => (g === 'roulette' ? 10_500 : !r.bonus ? 17_000 : { moeda: 26_500, caixas: 42_000, bola: 24_500, louca: CRAZY_PICK + CRAZY_VOLTA + CRAZY_FIM }[r.s]);   // tempo da jogada que todos veem
// Crazy: a roda grande só roda depois de fechar a escolha do flapper. Até lá o servidor guarda para si onde ela vai parar (c.sec) e ninguém é pago;
// ao fechar, abre o resultado, paga cada um pelo seu flapper (quem não escolheu fica com um à sorte) e acerta a hora da ronda seguinte ao número de voltas.
const MESA_TESTE = !!(process.env.CRAZY_PICK_MS || process.env.MESA_SPIN_MS);   // nos testes as mesas correm depressa
const CRAZY_PICK = process.env.CRAZY_PICK_MS ? +process.env.CRAZY_PICK_MS : MESA_TESTE ? 300 : 23_500;   // do fecho das apostas ao fecho da escolha (a roda principal demora ~13 s a mostrar a Crazy; sobram ~10 s para escolher)
const CRAZY_VOLTA = MESA_TESTE ? 150 : 10_500, CRAZY_FIM = MESA_TESTE ? 250 : 6_500;   // cada volta da roda grande, e o resultado no fim
const mesas = { roulette: { cur: null, hist: [], last: new Map() }, wheel: { cur: null, hist: [], last: new Map() } };
const resCurto = (g, r) => (g === 'roulette' ? r.n : { s: r.s, m: r.s === 'louca' ? (r.bonus.mults ? Math.max(...r.bonus.mults) * r.tm : null) : r.mult, i: r.idx });   // Crazy: o melhor dos três flappers (só depois de aberto)
for (const g of Object.keys(mesas)) mesas[g].hist = qm.histUlt.all(g).map((r) => JSON.parse(r.res));

// ao arrancar: apostas que ficaram por pagar (o servidor parou a meio de uma ronda) voltam para quem as fez
function devolverMesas(now) {
  const rows = qm.porPagar.all(); if (!rows.length) return;
  const w = mundo(now); carregarRonda(w.n);
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const p = r.ronda === ronda ? jogadores.get(r.conta) : null;
      if (p) { E.tableCredit(p, r.total); guardar(p, now); }
      qm.paga.run(r.total, r.mesa, r.id, r.conta);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); ronda = -1; carregarRonda(w.n); console.error('mesas', e.message); }
}
function pagarMesa(g, c, now) {
  const w = mundo(now); carregarRonda(w.n);
  const feitos = [];
  db.exec('BEGIN');
  try {
    for (const [conta, b] of c.bets) {
      if (b.win !== undefined) continue;
      if (g === 'wheel' && c.res.s === 'louca' && b.flap === undefined) { b.flap = rng.int(0, 2); b.auto = true; }   // não escolheu flapper: fica com um à sorte
      const win = E.tablePay(g, b.bets, c.res, b.flap), p = b.ronda === ronda && w.phase === 'play' ? jogadores.get(conta) : null;
      if (p) { E.tableCredit(p, win); guardar(p, now); contarDia(now, conta, { cnet: win - b.total, cwin: Math.max(0, win - b.total) }); }
      qm.paga.run(win, g, c.id, conta);
      feitos.push([conta, b, win]);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); ronda = -1; carregarRonda(w.n); console.error('mesa', g, e.message); return; }   // fica por pagar: tenta outra vez no segundo seguinte
  const m = mesas[g];
  for (const [conta, b, win] of feitos) {
    b.win = win; m.last.set(conta, { id: c.id, bets: b.bets, total: b.total, win, flap: b.flap });
    const net = win - b.total;
    mundoAcc('casino', -net);
    const nm = nomeDe(conta);
    if (net > 0) amostra(now, 'casino', net, { name: nm, g }, { k: 'casino', name: nm, g, money: net });
    else if (net < 0) amostra(now, 'casinoLoss', -net, { name: nm, g }, { k: 'casinoLoss', name: nm, g, money: -net });
  }
  if (m.last.size > 500) for (const k of m.last.keys()) { m.last.delete(k); if (m.last.size <= 400) break; }
}
function fecharMesa(g, now) {
  const m = mesas[g], c = m.cur;
  if (c.res === null) {
    c.res = E.tableDraw(g, rng);
    if (g === 'wheel' && process.env.MESA_FORCA_RODA) for (let k = 0; k < 20000 && c.res.s !== process.env.MESA_FORCA_RODA; k++) c.res = E.tableDraw(g, rng);   // só nos testes: obriga a roda a parar numa casa
    c.prox = c.fecha + MESA_SPIN(g, c.res);
    if (g === 'wheel' && c.res.s === 'louca') {   // o resultado da roda grande fica fechado até acabar a escolha
      c.sec = c.res.bonus; c.res = { ...c.res, bonus: { pickUntil: c.fecha + CRAZY_PICK } };
      c.prox = Math.max(c.prox, c.fecha + CRAZY_PICK + CRAZY_VOLTA + CRAZY_FIM);
    }
    c.curto = resCurto(g, c.res); m.hist.unshift(c.curto); if (m.hist.length > 24) m.hist.pop();
    try { qm.hist.run(g, c.id, now, JSON.stringify(c.curto)); m.n = (m.n || 0) + 1; if (m.n % 200 === 0) qm.histLimpa.run(g, now - 2 * T.DAY); } catch (e) { console.error('hist', e.message); }
  }
  if (c.sec) {
    if (now < c.res.bonus.pickUntil) return;   // ainda se escolhe o flapper: nada se abre nem se paga
    c.res = { ...c.res, bonus: { ...c.res.bonus, ...c.sec } }; c.sec = null;
    c.prox = c.res.bonus.pickUntil + CRAZY_VOLTA * c.res.bonus.stops.length + CRAZY_FIM;
    c.curto.m = resCurto(g, c.res).m;
    try { qm.hist.run(g, c.id, now, JSON.stringify(c.curto)); } catch (e) { console.error('hist', e.message); }
  }
  if ([...c.bets.values()].some((b) => b.win === undefined)) pagarMesa(g, c, now);
}
// a ronda em curso, avançando o que for preciso (fechar, pagar, abrir a seguinte)
function mesaDe(g, now) {
  const m = mesas[g];
  if (!m) throw new E.GameError('NO_GAME');
  if (m.cur && now >= m.cur.fecha && (m.cur.res === null || m.cur.sec || [...m.cur.bets.values()].some((b) => b.win === undefined))) fecharMesa(g, now);
  if (!m.cur || (m.cur.res !== null && !m.cur.sec && now >= m.cur.prox)) {
    const abre = m.cur && now - m.cur.prox < 4000 ? m.cur.prox : now;   // com gente à mesa as rondas seguem-se sem intervalo
    m.cur = { id: Math.max(Math.floor(abre / 100), (m.cur?.id || 0) + 1), abre, fecha: abre + MESA_BET(g), prox: null, res: null, bets: new Map() };
  }
  return m;
}
function mesaAberta(g, now) {
  const m = mesaDe(g, now);
  if (m.cur.res !== null || now >= m.cur.fecha) throw new E.GameError('BETS_CLOSED');
  return m;
}
function vistaMesa(g, conta, now) {
  const m = mesaDe(g, now), c = m.cur, mine = c.bets.get(conta);
  let pot = 0; for (const b of c.bets.values()) pot += b.total;
  const out = { now, g, id: c.id, phase: c.res === null ? 'bets' : 'spin', opensAt: c.abre, closesAt: c.fecha, nextAt: c.prox, players: c.bets.size, pot,
    mine: mine ? { bets: mine.bets, total: mine.total, win: mine.win, flap: mine.flap, auto: mine.auto } : null, hist: m.hist, last: m.last.get(conta) || null,
    prev: g === 'wheel' ? m.hist[c.res === null ? 0 : 1]?.i ?? null : null };   // onde a roda estava parada: todos partem do mesmo sítio
  if (c.res !== null) {
    out.res = c.res;
    out.wins = [...c.bets].filter(([, b]) => b.win > b.total).sort((a, b) => (b[1].win - b[1].total) - (a[1].win - a[1].total)).slice(0, 3).map(([id, b]) => ({ name: nomeDe(id), win: b.win - b.total }));
  }
  return out;
}
// as mesas nunca param: mesmo sem ninguém a ver, as rondas seguem-se à hora certa, como numa mesa ao vivo
setInterval(() => {
  const now = clock();
  for (const g of Object.keys(mesas)) { try { mesaDe(g, now); } catch (e) { console.error('mesa', e.message); } }
}, 500).unref();
// ---------- o mundo permanente e as épocas ----------
db.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS epocas (n INTEGER NOT NULL, div INTEGER NOT NULL, pos INTEGER NOT NULL, conta TEXT NOT NULL, pontos INTEGER NOT NULL,
  premio INTEGER NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (n, div, pos));`);
const qmeta = { ler: db.prepare('SELECT v FROM meta WHERE k = ?'), gravar: db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v') };
const qe = {
  ganhos: db.prepare('SELECT conta, SUM(money) m, COUNT(*) d FROM diario WHERE ronda = ? AND dia >= ? AND dia <= ? AND money > 0 GROUP BY conta'),
  grava: db.prepare('INSERT INTO epocas (n, div, pos, conta, pontos, premio, t) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  podio: db.prepare('SELECT pos, conta, pontos, premio FROM epocas WHERE n = ? AND div = ? ORDER BY pos'),
};

// Cópia da base de dados de antes da passagem para o mundo permanente. Fica numa pasta à parte (as cópias de hora a hora
// rodam e esta não pode rodar) e é verificada: se não der para a fazer, a passagem não se faz.
function copiaGuardada(now) {
  const dir = join(DATA, 'guardadas'); mkdirSync(dir, { recursive: true });
  const nome = join(dir, `antes-da-vida-sem-rondas-${new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.db`);
  db.exec(`VACUUM INTO '${nome.replace(/'/g, "''")}'`);
  const c = new DatabaseSync(nome, { readOnly: true });
  const ok = Object.values(c.prepare('PRAGMA integrity_check').get())[0], n = c.prepare('SELECT COUNT(*) n FROM jogadores').get().n;
  c.close();
  if (ok !== 'ok' || n !== db.prepare('SELECT COUNT(*) n FROM jogadores').get().n) throw new Error('COPIA_FALHOU ' + nome);
  console.log('cópia guardada antes da passagem:', nome, n, 'estados');
}

// Abre o mundo permanente, uma vez. Quem jogou as rondas passa com a conta, o avatar, a gangue e o título de veterano;
// tudo o resto recomeça (50 €, nível 1, profissão por escolher). As gangues ficam com o nome, a sigla, o chefe, os cargos,
// a sede, a armaria, os pedidos de entrada e a conversa; o cofre e o que cada um lá meteu voltam a zero, e os pedidos de
// golpe em grupo que estavam abertos não passam. Nada se apaga: as rondas ficam na base de dados.
function abrirMundo(now) {
  const ja = qmeta.ler.get('mundo_inicio');
  if (ja) { INICIO = +ja.v; return; }
  const inicio = RONDA_TESTE ? lisbonToUtc(RONDA_TESTE.y, RONDA_TESTE.m, RONDA_TESTE.d, CFG.round.startHour) : now;
  const velhas = db.prepare('SELECT ronda, conta, estado FROM jogadores WHERE ronda < ? ORDER BY ronda').all(MUNDO);
  if (velhas.length) copiaGuardada(now);
  const ultimo = new Map(); for (const r of velhas) ultimo.set(r.conta, r.estado);   // o estado da ronda mais recente de cada conta
  const rg = db.prepare('SELECT MAX(ronda) r FROM gangues WHERE ronda < ?').get(MUNDO).r;
  const epoca = seasonAt(ANCORA, now).n, passou = new Set();
  db.exec('BEGIN');
  try {
    for (const [conta, estado] of ultimo) {
      if (!q.contaPorId.get(conta)) continue;
      let av = 0;
      try { const e = JSON.parse(estado); if (Number.isSafeInteger(e.av) && e.av >= 0 && e.av < CFG.avatars) av = e.av; } catch { /* estado ilegível: fica o avatar 0 */ }
      const p = E.newPlayer(conta, inicio, { start: inicio, playEnd: FIM });
      p.av = av; p.titles = [{ k: 'vet' }]; E.seasonJoin(p, epoca);
      q.guardar.run(MUNDO, conta, toJson(p), now);
      passou.add(conta);
    }
    if (rg !== null && rg !== undefined) {
      for (const g of qg.todas.all(rg)) {
        qg.nova.run(MUNDO, g.id, g.nome, g.nome_lc, g.tag, g.lider, g.criada);
        qg.grava.run(g.lider, 0, g.sede, g.armaria, g.aberta, MUNDO, g.id);
      }
      for (const m of qg.membros.all(rg)) if (passou.has(m.conta)) qg.entra.run(MUNDO, m.conta, m.gangue, m.entrou, 0, m.cargo || 0);
      for (const r of qg.pedidos.all(rg)) if (passou.has(r.conta)) qg.pede.run(MUNDO, r.gangue, r.conta, r.t);
      db.prepare('INSERT INTO gangue_chat (ronda, gangue, conta, t, txt) SELECT ?, gangue, conta, t, txt FROM gangue_chat WHERE ronda = ? ORDER BY id').run(MUNDO, rg);
    }
    qmeta.gravar.run('mundo_inicio', String(inicio));
    qmeta.gravar.run('epoca', String(epoca));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  INICIO = inicio;
  console.log(`mundo aberto: ${passou.size} contas das rondas passaram`);
}

// por divisão: a mediana do que cada jogador da divisão ganhou por dia (nos dias em que ganhou) desde o início da época
function basesDaEpoca(ep, ate) {
  const porDia = new Map();
  for (const r of qe.ganhos.all(MUNDO, diaDe(ep.start), diaDe(Math.min(ate, ep.end) - 1))) porDia.set(r.conta, Math.floor(r.m / Math.max(1, r.d)));
  const vals = Array.from({ length: CFG.season.divs }, () => []);
  for (const p of jogadores.values()) if (p.ep && p.ep.n === ep.n) { const v = porDia.get(p.id); if (v > 0) vals[p.ep.div].push(v); }
  return vals.map((v) => { if (!v.length) return 0; v.sort((a, b) => a - b); return v[v.length >> 1]; });
}
// Fecha a época n: os 3 primeiros de cada divisão levam o título (que é também o troféu) e o dinheiro, e toda a gente
// entra na época seguinte com a divisão do nível que tem. Tudo no mesmo passo; a tabela «epocas» não deixa pagar duas vezes.
function fecharEpoca(n, now) {
  const ep = seasonBounds(ANCORA, n), ps = [...jogadores.values()], pod = E.seasonPodium(ps, n), bases = basesDaEpoca(ep, ep.end), premiados = [];
  db.exec('BEGIN');
  try {
    pod.forEach((lista, d) => lista.forEach((x, i) => {
      const pos = i + 1, cash = E.seasonPrize(bases[d], pos);
      E.seasonAward(x.p, n, d, pos, cash);
      caixa(now, 'epoca', cash, 0);
      qe.grava.run(n, d, pos, x.p.id, x.score, cash, now);
      evento(x.p.id, now, { k: 'season', n, d, pos, score: x.score, money: cash });
      premiados.push({ d, pos, id: x.p.id });
    }));
    for (const p of ps) { E.seasonJoin(p, n + 1); guardar(p, now); }
    qmeta.gravar.run('epoca', String(n + 1));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); ronda = -1; carregarRonda(MUNDO); throw e; }
  console.log(`época ${n} fechada: ${premiados.length} prémios`);
  for (const x of premiados) if (x.pos === 1) noticia(now, { k: 'season', name: nomeDe(x.id), n, d: x.d });
}
// a época aberta; se o relógio passou o fim (também com o servidor parado), fecha as que ficaram para trás, por ordem
function epocaEmDia(now) {
  if (EPOCA && now < EPOCA.end) return EPOCA;
  const s = seasonAt(ANCORA, now);
  if (EPOCA && EPOCA.n === s.n) return EPOCA;
  carregarRonda(MUNDO);
  let aberta = +(qmeta.ler.get('epoca')?.v ?? s.n);
  while (aberta < s.n) { fecharEpoca(aberta, now); aberta++; }
  EPOCA = s;
  for (const p of jogadores.values()) E.seasonJoin(p, s.n);
  cacheEpoca.clear();
  return EPOCA;
}
let cachePremios = { t: 0, n: -1, bases: null };
function premiosAgora(now, d) {
  const ep = epocaEmDia(now);
  if (cachePremios.n !== ep.n || now - cachePremios.t > 60_000) cachePremios = { t: now, n: ep.n, bases: basesDaEpoca(ep, now) };
  return CFG.season.prizeDays.map((_, i) => E.seasonPrize(cachePremios.bases[d], i + 1));
}
function podioDe(n, d) {
  if (n < 0) return null;
  const rows = qe.podio.all(n, d);
  return rows.length ? { n, top: rows.map((r) => ({ pos: r.pos, name: nomeDe(r.conta), score: r.pontos, money: r.premio, av: jogadores.get(r.conta)?.av || 0 })) } : null;
}

abrirMundo(clock());
carregarRonda(MUNDO);
epocaEmDia(clock());
setInterval(() => { try { epocaEmDia(clock()); } catch (e) { console.error('época', e.message); } }, 30_000).unref();
devolverMesas(clock());

// ---------- ações ----------
const recentes = new Map(); // conta -> Map(rid -> resposta), para toques repetidos

function evento(conta, now, dados) { q.novoEvento.run(conta, now, JSON.stringify(dados)); }

function agir(conta, corpo, now) {
  const w = mundo(now);
  if (w.phase !== 'play') throw new E.GameError('ROUND_CLOSED');
  carregarRonda(w.n); epocaEmDia(now); resolverOps(now); resolverFeira(now);
  const p = jogadorDe(conta, now, w);
  const mk0 = w.phase === 'play' ? bolsaDe(w, now) : null;
  const world = { start: w.start, playEnd: w.playEnd, press: mk0 ? MW.pressOf(mk0.w, 'lx') : 50 };
  E.setGov(mk0 ? GV.govSnapshot(mk0.w.gov) : null);   // v76: as leis em vigor e a corrupção, para as regras desta ação
  const a = corpo || {};
  let r, alvo = null, alvoResp0 = 0, mesa = null;
  const ctx = { outros: [], ops: [], depois: [] };   // o que as gangues têm de gravar no mesmo passo
  const resp0 = p.respect, din0 = dinheiro(p), av0 = p.avN || 0;
  switch (a.type) {
    case 'crime': r = E.doCrime(p, now, world, int(a.k), rng); break;
    case 'crimeAll': r = E.doCrimeAll(p, now, world, int(a.k), rng); break;
    case 'casino': r = E.casinoPlay(p, now, world, String(a.g), limpaAposta(a), rng); break;
    // v76: o parlamento. Votar na proposta em discussão (uma vez) e pôr dinheiro num dos lados (sai do jogo)
    case 'govVote': {
      const g = mk0 && mk0.w.gov, b = g && g.bill;
      if (!b) throw new E.GameError('NO_BILL');
      r = E.govVoteCheck(p, now, world);
      if (p.gv === b.ed0) throw new E.GameError('VOTED');
      p.gv = b.ed0; p.gvY = a.yes === true; if (a.yes === true) b.yes += 1; else b.no += 1;
      bolsaSuja = true; r = { ...r, yes: a.yes === true, bill: b.id };
      break;
    }
    case 'govLobby': {
      const g = mk0 && mk0.w.gov, b = g && g.bill;
      if (!b) throw new E.GameError('NO_BILL');
      r = E.govLobby(p, now, world, int(a.amount));
      if (a.side === 'y') b.ly += r.amount; else b.ln += r.amount;
      bolsaSuja = true; r = { ...r, side: a.side === 'y' ? 'y' : 'n', bill: b.id };
      break;
    }
    case 'tableBet': {
      const g = String(a.g), m = mesaAberta(g, now), mine = m.cur.bets.get(conta);
      r = E.tableBet(p, now, world, g, limpaAposta(a).bets, mine ? mine.bets : []);
      mesa = { g, c: m.cur, bets: r.bets, total: r.total }; r.round = m.cur.id;
      break;
    }
    case 'tableClear': {
      const g = String(a.g), m = mesaAberta(g, now), mine = m.cur.bets.get(conta);
      if (!mine) throw new E.GameError('NO_BET');
      r = E.tableClear(p, mine.bets); r.g = g;
      mesa = { g, c: m.cur, bets: null }; r.round = m.cur.id;
      break;
    }
    case 'tableFlap': {   // escolher o flapper da Crazy: só quem apostou nela, e só enquanto a escolha está aberta
      const m = mesaDe('wheel', now), c = m.cur, mine = c.bets.get(conta), f = int(a.c);
      if (!c.sec || now >= c.res.bonus.pickUntil) throw new E.GameError('PICK_CLOSED');
      if (!mine || !mine.bets.some((b) => b.s === 'louca')) throw new E.GameError('NO_BET');
      if (![0, 1, 2].includes(f)) throw new E.GameError('BAD_BET');
      mine.flap = f; r = { ok: true, flap: f, round: c.id };
      break;
    }
    case 'train': throw new E.GameError('GONE');   // v82: o treino de um toque acabou; treina-se em séries (gymStart/gymDone)
    case 'gymStart': r = E.gymStart(p, now, world, String(a.stat || ''), int(a.reps)); break;   // v82: série no ritmo
    case 'digStart': r = E.digStart(p, now, world, rng, String(a.site || '')); break;   // v85: escavações
    case 'digTap': r = E.digTap(p, now, world, rng, int(a.i)); break;
    case 'digStop': r = E.digStop(p, now, world); break;
    case 'gymDone': r = E.gymDone(p, now, world, Array.isArray(a.taps) ? a.taps.slice(0, 64) : null); break;
    case 'craftStart': r = E.craftStart(p, now, world, String(a.id || ''), a.n === undefined ? 1 : int(a.n)); break;   // v83: a cave
    case 'craftTake': r = E.craftTake(p, now, world); break;
    case 'maqService': r = E.maqService(p, now, world, String(a.id || '').slice(0, 24)); break;   // v83: revisão de uma máquina
    case 'drug': r = E.buyDrug(p, now, world, int(a.d)); break;
    case 'refill': r = E.refill(p, now, world); break;
    case 'consume': r = E.consume(p, now, world, String(a.id)); break;   // v78: café e farmácia
    case 'museum': {   // v79: o museu fica com o conjunto; a primeira entrega de cada um põe o nome na placa (os primeiros 20 da época)
      r = E.museumGive(p, now, world, String(a.set || '').slice(0, 12));
      // a placa é da época: cada jogador entra uma vez por conjunto; ficam escritos os primeiros 20 (os outros só contam)
      const ep = epocaEmDia(now).n;
      if (mk0 && (!p.musEp || p.musEp[r.set] !== ep)) {
        if (!mk0.w.mus || mk0.w.mus.ep !== ep) mk0.w.mus = { ep };
        const M = mk0.w.mus, L = M[r.set] || (M[r.set] = { n: 0, top: [] });
        L.n += 1; if (L.top.length < CFG.col.plaque) L.top.push({ name: nomeDe(p.id), t: now });
        p.musEp = { ...(p.musEp || {}), [r.set]: ep };
        bolsaSuja = true; r = { ...r, place: L.n };
        noticia(now, { k: 'mus', name: nomeDe(p.id), set: r.set, n: L.n });
      }
      break;
    }
    case 'colSell': r = E.colSell(p, now, world, String(a.id || '').slice(0, 24), int(a.n)); break;
    case 'deal': r = E.deal(p, now, world, int(a.j)); break;
    case 'job': r = E.chooseJob(p, now, world, int(a.i)); break;
    case 'course': r = E.startCourse(p, now, world, String(a.id || '').slice(0, 24)); break;
    case 'examStart': r = E.examStart(p, now, world, rng); break;   // v80: o exame do curso
    case 'examAnswer': r = E.examAnswer(p, now, world, Array.isArray(a.ans) ? a.ans.slice(0, 8) : null); break;
    case 'workStart': r = E.workStart(p, now, world, rng, String(a.id || '').slice(0, 24), a.shift === true); break;
    case 'workDone': { const x = a.ans && typeof a.ans === 'object' ? a.ans : null; r = E.workDone(p, now, world, rng, x && { slots: x.slots, drops: x.drops, order: x.order, taps: x.taps, holds: x.holds, picks: x.picks, place: x.place, spotted: x.spotted });
      if (r.shift) { r.tip = dica(p, now, w); p.jt = [r.tip, ...(Array.isArray(p.jt) ? p.jt : [])].slice(0, 5); }
      break; }
    case 'shift': r = E.doShift(p, now, world); r.tip = dica(p, now, w); p.jt = [r.tip, ...(Array.isArray(p.jt) ? p.jt : [])].slice(0, 5); break;
    case 'dealBuy': r = E.dealBuy(p, now, world, int(a.j), int(a.kg)); break;
    case 'hooker': r = E.visitHooker(p, now, world, int(a.i), rng); if (r.rob) evento(p.id, now, { k: 'hkRob', kind: r.rob.kind, money: r.rob.loss }); break;
    case 'cure': r = E.cure(p, now, world); break;
    case 'house': r = E.buyHouse(p, now, world); break;
    case 'houseUp': r = E.buyUpgrade(p, now, world, int(a.u)); break;
    case 'class': r = E.setClass(p, now, world, String(a.id)); break;
    case 'classChange': r = E.changeClass(p, now, world, String(a.id)); break;
    case 'avatar': r = E.setAvatar(p, now, world, int(a.i)); break;
    case 'detox': r = E.detox(p, now, world); break;
    case 'claim': r = E.claimMission(p, now, world); break;
    case 'missionSwap': r = E.swapMission(p, now, world); break;
    case 'stockBuy': r = E.stockBuy(p, now, world, bolsaDe(w, now), int(a.k), int(a.n), Number.isSafeInteger(a.price) ? a.price : undefined); break;
    case 'stockSell': r = E.stockSell(p, now, world, bolsaDe(w, now), int(a.k), int(a.n), Number.isSafeInteger(a.price) ? a.price : undefined); break;
    case 'bail': r = E.payBail(p, now, world); break;
    case 'medic': r = E.payMedic(p, now, world); break;
    case 'buyBiz': r = E.buyBiz(p, now, world, int(a.i)); break;
    case 'bizGoods': r = E.bizGoods(p, now, world, int(a.i), a.on === true); break;
    case 'acct': r = E.hireAccountant(p, now, world); break;
    case 'stockLimit': r = E.stockLimit(p, now, world, bolsaDe(w, now), int(a.k), int(a.tp), int(a.sl)); break;
    case 'portOpen': r = E.openPort(p, now, world, rng, int(a.at), bolsaDe(w, now)); break;   // um contentor de cada vez (a animação de o abrir)
    case 'collect': {
      const b = E.collectBiz(p, now, world, rng);
      const c = a.port === false ? { items: [] } : E.collectPort(p, now, world, rng, bolsaDe(w, now));   // port: false = só negócios e casas; os contentores abrem-se no porto, um a um
      const v = E.venueCollect(p, now, world);
      r = { ok: true, items: b.items, port: c.items, club: v.club, bro: v.bro };
      break;
    }
    case 'venueCollect': r = E.venueCollect(p, now, world); break;
    case 'venueBuy': r = E.venueBuy(p, now, world, String(a.kind)); break;
    case 'venueSet': r = E.venueSet(p, now, world, String(a.kind), int(a.pi), int(a.gd)); break;
    case 'stockUse': r = E.stockUse(p, now, world, int(a.d)); break;
    case 'stockDump': r = E.stockDump(p, now, world, int(a.d), int(a.n), bolsaDe(w, now)); break;
    // regiões, armazéns e transporte (passo 6, parte 2): o mercado de cada região está no mundo, com a bolsa
    case 'whBuy': r = E.whBuy(p, now, world, String(a.r || '')); break;
    case 'whUp': r = E.whUp(p, now, world, String(a.r || ''), String(a.k || '')); break;
    case 'mktBuy': r = E.mktBuy(p, now, world, bolsaDe(w, now), String(a.r || ''), int(a.d), int(a.n), Number.isSafeInteger(a.c) ? a.c : undefined); break;
    case 'mktSell': r = E.mktSell(p, now, world, bolsaDe(w, now), String(a.r || ''), int(a.d), int(a.n), Number.isSafeInteger(a.c) ? a.c : undefined); break;
    case 'mvSend': r = E.mvSend(p, now, world, bolsaDe(w, now), rng, String(a.a || ''), String(a.b || ''), int(a.d), int(a.n)); break;
    case 'stockHold': r = E.stockHold(p, now, world, int(a.d), a.on === true); break;
    case 'broHire': r = E.broHire(p, now, world, int(a.i)); break;
    case 'broFire': r = E.broFire(p, now, world, int(a.slot)); break;
    case 'clubBuy': case 'broVisit': {
      // casa de outro jogador: o dinheiro vai para o caixa dele e grava-se no mesmo passo
      const c = q.contaPorNome.get(String(a.owner || '').toLowerCase());
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_VENUE');
      const o = jogadores.get(c.id), seen = Number.isSafeInteger(a.price) ? a.price : undefined;
      r = a.type === 'clubBuy' ? E.clubBuyAt(p, o, now, world, int(a.d), seen) : E.broVisitAt(p, o, now, world, int(a.slot), rng, seen);
      r.owner = nomeDe(o.id);
      if (r.rob) evento(p.id, now, { k: 'hkRob', kind: r.rob.kind, money: r.rob.loss });
      ctx.outros.push(o);
      break;
    }
    case 'port': r = E.sendPort(p, now, world, int(a.k), int(a.amount), a.goods === true); break;
    case 'air': r = E.airSend(p, now, world, int(a.r), int(a.amount), a.bribe === true); break;
    case 'airCollect': r = E.airCollect(p, now, world, rng, a.keep === true, bolsaDe(w, now)); break;
    case 'deposit': r = E.deposit(p, now, world, int(a.amount)); break;
    case 'withdraw': r = E.withdraw(p, now, world, int(a.amount)); break;
    case 'gear': r = E.buyGear(p, now, world, ['armor', 'guard', 'tool', 'gweapon'].includes(a.kind) ? a.kind : 'weapon', int(a.idx)); break;
    case 'buy': r = E.buyItem(p, now, world, String(a.id || '').slice(0, 24), a.n === undefined ? 1 : int(a.n)); break;
    case 'equip': r = E.equip(p, now, world, int(a.i)); break;
    case 'sell': r = E.sellItem(p, now, world, int(a.i)); break;
    case 'sellGoods': r = E.sellGoods(p, now, world); break;
    case 'repair': r = E.repair(p, now, world, String(a.slot || ''), a.kit === true); break;
    // golpes grandes, avença e prisão (passo 5)
    case 'opStart': r = E.opStart(p, now, world, int(a.i)); break;
    case 'opStep': r = E.opStep(p, now, world, String(a.kind || '')); break;
    case 'opGo': r = E.opGo(p, now, world, rng); break;
    case 'opDrop': r = E.opDrop(p, now, world); break;
    case 'retainer': r = E.setRetainer(p, now, world, a.on === true); break;
    case 'jailSmuggle': r = E.jailSmuggle(p, now, world, rng); break;
    case 'jailWork': r = E.jailWork(p, now, world); break;
    case 'jailYard': r = E.jailYard(p, now, world, rng); break;
    case 'jailCards': r = E.jailCards(p, now, world, int(a.bet), rng); break;
    case 'jailFavor': r = E.jailFavor(p, now, world, String(a.kind || '')); break;
    case 'jailEscape': r = E.jailEscape(p, now, world, rng); break;
    case 'luxury': r = E.buyLuxury(p, now, world); break;
    case 'attack': {
      const nome = String(a.target || '').toLowerCase();
      const c = q.contaPorNome.get(nome);
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_TARGET');
      alvo = jogadores.get(c.id);
      alvoResp0 = alvo.respect;
      r = E.attack(p, alvo, now, world, a.mode === 'mug' ? 'mug' : 'beat', rng, a.drop === true);
      break;
    }
    case 'hitman': {
      // assassino a soldo: o alvo fica a saber que foi um assassino; quem pagou só se sabe quando falha
      const c = q.contaPorNome.get(String(a.target || '').toLowerCase());
      if (!c || !jogadores.has(c.id)) throw new E.GameError('NO_TARGET');
      const o = jogadores.get(c.id), r0 = o.respect, quem = nomeDe(p.id), b = nomeDe(o.id);
      r = E.hitman(p, o, now, world, rng, a.drop === true);
      ctx.outros.push(o);
      ctx.ops.push(() => {
        evento(o.id, now, r.success ? { k: 'hitman', win: true, respect: -r.respLoss, money: r.cashLoss } : { k: 'hitman', win: false, by: quem });
        if (r.success) contarDia(now, o.id, { resp: o.respect - r0, beaten: 1 });
      });
      ctx.depois.push(() => noticia(now, r.success ? { k: 'hitman', name: '', target: b } : { k: 'hitmanFail', name: quem, target: b }));
      r = { ...r, target: b };
      break;
    }
    default:
      if (typeof a.type === 'string' && a.type.startsWith('gang')) { r = agirGangue(a, p, conta, now, world, ctx); break; }
      if (typeof a.type === 'string' && a.type.startsWith('feira')) { r = agirFeira(a, p, conta, now, world, ctx); break; }   // v84
      throw new E.GameError('BAD_ACTION');
  }
  // v76: com a taxa sobre o jogo, 15% do que se ganha acima de 1 000 € numa jogada vai para os cofres
  if (a.type === 'casino' && r && (r.g !== 'bj' || r.done) && E.lawsOn().includes('jogo')) {
    const net = casinoNet(r), L = CFG.gov.laws.jogo;
    if (net > L.over) { const tax = Math.min(p.cash, Math.floor(((net - L.over) * L.bp) / 10000)); p.cash -= tax; r = { ...r, tax }; }
  }
  db.exec('BEGIN');
  try {
    guardar(p, now);
    if (alvo) {
      guardar(alvo, now);
      evento(alvo.id, now, { k: 'attacked', by: nomeDe(p.id), mode: r.mode, win: r.win, respect: r.win ? -r.targetLoss : (r.defenderGain || 0), money: r.money || 0 });
    }
    for (const o of ctx.outros) guardar(o, now);
    for (const f of ctx.ops) f();
    if (mesa) { if (mesa.bets) qm.aposta.run(mesa.g, mesa.c.id, conta, ronda, JSON.stringify(mesa.bets), mesa.total); else qm.tirar.run(mesa.g, mesa.c.id, conta); }
    contarAcao(now, a, r, p, alvo, resp0, alvoResp0);
    try { contarMundo(a, r, dinheiro(p) - din0, p); } catch (e) { console.error('mundo', e.message); }
    if (MEXE_MUNDO.has(a.type)) bolsaSuja = true;   // a ordem empurrou o preço (na bolsa ou no mercado de uma região): grava-se com o resto
    const avPago = ((p.avN || 0) - av0) * CFG.retainer.day;
    if (avPago > 0) caixa(now, 'avenca', 0, avPago);
    contarCaixa(now, a, r, dinheiro(p) - din0 + avPago);
    db.exec('COMMIT');
    if (mesa) { if (mesa.bets) mesa.c.bets.set(conta, { bets: mesa.bets, total: mesa.total, ronda }); else mesa.c.bets.delete(conta); }
    noticiar(now, a, r, p, alvo);
    for (const f of ctx.depois) f();
  } catch (e) {
    db.exec('ROLLBACK');
    // o que ficou em memória deixa de ser de confiança: volta a ler da base de dados
    ronda = -1; carregarRonda(w.n);
    throw e;
  }
  return { result: r, me: vista(p, now), feed: ultimas(), target: alvo ? { name: nomeDe(alvo.id), respect: alvo.respect } : undefined };
}

// ---------- listas ----------
// Duas classificações: a da época (o respeito ganho nela, dentro de cada divisão) e a geral (o respeito todo, para sempre).
const vet = (p) => p.titles?.some((x) => x.k === 'vet') || false;
const linhaRank = (p, i, score) => ({ pos: i + 1, id: p.id, name: nomeDe(p.id), respect: p.respect, level: E.level(p), av: p.av || 0, cls: p.cls || '', tag: tagDe(p.id), score, vet: vet(p) });
let cacheRank = { t: 0, n: -1, size: 0, lista: [] };
function rankingAtual(now, w) {
  carregarRonda(w.n);
  if (cacheRank.n === w.n && cacheRank.size === jogadores.size && now - cacheRank.t < 5000) return cacheRank.lista;
  const lista = E.ranking([...jogadores.values()]).map((p, i) => linhaRank(p, i, 0));
  cacheRank = { t: now, n: w.n, size: jogadores.size, lista };
  return lista;
}
function rankingEpoca(now, d) {
  const ep = epocaEmDia(now), c = cacheEpoca.get(d);
  if (c && c.n === ep.n && c.size === jogadores.size && now - c.t < 5000) return c.lista;
  const lista = E.seasonStandings([...jogadores.values()], ep.n, d).map((x, i) => linhaRank(x.p, i, x.score));
  cacheEpoca.set(d, { t: now, n: ep.n, size: jogadores.size, lista });
  return lista;
}
const posNaEpoca = (now, p) => (p && p.ep ? (rankingEpoca(now, p.ep.div).find((x) => x.id === p.id)?.pos ?? null) : null);
const vistaEpoca = (ep) => ({ n: ep.n, start: ep.start, end: ep.end });

// discotecas e bordéis dos outros jogadores, com o preço que ESTE jogador lá paga (o desconto da gangue já vem feito)
function casas(conta, now, w) {
  const me = jogadorDe(conta, now, w);
  if (!me) return { clubs: [], bros: [] };
  E.touch(me, now);
  const clubs = [], bros = [];
  for (const o of jogadores.values()) {
    if (o.id === me.id || (!o.club && !o.bro)) continue;
    const v = E.venueView(o, Math.max(now, o.t)), mine = E.sameCrew(me, o);
    const base = { name: nomeDe(o.id), tag: tagDe(o.id), av: o.av || 0, gang: mine };
    // só o que o dono tem à venda: o que guardou para ele não aparece a ninguém
    const venda = v.stock.map((n, d) => (n > 0 && !E.held(o, d) ? { d, n, price: E.clubPriceAt(o, me, d) } : null)).filter(Boolean);
    if (v.club && venda.length) clubs.push({ ...base, lvl: v.club.lvl, bp: E.venuePriceBp(o, 'club', me), pub: CFG.venue.prices[v.club.pi], items: venda });
    if (v.bro && v.bro.girls.length) bros.push({ ...base, lvl: v.bro.lvl, bp: E.venuePriceBp(o, 'bro', me), pub: CFG.venue.prices[v.bro.pi], girls: v.bro.girls.map((i, slot) => ({ slot, i, price: E.broPriceAt(o, me, i, now) })) });
  }
  // primeiro as da tua gangue, depois as mais baratas para ti
  const ord = (x, y) => (y.gang - x.gang) || (x.bp - y.bp) || (y.lvl - x.lvl) || (x.name < y.name ? -1 : 1);
  return { clubs: clubs.sort(ord).slice(0, 20), bros: bros.sort(ord).slice(0, 20) };
}
// O emprego não é um clicker: cada turno dá uma informação verdadeira do sítio onde se trabalha, tirada do estado do mundo
// nesse momento (CFG.jobs.list[].tip). Só sai o que o jogador podia descobrir indo ver; nunca o banco nem o que está guardado.
function dica(p, now, w) {
  const kind = (CFG.jobs.list[p.job] || {}).tip, t = now, outros = [];
  // quem já apareceu nas últimas informações vai para o fim da fila: cada turno conta coisa nova, se houver
  const vistos = new Set((Array.isArray(p.jt) ? p.jt : []).slice(0, 3).map((x) => x.a).filter(Boolean));
  for (const o of jogadores.values()) if (o.id !== p.id && !E.sameCrew(p, o)) outros.push(o);
  const quem = (o) => ({ a: nomeDe(o.id), lvl: E.level(o) });
  const novo = (lista) => lista.find((o) => !vistos.has(nomeDe(o.id))) || lista[0];
  const maisRico = (lista) => novo(lista.sort((x, y) => y.cash - x.cash));
  if (kind === 'cash' || kind === 'guard') {
    const livre = outros.filter((o) => o.cash > 0 && !(o.hospUntil > now) && !(o.jailUntil > now) && !(o.shieldUntil > now) && (kind === 'cash' || o.guard < 0));
    const o = maisRico(livre);
    if (o) return { k: kind, t, ...quem(o), m: o.cash };
  }
  if (kind === 'hosp' || kind === 'jail') {
    const campo = kind === 'hosp' ? 'hospUntil' : 'jailUntil';
    const dentro = outros.filter((o) => o[campo] > now).sort((x, y) => x[campo] - y[campo] || y.cash - x.cash);
    const o = novo(dentro);
    if (o) return { k: kind, t, ...quem(o), until: o[campo], m: o.cash };
  }
  if (kind === 'stock') {
    const mk = bolsaDe(w, now), h = mk.hist, antes = h[Math.max(0, h.length - 1 - 6)], agora = mk.prices;   // a última hora (6 edições de 10 min)
    let best = null;
    agora.forEach((v, i) => { const d = Math.round(((v - antes[i]) * 100) / Math.max(1, antes[i])); if (d && (!best || Math.abs(d) > Math.abs(best.p))) best = { s: i, p: d }; });
    if (best) return { k: 'stock', t, ...best };
  }
  if (kind === 'club') {
    let best = null;
    for (const o of outros) {
      if (!o.club) continue;
      const v = E.venueView(o, Math.max(now, o.t));
      v.stock.forEach((n, d) => { if (n > 0 && !E.held(o, d)) { const bp = Math.round((E.clubPriceAt(o, p, d) * 10000) / CFG.drugs[d].price); if (!best || bp < best.bp) best = { ...quem(o), d, bp }; } });
    }
    if (best && best.bp < 10000) return { k: 'club', t, ...best };
  }
  return { k: 'none', t };
}
function alvos(conta, now, w) {
  const me = jogadorDe(conta, now, w);
  if (!me) return [];
  E.touch(me, now);
  const lista = [], fora = [];
  for (const d of jogadores.values()) {
    if (d.id === me.id) continue;
    // a lista mostra quem dá para atacar quando estiveres livre: as razões do teu lado (prisão, hospital, escudo, energia) não escondem ninguém
    const livre = { ...me, energy: CFG.pvp.energy, jailUntil: 0, hospUntil: 0, shieldUntil: 0 };
    const motivo = E.canAttack(livre, d, now, { start: w.start, playEnd: w.playEnd });
    const base = { name: nomeDe(d.id), level: E.level(d), respect: d.respect, av: d.av || 0, cls: d.cls || '', tag: tagDe(d.id) };
    if (motivo && motivo !== 'NO_PVP_YET') {
      // quem não dá para atacar também aparece, com o motivo (why) e, quando é por tempo, a hora a que acaba (until)
      const until = motivo === 'TARGET_NEW' ? d.shieldUntil : motivo === 'TARGET_HOSPITAL' ? d.hospUntil : motivo === 'TARGET_JAIL' ? d.jailUntil : motivo === 'TARGET_PROTECTED' ? Math.max(d.protectUntil, d.capUntil) : 0;
      fora.push({ ...base, why: motivo, until });
      continue;
    }
    lista.push({
      ...base,
      chance: E.attackChanceBp(me, d, now), gain: E.expectedGain(me, d, now), loot: E.mugValue(me, d, now),
      hp: E.hitmanPrice(d), hc: E.hitmanChanceBp(d), hw: E.canHitman({ ...me, shieldUntil: 0 }, d, now, { start: w.start, playEnd: w.playEnd }),
    });
  }
  // os mais interessantes primeiro: mais respeito esperado
  lista.sort((x, y) => (y.chance * y.gain) - (x.chance * x.gain));
  // depois, até encher a lista, quem não dá para atacar: primeiro os mais perto de ti no ranking (respeito mais parecido com o teu)
  fora.sort((x, y) => (Math.abs(x.respect - me.respect) - Math.abs(y.respect - me.respect)) || (x.name < y.name ? -1 : 1));
  const cima = lista.slice(0, 25);
  return [...cima, ...fora.slice(0, 25 - cima.length)];
}
// Assassino a soldo: todos os outros jogadores, com o preço, a pontaria e, quando não dá para encomendar, o motivo (hw).
// Primeiro os que dá para encomendar, depois os mais fortes. Só sai o que já é público no ranking, mais o motivo.
function contratos(conta, now, w) {
  const me = jogadorDe(conta, now, w);
  if (!me) return [];
  E.touch(me, now);
  const lista = [];
  for (const d of jogadores.values()) {
    if (d.id === me.id) continue;
    const hw = E.canHitman({ ...me, shieldUntil: 0 }, d, now, { start: w.start, playEnd: w.playEnd });
    const until = hw === 'TARGET_NEW' ? d.shieldUntil : hw === 'TARGET_HOSPITAL' ? d.hospUntil : hw === 'TARGET_JAIL' ? d.jailUntil : hw === 'TARGET_PROTECTED' ? Math.max(d.protectUntil, d.capUntil) : hw === 'HITMAN_SAFE' ? d.hmSafe : 0;
    lista.push({ name: nomeDe(d.id), level: E.level(d), respect: d.respect, av: d.av || 0, tag: tagDe(d.id), hp: E.hitmanPrice(d), hc: E.hitmanChanceBp(d), hw, until });
  }
  lista.sort((x, y) => ((x.hw ? 1 : 0) - (y.hw ? 1 : 0)) || (y.respect - x.respect) || (x.name < y.name ? -1 : 1));
  return lista.slice(0, 30);
}

// ---------- ficheiros estáticos (só em testes locais) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function estatico(req, res) {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.endsWith('/')) u += 'index.html';
  const f = normalize(join(STATIC, u));
  if (!f.startsWith(normalize(STATIC)) || !existsSync(f) || statSync(f).isDirectory()) {
    const idx = join(STATIC, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(readFileSync(idx)); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}

// ---------- router ----------
async function tratar(req, res) {
  const now = clock();
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  if (!path.startsWith('/api/')) { if (STATIC) return estatico(req, res); return enviar(res, 404, { error: 'NOT_FOUND' }); }
  const quem = ip(req);
  if (!limite('ip:' + quem, 600, 60_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });

  if (req.method === 'GET' && path === '/api/saude') {
    const w = mundo(now); carregarRonda(w.n);
    return enviar(res, 200, { ok: true, ronda: w.n, fase: w.phase, jogadores: jogadores.size, v: VERSAO, epoca: vistaEpoca(epocaEmDia(now)) });
  }
  if (req.method === 'GET' && path === '/api/config') return enviar(res, 200, cfgPublica());
  if (req.method === 'GET' && path === '/api/news') {
    const w = mundo(now); carregarRonda(w.n);
    return enviar(res, 200, { now, feed: ultimas(), today: { dia: diaDe(now), items: manchetes(diaDe(now), now) }, yesterday: { dia: ontemDe(now), items: manchetes(ontemDe(now), now) }, mundo: vistaMundo(w, now) });
  }

  if (req.method === 'POST' && (path === '/api/register' || path === '/api/login')) {
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    const nome = String(b.name || '').trim(), senha = String(b.password || '');
    if (path === '/api/register') {
      if (b.website) return enviar(res, 400, { error: 'BAD_REQUEST' }); // isco para bots
      if (!limite('reg:' + quem, 5, T.HOUR, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
      if (!NOME_RE.test(nome)) return enviar(res, 400, { error: 'BAD_NAME' });
      if (senha.length < 8 || senha.length > 200) return enviar(res, 400, { error: 'BAD_PASSWORD' });
      const email = emailLimpo(b.email);
      if (!email) return enviar(res, 400, { error: 'BAD_EMAIL' });
      if (q.contaPorNome.get(nome.toLowerCase())) return enviar(res, 409, { error: 'NAME_TAKEN' });
      if (q.contaPorEmail.get(email)) return enviar(res, 409, { error: 'EMAIL_TAKEN' });
      const id = randomBytes(9).toString('base64url');
      const lingua = b.lang === 'pt' ? 'pt' : 'en';
      q.novaConta.run(id, nome, nome.toLowerCase(), hashSenha(senha), now, lingua, email);
      criarSessao(res, id, now);
      return enviar(res, 200, { ok: true, name: nome });
    }
    if (!limite('login:' + quem, 10, 5 * T.MIN, now) || !limite('login:' + nome.toLowerCase(), 10, 5 * T.MIN, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    const c = NOME_RE.test(nome) ? q.contaPorNome.get(nome.toLowerCase()) : null;
    if (!c || !confereSenha(senha, c.hash)) return enviar(res, 401, { error: 'BAD_LOGIN' });
    criarSessao(res, c.id, now);
    return enviar(res, 200, { ok: true, name: c.nome, lang: c.lingua });
  }

  const conta = contaDoPedido(req, now);
  // sem sessão, o estado responde na mesma (sem jogador) para a página de entrada não dar erro
  if (!conta && req.method === 'GET' && path === '/api/state') {
    const w0 = mundo(now);
    return enviar(res, 200, { now, round: w0, season: vistaEpoca(epocaEmDia(now)), account: null, me: null, rank: null, players: rankingAtual(now, w0).length, feed: ultimas() });
  }
  if (!conta) return enviar(res, 401, { error: 'LOGIN_REQUIRED' });

  if (req.method === 'POST' && path === '/api/logout') {
    const t = lerCookie(req); if (t) q.apagarSessao.run(sha(t));
    res.setHeader('Set-Cookie', `cr_s=; HttpOnly${SECURE}; SameSite=Lax; Path=/; Max-Age=0`);
    return enviar(res, 200, { ok: true });
  }

  const w = mundo(now);
  if (req.method === 'GET' && path === '/api/state') {
    const c = q.contaPorId.get(conta);
    const p = jogadorDe(conta, now, w);
    if (p) E.touch(p, now);
    const rk = rankingAtual(now, w);
    // a posição que aparece no topo é a da época, na tua divisão (é aí que se compete)
    return enviar(res, 200, { now, round: w, season: vistaEpoca(epocaEmDia(now)), account: { name: c?.nome, lang: c?.lingua }, me: p ? vista(p, now) : null, rank: posNaEpoca(now, p), players: rk.length, feed: ultimas() });
  }
  if (req.method === 'POST' && path === '/api/lang') {
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    q.lingua.run(b.lang === 'pt' ? 'pt' : 'en', conta);
    return enviar(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/act') {
    if (!limite('act:' + conta, ATOS_3S, 3000, now) || !limite('actm:' + conta, ATOS_MIN, 60_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    let b; try { b = await lerCorpo(req); } catch { return enviar(res, 400, { error: 'BAD_REQUEST' }); }
    const agora = clock(), wa = mundo(agora);
    const rid = typeof b.rid === 'string' && b.rid.length <= 40 ? b.rid : null;
    let mem = recentes.get(conta);
    if (!mem) { mem = new Map(); recentes.set(conta, mem); }
    if (rid && mem.has(rid)) return enviar(res, 200, mem.get(rid));
    try {
      const out = { now: agora, ...agir(conta, b, agora) };
      if (rid) { mem.set(rid, out); if (mem.size > 30) mem.delete(mem.keys().next().value); }
      return enviar(res, 200, out);
    } catch (e) {
      if (e instanceof E.GameError) {
        const { code, ...extra } = e; delete extra.message;
        const p = wa.phase === 'play' ? jogadorDe(conta, agora, wa) : null;
        if (p) { try { E.touch(p, agora); } catch { /* fica como está */ } }
        return enviar(res, 400, { error: code, ...extra, now: agora, me: p ? vista(p, agora) : null });
      }
      throw e;
    }
  }
  if (req.method === 'GET' && path === '/api/feira') {   // v84: a Feira da Ladra
    if (w.phase !== 'play') return enviar(res, 200, { now, cat: [], leiloes: [], meus: [], levantar: [], lances: [] });
    if (!limite('feira:' + conta, 40, 10_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    carregarRonda(w.n);
    return enviar(res, 200, vistaFeira(conta, clock(), url.searchParams.get('item') || undefined, parseInt(url.searchParams.get('aoff') || '0', 10), parseInt(url.searchParams.get('an') || '40', 10)));
  }
  if (req.method === 'GET' && path === '/api/gang') { carregarRonda(w.n); return enviar(res, 200, vistaGangue(conta, now)); }
  if (req.method === 'GET' && path === '/api/table') {
    const g = url.searchParams.get('g');
    if (!Object.hasOwn(mesas, g)) return enviar(res, 400, { error: 'NO_GAME' });
    if (!limite('mesa:' + conta, 40, 10_000, now)) return enviar(res, 429, { error: 'SLOW_DOWN' });
    return enviar(res, 200, vistaMesa(g, conta, clock()));
  }
  if (req.method === 'GET' && path === '/api/stocks') return enviar(res, 200, w.phase === 'play' ? vistaBolsa(w, now) : { now, tick: 0, nextAt: 0, prices: [], gen: [], hist: [] });
  if (req.method === 'GET' && path === '/api/venues') return enviar(res, 200, { now, ...(w.phase === 'play' ? casas(conta, now, w) : { clubs: [], bros: [] }) });
  if (req.method === 'GET' && path === '/api/targets') return enviar(res, 200, { now, list: w.phase === 'play' ? alvos(conta, now, w) : [] });
  if (req.method === 'GET' && path === '/api/hitman') return enviar(res, 200, { now, list: w.phase === 'play' ? contratos(conta, now, w) : [] });
  if (req.method === 'GET' && path === '/api/ranking') {
    // v=geral: o respeito todo; v=epoca (o normal): o respeito ganho nesta época, na divisão d (sem d, a tua)
    const ep = epocaEmDia(now), eu = jogadores.get(conta), geral = url.searchParams.get('v') === 'geral';
    const dq = Number(url.searchParams.get('d')), d = Number.isInteger(dq) && dq >= 0 && dq < CFG.season.divs && url.searchParams.has('d') ? dq : (eu?.ep?.div ?? 0);
    const rk = geral ? rankingAtual(now, w) : rankingEpoca(now, d);
    const minha = rk.find((x) => x.id === conta);
    const top = rk.slice(0, 100).map(({ id, ...r }) => ({ ...r, me: id === conta }));
    const out = { now, view: geral ? 'geral' : 'epoca', d, season: vistaEpoca(ep), top, me: minha ? { pos: minha.pos, respect: minha.respect, level: minha.level, name: minha.name, score: minha.score } : null, total: rk.length };
    if (!geral) { out.prizes = premiosAgora(now, d); out.last = podioDe(ep.n - 1, d); }
    return enviar(res, 200, out);
  }
  if (req.method === 'GET' && path === '/api/events') {
    return enviar(res, 200, { now, list: q.eventos.all(conta).map((r) => ({ id: r.id, t: r.t, ...JSON.parse(r.dados) })) });
  }
  return enviar(res, 404, { error: 'NOT_FOUND' });
}

const server = http.createServer((req, res) => {
  tratar(req, res).catch((e) => {
    console.error('erro', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    if (!res.headersSent) enviar(res, 500, { error: 'SERVER' });
  });
});
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`crime-api em ${PORT}, dados em ${DATA}`));

// limpezas e cópias de segurança de hora a hora (guarda as últimas 24)
setInterval(() => {
  const now = clock();
  try {
    q.limparSessoes.run(now);
    q.limparEventos.run(now - 15 * T.DAY);
    const dir = join(DATA, 'copias'); mkdirSync(dir, { recursive: true });
    q.limparNoticias.run(now - 15 * T.DAY);
    qm.limpar.run(Math.floor((now - 2 * T.DAY) / 100));
    qg.limpaChat.run(now - 20 * T.DAY);
    const nome = join(dir, `jogo-${new Date(now).toISOString().slice(0, 13)}.db`);
    if (!existsSync(nome)) db.exec(`VACUUM INTO '${nome.replace(/'/g, "''")}'`);
    const fs = readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    while (fs.length > 24) unlinkSync(join(dir, fs.shift()));
  } catch (e) { console.error('copia', e.message); }
}, T.HOUR).unref();
