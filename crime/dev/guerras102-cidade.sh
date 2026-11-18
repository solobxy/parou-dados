# v102: põe duas gangues em guerra na cidade de teste local (/tmp/cidade-p6b) para capturas.
# FASE=lista (só as gangues, sem guerra) | guerra (a decorrer, com pontos). Recomeça o servidor.
pkill -f "node server.mjs"; sleep 1
python3 - <<'PY'
import sqlite3, json, time, os
c=sqlite3.connect('/tmp/cidade-p6b/dados/jogo.db'); now=int(time.time()*1000); H=3600000
fase=os.environ.get('FASE','guerra')
ronda=c.execute("select ronda from jogadores limit 1").fetchone()[0]
ids={n:i for i,n in c.execute("select id, nome from contas")}
c.execute("delete from gangue_membros where gangue in ('ga','gb')"); c.execute("delete from gangues where id in ('ga','gb')"); c.execute("delete from guerras") if c.execute("select name from sqlite_master where name='guerras'").fetchone() else None
c.execute("delete from gangue_membros where conta in (%s)" % ','.join('?'*6), [ids[n] for n in ['Rico','Gasto','Seco','Assaltante','Planeador','Novato']])
for gid,nome,tag,lider,cofre in [('ga','Os Lobos','LOB','Rico',80000),('gb','Tubarões','TUB','Assaltante',20000)]:
  c.execute("insert into gangues (ronda,id,nome,nome_lc,tag,lider,cofre,sede,armaria,aberta,criada) values (?,?,?,?,?,?,?,2,1,1,?)",(ronda,gid,nome,nome.lower(),tag,ids[lider],cofre,now-3*24*H))
for n,g,cargo in [('Rico','ga',0),('Gasto','ga',2),('Seco','ga',0),('Assaltante','gb',0),('Planeador','gb',1),('Novato','gb',0)]:
  c.execute("insert into gangue_membros (ronda,conta,gangue,entrou,dado,cargo) values (?,?,?,?,0,?)",(ronda,ids[n],g,now-2*24*H,cargo))
  e=json.loads(c.execute("select estado from jogadores where conta=?",(ids[n],)).fetchone()[0])
  e['gang']=g; e['tr']=None; e['trL']=None; e['jailUntil']=0; e['hospUntil']=0; e['vigor']=100; e['shieldUntil']=0; e['protectUntil']=0
  if n in ('Rico','Gasto','Seco'): e['respect']=max(e['respect'],60000); e['peakRespect']=max(e['peakRespect'],e['respect'])
  c.execute("update jogadores set estado=? where conta=?",(json.dumps(e),ids[n]))
if fase=='guerra':
  c.execute("""CREATE TABLE IF NOT EXISTS guerras (ronda INTEGER NOT NULL, id TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, decl INTEGER NOT NULL, inicio INTEGER NOT NULL,
  fim INTEGER NOT NULL DEFAULT 0, alvo INTEGER NOT NULL, aposta INTEGER NOT NULL, sa INTEGER NOT NULL DEFAULT 0, sb INTEGER NOT NULL DEFAULT 0, vence TEXT NOT NULL DEFAULT '',
  nomes TEXT NOT NULL, pts TEXT NOT NULL, PRIMARY KEY (ronda, id))""")
  pts={'a':{ids['Rico']:310,ids['Gasto']:180,ids['Seco']:40},'b':{ids['Planeador']:120,ids['Assaltante']:65}}
  c.execute("insert into guerras values (?,?,?,?,?,?,0,900,25000,530,185,'',?,?)",(ronda,'w1','ga','gb',now-5*H,now-4*H,json.dumps({'a':{'name':'Os Lobos','tag':'LOB'},'b':{'name':'Tubarões','tag':'TUB'}}),json.dumps(pts)))
  c.execute("insert into guerras values (?,?,?,?,?,?,?,600,10000,610,420,'ga',?,?)",(ronda,'w0','ga','gb',now-80*H,now-79*H,now-60*H,json.dumps({'a':{'name':'Os Lobos','tag':'LOB'},'b':{'name':'Tubarões','tag':'TUB'}}),json.dumps({'a':{},'b':{}})))
c.commit()
PY
cd /home/claude/parou-dados/crime && PORT=3571 DATA=/tmp/cidade-p6b/dados STATIC=../sites/crime COOKIE_INSEGURO=1 ATOS_3S=100000 ATOS_MIN=1000000 nohup node server.mjs > /tmp/srv3571.log 2>&1 &
sleep 3
