# Recolha das fontes do ganhas.pt

O servidor de desenvolvimento não chega ao INE nem ao Eurostat, por isso a recolha corre no GitHub Actions
(ramos `ganhas-recolha` e `ganhas-recolha-rapida`, resultados em `ganhas-fontes-brutas` e `ganhas-fontes-rapidas`).

- `descarregar.py`: tudo de uma vez (lento).
- `rapido.py`: incremental, com orçamento de tempo.
- `pedidos.py` + `pedidos.json`: só o que estiver na lista.

Depois: `python3 ganhas/processar.py <pasta-rapidas> <dgaep.json>` gera `ganhas/dados/oficial.json`.
Os decis de 2024 (`ganhas/dados/decis.json`) vêm do ficheiro de séries da DGCP/MTSSS (quadros 31 e 33);
a soma das médias por decil confere com o ganho médio publicado. Atualizar quando sair o ano de 2025.
