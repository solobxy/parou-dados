// anjinho.pt - lista de espera («entra no diário»)
// Recebe POST /api/lista com {email, consentimento:true, origem} e guarda uma linha por email em
// $STATE_DIRECTORY/lista.jsonl (por omissão /var/lib/anjinho). Cada linha é gravada e sincronizada
// com o disco (fsync) antes de responder, por isso uma resposta "ok" quer dizer email guardado.
// Não guarda IPs nem escreve emails nos registos. Só escuta em 127.0.0.1 (o Caddy está à frente).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.STATE_DIRECTORY || '/var/lib/anjinho';
const FICHEIRO = path.join(DIR, 'lista.jsonl');
const PORTA = Number(process.env.PORT || 3100);
fs.mkdirSync(DIR, { recursive: true });

const emails = new Set();
if (fs.existsSync(FICHEIRO)) {
  for (const linha of fs.readFileSync(FICHEIRO, 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    try { emails.add(JSON.parse(linha).email); } catch { console.error('linha inválida ignorada na leitura'); }
  }
}
const fd = fs.openSync(FICHEIRO, 'a', 0o600);
console.log(`lista de espera pronta: ${emails.size} emails`);

// Limite simples: 8 pedidos por endereço a cada 10 minutos (só em memória)
const pedidos = new Map();
function demasiados(chave) {
  const agora = Date.now();
  const lista = (pedidos.get(chave) || []).filter(t => agora - t < 600000);
  lista.push(agora);
  pedidos.set(chave, lista);
  return lista.length > 8;
}
setInterval(() => {
  const agora = Date.now();
  for (const [k, l] of pedidos) if (l.every(t => agora - t >= 600000)) pedidos.delete(k);
}, 600000).unref();

const VALIDO = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

http.createServer((req, res) => {
  const responder = (codigo, corpo) => {
    if (res.writableEnded) return;
    res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(corpo));
  };
  const rota = (req.url || '').split('?')[0];
  if (rota === '/api/saude' && req.method === 'GET') return responder(200, { ok: true, total: emails.size });
  if (rota !== '/api/lista' || req.method !== 'POST') return responder(404, { ok: false });
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return responder(415, { ok: false });

  let corpo = '';
  req.setEncoding('utf8');
  req.on('data', parte => {
    corpo += parte;
    if (corpo.length > 4096) { responder(413, { ok: false }); req.destroy(); }
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let dados;
    try { dados = JSON.parse(corpo); } catch { return responder(400, { ok: false, erro: 'pedido' }); }
    if (!dados || typeof dados !== 'object') return responder(400, { ok: false, erro: 'pedido' });
    if (dados.site) return responder(200, { ok: true }); // campo-armadilha para robôs
    const quem = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (demasiados(quem)) return responder(429, { ok: false, erro: 'muitos' });
    const email = String(dados.email || '').trim().toLowerCase();
    if (email.length > 254 || !VALIDO.test(email)) return responder(400, { ok: false, erro: 'email' });
    if (dados.consentimento !== true) return responder(400, { ok: false, erro: 'consentimento' });
    if (!emails.has(email)) {
      const linha = JSON.stringify({
        email,
        quando: new Date().toISOString(),
        consentimento: 'v1: «um email por drop, nada mais. sais quando quiseres.»',
        origem: String(dados.origem || 'site').slice(0, 40),
      }) + '\n';
      try { fs.writeSync(fd, linha); fs.fsyncSync(fd); }
      catch (e) { console.error('ERRO a gravar na lista:', e.message); return responder(500, { ok: false, erro: 'servidor' }); }
      emails.add(email);
      console.log(`novo email na lista (total ${emails.size})`);
    }
    // A mesma resposta para emails novos e repetidos: não revela quem já está na lista
    responder(200, { ok: true });
  });
}).listen(PORTA, '127.0.0.1');
