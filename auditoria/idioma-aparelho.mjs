// Testa a escolha do idioma para quem abre a PAROU pela primeira vez (antes era sempre português):
// segue as línguas do aparelho pela ordem, sem nenhuma das quatro fica o inglês, e os robôs ficam no português.
// Uso: APP=<pasta da app> tsx auditoria/idioma-aparelho.mjs
import path from 'node:path';
const APP = process.env.APP || '../parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { idiomaDoAparelho } = await import(path.join(APP, 'src/i18n/index.ts'));
const casos = [
  [['pt-PT'], '', 'pt', 'português de Portugal'],
  [['pt-BR', 'en'], '', 'pt', 'português do Brasil'],
  [['en-US'], '', 'en', 'inglês'],
  [['en-GB', 'pt-PT'], '', 'en', 'a primeira preferida manda'],
  [['de-DE', 'en'], '', 'de', 'alemão'],
  [['fr-CA'], '', 'fr', 'francês do Canadá'],
  [['es-ES', 'pt-PT'], '', 'pt', 'espanhol sem tradução, com português a seguir'],
  [['es-ES', 'fr'], '', 'fr', 'espanhol e francês'],
  [['nl-NL'], '', 'en', 'língua sem tradução: inglês'],
  [['zh_CN'], '', 'en', 'separador _ também'],
  [[], '', 'pt', 'sem informação: português'],
  [[''], '', 'pt', 'vazio: português'],
  [['en-US'], 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'pt', 'Google fica no português'],
  [['en-US'], 'Mozilla/5.0 (compatible; bingbot/2.0)', 'pt', 'Bing fica no português'],
  [['en-US'], 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15', 'en', 'iPhone em inglês'],
];
for (const [ls, ag, esperado, nome] of casos) {
  const r = idiomaDoAparelho(ls, ag);
  ok(`[idioma] ${nome}`, r === esperado, `${JSON.stringify(ls)} -> ${r}`);
}
console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
