/* caiu.pt — cálculo da fatura anual de luz e gás.
   Segue as regras do simulador da ERSE (confirmadas todos os dias contra o próprio simulador, em caiu/energia.py):
   - preços sem IVA; IVA de 6 % nos primeiros 200 kWh por 30 dias (300 kWh nas famílias numerosas) até 6,9 kVA,
     no termo fixo das tarifas de acesso às redes até 3,45 kVA (luz) ou no termo fixo de acesso (gás) e na contribuição
     audiovisual; 23 % no resto;
   - IEC da eletricidade e do gás natural com IVA a 23 %; a taxa DGEG e a TOS (municipal) ficam de fora, como na ERSE;
   - reembolsos e ofertas de adesão contam como desconto sem IVA (valor com IVA / 1,23).
   Funciona no browser (window.CaiuEnergia) e no node (require). Sem dependências. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.CaiuEnergia = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DIAS = 365, MESES = 12;

  function r2(x) { return Math.round(x * 100) / 100; }
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : 0; }

  function escalaoGas(kwh, P) {
    var m3 = kwh / P.kwh_m3;
    return m3 <= 220 ? 1 : m3 <= 500 ? 2 : m3 <= 1000 ? 3 : 4;
  }

  /* ---------- partes da fatura ---------- */

  // Eletricidade: devolve null se a oferta não tem preço para esta potência e ciclo.
  function parteEle(of, ele, P) {
    var t = of.e && of.e[ele.kva];
    var p = t && t[ele.ciclo];
    if (!p) return null;
    var kwh = ele.kwh, total = 0, energia = 0, i;
    for (i = 0; i < kwh.length; i++) {
      if (typeof p[i + 1] !== 'number') return null;
      energia += p[i + 1] * kwh[i];
      total += kwh[i];
    }
    var fixo = p[0] * DIAS;
    // IVA reduzido na energia: primeiros 200 kWh por 30 dias, repartidos pelos períodos na proporção do consumo
    var lim = ele.kvaN <= 6.9 ? (ele.familiaNumerosa ? P.lim6_fn : P.lim6) * DIAS / 30 : 0;
    var parte = lim > 0 && total > 0 ? Math.min(1, lim / total) : 0;
    // IVA reduzido no termo fixo das tarifas de acesso (até 3,45 kVA)
    var fixo6 = ele.kvaN <= 3.45 ? Math.min(fixo, P.tar_tf_kva * ele.kvaN * DIAS) : 0;
    return { fixo: fixo, energia: energia, kwh: total, f6: fixo ? fixo6 / fixo : 0, e6: parte,
             iec: P.iec * total, cav: P.cav * MESES };
  }

  function parteGas(of, gas, P) {
    var esc = escalaoGas(gas.kwh, P), p = null;
    if (of.g) p = of.g[esc];
    else if (of.go && gas.ord) p = of.go[gas.ord] && of.go[gas.ord][esc];
    if (!p) return null;
    var fixo = p[0] * DIAS, energia = p[1] * gas.kwh;
    var fixo6 = Math.min(fixo, (P.gas_tar_tf[esc - 1] || 0) * DIAS);
    return { fixo: fixo, energia: energia, kwh: gas.kwh, escalao: esc, f6: fixo ? fixo6 / fixo : 0, e6: 0,
             iec: P.gas_iec * gas.kwh, cav: 0 };
  }

  /* ---------- fatura de uma oferta ----------
     perfil: { tipo: 'E'|'G'|'D', ele: {kva:'6,9', kvaN:6.9, ciclo:1|2|3, kwh:[...], familiaNumerosa}, gas: {kwh, ord} }
     op: { campanhas: true|false }  (false = sem ofertas de adesão nem reembolsos de boas-vindas)
     Os descontos em percentagem baixam cada parcela à sua taxa de IVA; os valores fixos baixam a parte a 23 %. */
  function fatura(of, perfil, P, op) {
    op = op || {};
    var campanhas = op.campanhas !== false;
    var e = null, g = null;
    if (of.t === 'E' || of.t === 'D') { e = parteEle(of, perfil.ele, P); if (!e) return null; }
    if (of.t === 'G' || of.t === 'D') { g = parteGas(of, perfil.gas, P); if (!g) return null; }
    var a6 = 0, a23 = 0, iec = 0, cav = 0, base = 0, reemb = 0, novo = 0;
    function parcela(x, rtf, rtw, rw, ntf, ntw, nw) {
      if (!x) return;
      if (!campanhas) { ntf = ntw = nw = 0; }
      var dF = (num(rtf) + num(ntf)) * x.fixo;
      var dE = (num(rtw) + num(ntw)) * x.energia + (num(rw) + num(nw)) * x.kwh;
      reemb += num(rtf) * x.fixo + num(rtw) * x.energia + num(rw) * x.kwh;
      novo += num(ntf) * x.fixo + num(ntw) * x.energia + num(nw) * x.kwh;
      var fixo = x.fixo - dF, energia = x.energia - dE;
      base += x.fixo + x.energia;
      a6 += fixo * x.f6 + energia * x.e6;
      a23 += fixo * (1 - x.f6) + energia * (1 - x.e6);
      iec += x.iec; cav += x.cav;
    }
    parcela(e, of.rtf, of.rtw, of.rw, of.nctf, of.nctw, of.ncw);
    parcela(g, of.rgtf, of.rgtw, of.rgw, of.ncgtf, of.ncgtw, of.ncgw);
    // valores fixos por ano (a ERSE dá-os com IVA)
    var rfixo = num(of.rf) / (1 + P.iva), fixos = 0;
    if (of.rfc) { if (campanhas) { novo += rfixo; fixos += rfixo; } }
    else { reemb += rfixo; fixos += rfixo; }
    if (campanhas) { novo += num(of.nc) / (1 + P.iva); fixos += num(of.nc) / (1 + P.iva); }
    var serv = num(of.srv), servIva = of.srvc != null ? num(of.srvc) - serv : serv * P.iva;
    var iva = P.iva_red * a6 + P.iva * (a23 - fixos) + servIva + P.iva * iec + P.iva_red * cav;
    var impostos = iva + iec + cav;
    var desconto = reemb + novo;
    var total = base + serv - desconto + impostos;
    return {
      total: r2(total), base: r2(base), servicos: r2(serv + servIva), impostos: r2(impostos),
      desconto: r2(desconto * (1 + P.iva)), reemb: r2(reemb * (1 + P.iva)), campanha: r2(novo * (1 + P.iva)),
      ele: e ? r2(e.fixo + e.energia) : null, gas: g ? r2(g.fixo + g.energia) : null,
      escalao: g ? g.escalao : null
    };
  }

  /* ---------- vantagens fora da fatura (saldo em cartão, combustível) ----------
     habitos: { continente, pingodoce (€/mês), litros: {galp, repsol, bp, outro} (l/mês) }
     tem: { cartao_continente, nos_tv, solar_galp, ... } */
  function aplica(v, of) {
    var a = v.aplica || {};
    if (a.com && a.com !== of.com) return false;
    if (a.ids && a.ids.indexOf(of.id) < 0) return false;
    if (a.nome && !(new RegExp(a.nome, 'i')).test(of.n)) return false;
    if (a.sem_nome && (new RegExp(a.sem_nome, 'i')).test(of.n)) return false;
    return true;
  }

  function vantagens(of, fat, perfil, VS) {
    var hab = perfil.habitos || {}, tem = perfil.tem || {}, litros = hab.litros || {};
    var porGrupo = {};
    (VS || []).forEach(function (v) {
      if (v.estado === 'parado' || !aplica(v, of)) return;
      var falta = (v.requer || []).filter(function (k) { return !tem[k]; });
      var valor = 0, nota = '', mes, l;
      if (v.tipo === 'nota') {
        porGrupo[v.id] = { id: v.id, nome: v.nome, valor: 0, nota: v.resumo || '', so_nota: true, falta: [], fonte: v.fonte && v.fonte.url };
        return;
      }
      if (v.tipo === 'combina') {
        var n = (of.t === 'D' ? 2 : 1) + (tem.nos_tv ? 1 : 0) + (tem.solar_galp ? 1 : 0);
        var nv = v.niveis[Math.min(n, v.niveis.length) - 1];
        var compras = Math.min(num(hab.continente), v.limites.continente_mes);
        l = Math.min(num(litros[v.marca]), v.limites.litros_mes);
        // quem tem COMBINA deixa de receber o vale de combustível das compras no Continente
        var vales = Math.floor(num(hab.continente) / v.perde.compra_minima);
        var perdido = v.perde.cpl * Math.min(num(litros[v.marca]), vales * v.perde.litros_por_vale);
        mes = nv.continente * compras + nv.cpl * l - perdido;
        valor = mes * MESES;
        nota = 'Nível ' + Math.min(n, v.niveis.length) + ': ' + Math.round(nv.continente * 100) + ' % nas compras do Continente e ' +
          Math.round(nv.cpl * 100) + ' cênt./l na Galp, em saldo no Cartão Continente';
      } else if (v.tipo === 'cpl' || v.tipo === 'cpl_oferta') {
        var cpl = v.tipo === 'cpl' ? num(v.cpl) : num(of.cpl);
        if (!cpl) return;
        l = Math.min(num(litros[v.marca]), v.litros_mes || Infinity);
        valor = cpl * l * MESES;
        nota = Math.round(cpl * 100) + ' cênt./l em ' + (l ? Math.round(l) + ' litros por mês' : 'cada litro') +
          (v.tipo === 'cpl_oferta' && of.cpl_ate > cpl ? ' (até ' + Math.round(of.cpl_ate * 100) + ' cênt./l com cartão de parceiro)' : '');
      } else if (v.tipo === 'credito_oferta') {
        if (!of.credito) return;
        mes = Math.min(of.credito[0] * fat.total / MESES, of.credito[1]);
        if (v.gasto_minimo && num(hab[v.gasto_minimo]) <= 0) mes = 0;
        valor = mes * MESES;
        nota = Math.round(of.credito[0] * 100) + ' % da fatura, até ' + of.credito[1] + ' € por mês';
      }
      if (!(valor > 0.5)) return;
      var item = { id: v.id, nome: v.nome, valor: r2(valor), nota: nota, resumo: v.resumo || '', falta: falta,
                   fonte: v.fonte && v.fonte.url, estado: v.estado };
      var gr = v.grupo || v.id;
      if (!porGrupo[gr] || porGrupo[gr].valor < item.valor) porGrupo[gr] = item;
    });
    return Object.keys(porGrupo).map(function (k) { return porGrupo[k]; });
  }

  /* ---------- a oferta serve a esta pessoa? ---------- */
  function serve(of, perfil) {
    var pr = perfil.pref || {}, tem = perfil.tem || {};
    if (of.dd && pr.dd === false) return false;
    if (of.fe && pr.fe === false) return false;
    if (of.idx && pr.indexado === false) return false;
    if (of.fid && pr.fidelizacao === false) return false;
    if (of.srv && pr.servicos === false) return false;
    if (of.novos && pr.clienteDe && pr.clienteDe === of.com) return false;
    var req = of.req || [];
    for (var i = 0; i < req.length; i++) if (!tem[req[i]]) return false;
    return true;
  }

  /* ---------- comparar todas ----------
     Devolve a lista ordenada pelo custo do 1.º ano (fatura com campanhas menos vantagens), uma linha por oferta. */
  function comparar(D, perfil, op) {
    op = op || {};
    var P = D.param, VS = D.vant || [], tipo = perfil.tipo, linhas = [];
    function linha(of, partes) {
      var f = fatura(of, perfil, P, { campanhas: true });
      if (!f) return null;
      var s = fatura(of, perfil, P, { campanhas: false });
      var vs = op.parcerias === false ? [] : vantagens(of, f, perfil, VS);
      var vTotal = vs.reduce(function (a, x) { return a + (x.falta.length || x.so_nota ? 0 : x.valor); }, 0);
      var ano1 = (op.campanhas === false ? s.total : f.total) - vTotal;
      return { of: of, partes: partes || null, fatura: f, semCampanhas: s, vantagens: vs, vant: r2(vTotal), ano1: r2(ano1),
               depois: r2(s.total - vTotal) };
    }
    D.of.forEach(function (of) {
      if (!serve(of, perfil)) return;
      if (tipo === 'D' ? of.t !== 'D' : of.t !== tipo) return;
      var l = linha(of);
      if (l) linhas.push(l);
    });
    if (tipo === 'D') {
      // também luz e gás em contratos separados: a melhor luz com o melhor gás (e o par do mesmo comercializador)
      var soE = comparar(D, Object.assign({}, perfil, { tipo: 'E' }), op), soG = comparar(D, Object.assign({}, perfil, { tipo: 'G' }), op);
      if (soE.length && soG.length) {
        var pares = [[soE[0], soG[0]]];
        var vistos = {};
        soE.forEach(function (le) {
          if (vistos[le.of.com]) return;
          var lg = soG.filter(function (x) { return x.of.com === le.of.com; })[0];
          if (lg) { vistos[le.of.com] = 1; pares.push([le, lg]); }
        });
        pares.forEach(function (pp) {
          var a = pp[0], b = pp[1];
          if (linhas.some(function (x) { return x.partes && x.partes[0].of.id === a.of.id && x.partes[1].of.id === b.of.id; })) return;
          linhas.push({
            of: { id: a.of.id + '+' + b.of.id, com: a.of.com === b.of.com ? a.of.com : a.of.com + '+' + b.of.com,
                  n: a.of.n + ' + ' + b.of.n, t: 'D2', tmp: a.of.tmp || b.of.tmp, idx: a.of.idx || b.of.idx },
            partes: [a, b],
            fatura: { total: r2(a.fatura.total + b.fatura.total), campanha: r2(a.fatura.campanha + b.fatura.campanha),
                      servicos: r2(a.fatura.servicos + b.fatura.servicos), impostos: r2(a.fatura.impostos + b.fatura.impostos) },
            semCampanhas: { total: r2(a.semCampanhas.total + b.semCampanhas.total) },
            vantagens: a.vantagens.concat(b.vantagens), vant: r2(a.vant + b.vant),
            ano1: r2(a.ano1 + b.ano1), depois: r2(a.depois + b.depois)
          });
        });
      }
    }
    linhas.sort(function (x, y) { return x.ano1 - y.ano1 || x.fatura.total - y.fatura.total; });
    return linhas;
  }

  /* Melhor oferta de cada comercializador (para as comparações lado a lado). */
  function porComercializador(linhas) {
    var vistos = {}, out = [];
    linhas.forEach(function (l) { var k = l.of.com; if (!vistos[k]) { vistos[k] = 1; out.push(l); } });
    return out;
  }

  return { fatura: fatura, vantagens: vantagens, comparar: comparar, porComercializador: porComercializador,
           escalaoGas: escalaoGas, serve: serve, r2: r2 };
}));
