# v101: põe a cidade de teste local (/tmp/cidade-p6b) em estados de viagem para capturas: TRMODE=base|abroad|egypt dev/viagens101-cidade.sh
pkill -f "node server.mjs"; sleep 1
python3 - <<'PY'
import sqlite3, json, time
c=sqlite3.connect('/tmp/cidade-p6b/dados/jogo.db')
now=int(time.time()*1000); MIN=60000
rows={r[0]:r[1] for r in c.execute("select c.nome, j.conta from jogadores j join contas c on c.id=j.conta")} if False else None
def get(nome):
  conta=c.execute("select id from contas where lower(nome)=lower(?)",(nome,)).fetchone()[0]
  return conta, json.loads(c.execute("select estado from jogadores where conta=?",(conta,)).fetchone()[0])
def put(conta,e): c.execute("update jogadores set estado=? where conta=?",(json.dumps(e),conta))
import os
mode=os.environ.get('TRMODE','base')
for nome in ['Rico','Gasto','Novato','Assaltante']:
  conta,e=get(nome)
  e['tr']=None; e['trL']=None; e['trB']=e.get('trB',0); e['jailUntil']=0; e['hospUntil']=0; e['dg']=None
  e.setdefault('cx',{}).setdefault('trip',{})
  if nome=='Rico':
    e['trB']=2; e['done']=list(set(e.get('done',[])+['arqueologia1','arqueologia2','arqueologia3']))
    e['eq']['mao']={'id':'pistola50','u':40}
    if mode=='abroad': e['tr']={'to':'it','st':'there','t0':now-10*MIN,'at':now-10*MIN,'bag':{'limoncello':8},'paid':{'limoncello':640},'arm':False}
    if mode=='egypt': e['tr']={'to':'eg','st':'there','t0':now-10*MIN,'at':now-10*MIN,'bag':{},'paid':{},'arm':True,'gun':'smg9'}
  if nome=='Assaltante' and mode=='abroad':
    e['tr']={'to':'it','st':'there','t0':now-20*MIN,'at':now-20*MIN,'bag':{},'paid':{},'arm':False}
    e['shieldUntil']=0
  if nome=='Gasto':
    e['respect']=max(e['respect'],10**7); e['peakRespect']=max(e['peakRespect'],e['respect'])
    e['tr']={'to':'jp','st':'out','t0':now-60*MIN,'at':now+160*MIN,'bag':{},'paid':{},'arm':False}
  if nome=='Novato':
    e['respect']=max(e['respect'],3000); e['peakRespect']=max(e['peakRespect'],e['respect'])
    e['trL']={'to':'ma','at':now-5*MIN,'bag':{'argao':6,'tabaco':4},'paid':{'argao':210,'tabaco':200},'sz':['tabaco']}
  put(conta,e)
c.commit()
PY
cd /home/claude/parou-dados/crime && PORT=3571 DATA=/tmp/cidade-p6b/dados STATIC=../sites/crime COOKIE_INSEGURO=1 ATOS_3S=100000 ATOS_MIN=1000000 nohup node server.mjs > /tmp/srv3571.log 2>&1 &
sleep 3
