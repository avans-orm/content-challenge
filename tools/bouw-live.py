#!/usr/bin/env python3
"""Zet de prototype-game (één HTML-bestand uit het artifact) om naar de live versie (index.html).

Gebruik:  python3 tools/bouw-live.py prototype.html index.html

Wat er verandert:
- het game-script start pas na het inloggen (live.js laadt eerst de gegevens);
- localStorage wordt CStore: alles gaat naar de database in plaats van de browser;
- docentmodus volgt de rol van het account (geen docentcode meer);
- scoreborden en klasoverzichten tonen de echte klas in plaats van voorbeelddata.
Elke vervanging wordt gecontroleerd: klopt een stuk niet meer, dan stopt het script met een melding.
"""
import re
import sys

src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()


def rep(old, new, count=1, regex=False):
    global s
    if regex:
        n = len(re.findall(old, s, flags=re.S))
        if n != count:
            sys.exit(f"Verwacht {count}x, gevonden {n}x: {old[:80]}")
        s = re.sub(old, new, s, flags=re.S)
    else:
        n = s.count(old)
        if n != count:
            sys.exit(f"Verwacht {count}x, gevonden {n}x: {old[:80]}")
        s = s.replace(old, new)


# 1. Game-script pas starten na inloggen.
rep('<script>\n(function(){\n"use strict";', '<script type="text/plain" id="gamecode">\n(function(){\n"use strict";')
start = s.index('<script type="text/plain" id="gamecode">')
end = s.index('</script>', start)
game = s[start:end]
n_ls = game.count("localStorage")
game = game.replace("localStorage", "CStore")
s = s[:start] + game + s[end:]
print("localStorage vervangen:", n_ls)

# 2. Docentmodus = rol van het account.
rep(r'function isDocent\(\)\{.*?\}\n', 'function isDocent(){return CCLIVE.isDocent();}\n', regex=True)
rep(r'function setDocent\(on\)\{.*?\}\n', 'function setDocent(on){}\n', regex=True)
rep(r'function viewDocentLogin\(\)\{.*?\n(?=function docentBar\(\))',
    'function viewDocentLogin(){return h("div",null,head("Docentweergave","Alleen voor docenten","De docentweergave is alleen zichtbaar voor docentaccounts.",[["t-brief","Alleen voor docenten"]]),h("div",{class:"row"},h("button",{class:"btn",onclick:()=>{S.role="student";save();render();}},"Terug naar de game")));}\n',
    regex=True)
rep('function reviewBlock(n){if(!isDocent())return null;', 'function reviewBlock(n){if(!isDocent()||CCLIVE.bekijk())return null;')
rep('resetLive6();render();', 'CCLIVE.schrijfToe();resetLive6();render();')

# 3. Echte klas in plaats van voorbeelddata.
for n in ["", "2", "3", "4", "5", "6"]:
    rep(r'const EXAMPLE_CLASS' + n + r'=\[.*?\n\];', 'const EXAMPLE_CLASS' + n + '=CCLIVE.klasArr(' + (n or "1") + ');', regex=True)
rep(r'EXAMPLE_CLASS(\d?)\.concat\(\[myRow(\d?)\(\)\]\)', r'EXAMPLE_CLASS\1.concat(CCLIVE.bekijk()?[myRow\2()]:[])', count=6, regex=True)
rep('h("td",null,r.n),h("td",null,"Studio "+r.s)', 'h("td",null,CCLIVE.naamCel(r)),h("td",null,"Studio "+r.s)', count=6)
rep('(S.p.naam||"Jij")+" (jij)"', 'CCLIVE.mijnNaam(S.p.naam)', count=6)
rep('h("p",{class:"example"},"Voorbeeld: de andere studenten zijn verzonnen. In de echte versie staat hier de hele klas.")', 'CCLIVE.klasNoot("bord")', count=6)
rep(r'h\("p",\{class:"example"\},"Voorbeelddata\.[^"]*"\)', 'CCLIVE.klasNoot("docent")', count=6, regex=True)
for t in ["Kennischeck van deze student (jij)", "Eventkaart van deze student (jij)", "Rode vlaggen (jij)"]:
    rep('"' + t + '"', '"' + t.replace(" (jij)", "") + '"+(CCLIVE.bekijk()?"":" (jij)")')

# Voorbeeld van het huisstijlhandboek in een afgeschermd kader: geen scripts, eigen herkomst.
rep('const f=h("iframe",{class:"hbframe",title:"Voorbeeld van je huisstijlhandboek"});f.srcdoc=', 'const f=h("iframe",{class:"hbframe",title:"Voorbeeld van je huisstijlhandboek",sandbox:"allow-popups"});f.srcdoc=')

# Kenniskaarten staan in de site zelf (map kennis/), niet meer op claude.ai.
rep(r'const KAART_URL=\{.*?\};', 'const KAART_URL={1:"kennis/l1.html",2:"kennis/l2.html",3:"kennis/l3.html",4:"kennis/l4.html",5:"kennis/l5.html",6:"kennis/l6.html"};', regex=True)
rep('id="kaartenBtn" href="https://claude.ai/artifact/4KaNAPnvqaFUtwBovYstZw"', 'id="kaartenBtn" href="kennis/l1.html"')

# Lesdecks als PDF in de site (map lesdeck/).
rep(r'const LESDECK_URL=\{.*?\};', 'const LESDECK_URL={1:"lesdeck/l1.pdf",2:"lesdeck/l2.pdf",3:"lesdeck/l3.pdf",4:"lesdeck/l4.pdf",5:"lesdeck/l5.pdf",6:"lesdeck/l6.pdf"};', regex=True)
rep('id="deckBtn" href="https://claude.ai/artifact/PeqWKwmgCz3Q4rXuqSqpNr"', 'id="deckBtn" href="lesdeck/l1.pdf"')

# 4. Teksten over opslag in de browser.
rep('Opslag in je browser: ongeveer ', 'Opslag van je account: ongeveer ')
rep('"Opslag in je browser"', '"Opslag van je account"')
rep('const max=5*1024*1024;', 'const max=CCLIVE.maxOpslag;')
rep('De opslag van je browser is vol.', 'De opslag van je account is vol.')
rep("de opslag van je browser is vol.", "de opslag van je account is vol.")
rep('Je werk kon niet worden opgeslagen in deze browser.', 'Je werk kon niet worden opgeslagen.')
rep('h("strong",null,"Speel dit level op hetzelfde apparaat. "),"Je voortgang staat alleen in deze browser op dit apparaat. Speel level 4 dus waar je level 1 tot en met 3 speelde. Staan',
    'h("strong",null,"Je werk staat in je account. "),"Je kunt dus op elk apparaat verder, ook op je telefoon. Staan')

# 5. Samenvatting voor scorebord en dashboard (draait binnen de game, dus met toegang tot de scorefuncties).
hook = r'''
/* ---------- live: samenvatting per level voor scorebord en docentendashboard ---------- */
CCLIVE.koppel({samenvatting(){
 const out={naam:String(S.p.naam||"").trim(),studio:S.p.studio||"",bedrijf:String(S.p.bedrijf||"").trim(),lvl:S.lvl,lv:{}};
 const open=[null,()=>true,l2open,l3open,l4open,l5open,l6open],rows=[null,myRow,myRow2,myRow3,myRow4,myRow5,myRow6],D=[null,done,done2,done3,done4,done5,done6];
 const MS=[null,MISSIONS,MISSIONS2,MISSIONS3,MISSIONS4,MISSIONS5,MISSIONS6],cur=[null,()=>S.cur,()=>S.l2.cur,()=>S.l3.cur,()=>S.l4.cur,()=>S.l5.cur,()=>S.l6.cur];
 for(let n=1;n<=6;n++){try{
  if(!open[n]()){out.lv[n]={x:[0,0,0,0],b:0,st:"Nog niet open",open:false};if(n===3)out.lv[n].ev="Nog niet getrokken";if(n===6)out.lv[n].sz=0;continue;}
  const r=rows[n]();delete r.me;delete r.n;delete r.s;r.open=true;r.klaar=!!D[n]("oplevering");
  r.st=r.klaar?(n===6?"Challenge klaar":"Oplevering klaar"):"Bezig: "+((MS[n].find(m=>m.id===cur[n]())||{}).t||"-");
  out.lv[n]=r;}catch(e){out.lv[n]={x:[0,0,0,0],b:0,st:"-"};}}
 return out;}});
'''
rep('\n$("#roleStudent").addEventListener("click"', hook + '\n$("#roleStudent").addEventListener("click"')

# 6. Kop: inlogscherm, scripts en stijl voor de live-onderdelen.
head_add = '''<script>window.CC_HASH=location.hash;window.CC_QS=location.search;</script>
<link rel="stylesheet" href="live.css">
'''
rep('<title>Content Challenge</title>', '<title>Content Challenge</title>\n' + head_add)
rep('<body>\n<title>', '<body class="cc-wait">\n<div id="ccgate" class="ccgate"><div class="ccbox"><p class="ccload">Laden…</p></div></div>\n<title>')
tail = '''<script src="vendor/supabase.js"></script>
<script src="config.js"></script>
<script src="cloud.js"></script>
<script src="live.js"></script>
</body></html>'''
rep('</script>\n\n</body></html>', '</script>\n' + tail)
s = s.replace('<html><head><meta charset=utf8>', '<html lang="nl"><head><meta charset=utf8>\n'+'''<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'">
''', 1)
assert 'Content-Security-Policy' in s[:s.index('</head>')]

open(out, "w", encoding="utf-8").write(s)
print("Klaar:", out, len(s), "tekens")
