#!/usr/bin/env python3
"""Metro Mondego (metrobus de Coimbra, Miranda do Corvo e Lousã): a AGIT publica os horários só em NeTEx. O construtor
converte-os para GTFS (netex_gtfs.py) e trata-os como os outros operadores. Sem isto, Coimbra ficava sem o seu principal
transporte (comentário na Comunidade, 16/11/2026).
Testa: fonte oficial na lista, conversão (linhas, paragens, sentidos, horas depois da meia-noite, dias por bits e por
período com dias da semana, dias tirados), desenhos pelos eixos da rede (KML) e entrada na base pela via normal.
Uso: python auditoria/test_metro_mondego.py   (a partir da raiz do repositório; falha com exit 1)"""
import csv, datetime, io, os, sqlite3, sys, zipfile
sys.path.insert(0, os.getcwd())
import construir_dados as cd
import netex_gtfs as ng

falhas = 0
def ok(nome, cond, extra=""):
    global falhas
    if not cond: falhas += 1
    print(("OK     " if cond else "FALHOU "), nome, extra)

# --- Fonte ---------------------------------------------------------------------------------------------------------
f = next((x for x in cd.SEED_FEEDS if x["id"] == "metro_mondego"), {})
ok("[fonte] Metro Mondego está na lista de operadores", bool(f))
ok("[fonte] vem da API oficial da AGIT, em NeTEx",
   f.get("url") == "https://api.planner.agit.pt/v1/datasets/metro-mondego/distributions/netex/download"
   and f.get("formato") == "netex", str(f.get("url")))
ok("[fonte] desenhos pela rede publicada em dados.gov.pt", "dados.gov.pt" in (f.get("desenhos_kml") or ""))
ok("[fonte] não entra outra vez pelo catálogo automático", "metro mondego" in cd.DISCOVERY_SKIP)

# --- Ficheiro NeTEx pequeno, com a mesma forma do da AGIT ----------------------------------------------------------
P = "PT:{}:AGIT_TESTE_{}"
def ssp(n, nome, lat, lon):
    return f"""
<StopPlace id="{P.format('StopPlace', n)}"><Name>{nome}</Name>
  <Centroid><Location><Longitude>{lon}</Longitude><Latitude>{lat}</Latitude></Location></Centroid>
  <quays><Quay id="{P.format('Quay', n)}"><keyList><KeyValue><Key>gtfs:stop_id</Key><Value>{n}</Value></KeyValue></keyList>
    <Name>{nome}</Name><Centroid><Location><Longitude>{lon}</Longitude><Latitude>{lat}</Latitude></Location></Centroid>
    <PublicCode>cbr_{n}</PublicCode></Quay></quays></StopPlace>
<ScheduledStopPoint id="{P.format('ScheduledStopPoint', n)}"><Name>{nome}</Name></ScheduledStopPoint>
<PassengerStopAssignment id="{P.format('PassengerStopAssignment', n)}" order="1">
  <ScheduledStopPointRef ref="{P.format('ScheduledStopPoint', n)}"/><QuayRef ref="{P.format('Quay', n)}"/></PassengerStopAssignment>"""

def padrao(nome, rota, paragens):
    pts = "".join(f"""<StopPointInJourneyPattern id="{P.format('SPJP', nome + str(i))}" order="{i + 1}">
      <ScheduledStopPointRef ref="{P.format('ScheduledStopPoint', s)}"/>
      <ForAlighting>{'false' if i == 0 else 'true'}</ForAlighting><ForBoarding>{'false' if i == len(paragens) - 1 else 'true'}</ForBoarding>
      </StopPointInJourneyPattern>""" for i, s in enumerate(paragens))
    return f"""<ServiceJourneyPattern id="{P.format('SJP', nome)}"><RouteRef ref="{P.format('Route', rota)}"/>
      <pointsInSequence>{pts}</pointsInSequence></ServiceJourneyPattern>"""

def viagem(tid, pad, n, horas, tipo, offsets=None):
    offsets = offsets or [0] * n
    tps = "".join(f"""<TimetabledPassingTime><StopPointInJourneyPatternRef ref="{P.format('SPJP', pad + str(i))}"/>
      <ArrivalTime>{h}</ArrivalTime>{'<ArrivalDayOffset>%d</ArrivalDayOffset>' % o if o else ''}
      <DepartureTime>{h}</DepartureTime>{'<DepartureDayOffset>%d</DepartureDayOffset>' % o if o else ''}
      </TimetabledPassingTime>""" for i, (h, o) in enumerate(zip(horas, offsets)))
    return f"""<ServiceJourney id="{P.format('ServiceJourney', tid)}">
      <keyList><KeyValue><Key>gtfs:trip_id</Key><Value>{tid}</Value></KeyValue></keyList><Name>{tid}</Name>
      <dayTypes><DayTypeRef ref="{P.format('DayType', tipo)}"/></dayTypes>
      <ServiceJourneyPatternRef ref="{P.format('SJP', pad)}"/>
      <passingTimes>{tps}</passingTimes></ServiceJourney>"""

# Dias úteis: bits desde segunda 16/11/2026 (5 dias sim, 2 não, duas semanas), sem o dia 1/12 (tirado à parte).
bits_uteis = "1111100" * 3
NETEX = f"""<?xml version="1.0" encoding="UTF-8"?>
<PublicationDelivery xmlns="http://www.netex.org.uk/netex" version="1.1"><dataObjects><CompositeFrame id="c"><frames>
<ResourceFrame id="r"><organisations>
  <Operator id="{P.format('Operator', 1)}"><keyList><KeyValue><Key>gtfs:agency_id</Key><Value>1</Value></KeyValue></keyList>
    <Name>Metro Mondego</Name><ContactDetails><Url>https://www.metromondego.pt/pt</Url></ContactDetails></Operator>
</organisations></ResourceFrame>
<SiteFrame id="s"><stopPlaces>
  {ssp(1, 'Coimbra B', 40.2240, -8.4400)}
  {ssp(2, 'República (desc)', 40.2140, -8.4300)}
  {ssp(3, 'Vale das Flores', 40.2040, -8.4300)}
</stopPlaces></SiteFrame>
<ServiceCalendarFrame id="k">
  <dayTypes>
    <DayType id="{P.format('DayType', 'U')}"><keyList><KeyValue><Key>gtfs:service_id</Key><Value>11</Value></KeyValue></keyList></DayType>
    <DayType id="{P.format('DayType', 'D')}"><keyList><KeyValue><Key>gtfs:service_id</Key><Value>1</Value></KeyValue></keyList>
      <properties><PropertyOfDay><DaysOfWeek>Sunday</DaysOfWeek></PropertyOfDay></properties></DayType>
  </dayTypes>
  <operatingPeriods>
    <UicOperatingPeriod id="{P.format('UicOperatingPeriod', 'U')}"><FromDate>2026-11-16T00:00:00Z</FromDate>
      <ToDate>2026-12-06T23:59:59Z</ToDate><ValidDayBits>{bits_uteis}</ValidDayBits></UicOperatingPeriod>
    <OperatingPeriod id="{P.format('OperatingPeriod', 'D')}"><FromDate>2026-11-16T00:00:00Z</FromDate><ToDate>2026-12-06T23:59:59Z</ToDate></OperatingPeriod>
  </operatingPeriods>
  <dayTypeAssignments>
    <DayTypeAssignment id="a1" order="1"><OperatingPeriodRef ref="{P.format('UicOperatingPeriod', 'U')}"/><DayTypeRef ref="{P.format('DayType', 'U')}"/><isAvailable>true</isAvailable></DayTypeAssignment>
    <DayTypeAssignment id="a2" order="2"><OperatingPeriodRef ref="{P.format('OperatingPeriod', 'D')}"/><DayTypeRef ref="{P.format('DayType', 'D')}"/></DayTypeAssignment>
    <DayTypeAssignment id="a3" order="3"><Date>2026-12-01</Date><DayTypeRef ref="{P.format('DayType', 'U')}"/><isAvailable>false</isAvailable></DayTypeAssignment>
  </dayTypeAssignments>
</ServiceCalendarFrame>
<ServiceFrame id="v">
  <routes>
    <Route id="{P.format('Route', 'ida')}"><LineRef ref="{P.format('Line', 'U1')}"/><DirectionType>outbound</DirectionType></Route>
    <Route id="{P.format('Route', 'volta')}"><LineRef ref="{P.format('Line', 'U1')}"/><DirectionType>inbound</DirectionType></Route>
  </routes>
  <lines><Line id="{P.format('Line', 'U1')}"><keyList><KeyValue><Key>gtfs:route_id</Key><Value>3622</Value></KeyValue></keyList>
    <Name>U1</Name><ShortName>Azul</ShortName><TransportMode>bus</TransportMode>
    <OperatorRef ref="{P.format('Operator', 1)}"/><Presentation><Colour>2B6CC4</Colour><TextColour>FFFFFF</TextColour></Presentation></Line></lines>
  <journeyPatterns>{padrao('ida', 'ida', [1, 2, 3])}{padrao('volta', 'volta', [3, 2, 1])}</journeyPatterns>
</ServiceFrame>
<TimetableFrame id="t"><vehicleJourneys>
  {viagem('V1', 'ida', 3, ['07:00:00', '07:06:00', '07:12:00'], 'U')}
  {viagem('V2', 'volta', 3, ['08:00:00', '08:06:00', '08:12:00'], 'U')}
  {viagem('V3', 'ida', 3, ['23:55:00', '00:01:00', '00:07:00'], 'D', [0, 1, 1])}
</vehicleJourneys></TimetableFrame>
</frames></CompositeFrame></dataObjects></PublicationDelivery>""".encode("utf-8")

zip_netex = io.BytesIO()
with zipfile.ZipFile(zip_netex, "w") as z:
    z.writestr("netex.xml", NETEX)
    z.writestr("metadata.jsonld", "{}")
zip_netex = zip_netex.getvalue()

# Rede: o eixo faz uma curva para oeste entre Coimbra B e a República (passa por 40.2190,-8.4450).
CURVA = (40.2190, -8.4450)
KML = f"""<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Eixo</name><LineString><coordinates>
-8.4400,40.2242,0 {CURVA[1]},{CURVA[0]},0 -8.4302,40.2140,0
</coordinates></LineString></Placemark>
<Placemark><name>Eixo 2</name><LineString><coordinates>
-8.4302,40.2140,0 -8.4301,40.2090,0 -8.4300,40.2042,0
</coordinates></LineString></Placemark></Document></kml>""".encode("utf-8")

def ler(zbytes, nome):
    with zipfile.ZipFile(io.BytesIO(zbytes)) as z:
        return list(csv.DictReader(io.StringIO(z.read(nome).decode("utf-8"))))

g = ng.netex_para_gtfs(zip_netex, KML)
rotas, paragens, viagens, horas = ler(g, "routes.txt"), ler(g, "stops.txt"), ler(g, "trips.txt"), ler(g, "stop_times.txt")
datas = ler(g, "calendar_dates.txt")
ok("[conversão] uma linha U1, autocarro, com a cor oficial",
   [(r["route_short_name"], r["route_type"], r["route_color"]) for r in rotas] == [("U1", "3", "2B6CC4")], str(rotas))
ok("[conversão] 3 paragens, com o código público", len(paragens) == 3 and {p["stop_code"] for p in paragens} == {"cbr_1", "cbr_2", "cbr_3"})
ok("[conversão] nome sem o sufixo interno de sentido («República (desc)» -> «República»)",
   {p["stop_name"] for p in paragens} == {"Coimbra B", "República", "Vale das Flores"}, str([p["stop_name"] for p in paragens]))
v = {x["trip_id"]: x for x in viagens}
ok("[conversão] 3 viagens", len(viagens) == 3)
ok("[conversão] destino = última paragem", v["V1"]["trip_headsign"] == "Vale das Flores" and v["V2"]["trip_headsign"] == "Coimbra B",
   str({k: x["trip_headsign"] for k, x in v.items()}))
ok("[conversão] sentidos (outbound 0, inbound 1)", v["V1"]["direction_id"] == "0" and v["V2"]["direction_id"] == "1")
h3 = [x for x in horas if x["trip_id"] == "V3"]
ok("[conversão] horas depois da meia-noite (DayOffset) ficam 24:01 e 24:07",
   [x["arrival_time"] for x in h3] == ["23:55:00", "24:01:00", "24:07:00"], str([x["arrival_time"] for x in h3]))
h1 = sorted((x for x in horas if x["trip_id"] == "V1"), key=lambda x: int(x["stop_sequence"]))
ok("[conversão] não se entra na última paragem nem se sai na primeira",
   h1[-1]["pickup_type"] == "1" and h1[0]["drop_off_type"] == "1" and h1[1]["pickup_type"] == "0")
uteis = sorted(d["date"] for d in datas if d["service_id"] == "11")
domingos = sorted(d["date"] for d in datas if d["service_id"] == "1")
ok("[dias] dias úteis pelos bits: 16/11 a 4/12, sem fins de semana", uteis[0] == "20261116" and uteis[-1] == "20261204"
   and all(datetime.date(int(x[:4]), int(x[4:6]), int(x[6:])).weekday() < 5 for x in uteis), f"{uteis[:2]}…{uteis[-2:]}")
ok("[dias] dia tirado (isAvailable=false) não tem serviço: 1/12", "20261201" not in uteis and len(uteis) == 14, str(len(uteis)))
ok("[dias] período de data a data só nos domingos (DaysOfWeek)", domingos == ["20261122", "20261129", "20261206"], str(domingos))

# --- Desenhos -------------------------------------------------------------------------------------------------------
formas = ler(g, "shapes.txt")
ida = [(float(x["shape_pt_lat"]), float(x["shape_pt_lon"])) for x in formas if x["shape_id"] == v["V1"]["shape_id"]]
perto_curva = min(ng._dist(p, CURVA) for p in ida) if ida else 1e9
ok("[desenho] a linha segue o eixo da rede (passa pela curva)", perto_curva < 5, f"{perto_curva:.0f} m")
ok("[desenho] ida e volta (paragens diferentes) têm desenhos diferentes; V1 e V3 (iguais) partilham",
   v["V1"]["shape_id"] != v["V2"]["shape_id"] and v["V1"]["shape_id"] == v["V3"]["shape_id"])
sem_rede = ler(ng.netex_para_gtfs(zip_netex, None), "shapes.txt")
ok("[desenho] sem rede: de paragem a paragem (3 pontos por desenho)",
   sum(1 for x in sem_rede if x["shape_id"] == "f1") == 3)
ok("[desenho] rede ilegível não impede os horários", len(ler(ng.netex_para_gtfs(zip_netex, b"<kml"), "trips.txt")) == 3)

# --- Entrada na base pela via normal (process_feed) ----------------------------------------------------------------
conn = sqlite3.connect(":memory:")
conn.executescript(cd.SCHEMA_TABLES)
orig_zip, orig_get = cd.download_zip, cd.http_get
cd.download_zip = lambda url: (zip_netex, 200, 5, None)
cd.http_get = lambda url, timeout=180, insecure=False: (200, KML)
try:
    row = cd.process_feed(conn, f, datetime.datetime(2026, 11, 16, 6, 0), False)
finally:
    cd.download_zip, cd.http_get = orig_zip, orig_get
ok("[base] feed OK com 1 linha, 3 paragens", row.get("status") == "OK" and row.get("lines_count") == 1
   and row.get("stops_count") == 3, str({k: row.get(k) for k in ("status", "lines_count", "stops_count", "last_error")}))
nome = conn.execute("SELECT route_short_name, route_long_name FROM routes WHERE feed_id = 'metro_mondego'").fetchone()
ok("[base] nome comprido da linha = os dois destinos", nome == ("U1", "Coimbra B – Vale das Flores"), str(nome))
ok("[base] ids com o prefixo do operador", conn.execute(
    "SELECT COUNT(*) FROM stops WHERE stop_id LIKE 'metro_mondego:%'").fetchone()[0] == 3)
ok("[base] viagens com desenho", conn.execute(
    "SELECT COUNT(*) FROM trips WHERE feed_id = 'metro_mondego' AND shape_id IS NOT NULL").fetchone()[0] == 3)

sys.exit(1 if falhas else 0)
