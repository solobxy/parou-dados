# Kurogane

Jogo de sobrevivência com zombies, visto de cima em 3D, para o browser (telemóvel e computador).

- `jogo/src/` — código do jogo (three.js). `jogo/build.cjs` junta tudo num só `index.html`.
- `server.mjs` — servidor do jogo online (Node, sem dependências). Corre em 127.0.0.1:3190; o Caddy passa `/srv/*` para aqui.
- `../sites/kurogane/` — o jogo publicado (o `index.html` construído e as músicas).

## Construir

```
cd kurogane && npm install && pip install fonttools brotli
node jogo/build.cjs        # gera jogo/dist/index.html e jogo/dist/web/index.html (o do site)
cp jogo/dist/web/index.html ../sites/kurogane/index.html
```

## Testar

- `node jogo/test.cjs jogo/t29.cjs mobile` — um cenário num Chrome sem ecrã (precisa do Playwright).
- `node jogo/tnet.cjs` — dois jogadores no mesmo servidor local (porta 3191).
