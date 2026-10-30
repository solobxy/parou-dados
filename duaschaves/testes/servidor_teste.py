# Servidor de teste: ficheiros do site + dados (lista.json, det/) e /api/* reencaminhado para a API local
import sys, os, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
SITE, DADOS, PORTA, API = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
BLOQ = {'/anuncios.json', '/links.json', '/estado-recolha.json'}
class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def translate_path(self, path):
        p = path.split('?')[0]
        if p == '/lista.json' or p.startswith('/det/'):
            return os.path.join(DADOS, p.lstrip('/'))
        return os.path.join(SITE, p.lstrip('/')) if p != '/' else os.path.join(SITE, 'index.html')
    def _api(self):
        n = int(self.headers.get('Content-Length') or 0); corpo = self.rfile.read(n) if n else None
        h = {k: v for k, v in self.headers.items() if k.lower() not in ('host', 'content-length', 'connection')}
        h['Host'] = 'localhost:%d' % PORTA
        req = urllib.request.Request(API + self.path, data=corpo, method=self.command, headers=h)
        try:
            r = urllib.request.urlopen(req); cod = r.status
        except urllib.error.HTTPError as e:
            r = e; cod = e.code
        dados = r.read(); self.send_response(cod)
        for k, v in r.headers.items():
            if k.lower() not in ('transfer-encoding', 'connection', 'content-length', 'server', 'date'): self.send_header(k, v)
        self.send_header('Content-Length', str(len(dados))); self.end_headers(); self.wfile.write(dados)
    def do_GET(self):
        if self.path.split('?')[0] in BLOQ: return self.send_error(404)
        if self.path.startswith('/api/'): return self._api()
        return super().do_GET()
    def do_POST(self):
        if self.path.startswith('/api/'): return self._api()
        self.send_error(405)
ThreadingHTTPServer(('127.0.0.1', PORTA), H).serve_forever()
