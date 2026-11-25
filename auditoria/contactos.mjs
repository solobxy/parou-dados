// Contactos da PAROU: o email e o telefone que funcionam (o contacto@parou.pt não reencaminhava, 25/11/2026).
// Uso: APP=caminho-da-app node auditoria/contactos.mjs
import fs from 'node:fs';
import path from 'node:path';
const app = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const ficheiros = [];
const andar = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const c = path.join(d, f.name); if (f.isDirectory()) andar(c); else if (/\.(tsx?|html|json|txt)$/.test(f.name)) ficheiros.push(c); } };
andar(path.join(app, 'src')); ficheiros.push(path.join(app, 'index.html'));
const comAntigo = ficheiros.filter((f) => /contacto@parou\.pt|suporte@parou\.pt(?!>)/.test(fs.readFileSync(f, 'utf8').replace(/MAIL_FROM[^\n]*/g, '')));
ok('nenhum ecrã manda escrever para o contacto@parou.pt (não chega a ninguém)', comAntigo.length === 0, comAntigo.map((f) => path.relative(app, f)).join(', '));
const base = fs.readFileSync(path.join(app, 'src/components/paginasInfoBase.tsx'), 'utf8');
ok('o contacto mostrado é o email do Dinis', /CONTACTO = 'diniscash@gmail\.com'/.test(base));
ok('o telefone está nos contactos', /TELEFONE = '913 488 258'/.test(base) && /TELEFONE_LINK = '\+351913488258'/.test(base));
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
ok('os dados para o Google têm o email e o telefone', /"email": "diniscash@gmail\.com"/.test(html) && /"telephone": "\+351913488258"/.test(html));
const pagina = fs.readFileSync(path.join(app, 'src/components/PaginaInformativa.tsx'), 'utf8');
ok('a página de contactos mostra o email e o telefone', /CONTACTO/.test(pagina) && /TELEFONE/.test(pagina));
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
