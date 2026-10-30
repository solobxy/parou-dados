# Testa a API: links dos anúncios originais só com acesso ativo; pedidos sem conta (lista de espera e senhorios).
# Uso: correr api.py com DC_DB=/tmp/dcapi-t/dados.db DC_PORTA=3111 DC_LINKS=<links.json com imo-19324791> ORIGENS=http://localhost:8795 ADMINS=admin@teste.pt
import json,urllib.request,sqlite3,hashlib,time,os
B='http://127.0.0.1:3111';ORIG=os.environ.get('ORIGEM','http://localhost:8795');DB=os.environ.get('DC_DB','/tmp/dcapi-t/dados.db')
def req(m,p,corpo=None,ck=''):
    h={'Host':ORIG.split('//')[1],'Origin':ORIG}
    if ck:h['Cookie']=ck
    d=None
    if corpo is not None:h['Content-Type']='application/json';d=json.dumps(corpo).encode()
    r=urllib.request.Request(B+p,data=d,method=m,headers=h)
    try:
        with urllib.request.urlopen(r) as x:return x.status,json.loads(x.read() or b'{}'),x.headers.get_all('Set-Cookie') or []
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}'),[]
falhas=[]
def ok(c,m):
    print(('ok   ' if c else 'FALHA'),m)
    if not c:falhas.append(m)
def sessao(email):
    s,b,ck=req('POST','/api/registar',{'email':email,'senha':'umaSenhaBoa2026!','nome':'X'})
    if s!=200:s,b,ck=req('POST','/api/entrar-senha',{'email':email,'senha':'umaSenhaBoa2026!'})
    return ([c.split(';')[0] for c in ck if c.startswith('__Host-dc_sessao')] or [''])[0]
RID='imo-19324791';ag=int(time.time())
s,b,_=req('GET','/api/link?id='+RID);ok(s==403,'sem sessão: 403')
s,b,_=req('GET','/api/link?id=../../etc');ok(s==400,'id inválido: 400')
ses=sessao('ana2@teste.pt')
s,b,_=req('GET','/api/link?id='+RID,ck=ses);ok(s==403,'conta sem acesso: 403')
c=sqlite3.connect(DB);c.execute("UPDATE utilizadores SET acesso_ate=? WHERE email='ana2@teste.pt'",(ag+86400,));c.commit()
s,b,_=req('GET','/api/link?id='+RID,ck=ses);ok(s==200 and b.get('url','').startswith('https://'),'conta com acesso: link')
s,b,_=req('GET','/api/link?id=imo-0000',ck=ses);ok(s==404,'id inexistente: 404')
c.execute("UPDATE utilizadores SET acesso_ate=? WHERE email='ana2@teste.pt'",(ag-10,));c.commit()
s,b,_=req('GET','/api/link?id='+RID,ck=ses);ok(s==403,'acesso expirado: 403')
t='x'*40;c.execute("INSERT INTO subscricoes(email,disp,estado,criado,ate) VALUES(?,?,?,?,?)",('rui@teste.pt',hashlib.sha256(t.encode()).hexdigest(),'ativa',ag,ag+86400));c.commit()
s,b,_=req('GET','/api/link?id='+RID,ck='__Host-dc_disp='+t);ok(s==200,'dispositivo com subscrição ativa: link')
t2='y'*40;c.execute("INSERT INTO subscricoes(email,disp,estado,criado) VALUES(?,?,?,?)",('rui2@teste.pt',hashlib.sha256(t2.encode()).hexdigest(),'pendente',ag));c.commit()
s,b,_=req('GET','/api/link?id='+RID,ck='__Host-dc_disp='+t2);ok(s==403,'subscrição pendente: 403')
n0=c.execute('SELECT COUNT(*) FROM pedidos').fetchone()[0]
s,b,_=req('POST','/api/pedido',{'tipo':'senhorio','email':'senhorio2@teste.pt','dados':{'nome':'Rui','cidade':'Porto','renda':'750','area':'abc','descricao':'x'*5000,'admin':True}});ok(s==200,'pedido senhorio: 200')
s,b,_=req('POST','/api/pedido',{'tipo':'outro','email':'a@b.pt'});ok(s==400,'tipo inválido: 400')
s,b,_=req('POST','/api/pedido',{'tipo':'seguro','email':'mau'});ok(s==400,'e-mail inválido: 400')
s,b,_=req('POST','/api/pedido',{'tipo':'seguro','email':'robo@teste.pt','site':'http://spam'});ok(s==200,'isco: 200')
ok(c.execute('SELECT COUNT(*) FROM pedidos').fetchone()[0]==n0+1,'isco não guarda nada')
s,b,_=req('GET','/api/pedidos',ck=ses);ok(s==403,'pedidos sem ser admin: 403')
adm=sessao('admin@teste.pt')
s,b,_=req('GET','/api/pedidos',ck=adm);p=[x for x in b.get('pedidos',[]) if x['email']=='senhorio2@teste.pt']
ok(s==200 and p and p[0]['dados'].get('renda')==750 and 'area' not in p[0]['dados'] and 'admin' not in p[0]['dados'] and len(p[0]['dados']['descricao'])==2000,'admin vê o pedido limpo')
s,b,_=req('GET','/api/link?id='+RID,ck=adm);ok(s==200,'admin vê links')
print('FALHAS',len(falhas))
