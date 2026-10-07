#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAROU.PT - Resumo diario dos feeds com problemas
================================================

Le o manifest.json da construcao do dia e:
- escreve um resumo no GitHub Actions (separador "Summary" da execucao);
- mantem uma issue "Estado dos feeds (automatico)" no repositorio: abre-a quando
  aparece um problema, comenta so quando a lista de problemas muda (para o GitHub
  te avisar por email sem repetir todos os dias) e fecha-a quando tudo fica bem.

Uso: python avisos.py            (no GitHub Actions, com GH_TOKEN)
     python avisos.py --sem-github   (so mostra o resumo, sem mexer em issues)
"""

import datetime
import json
import os
import subprocess
import sys
import tempfile
from zoneinfo import ZoneInfo

MANIFEST = "manifest.json"
TITULO = "Estado dos feeds (automático)"
AVISO_DIAS = 14
LISBON = ZoneInfo("Europe/Lisbon")
MARCA = "<!-- assinatura:"

GRUPOS = [
    ("erro", "Sem dados ou com falha"),
    ("sem_servico", "Sem viagens nos dias úteis"),
    ("caducado", "Horário caducado"),
    ("a_caducar", f"Horário acaba nos próximos {AVISO_DIAS} dias"),
]


def validade(feed, hoje):
    """Usa o estado gravado no manifest; em manifests antigos calcula-o a partir de valid_until."""
    if feed.get("validade"):
        return feed["validade"], feed.get("dias_validade")
    fim = feed.get("valid_until")
    if not fim:
        return "desconhecido", None
    try:
        dias = (datetime.date.fromisoformat(str(fim)[:10]) - hoje).days
    except ValueError:
        return "desconhecido", None
    if dias < 0:
        return "caducado", dias
    if dias <= AVISO_DIAS:
        return "a_caducar", dias
    return "ok", dias


def resumir_erro(texto):
    primeiro = (texto or "").split(" | ")[0]
    if " -> " in primeiro:
        primeiro = primeiro.split(" -> ", 1)[1]
    primeiro = primeiro.strip()
    return primeiro[:180] + ("…" if len(primeiro) > 180 else "")


def data_pt(iso):
    try:
        d = datetime.date.fromisoformat(str(iso)[:10])
        return d.strftime("%d/%m/%Y")
    except ValueError:
        return str(iso)


def analisar(manifest, hoje):
    """Devolve (problemas, sem_viagens). problemas = lista de (grupo, operador, texto)."""
    problemas, sem_viagens = [], []
    uteis = int((manifest.get("verificacao") or {}).get("dias_uteis_verificados") or 0)
    for f in manifest.get("feeds", []):
        nome = f.get("operator_name") or f.get("id") or "?"
        status = f.get("status")
        erro = f.get("last_error") or ""
        if status == "ERROR":
            problemas.append(("erro", nome, f"Sem dados: {resumir_erro(erro)}"))
            continue
        if erro.startswith("Hoje falhou"):
            problemas.append(("erro", nome, "O download falhou hoje; a app continua com os dados anteriores."))
        estado, dias = validade(f, hoje)
        if estado == "caducado":
            texto = f"Caducou a {data_pt(f.get('valid_until'))} (há {-dias} dias)."
            if f.get("horario_prolongado") or "não atualizou as datas" in erro:
                texto += " A app está a repetir o último horário semanal."
            problemas.append(("caducado", nome, texto))
        elif estado == "a_caducar":
            quando = "hoje" if dias == 0 else ("amanhã" if dias == 1 else f"daqui a {dias} dias")
            problemas.append(("a_caducar", nome, f"Acaba a {data_pt(f.get('valid_until'))} ({quando})."))
        sem_uteis = int(f.get("dias_uteis_sem_servico") or 0)
        if (status == "OK" and (f.get("trips") or 0) > 0 and uteis >= 3
                and estado != "caducado" and sem_uteis >= uteis - 1):
            problemas.append(("sem_servico", nome,
                              f"Sem viagens em {sem_uteis} dos {uteis} dias úteis dos próximos 7 dias, "
                              f"apesar de o ficheiro dizer que é válido até {data_pt(f.get('valid_until'))}. "
                              "O operador deve estar a publicar um horário antigo."))
        elif status == "OK" and (f.get("trips") or 0) > 0 and f.get("viagens_hoje") == 0:
            sem_viagens.append(nome)
    return problemas, sem_viagens


def assinatura(problemas):
    return ";".join(sorted(f"{g}:{n}" for g, n, _ in problemas))


def corpo(manifest, problemas, sem_viagens, hoje):
    totais = manifest.get("totals", {})
    horarios = f"{int(totais.get('stop_times') or 0):,}".replace(",", " ")
    linhas = [
        f"## Estado dos feeds — {hoje.strftime('%d/%m/%Y')}",
        "",
        f"Base construída a {str(manifest.get('built_at', ''))[:16].replace('T', ' ')} UTC: "
        f"{totais.get('operators_ok', '?')} de {totais.get('operators', '?')} operadores com dados, "
        f"{horarios} horários.",
        "",
    ]
    if not problemas:
        linhas.append("Todos os feeds estão a funcionar e dentro da validade.")
    for grupo, titulo in GRUPOS:
        itens = [(n, t) for g, n, t in problemas if g == grupo]
        if not itens:
            continue
        linhas += [f"### {titulo} ({len(itens)})", "", "| Operador | Detalhe |", "| --- | --- |"]
        linhas += [f"| {n.replace('|', '/')} | {t.replace('|', '/')} |" for n, t in sorted(itens)]
        linhas.append("")
    if sem_viagens:
        linhas += ["", f"Sem viagens hoje (pode ser normal ao fim de semana ou em feriados): "
                       f"{', '.join(sorted(sem_viagens))}."]
    return "\n".join(linhas).strip() + "\n"


def gh(*args, entrada=None):
    res = subprocess.run(["gh", *args], capture_output=True, text=True, input=entrada)
    if res.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:2])} falhou: {res.stderr.strip()[:300]}")
    return res.stdout


def sincronizar_issue(repo, texto, problemas):
    lista = json.loads(gh("issue", "list", "--repo", repo, "--state", "open", "--limit", "50",
                          "--search", f'in:title "{TITULO}"', "--json", "number,title,body"))
    aberta = next((i for i in lista if i.get("title") == TITULO), None)
    nova = assinatura(problemas)
    corpo_issue = texto + f"\n{MARCA} {nova} -->\n"

    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as tmp:
        tmp.write(corpo_issue)
        caminho = tmp.name
    try:
        if not problemas:
            if aberta:
                gh("issue", "close", str(aberta["number"]), "--repo", repo,
                   "--comment", "Todos os feeds voltaram a estar bem. Fecho esta issue.")
                print(f"Issue #{aberta['number']} fechada.")
            else:
                print("Sem problemas e sem issue aberta.")
            return
        if not aberta:
            url = gh("issue", "create", "--repo", repo, "--title", TITULO, "--body-file", caminho).strip()
            print(f"Issue criada: {url}")
            return
        antiga = ""
        corpo_antigo = aberta.get("body") or ""
        if MARCA in corpo_antigo:
            antiga = corpo_antigo.split(MARCA, 1)[1].split("-->", 1)[0].strip()
        gh("issue", "edit", str(aberta["number"]), "--repo", repo, "--body-file", caminho)
        if antiga != nova:
            antes = set(filter(None, antiga.split(";")))
            agora = set(filter(None, nova.split(";")))
            partes = []
            if agora - antes:
                partes.append("Novos problemas: " + ", ".join(sorted(x.split(":", 1)[1] for x in agora - antes)) + ".")
            if antes - agora:
                partes.append("Resolvidos: " + ", ".join(sorted(x.split(":", 1)[1] for x in antes - agora)) + ".")
            gh("issue", "comment", str(aberta["number"]), "--repo", repo,
               "--body", " ".join(partes) or "A lista de problemas mudou.")
            print(f"Issue #{aberta['number']} atualizada e comentada.")
        else:
            print(f"Issue #{aberta['number']} atualizada (sem alterações na lista).")
    finally:
        os.unlink(caminho)


def main():
    sem_github = "--sem-github" in sys.argv
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    hoje = datetime.datetime.now(LISBON).date()
    problemas, sem_viagens = analisar(manifest, hoje)
    texto = corpo(manifest, problemas, sem_viagens, hoje)

    resumo = os.environ.get("GITHUB_STEP_SUMMARY")
    if resumo:
        with open(resumo, "a", encoding="utf-8") as fh:
            fh.write(texto)
    print(texto)

    repo = os.environ.get("GITHUB_REPOSITORY")
    if sem_github or not repo:
        print("(Sem GitHub: não mexi em issues.)")
        return
    sincronizar_issue(repo, texto, problemas)


if __name__ == "__main__":
    main()
