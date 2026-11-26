"""Envia o .aab da PAROU para a Google Play (faixa de teste fechado), pela API oficial da Play.

Precisa do segredo PLAY_SERVICE_ACCOUNT_JSON (chave JSON de uma conta de serviço convidada na Play Console
com autorização para lançar em faixas de teste). Nunca escreve a chave no registo.

Uso: python enviar_play.py <ficheiro.aab> <codigo> [faixa] [notas]
  faixa: nome interno da faixa (ex.: alpha). Vazio = descobre a faixa de teste fechado onde já há versões.
"""
import json
import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

PACOTE = "pt.parou.app"
FAIXAS_QUE_NAO_SAO_TESTE_FECHADO = {"production", "internal", "beta"}  # beta = teste aberto


def escolher_faixa(faixas, pedida):
    nomes = [f["track"] for f in faixas]
    print("Faixas na Play:", ", ".join(nomes) or "(nenhuma)")
    if pedida:
        return pedida
    # Faixa de teste fechado que já tem versões (a criada na Play Console)
    for f in faixas:
        if f["track"] in FAIXAS_QUE_NAO_SAO_TESTE_FECHADO:
            continue
        if any(r.get("versionCodes") for r in f.get("releases", [])):
            return f["track"]
    if "alpha" in nomes:
        return "alpha"
    sys.exit("Não encontrei a faixa de teste fechado; indica-a no campo «faixa» do workflow.")


def main():
    aab, codigo = sys.argv[1], int(sys.argv[2])
    pedida = sys.argv[3].strip() if len(sys.argv) > 3 else ""
    notas = sys.argv[4].strip() if len(sys.argv) > 4 and sys.argv[4].strip() else "Correções e melhorias."

    info = json.loads(os.environ["PLAY_SERVICE_ACCOUNT_JSON"])
    cred = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    print("Conta de serviço:", info.get("client_email", "?"))
    api = build("androidpublisher", "v3", credentials=cred, cache_discovery=False)
    edits = api.edits()

    edit_id = edits.insert(packageName=PACOTE, body={}).execute()["id"]
    faixas = edits.tracks().list(packageName=PACOTE, editId=edit_id).execute().get("tracks", [])
    faixa = escolher_faixa(faixas, pedida)
    print("Faixa escolhida:", faixa)

    media = MediaFileUpload(aab, mimetype="application/octet-stream", resumable=True)
    enviado = edits.bundles().upload(packageName=PACOTE, editId=edit_id, media_body=media).execute()
    print("Enviado o .aab com o código", enviado["versionCode"])
    if int(enviado["versionCode"]) != codigo:
        sys.exit(f"O .aab tem o código {enviado['versionCode']}, mas foi pedido o {codigo}.")

    edits.tracks().update(
        packageName=PACOTE,
        editId=edit_id,
        track=faixa,
        body={
            "track": faixa,
            "releases": [
                {
                    "versionCodes": [str(codigo)],
                    "status": "completed",
                    "releaseNotes": [{"language": "pt-PT", "text": notas[:500]}],
                }
            ],
        },
    ).execute()
    edits.commit(packageName=PACOTE, editId=edit_id).execute()
    print(f"Versão {codigo} enviada para a faixa «{faixa}». Fica em revisão na Google antes de chegar aos testadores.")


if __name__ == "__main__":
    main()
