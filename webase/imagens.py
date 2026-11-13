"""webase: validação do logótipo (PNG) sem bibliotecas externas.

O site desenha o logótipo num canvas no próprio aparelho (máx. 512 px) e envia-o como PNG. Aqui confirma-se que é
mesmo um PNG bem formado (assinatura, blocos com CRC certo, dimensões razoáveis) e guardam-se só os blocos da imagem:
saem textos, datas, perfis e qualquer outro bloco que possa trazer dados.
"""
import struct
import zlib

ASSINATURA = b'\x89PNG\r\n\x1a\n'
MANTER = {b'IHDR', b'PLTE', b'tRNS', b'IDAT', b'IEND'}
MIN_LADO, MAX_LADO = 16, 2048


class ImagemInvalida(ValueError):
    pass


def limpar_png(b):
    """Devolve (bytes_limpos, largura, altura) ou levanta ImagemInvalida."""
    if not isinstance(b, (bytes, bytearray)) or len(b) < 60 or b[:8] != ASSINATURA:
        raise ImagemInvalida('O logótipo tem de ser uma imagem PNG.')
    out = bytearray(ASSINATURA)
    i, n = 8, len(b)
    larg = alt = None
    viu_idat = viu_fim = False
    while i < n:
        if i + 8 > n:
            raise ImagemInvalida('Imagem cortada.')
        tam = struct.unpack('>I', b[i:i + 4])[0]
        tipo = bytes(b[i + 4:i + 8])
        if tam > n or i + 12 + tam > n:
            raise ImagemInvalida('Imagem cortada.')
        dados = bytes(b[i + 8:i + 8 + tam])
        crc = struct.unpack('>I', b[i + 8 + tam:i + 12 + tam])[0]
        if zlib.crc32(tipo + dados) & 0xFFFFFFFF != crc:
            raise ImagemInvalida('Imagem danificada.')
        if larg is None:
            if tipo != b'IHDR' or tam != 13:
                raise ImagemInvalida('Imagem mal formada.')
            larg, alt = struct.unpack('>II', dados[:8])
        if tipo == b'IDAT':
            viu_idat = True
        if tipo in MANTER:
            out += b[i:i + 12 + tam]
        i += 12 + tam
        if tipo == b'IEND':
            viu_fim = True
            break
    if not (viu_idat and viu_fim):
        raise ImagemInvalida('Imagem sem conteúdo.')
    if not (MIN_LADO <= larg <= MAX_LADO and MIN_LADO <= alt <= MAX_LADO):
        raise ImagemInvalida('O logótipo tem de ter entre %d e %d píxeis de lado.' % (MIN_LADO, MAX_LADO))
    return bytes(out), larg, alt
