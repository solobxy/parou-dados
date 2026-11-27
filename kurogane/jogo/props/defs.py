# Os adereços: cada função desenha um, em metros, com a frente para +z e o chão em y = 0.
from lib import Part
import math

def lixo():
    # contentor do lixo de rodas (1100 L): cuba afunilada, frisos, tampas com pegas, munhões de elevação, rodas
    body = Part('v', tint=True, angle=40)
    body.box(1.28, 0.86, 0.8, 0, 0.6, 0, bev=0.05, seg=1, taper=(1.06, 1.08))
    body.box(1.44, 0.07, 0.92, 0, 1.055, 0, bev=0.025, seg=1)  # aro de cima
    for sx in (-0.45, -0.15, 0.15, 0.45):
        for sz in (-1, 1): body.box(0.07, 0.72, 0.05, sx, 0.62, sz * 0.425, rx=sz * -0.04, bev=0.015)
    for sx in (-1, 1): body.box(0.05, 0.6, 0.6, sx * 0.67, 0.62, 0, rz=sx * 0.04, bev=0.015)  # reforço dos lados
    body.box(1.38, 0.08, 0.05, 0, 0.92, 0.45, bev=0.02)  # banda da frente
    lid = Part('v', 0x2a2c2e, angle=40)
    for i, sx in enumerate((-0.355, 0.355)):
        a = -0.1 if i else 0.0
        lid.box(0.69, 0.05, 0.94, sx, 1.115 + (0.03 if i else 0), 0.0, rx=a, bev=0.02)
        lid.box(0.6, 0.03, 0.8, sx, 1.15 + (0.035 if i else 0), -0.03, rx=a, bev=0.012)
        lid.box(0.22, 0.05, 0.05, sx, 1.11 + (0.05 if i else 0), 0.48 - (0.0 if not i else 0.01), rx=a, bev=0.012)  # pega
    for sx in (-0.355, 0.355):
        for k in (-0.2, 0.2): lid.cyl(0.025, 0.025, 0.06, 8, sx + k, 1.1, -0.47, rz=math.pi / 2)  # dobradiças
    met = Part('m', 0x7c8084, angle=30)
    for sx in (-1, 1):
        met.cyl(0.05, 0.05, 0.1, 10, sx * 0.72, 0.95, 0, rz=math.pi / 2)  # munhões
        met.cyl(0.075, 0.075, 0.02, 10, sx * 0.775, 0.95, 0, rz=math.pi / 2)
    met.tube([(-0.5, 0.25, 0.48), (-0.5, 0.2, 0.55), (0.5, 0.2, 0.55), (0.5, 0.25, 0.48)], 0.018)  # pedal
    rub = Part('v', 0x1c1d1e, angle=30)
    for sx in (-0.52, 0.52):
        for sz in (-0.3, 0.3):
            met.box(0.1, 0.06, 0.1, sx, 0.165, sz, bev=0.01)
            met.box(0.015, 0.08, 0.06, sx - 0.035, 0.11, sz); met.box(0.015, 0.08, 0.06, sx + 0.035, 0.11, sz)
            rub.cyl(0.075, 0.075, 0.045, 10, sx, 0.075, sz, rz=math.pi / 2)
    lab = Part('v', 0xe8e4d8, angle=30)
    lab.box(0.34, 0.2, 0.012, 0.25, 0.68, 0.43, rx=-0.04)
    yel = Part('v', 0xe0b23a, angle=30)
    yel.box(1.3, 0.05, 0.012, 0, 0.98, 0.462)

PROPS = {'lixo': lixo}

def vend():
    # máquina de bebidas japonesa: corpo com cantos boleados, moldura do mostruário (a imagem das latas é do jogo), botões acesos,
    # moedeiro, saída das latas com aba, letreiro aceso em cima, grelha de ventilação dos lados, rodapé
    body = Part('m', tint=True, angle=40)
    body.box(0.95, 1.84, 0.74, 0, 0.14 + 0.92, -0.005, bev=0.03, seg=2)
    body.box(0.97, 0.06, 0.76, 0, 1.97, -0.005, bev=0.02)  # tampa de cima
    dark = Part('m', 0x1b1d20, angle=40)
    dark.box(0.9, 0.12, 0.7, 0, 0.07, 0, bev=0.02)  # rodapé
    dark.box(0.88, 1.12, 0.03, 0, 1.34, 0.372, bev=0.01)  # moldura do mostruário
    dark.box(0.6, 0.2, 0.05, 0, 0.47, 0.37, bev=0.012)  # saída das latas
    dark.box(0.14, 0.42, 0.03, 0.34, 0.85, 0.375, bev=0.008)  # painel do moedeiro
    met = Part('m', 0xb8bcc0, angle=30)
    met.box(0.54, 0.1, 0.02, 0, 0.5, 0.398, rx=0.25, bev=0.005)  # aba
    met.box(0.06, 0.1, 0.012, 0.34, 0.98, 0.392); met.box(0.05, 0.03, 0.012, 0.34, 0.86, 0.392); met.box(0.08, 0.08, 0.012, 0.34, 0.72, 0.392)  # moedas, notas, troco
    for sx in (-1, 1):
        for i in range(7): met.box(0.012, 0.03, 0.5, sx * 0.478, 0.4 + i * 0.07, -0.05)  # ventilação
    lit = Part('lit', lit=(1.55, 1.55, 1.45))
    lit.box(0.84, 0.12, 0.04, 0, 1.92, 0.375)  # letreiro aceso
    btn = Part('lit', lit=(1.2, 1.35, 1.6))
    for r in range(3):
        for c in range(5): btn.box(0.05, 0.022, 0.012, -0.3 + c * 0.13, 1.06 + r * 0.33, 0.392)  # botões por baixo de cada fila
    btn2 = Part('lit', lit=(1.6, 0.4, 0.3))
    btn2.box(0.06, 0.03, 0.012, 0.34, 0.66, 0.392)

def banco():
    # banco de jardim: ripas de madeira com folga, costas em 3 ripas, pés de ferro fundido com braço, parafusos
    wood = Part('v', 0x8a5a32, angle=30)
    for i in range(4): wood.box(1.62, 0.035, 0.1, 0, 0.45, 0.17 - i * 0.115, bev=0.012)
    for i in range(3): wood.box(1.62, 0.09, 0.03, 0, 0.6 + i * 0.12, -0.215 - i * 0.025, rx=-0.2, bev=0.01)
    iron = Part('m', 0x2e3032, angle=35)
    for sx in (-0.7, 0.7):
        iron.box(0.05, 0.44, 0.06, sx, 0.22, 0.17, bev=0.012)  # pé da frente
        iron.box(0.05, 0.85, 0.06, sx, 0.43, -0.2, rx=-0.18, bev=0.012)  # pé de trás e costas
        iron.box(0.05, 0.05, 0.45, sx, 0.42, -0.02, bev=0.012)  # travessa do assento
        iron.box(0.06, 0.04, 0.42, sx, 0.66, 0.0, bev=0.015)  # braço
        iron.box(0.05, 0.22, 0.05, sx, 0.55, 0.18, bev=0.012)
        iron.box(0.12, 0.03, 0.1, sx, 0.015, 0.17, bev=0.008); iron.box(0.12, 0.03, 0.1, sx, 0.015, -0.27, bev=0.008)  # sapatas
        for i in range(4): iron.cyl(0.012, 0.012, 0.012, 6, sx * 0.93, 0.47, 0.17 - i * 0.115)

def caixote():
    # caixote de tábuas (militar, de madeira ou de ferramentas, conforme a cor): tábuas com folga, travessas, cantoneiras de metal, pegas de corda, fecho, etiqueta
    body = Part('v', tint=True, angle=35)
    body.box(1.24, 0.64, 0.74, 0, 0.35, 0, bev=0.01)
    for i in range(4): body.box(1.27, 0.15, 0.77, 0, 0.11 + i * 0.16, 0, bev=0.012)  # tábuas (a folga faz sombra)
    tamp = Part('v', tint=True, shade=0.88, angle=35)
    for i in range(5): tamp.box(1.28, 0.04, 0.15, 0, 0.69, -0.32 + i * 0.16, bev=0.01)  # tampa em tábuas
    band = Part('v', tint=True, shade=0.72, angle=35)
    for sx in (-0.45, 0.45):
        band.box(0.11, 0.7, 0.8, sx, 0.355, 0, bev=0.012)  # travessas
    for sz in (-1, 1): band.box(1.3, 0.08, 0.04, 0, 0.6, sz * 0.395, bev=0.01)
    met = Part('m', 0x4a4c4e, angle=30)
    for sx in (-1, 1):
        for sz in (-1, 1):
            for sy in (0.04, 0.68): met.box(0.08, 0.08, 0.08, sx * 0.62, sy, sz * 0.37, bev=0.01)  # cantoneiras
    met.box(0.08, 0.1, 0.03, 0, 0.6, 0.415, bev=0.008); met.box(0.05, 0.05, 0.03, 0, 0.53, 0.42, bev=0.008)  # fecho
    rope = Part('v', 0x8a7a5a, angle=60)
    for sx in (-1, 1): rope.torus(0.09, 0.016, 12, 5, sx * 0.66, 0.42, 0, ry=math.pi / 2, arc=math.pi)
    lab = Part('v', 0xd9cfae, angle=30)
    lab.box(0.42, 0.16, 0.01, -0.15, 0.36, 0.395)

def bidao():
    # bidão de 200 L: dois aros de rolar, aro de cima, tampa com bujões
    body = Part('m', tint=True, angle=40)
    R = 0.3
    body.lathe([(0.0, 0.0), (R - 0.02, 0.0), (R, 0.02), (R, 0.28), (R + 0.012, 0.29), (R + 0.012, 0.31), (R, 0.32), (R, 0.58), (R + 0.012, 0.59), (R + 0.012, 0.61), (R, 0.62), (R, 0.88), (R + 0.01, 0.89), (R + 0.01, 0.9), (R - 0.02, 0.9), (R - 0.03, 0.885), (0.0, 0.885)], n=18)
    met = Part('m', 0x6a6c6e, angle=30)
    met.cyl(0.035, 0.035, 0.025, 8, 0.17, 0.895, 0); met.cyl(0.022, 0.022, 0.025, 8, -0.16, 0.895, 0.05)

def cone():
    # cone de trânsito: base quadrada com cantos cortados, corpo com faixas refletoras
    o = Part('v', 0xe8662a, angle=45)
    o.box(0.4, 0.035, 0.4, 0, 0.018, 0, bev=0.05, seg=1)
    o.lathe([(0.16, 0.035), (0.145, 0.1), (0.115, 0.28), (0.1, 0.36), (0.065, 0.55), (0.045, 0.64), (0.0, 0.645)], n=14)
    w = Part('v', 0xf2f0ea, angle=45)
    w.lathe([(0.118, 0.27), (0.103, 0.355)], n=14, close=False)
    w.lathe([(0.083, 0.45), (0.072, 0.51)], n=14, close=False)

def candeeiro():
    # candeeiro de rua: base, poste afunilado com junta, braço curvo, cabeça com lente acesa
    m = Part('m', 0x5f6266, angle=35)
    m.cyl(0.14, 0.16, 0.3, 10, 0, 0.15, 0, bev=0.02)
    m.cyl(0.07, 0.1, 4.95, 10, 0, 2.75, 0)
    m.cyl(0.095, 0.095, 0.08, 10, 0, 0.5, 0); m.cyl(0.08, 0.08, 0.06, 10, 0, 3.2, 0)
    m.tube([(0, 5.05, 0), (0, 5.19, 0.15), (0, 5.22, 0.45), (0, 5.18, 0.85)], 0.045, 6)
    h = Part('m', 0x3f4246, angle=35)
    h.box(0.34, 0.1, 0.56, 0, 5.12, 1.05, bev=0.04, seg=1)
    h.box(0.24, 0.03, 0.4, 0, 5.18, 1.0, bev=0.01)
    lit = Part('lit', lit=(1.8, 1.55, 1.1))
    lit.box(0.28, 0.02, 0.44, 0, 5.065, 1.05)

def ac():
    # máquina de ar condicionado de fora (frente +z, costas em z = 0): grelha redonda com raios, aletas dos lados, pés, canos
    body = Part('v', 0xdcdad4, angle=35)
    body.box(0.8, 0.55, 0.28, 0, 0, 0.15, bev=0.02)
    g = Part('v', 0x3a3a38, angle=40)
    g.cyl(0.21, 0.21, 0.02, 16, -0.1, 0, 0.29, rx=math.pi / 2)
    gr = Part('m', 0x8a8a86, angle=40)
    for r in (0.07, 0.13, 0.19): gr.torus(r, 0.006, 16, 4, -0.1, 0, 0.303)
    for a in range(4): gr.box(0.4, 0.012, 0.01, -0.1, 0, 0.305, rz=a * math.pi / 4)
    for i in range(6): gr.box(0.12, 0.012, 0.012, 0.27, -0.19 + i * 0.075, 0.297)
    p = Part('m', 0xc8a070, angle=40)
    p.tube([(0.36, -0.12, 0.2), (0.45, -0.12, 0.2), (0.45, -0.4, 0.2)], 0.012, 6)
    p.tube([(0.36, -0.18, 0.24), (0.48, -0.18, 0.24), (0.48, -0.4, 0.24)], 0.009, 6)

def armario():
    # armário metálico (1 m de largura; o jogo estica): duas portas, ranhuras de ventilação, puxadores, pés
    b = Part('m', tint=True, angle=35)
    b.box(1.0, 1.86, 0.5, 0, 0.95, 0, bev=0.015)
    d = Part('m', tint=True, shade=1.06, angle=35)
    for sx in (-0.25, 0.25):
        d.box(0.48, 1.76, 0.02, sx, 0.97, 0.255, bev=0.006)
    k = Part('m', tint=True, shade=0.6, angle=35)
    for sx in (-0.25, 0.25):
        for i in range(5): k.box(0.3, 0.015, 0.01, sx, 1.6 + i * 0.035, 0.267)
        for i in range(5): k.box(0.3, 0.015, 0.01, sx, 0.25 + i * 0.035, 0.267)
    h = Part('m', 0x555555, angle=30)
    for sx in (-0.035, 0.035): h.box(0.03, 0.2, 0.03, sx, 1.0, 0.28, bev=0.008)
    h.box(0.012, 1.76, 0.012, 0, 0.97, 0.268)
    f = Part('v', 0x222222, angle=30)
    for sx in (-0.45, 0.45):
        for sz in (-0.2, 0.2): f.box(0.05, 0.04, 0.05, sx, 0.02, sz)

def mesa():
    # mesa de madeira (1,4 x 0,8; o jogo estica): tampo com bordo, aro, pernas afuniladas
    t = Part('v', tint=True, angle=35)
    t.box(1.4, 0.05, 0.8, 0, 0.74, 0, bev=0.012)
    a = Part('v', tint=True, shade=0.78, angle=35)
    a.box(1.24, 0.09, 0.66, 0, 0.67, 0, bev=0.01)
    for sx in (-1, 1):
        for sz in (-1, 1): a.box(0.06, 0.66, 0.06, sx * 0.62, 0.34, sz * 0.32, bev=0.01, taper=(1.15, 1.15))

def cadeira():
    c = Part('v', 0x5a4a3a, angle=35)
    c.box(0.42, 0.05, 0.42, 0, 0.45, 0, bev=0.012)
    c.box(0.42, 0.07, 0.03, 0, 0.84, -0.2, rx=-0.1, bev=0.01); c.box(0.42, 0.05, 0.03, 0, 0.66, -0.2, rx=-0.1, bev=0.01)
    for sx in (-1, 1): c.box(0.035, 0.45, 0.035, sx * 0.19, 0.67, -0.2, rx=-0.1, bev=0.008)
    l = Part('v', 0x3a3a3a, angle=35)
    for sx in (-1, 1):
        for sz in (-1, 1): l.box(0.035, 0.45, 0.035, sx * 0.18, 0.22, sz * 0.18, bev=0.008)
    for sx in (-1, 1): l.box(0.025, 0.025, 0.34, sx * 0.18, 0.15, 0)

def cama():
    # cama de hospital/casa: estrutura metálica com cabeceira de tubos, colchão boleado, lençol (cor do sítio), almofada, cobertor dobrado
    m = Part('m', 0xb8bcbf, angle=35)
    m.box(0.95, 0.12, 2.0, 0, 0.42, 0, bev=0.02)
    for sz in (-1, 1):
        m.tube([(-0.45, 0.0, sz * 0.98), (-0.45, 0.95 if sz < 0 else 0.75, sz * 0.98), (0.45, 0.95 if sz < 0 else 0.75, sz * 0.98), (0.45, 0.0, sz * 0.98)], 0.022, 6)
        for i in range(4): m.cyl(0.012, 0.012, (0.5 if sz < 0 else 0.3), 6, -0.27 + i * 0.18, (0.7 if sz < 0 else 0.6), sz * 0.98)
    s = Part('v', tint=True, angle=50)
    s.box(0.9, 0.18, 1.94, 0, 0.57, 0, bev=0.06, seg=2)
    w = Part('v', 0xffffff, angle=50)
    w.box(0.66, 0.12, 0.36, 0, 0.71, -0.72, bev=0.05, seg=2)
    bl = Part('v', 0x7aa0b8, angle=50)
    bl.box(0.92, 0.05, 1.15, 0, 0.68, 0.33, bev=0.02, seg=1)
    bl.box(0.92, 0.06, 0.2, 0, 0.72, -0.17, bev=0.03, seg=1)

def barreira():
    w = Part('v', 0xd8d4c8, angle=35)
    for sx in (-0.8, 0.8):
        w.box(0.07, 0.9, 0.08, sx, 0.45, 0.17, rx=0.18, bev=0.01); w.box(0.07, 0.9, 0.08, sx, 0.45, -0.17, rx=-0.18, bev=0.01)
        w.box(0.1, 0.03, 0.55, sx, 0.015, 0, bev=0.008)
    o = Part('v', 0xe8a62a, angle=35); o.box(1.9, 0.22, 0.05, 0, 0.75, 0, bev=0.01)
    r = Part('v', 0x1e1f20, angle=35)
    for i in range(5): r.box(0.19, 0.222, 0.054, -0.76 + i * 0.38, 0.75, 0)  # faixas pretas no amarelo
    for i in range(4): r.box(0.19, 0.142, 0.054, -0.57 + i * 0.38, 0.45, 0)
    wt = Part('v', 0xf2f0ea, angle=35); wt.box(1.9, 0.14, 0.05, 0, 0.45, 0, bev=0.01)
    l = Part('lit', lit=(1.6, 1.0, 0.3)); l.box(0.1, 0.1, 0.06, -0.8, 0.95, 0)

PROPS.update({'vend': vend, 'banco': banco, 'caixote': caixote, 'bidao': bidao, 'cone': cone, 'candeeiro': candeeiro, 'ac': ac, 'armario': armario, 'mesa': mesa, 'cadeira': cadeira, 'cama': cama, 'barreira': barreira})

def carro():
    # carro parado (sedan, 4,1 x 1,72): carroçaria boleada com cavas das rodas, cabine oca com vidros transparentes, bancos e tablier lá dentro,
    # para-choques, grelha, matrículas, espelhos, frisos das portas e puxadores. Os faróis ficam no jogo (acendem ou não; nos destroços ficam cinzentos)
    body = Part('m', tint=True, angle=38)
    body.box(1.72, 0.5, 4.04, 0, 0.6, 0, bev=0.1, seg=1)
    body.box(1.66, 0.12, 1.25, 0, 0.88, 1.35, rx=-0.06, bev=0.04)  # capot
    body.box(1.66, 0.1, 0.8, 0, 0.88, -1.62, rx=0.04, bev=0.04)  # mala
    for sx in (-1, 1):
        body.box(0.07, 0.6, 0.09, sx * 0.71, 1.17, 0.66, rx=-0.62, bev=0.015)  # pilar A
        body.box(0.07, 0.5, 0.11, sx * 0.72, 1.12, -0.25, bev=0.015)  # pilar B
        body.box(0.07, 0.55, 0.1, sx * 0.71, 1.15, -1.12, rx=0.55, bev=0.015)  # pilar C
        body.box(0.1, 0.07, 0.14, sx * 0.9, 1.0, 0.6, bev=0.02)  # espelho
    body.box(1.46, 0.07, 1.62, 0, 1.4, -0.24, bev=0.03)  # tejadilho
    dk = Part('v', 0x1e1f21, angle=35)
    for sz in (-1.3, 1.3):
        dk.cyl(0.4, 0.4, 1.745, 10, 0, 0.36, sz, rz=math.pi / 2, caps=True)  # cavas das rodas
    dk.box(1.76, 0.16, 0.14, 0, 0.42, 2.03, bev=0.05); dk.box(1.76, 0.16, 0.14, 0, 0.42, -2.03, bev=0.05)  # para-choques
    dk.box(0.9, 0.12, 0.02, 0, 0.72, 2.03)  # grelha
    for sx in (-1, 1):
        dk.box(0.012, 0.42, 0.012, sx * 0.865, 0.7, -0.25); dk.box(0.012, 0.42, 0.012, sx * 0.865, 0.7, 0.75)  # frisos das portas
        dk.box(0.012, 0.012, 3.0, sx * 0.865, 0.92, -0.1)
    tyre = Part('v', 0x161718, angle=40)
    rim = Part('m', 0x9a9ea2, angle=40)
    for sx in (-0.79, 0.79):
        for sz in (-1.3, 1.3):
            tyre.cyl(0.33, 0.33, 0.22, 12, sx, 0.33, sz, rz=math.pi / 2)
            rim.cyl(0.2, 0.2, 0.235, 8, sx, 0.33, sz, rz=math.pi / 2)
    met = Part('m', 0xb8bcc0, angle=30)
    for sx in (-1, 1):
        for sz in (0.45, -0.6): met.box(0.02, 0.025, 0.12, sx * 0.87, 0.88, sz)  # puxadores
    pl = Part('v', 0xf2f0e6, angle=30)
    pl.box(0.42, 0.11, 0.012, 0, 0.42, 2.105); pl.box(0.42, 0.11, 0.012, 0, 0.56, -2.03)
    gl = Part('gl', 0x9ab8c8)
    gl.box(1.42, 0.5, 0.02, 0, 1.17, 0.67, rx=-0.62)  # para-brisas
    gl.box(1.42, 0.46, 0.02, 0, 1.17, -1.12, rx=0.55)  # vidro de trás
    for sx in (-1, 1):
        gl.box(0.02, 0.4, 0.82, sx * 0.725, 1.15, 0.22); gl.box(0.02, 0.4, 0.78, sx * 0.725, 1.15, -0.7)
    inn = Part('v', 0x2a2827, angle=40)
    for sx in (-0.38, 0.38):
        inn.box(0.5, 0.12, 0.5, sx, 0.92, 0.05, bev=0.03); inn.box(0.5, 0.45, 0.12, sx, 1.1, -0.24, rx=-0.15, bev=0.03)
        inn.box(0.24, 0.12, 0.09, sx, 1.27, -0.29, rx=-0.15, bev=0.02)
    inn.box(1.4, 0.14, 0.5, 0, 0.92, -0.85, bev=0.03); inn.box(1.4, 0.42, 0.12, 0, 1.08, -1.08, rx=-0.2, bev=0.03)  # banco de trás
    inn.box(1.5, 0.2, 0.35, 0, 1.0, 0.68, bev=0.04)  # tablier
    inn.torus(0.17, 0.022, 14, 5, -0.38, 1.1, 0.48, rx=-1.1)  # volante

PROPS.update({'carro': carro})

def sofa():
    # sofá: base, almofadas do assento e das costas separadas (a folga faz sombra), braços boleados, pés
    s = Part('v', tint=True, angle=50)
    s.box(1.9, 0.22, 0.82, 0, 0.2, 0.02, bev=0.04)
    for sx in (-0.43, 0.43): s.box(0.84, 0.16, 0.66, sx, 0.38, 0.07, bev=0.06, seg=2)
    k = Part('v', tint=True, shade=0.86, angle=50)
    k.box(1.9, 0.55, 0.2, 0, 0.55, -0.32, bev=0.06, seg=1)
    for sx in (-0.43, 0.43): k.box(0.82, 0.38, 0.14, sx, 0.62, -0.18, rx=-0.12, bev=0.06, seg=2)
    for sx in (-0.88, 0.88): k.box(0.18, 0.58, 0.85, sx, 0.36, 0, bev=0.07, seg=2)
    f = Part('v', 0x2a2420, angle=30)
    for sx in (-0.85, 0.85):
        for sz in (-0.33, 0.33): f.cyl(0.025, 0.02, 0.09, 6, sx, 0.045, sz)

def fogao():
    m = Part('m', 0xe8e6e0, angle=35)
    m.box(0.7, 0.86, 0.6, 0, 0.45, 0, bev=0.015)
    m.box(0.7, 0.2, 0.04, 0, 0.98, -0.29, bev=0.01)  # costas
    d = Part('v', 0x1e1f20, angle=35)
    d.box(0.66, 0.02, 0.56, 0, 0.885, 0)  # placa
    d.box(0.52, 0.34, 0.012, 0, 0.42, 0.302)  # vidro do forno
    for sx in (-0.17, 0.17):
        for sz in (-0.13, 0.13): d.cyl(0.085, 0.09, 0.02, 12, sx, 0.9, sz); d.torus(0.06, 0.007, 10, 4, sx, 0.915, sz, rx=math.pi / 2)
    k = Part('m', 0xb8bcc0, angle=35)
    for i in range(4): k.cyl(0.022, 0.022, 0.03, 8, -0.24 + i * 0.16, 0.78, 0.31, rx=math.pi / 2)  # botões
    k.tube([(-0.22, 0.65, 0.31), (-0.22, 0.65, 0.35), (0.22, 0.65, 0.35), (0.22, 0.65, 0.31)], 0.01, 6)  # puxador do forno

def frigo():
    m = Part('m', 0xe8e6e0, angle=40)
    m.box(0.7, 1.78, 0.6, 0, 0.9, -0.02, bev=0.03)
    m.box(0.68, 0.58, 0.05, 0, 1.47, 0.3, bev=0.02); m.box(0.68, 1.12, 0.05, 0, 0.6, 0.3, bev=0.02)  # portas
    h = Part('m', 0x8a8e92, angle=30)
    h.box(0.03, 0.3, 0.035, -0.29, 1.5, 0.345, bev=0.008); h.box(0.03, 0.42, 0.035, -0.29, 0.95, 0.345, bev=0.008)
    d = Part('v', 0x2a2b2c, angle=30)
    d.box(0.6, 0.06, 0.02, 0, 0.03, 0.27)  # grelha de baixo
    mg = Part('v', 0xd23a2e, angle=30); mg.box(0.06, 0.06, 0.01, 0.15, 1.6, 0.328)  # íman
    mg2 = Part('v', 0xf0c23a, angle=30); mg2.box(0.12, 0.16, 0.004, 0.12, 1.4, 0.327)  # papel

def sanita():
    w = Part('v', 0xf0f0ee, angle=45)
    w.lathe([(0.14, 0.0), (0.16, 0.05), (0.13, 0.2), (0.19, 0.33), (0.2, 0.4), (0.0, 0.4)], n=14, z=0.07)
    w.box(0.42, 0.38, 0.17, 0, 0.6, -0.2, bev=0.03)
    w.box(0.44, 0.03, 0.19, 0, 0.8, -0.2, bev=0.012)
    s = Part('v', 0xe2e2de, angle=45)
    s.torus(0.15, 0.025, 14, 5, 0, 0.415, 0.08, rx=math.pi / 2)
    s.box(0.36, 0.02, 0.36, 0, 0.46, -0.07, rx=-1.35, bev=0.01)  # tampa levantada
    m = Part('m', 0xb8bcc0, angle=30); m.box(0.06, 0.02, 0.03, 0.14, 0.76, -0.1)

def lavatorio():
    c = Part('v', 0xd8d4cc, angle=35)
    c.box(0.55, 0.78, 0.45, 0, 0.4, 0, bev=0.012)
    for sx in (-0.135, 0.135): c.box(0.25, 0.6, 0.015, sx, 0.4, 0.226, bev=0.005)
    w = Part('v', 0xf0f0ee, angle=40)
    w.box(0.56, 0.06, 0.46, 0, 0.82, 0.01, bev=0.02)
    d = Part('v', 0xc8ccd0, angle=40); d.box(0.36, 0.015, 0.26, 0, 0.849, 0.04)  # bacia
    m = Part('m', 0xb8bcc0, angle=30)
    m.cyl(0.018, 0.018, 0.14, 8, 0, 0.92, -0.15); m.tube([(0, 0.98, -0.15), (0, 1.0, -0.1), (0, 0.97, -0.05)], 0.012, 6)
    for sx in (-0.17, 0.17): m.box(0.012, 0.05, 0.012, sx, 0.4, 0.24)
    mi = Part('win', 0x9ab0c0, angle=30); mi.box(0.5, 0.6, 0.02, 0, 1.4, -0.21)
    fr = Part('v', 0xe8e6e0, angle=30); fr.box(0.54, 0.64, 0.015, 0, 1.4, -0.222, bev=0.005)

def secretaria():
    t = Part('v', 0x8a7a62, angle=35)
    t.box(1.2, 0.04, 0.6, 0, 0.74, 0, bev=0.01)
    l = Part('m', 0x5a5e62, angle=35)
    for sx in (-0.55, 0.55): l.box(0.04, 0.72, 0.55, sx, 0.36, 0, bev=0.008)
    l.box(1.06, 0.3, 0.02, 0, 0.55, -0.25)  # painel de trás
    l.box(0.38, 0.5, 0.5, 0.33, 0.47, 0.02, bev=0.01)  # gavetas
    k = Part('m', 0x8a8e92, angle=30)
    for i in range(3): k.box(0.12, 0.015, 0.015, 0.33, 0.33 + i * 0.16, 0.275)
    for i in range(3): k.box(0.36, 0.004, 0.012, 0.33, 0.4 + i * 0.16, 0.272)
    pc = Part('v', 0x1a1c1e, angle=35)
    pc.box(0.52, 0.32, 0.03, 0, 1.02, -0.15, rx=-0.08, bev=0.01)  # monitor
    pc.box(0.05, 0.13, 0.05, 0, 0.83, -0.17); pc.box(0.2, 0.012, 0.14, 0, 0.765, -0.17, bev=0.005)
    pc.box(0.42, 0.02, 0.14, 0, 0.77, 0.1, bev=0.005)  # teclado
    pc.box(0.06, 0.02, 0.1, 0.32, 0.77, 0.12, bev=0.008)  # rato
    sc = Part('v', 0x223040, angle=30); sc.box(0.48, 0.28, 0.005, 0, 1.023, -0.132, rx=-0.08)  # ecrã
    kk = Part('v', 0x3a3c3e, angle=30)
    for i in range(4): kk.box(0.38, 0.004, 0.022, 0, 0.782, 0.05 + i * 0.03)
    pa = Part('v', 0xf2efe6, angle=30); pa.box(0.21, 0.006, 0.3, -0.38, 0.763, 0.05, ry=0.3)  # papéis
    cu = Part('v', 0xd23a2e, angle=40); cu.cyl(0.04, 0.035, 0.1, 10, -0.48, 0.81, -0.15)  # caneca

def tv():
    m = Part('v', 0x4a3a2c, angle=35)
    m.box(1.2, 0.42, 0.4, 0, 0.23, 0, bev=0.012)
    for sx in (-0.3, 0.3): m.box(0.56, 0.3, 0.012, sx, 0.25, 0.2, bev=0.004)
    k = Part('m', 0x8a8e92, angle=30)
    for sx in (-0.05, 0.05): k.box(0.08, 0.012, 0.012, sx, 0.3, 0.212)
    t = Part('v', 0x151618, angle=35)
    t.box(1.0, 0.6, 0.05, 0, 0.8, -0.05, bev=0.012); t.box(0.3, 0.02, 0.18, 0, 0.45, -0.05); t.box(0.06, 0.1, 0.04, 0, 0.5, -0.06)
    sc = Part('v', 0x1c2430, angle=30); sc.box(0.94, 0.54, 0.004, 0, 0.8, -0.024)

def balcao():
    # balcão de 1 x 1 (o jogo estica): rodapé recuado, corpo com portas, tampo com bordo
    c = Part('v', tint=True, angle=35)
    c.box(0.96, 0.86, 0.96, 0, 0.51, 0, bev=0.01)
    k = Part('v', tint=True, shade=0.55, angle=35)
    k.box(0.92, 0.08, 0.92, 0, 0.04, 0)
    g = Part('v', tint=True, shade=0.8, angle=35)
    g.box(0.965, 0.012, 0.965, 0, 0.72, 0)  # friso das gavetas
    t = Part('v', 0xe8e4da, angle=35)
    t.box(1.04, 0.05, 1.04, 0, 0.995, 0, bev=0.012)

PROPS.update({'sofa': sofa, 'fogao': fogao, 'frigo': frigo, 'sanita': sanita, 'lavatorio': lavatorio, 'secretaria': secretaria, 'tv': tv, 'balcao': balcao})

def poste():
    # poste de eletricidade de betão (8,5 m; o jogo estica na altura): base, poste afunilado, duas travessas com isoladores,
    # dois transformadores com cintas, degraus de ferro, placa amarela
    p = Part('v', tint=True, angle=40)
    p.cyl(0.13, 0.17, 8.5, 10, 0, 4.25, 0)
    p.cyl(0.2, 0.22, 0.3, 10, 0, 0.15, 0)
    d = Part('v', 0x5a5650, angle=35)
    for y in (8.1, 7.4): d.box(1.6, 0.1, 0.1, 0, y, 0, bev=0.015); d.box(0.04, 0.5, 0.04, 0.35, y - 0.22, 0, rz=0.7); d.box(0.04, 0.5, 0.04, -0.35, y - 0.22, 0, rz=-0.7)
    ins = Part('v', 0x7a7a74, angle=45)
    for y in (8.1,):
        for sx in (-0.7, 0, 0.7): ins.lathe([(0.04, 0), (0.05, 0.03), (0.03, 0.06), (0.05, 0.09), (0.03, 0.12), (0.0, 0.13)], n=8, x=sx, y=y + 0.05)
    t = Part('m', 0x6d6a64, angle=40)
    t.cyl(0.17, 0.17, 0.5, 12, 0.35, 6.6, 0); t.cyl(0.14, 0.14, 0.45, 12, -0.35, 5.9, 0)
    t.cyl(0.18, 0.18, 0.03, 12, 0.35, 6.86, 0); t.cyl(0.15, 0.15, 0.03, 12, -0.35, 6.13, 0)
    for sx, y in ((0.35, 6.6), (-0.35, 5.9)): t.box(0.2, 0.06, 0.08, sx * 0.55, y, 0)
    s = Part('m', 0x4a4a46, angle=35)
    for i in range(6): s.box(0.04, 0.03, 0.3, 0, 2.8 + i * 0.45, 0, ry=(i % 2) * math.pi / 2)  # degraus
    y = Part('v', 0xe6c84a, angle=30); y.box(0.3, 0.42, 0.04, 0, 2.4, 0.15, bev=0.01)
    k = Part('v', 0x2a2b2c, angle=30); k.box(0.22, 0.04, 0.005, 0, 2.5, 0.172); k.box(0.16, 0.03, 0.005, 0, 2.38, 0.172)

def marco():
    # marco do correio japonês: corpo redondo com cúpula, duas ranhuras, placa branca, base
    r = Part('m', 0xc8281e, angle=45)
    r.lathe([(0.24, 0.1), (0.24, 1.1), (0.22, 1.2), (0.17, 1.28), (0.09, 1.33), (0.0, 1.345)], n=18)
    d = Part('v', 0x2a2b2c, angle=30)
    for sx in (-0.07, 0.07): d.box(0.11, 0.035, 0.05, sx, 0.98, 0.225, bev=0.008)
    d.box(0.1, 0.12, 0.02, 0, 0.55, 0.235)  # fechadura
    w = Part('v', 0xf2f0ea, angle=30); w.box(0.2, 0.14, 0.02, 0, 0.78, 0.235, bev=0.005)
    b = Part('v', 0x3a3c40, angle=35); b.cyl(0.26, 0.28, 0.1, 16, 0, 0.05, 0)

def armtec():
    # armário técnico de rua (0,7 x 1,3 x 0,4): portas, pala, ventilação, fechadura, autocolante
    m = Part('m', 0xb8bcbc, angle=35)
    m.box(0.7, 1.26, 0.4, 0, 0.67, 0, bev=0.03)
    m.box(0.76, 0.04, 0.46, 0, 1.32, 0, bev=0.012)
    m.box(0.66, 0.06, 0.36, 0, 0.03, 0)
    g = Part('m', 0x8a8e8e, angle=35)
    g.box(0.008, 1.1, 0.01, 0, 0.67, 0.203)
    for i in range(6): g.box(0.22, 0.012, 0.01, -0.18, 1.0 + i * 0.03, 0.204)
    k = Part('v', 0x3a3c3e, angle=30); k.box(0.03, 0.08, 0.02, 0.06, 0.75, 0.21, bev=0.006)
    y = Part('v', 0xd8c23a, angle=30); y.box(0.12, 0.16, 0.004, 0.18, 0.7, 0.203)

def pilarete():
    y = Part('m', 0xd8b82a, angle=45)
    y.lathe([(0.07, 0), (0.065, 0.02), (0.06, 0.82), (0.05, 0.88), (0.0, 0.9)], n=12)
    k = Part('v', 0x1d1d1d, angle=45)
    k.lathe([(0.064, 0.66), (0.064, 0.78)], n=12, close=False)
    w = Part('v', 0xe8e6e0, angle=45)
    w.lathe([(0.062, 0.7), (0.062, 0.73)], n=12, close=False)

def cabine():
    # cabine telefónica verde: base, pilares, telhado com luz, telefone com auscultador, prateleira (vidros ficam no jogo)
    g = Part('m', 0x2a8a5a, angle=35)
    for sx in (-1, 1):
        for sz in (-1, 1): g.box(0.06, 2.2, 0.06, sx * 0.44, 1.16, sz * 0.44, bev=0.012)
    g.box(1.0, 0.16, 1.0, 0, 2.32, 0, bev=0.03)
    for y in (0.15, 0.6, 2.2):
        g.box(0.92, 0.04, 0.04, 0, y, -0.44); g.box(0.04, 0.04, 0.92, -0.44, y, 0); g.box(0.04, 0.04, 0.92, 0.44, y, 0)
    b = Part('v', 0x3a3c40, angle=35); b.box(0.95, 0.12, 0.95, 0, 0.06, 0, bev=0.02)
    t = Part('v', 0x3aa06a, angle=35)
    t.box(0.3, 0.45, 0.16, 0, 1.3, -0.34, bev=0.02)
    k = Part('v', 0x1d1f22, angle=35)
    k.box(0.07, 0.22, 0.06, -0.11, 1.32, -0.24, bev=0.02); k.box(0.12, 0.1, 0.01, 0.04, 1.28, -0.259)
    k.tube([(-0.11, 1.22, -0.24), (-0.12, 1.0, -0.22), (-0.05, 0.98, -0.25), (0.0, 1.1, -0.26)], 0.006, 4)
    k.box(0.5, 0.03, 0.22, 0, 1.0, -0.33, bev=0.008)
    w = Part('v', 0xf2f0ea, angle=30); w.box(0.6, 0.12, 0.012, 0, 2.32, 0.505)
    l = Part('lit', lit=(1.5, 1.5, 1.4)); l.box(0.5, 0.03, 0.5, 0, 2.225, 0)

def bicicleta():
    # bicicleta: rodas com raios, quadro em diamante (cor do sítio), guiador, selim, pedais, guarda-lamas, cesto
    t = Part('v', 0x1b1b1c, angle=50)
    for s in (-0.52, 0.52): t.torus(0.31, 0.022, 20, 5, 0, 0.33, s, ry=math.pi / 2)
    r = Part('m', 0xa8acb0, angle=40)
    for s in (-0.52, 0.52):
        r.torus(0.28, 0.008, 20, 4, 0, 0.33, s, ry=math.pi / 2)
        for a in range(8): r.box(0.004, 0.56, 0.004, 0, 0.33, s, rx=a * math.pi / 8)
        r.cyl(0.03, 0.03, 0.08, 8, 0, 0.33, s, rz=math.pi / 2)
    f = Part('m', tint=True, angle=35)
    f.tube([(0, 0.33, -0.52), (0, 0.38, -0.05), (0, 0.85, -0.12)], 0.018, 6)  # escora e tubo do selim
    f.tube([(0, 0.38, -0.05), (0, 0.78, 0.42)], 0.022, 6)  # tubo de baixo
    f.tube([(0, 0.82, -0.08), (0, 0.84, 0.4)], 0.02, 6)  # tubo de cima
    f.tube([(0, 0.82, -0.08), (0, 0.33, -0.52)], 0.014, 6)
    f.tube([(0, 0.92, 0.4), (0, 0.33, 0.52)], 0.018, 6)  # forqueta
    k = Part('v', 0x2a2b2c, angle=35)
    k.box(0.08, 0.04, 0.24, 0, 0.92, -0.12, bev=0.015)  # selim
    k.tube([(-0.25, 0.98, 0.36), (-0.1, 0.96, 0.4), (0.1, 0.96, 0.4), (0.25, 0.98, 0.36)], 0.012, 6)  # guiador
    k.cyl(0.07, 0.07, 0.02, 10, 0, 0.38, -0.05, rz=math.pi / 2)  # pedaleira
    k.box(0.08, 0.02, 0.04, 0.09, 0.3, -0.02); k.box(0.08, 0.02, 0.04, -0.09, 0.46, -0.1)
    c = Part('m', 0x8a8e92, angle=40)
    for sx in (-0.13, 0.13): c.box(0.012, 0.18, 0.24, sx, 0.98, 0.62)  # cesto de arame (só as paredes)
    for sz in (0.5, 0.74): c.box(0.26, 0.18, 0.012, 0, 0.98, sz)
    c.box(0.26, 0.012, 0.24, 0, 0.89, 0.62)
    for s in (-0.52, 0.52): c.box(0.06, 0.008, 0.4, 0, 0.67, s * 0.95)  # guarda-lamas

PROPS.update({'poste': poste, 'marco': marco, 'armtec': armtec, 'pilarete': pilarete, 'cabine': cabine, 'bicicleta': bicicleta})

def saco():
    # saco de lona com coisas lá dentro (o que se deixa cair): bojudo e amarrotado, gargalo atado com corda, alça
    c = Part('v', 0x5a4a32, angle=70, noise=0.018, L=0.12)
    c.lathe([(0.0, 0.0), (0.16, 0.005), (0.25, 0.05), (0.27, 0.13), (0.25, 0.22), (0.18, 0.29), (0.08, 0.33), (0.05, 0.35), (0.06, 0.38), (0.09, 0.43), (0.0, 0.42)], n=16)
    r = Part('v', 0x8a7a5a, angle=60)
    r.torus(0.055, 0.012, 12, 5, 0, 0.345, 0)
    r.tube([(0.05, 0.345, 0.02), (0.1, 0.3, 0.06), (0.14, 0.25, 0.08)], 0.008, 4)
    s = Part('v', 0x3a3020, angle=50)
    s.tube([(-0.2, 0.08, 0.14), (-0.24, 0.2, 0.12), (-0.2, 0.3, 0.06), (0.0, 0.34, -0.05), (0.2, 0.3, -0.06), (0.24, 0.2, -0.12), (0.2, 0.08, -0.14)], 0.015, 5)

def sacocorpo():
    # saco de cadáver: preto, com a forma do corpo, fecho éclair a todo o comprimento e pegas nas pontas
    b = Part('v', 0x2a2b2c, angle=60, noise=0.012, L=0.15)
    b.box(0.68, 0.22, 1.68, 0, 0.12, 0, bev=0.1, seg=2)
    b.box(0.42, 0.08, 0.5, 0, 0.24, 0.45, bev=0.04, seg=1)  # peito
    b.box(0.3, 0.1, 0.3, 0, 0.23, 0.68, bev=0.05, seg=1)  # cabeça
    b.box(0.46, 0.06, 0.7, 0, 0.23, -0.35, bev=0.03, seg=1)  # pernas
    z = Part('m', 0x6a6e72, angle=40)
    z.box(0.03, 0.012, 1.5, -0.12, 0.29, 0.05, rz=0.05)
    z.box(0.04, 0.02, 0.05, -0.12, 0.3, 0.78, bev=0.005)  # puxador
    h = Part('v', 0x1c1d1e, angle=40)
    for sz in (-0.86, 0.86): h.tube([(-0.15, 0.12, sz * 0.97), (-0.1, 0.16, sz * 1.02), (0.1, 0.16, sz * 1.02), (0.15, 0.12, sz * 0.97)], 0.012, 5)
    for sx in (-0.34, 0.34): h.tube([(sx, 0.12, -0.3), (sx * 1.06, 0.16, -0.2), (sx * 1.06, 0.16, 0.2), (sx, 0.12, 0.3)], 0.01, 5)

PROPS.update({'saco': saco, 'sacocorpo': sacocorpo})
