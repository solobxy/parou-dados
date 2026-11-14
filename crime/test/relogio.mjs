// Só para os testes: adianta ou atrasa o relógio do servidor para ele acordar sempre poucas horas depois do início
// de uma ronda, seja qual for o dia e a hora em que os testes correm (ataques já abertos, ainda sem entradas tardias).
const desvio = +process.env.TESTE_DESVIO_MS || 0;
if (desvio) { const real = Date.now.bind(Date); Date.now = () => real() + desvio; }
