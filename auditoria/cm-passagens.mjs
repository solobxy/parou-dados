// Testa as próximas partidas da Carris Metropolitana nas páginas das paragens:
// a API lenta não pode fazer esperar a página mais de ~2,5 s, e uma falha não pode passar por "sem partidas".
// Uso: APP=<pasta da app> tsx auditoria/cm-passagens.mjs
import path from 'node:path';
const APP = process.env.APP || '../parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const m = await import(path.join(APP, 'src/server/seo/carrisMetropolitana.ts'));
const real = globalThis.fetch;
const vivo = setInterval(() => {}, 1000); // AbortSignal.timeout não segura o processo

// 1. API pendurada (nunca responde, mas respeita o abort)
globalThis.fetch = (_u, o) => new Promise((_, rej) => o?.signal?.addEventListener('abort', () => rej(new Error('abortado'))));
let t = Date.now();
let r = await m.passagensHojeCMComEstado('999901');
ok('[lenta] desiste em menos de 4 s', Date.now() - t < 4000, `${Date.now() - t} ms`);
ok('[lenta] diz que não respondeu (ok=false), não "sem partidas"', r.ok === false && r.v.length === 0);

// 2. API responde
globalThis.fetch = async () => new Response(JSON.stringify([{ line_id: '1001', headsign: 'Cacilhas', scheduled_arrival: '10:00:00', estimated_arrival: '10:02:00' }]), { status: 200 });
r = await m.passagensHojeCMComEstado('999902');
ok('[resposta] ok e com a partida', r.ok === true && r.v.length === 1 && r.v[0].linha === '1001' && r.v[0].prevista === 36120, JSON.stringify(r.v));

// 3. Falha depois de uma resposta recente: usa a cópia (ok)
globalThis.fetch = async () => { throw new Error('rede'); };
r = await m.passagensHojeCMComEstado('999902');
ok('[cópia] dentro de 60 s responde da cópia', r.ok === true && r.v.length === 1);

// 4. Sem resposta e sem cópia
r = await m.passagensHojeCMComEstado('999903');
ok('[falha] sem cópia: ok=false', r.ok === false);
ok('[compatível] passagensHojeCM continua a devolver lista', Array.isArray(await m.passagensHojeCM('999903')));
globalThis.fetch = real; clearInterval(vivo);
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
