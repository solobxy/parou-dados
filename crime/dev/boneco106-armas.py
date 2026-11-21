# Camadas das armas para o boneco, uma por arma, a partir da própria fotografia da arma (img/gear/<id>.webp):
# recorta a arma do fundo escuro, deita-a ao comprido e põe-na no corpo conforme o tipo:
#   brancas (faca, contundente, lâmina, espada): pendurada na mão direita, cabo na mão e a ponta para baixo;
#   soqueiras: em cima do punho direito;
#   pistolas e revólveres: na mão esquerda, cano para baixo;
#   compridas (smg, caçadeira, carabina, espingarda, sniper, pesada): ao peito na diagonal, com a correia ao ombro.
# Uso (dentro de crime/): python3 dev/boneco106-armas.py <saída> [ids...]   — precisa do rembg (pip install "rembg[cpu]")
# Os ficheiros saem como w_<id>.webp: copiam-se para sites/crime/img/boneco/w/<id>.webp.
import sys, json, numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage
import os, subprocess
AQUI = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(AQUI, '..', '..', 'sites', 'crime', 'img')
GEAR = os.path.join(SITE, 'gear') + '/'
BASE = Image.open(os.path.join(SITE, 'boneco', 'base.webp')).convert('RGBA'); W, H = BASE.size
by = json.loads(subprocess.check_output(['node', '-e', "import('./engine/config.js').then(({CFG})=>{const b={};for(const g of CFG.gear)if(g.t)(b[g.t]=b[g.t]||[]).push(g.id);console.log(JSON.stringify(b))})"], cwd=os.path.join(AQUI, '..'))); tipo = {i: t for t, L in by.items() for i in L}
LEN = {'faca': 78, 'contundente': 190, 'lamina': 170, 'espada': 250, 'soqueira': 44, 'pistola': 96, 'revolver': 104,
       'smg': 170, 'cacadeira': 300, 'carabina': 290, 'espingarda': 310, 'sniper': 320, 'pesada': 300}
MAO_D, MAO_E = (126, 386), (352, 383)   # mãos (direita do boneco à esquerda da imagem)
_S = None
_U = None
U2 = {'katana', 'espadamao', 'claymore'}
CORTE = {'metralhadorapesada': 305, 'smgdobravel': 335, 'metralhadora': 335, 'smgtatica': 335}   # v107/v108: sem tripé nem suporte de exposição
# v108: as compridas com o cano para baixo (coronha articulada confunde a altura das pontas) ou de pernas para o ar (silenciador grosso)
ESCOPO = {'afinada', 'caca', 'espingarda22', 'espingarda300', 'espingarda3030', 'espingardaar', 'espingardasafari', 'espingardavarmint', 'ferrolho',
          'ligeira', 'precisao', 'sniper', 'sniper308', 'sniper338', 'sniperanti', 'snipercompeticao', 'sniperlonga', 'sniperpolicia', 'snipersemi'}   # a luneta tem de ficar por cima
# escolhidas a olho, as quatro hipóteses lado a lado (dev: var4)
VIRA_H = {'micro', 'smg45', 'artesanal', 'batalhapesada', 'cacadeiracarregador', 'metralhadoraligeira', 'compacta', 'smg9', 'smgpdw'}
VIRA_V = {'carabinacurta', 'ar762', 'calibre50', 'cacadeiratatica', 'espingardaassalto', 'smgtambor',   # v125: a cacadeiratambor (fotografia nova) já sai direita
          'cacadeiraauto', 'carabinapolicia', 'bullpup', 'carabinaprototipo', 'sniperbullpup', 'sniperartico',
          'cacadeiradupla', 'espingardaexpress', 'espingardaalavanca', 'compacta', 'smg9', 'smgpdw'} | ESCOPO
def _sem_tripe(m):   # v107: a de tripé — tira o tripé (mais acima no meio, onde está a cabeça do tripé) e as caixas de munição
    m[285:] = False; m[262:, 230:370] = False; return m
CORTE_F = {'metralhadoratripe': _sem_tripe}
SEM_TAN = {'metralhadoramedia'}   # a bandoleira cor de areia não vai para o boneco
# v106: as fotografias das pistolas e revólveres têm a arma preta em cima de fundo preto e o recorte apanhava sombras e o carregador;
# usam-se 7 desenhos de catálogo (Flux, em dev/boneco-fontes/, fundo branco) com o mesmo tipo e as mesmas cores de cada fotografia
FONTES = os.path.join(AQUI, 'boneco-fontes') + '/'
CURTA = {**{i: 'hg_a' for i in ('pistola22', 'pistolacompacta', 'pistola', 'pistolatiro', 'pistolacarbono')},   # polímero preto
         **{i: 'hg_b' for i in ('pistolabolso', 'pistola9', 'pistola10', 'pistola57', 'pistola50')},   # aço preto
         **{i: 'hg_c' for i in ('pistola380', 'pistolamilitar')},   # corrediça cor de areia e mira
         'pistolapolicia': 'hg_d',   # corrediça prateada e mira
         # v108: fotografias novas (z_image no Higgsfield) e desenhos a condizer
         'pistolaouro': 'hg_h', 'pistola50ae': 'hg_j',
         'pistolaaco': 'hg_i', 'pistolaauto': 'hg_k',   # v125: desenhos próprios (inox; Glock 18 de carregador comprido), cada um com um só punho e o cano à direita
         'pistolaafinada': 'hg_e',   # corrediça de bronze
         **{i: 'hg_f' for i in ('revolver22', 'revolver357', 'magnum', 'revolvercaca', 'revolver500')},   # inox, cabo de borracha
         **{i: 'hg_g' for i in ('revolver', 'snubnose', 'revolver44', 'revolver454', 'revolvercolecao')}}   # aço escuro, cabo de madeira
def recorta_branco(nome):
    # fundo branco com sombras suaves: o rembg (isnet) separa bem a arma da sombra; os brilhos quase brancos ficam cinzentos
    global _S
    from rembg import remove, new_session
    if _S is None: _S = new_session('isnet-general-use')
    im = Image.open(FONTES + nome + '.webp').convert('RGB'); A = np.asarray(im).astype(int)
    if nome in ('hg_f',):   # inox em cima de branco: o rembg perdia o metal; aqui não há sombra, chega o limiar
        bg = A.min(axis=2) > 238; lab, n = ndimage.label(bg); sz = ndimage.sum(bg, lab, range(1, n + 1))
        bg[np.isin(lab, [i + 1 for i, v in enumerate(sz) if v < 180])] = False; m = ~bg
    else: m = np.asarray(remove(im, session=_S))[..., 3] > 128
    m = ndimage.binary_opening(m, iterations=1); lab, n = ndimage.label(m); sz = ndimage.sum(m, lab, range(1, n + 1)); m = lab == (int(np.argmax(sz)) + 1)
    B = A.copy(); hi = m & (A.min(axis=2) > 225); B[hi] = (B[hi] * 0.78).astype(int)
    from PIL import ImageEnhance
    B = (B * 0.86).astype(np.uint8)   # luz de estúdio → a luz do boneco: um pouco mais escuro e menos saturado
    o = ImageEnhance.Color(Image.fromarray(B)).enhance(0.72).convert('RGBA'); o.putalpha(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)))
    return o.crop(o.getbbox())
VIRA = {'hg_a', 'hg_d', 'hg_g', 'hg_j'}   # desenhos com o cano à esquerda
def nivela(o, nome):
    # cano à direita e a aresta de cima da frente (corrediça ou cano) na horizontal
    if nome in VIRA: o = o.transpose(Image.FLIP_LEFT_RIGHT)
    for _ in range(0 if nome == 'hg_g' else 4):   # no revólver curto a frente é o cão e o tambor: o desenho já vem direito
        m = np.asarray(o)[..., 3] > 100; w = m.shape[1]
        cols = [x for x in range(int(w * 0.66), int(w * 0.97)) if m[:, x].any()]
        top = np.array([np.argmax(m[:, x]) for x in cols]); k = np.polyfit(cols, top, 1)[0]
        ang = np.degrees(np.arctan(k))
        if abs(ang) < 0.5: break
        o = o.rotate(ang, expand=True, resample=Image.BICUBIC); o = o.crop(o.getbbox())
    return o
def recorta(id):
    # o recorte é feito pelo rembg (modelo isnet, corre aqui): estas fotografias têm a arma em cima de pedra, e só a diferença de cor apanhava a pedra
    global _S, _U
    from rembg import remove, new_session
    if _S is None: _S = new_session('isnet-general-use')
    if id in U2 and _U is None: _U = new_session('u2net')   # nestas o isnet perdia a lâmina
    o = remove(Image.open(GEAR + id + '.webp').convert('RGB'), session=_U if id in U2 else _S)
    A = np.asarray(o); m = A[..., 3] > (18 if id in U2 else 35 if tipo[id] in ('faca', 'lamina', 'contundente') else 140)   # lâminas finas e claras saem com pouca opacidade
    if id in CORTE: m[CORTE[id]:] = False   # fotografias com a arma num suporte: corta-se o suporte
    if id in CORTE_F: m = CORTE_F[id](m)
    if id in SEM_TAN:
        C = A[..., :3].astype(int); m &= ~((C[..., 0] - C[..., 2] > 12) & (C[..., 0] > 35)); m[378:, 255:490] = False   # e o rolo da bandoleira no chão
    m = ndimage.binary_opening(m, iterations=1)
    lab, n = ndimage.label(m)
    if not n: return None
    sz = ndimage.sum(m, lab, range(1, n + 1)); keep = [i + 1 for i, v in enumerate(sz) if v >= sz.max() * (0.06 if tipo[id] in ('faca', 'lamina', 'espada', 'contundente') else 0.25)]   # a arma (e peças grandes dela), sem balas soltas
    m = np.isin(lab, keep)
    al = Image.fromarray(np.where(m, np.maximum(A[..., 3], 200), 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))   # o que é arma fica opaco
    im = Image.fromarray(A[..., :3]).convert('RGBA'); im.putalpha(al)
    return im, m
def eixo(m):
    ys, xs = np.nonzero(m); c = np.cov(np.vstack([xs - xs.mean(), ys - ys.mean()]))
    w, v = np.linalg.eigh(c); vx, vy = v[:, 1]; return np.degrees(np.arctan2(vy, vx))
def deita(im, m):
    # roda até o comprimento ficar na horizontal e corta à volta
    ang = eixo(m); r = im.rotate(ang, expand=True, resample=Image.BICUBIC); bb = r.getbbox(); return r.crop(bb)
def pontas(r):
    # altura do recorte em cada ponta (15% do comprimento) e luz/cor: diz onde está o cabo
    A = np.asarray(r).astype(float); al = A[..., 3] > 60; w = al.shape[1]; k = max(3, int(w * 0.18))
    def info(sl):
        cols = al[:, sl]; hgt = cols.sum(axis=0).mean(); px = A[:, sl][cols]
        rgb = px[:, :3] if len(px) else np.zeros((1, 3)); lum = rgb.mean(); sat = (rgb.max(axis=1) - rgb.min(axis=1)).mean()
        return hgt, lum, sat
    return info(slice(0, k)), info(slice(w - k, w))
def endireita(r):
    # com o cano à direita: o cano fica por cima do resto (punho, carregador e coronha descem); se não, vira ao contrário
    A = np.asarray(r)[..., 3] > 60; ys, xs = np.nonzero(A); w = A.shape[1]; k = xs > w * 0.82
    if k.sum() and ys[k].mean() > ys.mean(): r = r.transpose(Image.FLIP_TOP_BOTTOM)
    return r
def camada(id):
    t = tipo[id]
    if t not in ('pistola', 'revolver'):
        rc = recorta(id)
        if rc is None: return None
        r = deita(*rc); (hL, lL, sL), (hR, lR, sR) = pontas(r)
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if t in ('faca', 'contundente', 'lamina', 'espada'):
        # a lâmina é a ponta mais clara e menos colorida (metal); sem metal claro, o cabo é a ponta mais fina
        metal = (lL - sL * 0.8) - (lR - sR * 0.8)
        cabo_esq = metal < -12 or (abs(metal) <= 12 and hL < hR)
        if t == 'espada':   # nas espadas o cabo é o lado da guarda (a parte mais larga)
            al = np.asarray(r)[..., 3] > 60; prof = al.sum(axis=0); cabo_esq = int(np.argmax(prof)) < al.shape[1] / 2
        if not cabo_esq: r = r.transpose(Image.FLIP_LEFT_RIGHT)
        s = LEN[t] / r.size[0]; r = r.resize((max(1, int(r.size[0] * s)), max(1, int(r.size[1] * s))), Image.LANCZOS)
        r = r.rotate(-84, expand=True, resample=Image.BICUBIC)   # cabo em cima, ponta para baixo, um pouco para fora
        bb = r.getbbox(); r = r.crop(bb)
        L.alpha_composite(r, (int(MAO_D[0] - r.size[0] * 0.55), int(MAO_D[1] - 14)))
    elif t == 'soqueira':
        s = LEN[t] / max(r.size); r = r.resize((max(1, int(r.size[0] * s)), max(1, int(r.size[1] * s))), Image.LANCZOS).rotate(-80, expand=True, resample=Image.BICUBIC)
        r = r.crop(r.getbbox()); L.alpha_composite(r, (int(MAO_D[0] - r.size[0] / 2), int(MAO_D[1] + 4 - r.size[1] / 2)))
    elif t in ('pistola', 'revolver'):
        # na mão esquerda, cano para baixo e o cabo dentro da mão (de perfil, para se perceber a arma)
        r = nivela(recorta_branco(CURTA[id]), CURTA[id])
        s = LEN[t] / r.size[0]; r = r.resize((max(1, int(r.size[0] * s)), max(1, int(r.size[1] * s))), Image.LANCZOS)
        r = r.rotate(-80, expand=True, resample=Image.BICUBIC); r = r.crop(r.getbbox())
        L.alpha_composite(r, (int(MAO_E[0] - r.size[0] * 0.5), int(MAO_E[1] - 14)))
        # os dedos à frente do cabo: copia a pele da mão do boneco por cima da arma (a camada fica por baixo das luvas)
        Bq = np.asarray(BASE).astype(int); Lq = np.asarray(L).copy()
        x0, x1, y0, y1 = MAO_E[0] - 30, MAO_E[0] + 26, MAO_E[1] - 30, MAO_E[1] + 40
        win = Bq[y0:y1, x0:x1]; r_, g_, b_ = win[..., 0], win[..., 1], win[..., 2]
        pele = (r_ - b_ > 22) & (r_ > g_) & (r_ > 80)
        pele = ndimage.binary_opening(pele, iterations=1) & (Lq[y0:y1, x0:x1, 3] > 0)
        Lq[y0:y1, x0:x1][pele] = np.concatenate([win[pele][:, :3], np.full((pele.sum(), 1), 255)], axis=1).astype(np.uint8)
        L = Image.fromarray(Lq)
    else:
        # ao peito: coronha em baixo à direita do boneco (esquerda da imagem), cano para cima ao ombro esquerdo
        if hL < hR: r = r.transpose(Image.FLIP_LEFT_RIGHT)   # coronha (mais alta) à esquerda, cano à direita
        r = endireita(r)
        if id in VIRA_H: r = r.transpose(Image.FLIP_LEFT_RIGHT)   # v108: as regras de cima enganam-se nestas (vistas uma a uma)
        if id in VIRA_V: r = r.transpose(Image.FLIP_TOP_BOTTOM)
        s = LEN[t] / r.size[0]; r = r.resize((max(1, int(r.size[0] * s)), max(1, int(r.size[1] * s))), Image.LANCZOS)
        r = r.rotate(38, expand=True, resample=Image.BICUBIC); r = r.crop(r.getbbox())
        cx, cy = 236, 250   # meio do peito
        x0, y0 = int(cx - r.size[0] / 2), int(cy - r.size[1] / 2)
        dr = ImageDraw.Draw(L)   # correia: do ombro esquerdo (direita da imagem) à coronha, por baixo da arma (v108: o vértice assenta no ombro; antes ficava no ar)
        dr.line([(298, 128), (x0 + r.size[0] * 0.18, y0 + r.size[1] * 0.86)], fill=(22, 22, 22, 255), width=7)
        dr.line([(298, 128), (x0 + r.size[0] * 0.80, y0 + r.size[1] * 0.20)], fill=(22, 22, 22, 255), width=7)
        L = L.filter(ImageFilter.GaussianBlur(0.6)); L.alpha_composite(r, (x0, y0))
    return L
if __name__ == '__main__':
    out = sys.argv[1]; ids = sys.argv[2:] or list(tipo)
    import os; os.makedirs(out, exist_ok=True)
    for i in ids:
        L = camada(i)
        if L is None: print('sem recorte', i); continue
        L.save(f'{out}/w_{i}.webp', 'WEBP', quality=86, method=6)
    print('feitas', len(ids))
