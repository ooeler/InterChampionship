// Teams, Spielerprofil, Einladungen, Benutzer, Spieleransicht
// Spielerprofil (#103): Teams nur lesend, Antippen öffnet das Profil; das eigene Profil ist bearbeitbar.
// Profile und Saison-Archiv liegen in eigenen Tabellen (player_profiles, player_seasons).
// Profil als Overlay: PROF = angezeigter Spieler, PROFE = über „Mein Profil“ geöffnet (nur dort bearbeitbar, mit Passwort ändern)
var TED=-1,PROF=null,PROFE=false,PRF=null,PSE=null;
function loadProf(){if(PRF!==null||!sb||!me)return;PRF={};sb.from("player_profiles").select("player,pos,stick,nr").order("player").then(function(r){if(r.error)return;(r.data||[]).forEach(function(q){PRF[q.player]=q});render()})}
function loadSeasons(){if(PSE!==null||!sb||!me)return;PSE=[];sb.from("player_seasons").select("*").order("season").then(function(r){if(r.error)return;PSE=r.data||[];render()})}
var POS={f:"Feldspieler",g:"Torhüter"},STK={l:"Links",r:"Rechts"};
function prOf(p){return (PRF||{})[p]||{}}
function nrTag(p){var q=prOf(p);return q.nr!=null?'<span class="nr">'+(+q.nr)+'</span>':''}
function teamView(t,k){return '<div class="card"><h3 class="'+(k?"tb":"ta")+'">'+(t.img?'<img class="sl" src="'+img(t.img)+'">':'')+esc(t.n)+' <span class="sp">· '+t.p.length+' Spieler</span></h3>'
+t.p.slice().sort(function(a,b){return a.localeCompare(b,"de")}).map(function(p){return '<div class="row"><button class="pl" data-prof="'+esc(p)+'" aria-label="Profil von '+esc(p)+'">'+nrTag(p)+esc(p)+tags(p)+(p==PLAYER?' <span class="sp">(du)</span>':'')+'</button></div>'}).join("")
+(canTeam()?'<button class="add" data-ted="'+k+'">✏️ Team bearbeiten</button>':'')+'</div>'}
// Rang wie in den Ranglisten: 1 + Anzahl Spieler mit mehr
function rankOf(fn,p){var v=fn(p);return v>0?1+allP().filter(function(q){return fn(q)>v}).length:null}
function potmCount(p){var n=0;S.m.forEach(function(m,i){if(m.res[0]==null||m.res[1]==null)return;var s=starTop(i);if(s&&s.p.indexOf(p)>=0)n++});return n}
function seasonRow(p){var g=function(q){return tot("g",q)},a=function(q){return tot("a",q)},t=function(q){return tot("att",q)},k=S.t[0].p.indexOf(p)>=0?0:S.t[1].p.indexOf(p)>=0?1:-1;
return {season:S.sn||"",player:p,team:k<0?null:S.t[k].n,goals:g(p),assists:a(p),trainings:t(p),potm:potmCount(p),rank_goals:rankOf(g,p),rank_points:rankOf(function(q){return g(q)+a(q)},p),rank_trainings:rankOf(t,p)}}
function statLine(r){var rk=function(x){return x?' <span class="sp">('+(+x)+'.)</span>':''};return '<div class="kv"><span>⚽ Tore</span><b>'+(+r.goals)+rk(r.rank_goals)+'</b></div><div class="kv"><span>🏒 Skorerpunkte</span><b>'+((+r.goals)+(+r.assists))+rk(r.rank_points)+'</b></div><div class="kv"><span>🏃 Trainingsbesuche</span><b>'+(+r.trainings)+rk(r.rank_trainings)+'</b></div><div class="kv"><span>⭐ Spieler des Monats</span><b>'+(+r.potm)+'</b></div>'}
function pwForm(){var em=me&&me.email?esc(me.email):"";return '<form id="pwf" class="sk"><div class="sp" style="margin-bottom:4px">🔒 Passwort ändern</div><input type="email" name="u" autocomplete="username" value="'+em+'" hidden><label class="sp" for="pw1">Neues Passwort (mind. 8 Zeichen)</label><input class="t" id="pw1" type="password" name="p1" autocomplete="new-password" minlength="8" required><label class="sp" for="pw2">Passwort wiederholen</label><input class="t" id="pw2" type="password" name="p2" autocomplete="new-password" required><button class="add">Passwort ändern</button></form>'}
function acctLine(){return me&&me.email?'<div class="kv"><span>Konto</span><b class="wr">'+esc(me.email)+'</b></div>':''}
// Frühere Saisons im Profil: zugeklappt, aufgeklappt nur für den Spieler, dessen Profil gerade offen ist
var PSH=null;
document.addEventListener("click",function(e){if(!(e.target.closest&&e.target.closest("#ovc [data-psh]")))return;PSH=PSH===PROF?null:PROF;render();var b=document.querySelector("#ovc [data-psh]");if(b)b.focus()});
function profCard(){var p=PROF,cl='<button class="x pcl" data-prof="" aria-label="Profil schliessen">✕</button>';if(PROFE&&!PLAYER)return '<div class="card prof" id="prof"><h3 id="prof-t">👤 Mein Profil</h3>'+cl+acctLine()+'<div class="sp">Dein Konto ist noch keinem Spieler zugeordnet.</div>'+pwForm()+'</div>';if(p==null)return "";loadSeasons();var q=prOf(p),own=PROFE&&p==PLAYER,cur=seasonRow(p),H=(PSE||[]).filter(function(r){return r.player==p&&r.season!=S.sn}).reverse();
return '<div class="card prof'+(PDIR&&!calm()?(PDIR>0?' swr':' swl'):'')+'" id="prof"><h3 id="prof-t">👤 '+nrTag(p)+esc(p)+tags(p)+'</h3>'+cl+(own?acctLine():profNav(p))
+'<div class="kv"><span>Team</span><b>'+(cur.team?esc(cur.team):'–')+'</b></div>'
+(own?'<form id="proff"><label class="sp" for="pfpos">Position</label><select class="t" id="pfpos" name="pos"><option value="">– bitte wählen –</option>'+["f","g"].map(function(v){return '<option value="'+v+'"'+(q.pos==v?" selected":"")+'>'+POS[v]+'</option>'}).join("")+'</select>'
+'<div data-stick'+(q.pos=="g"?" hidden":"")+'><label class="sp" for="pfst">Stockseite</label><select class="t" id="pfst" name="stick"><option value="">–</option>'+["l","r"].map(function(v){return '<option value="'+v+'"'+(q.stick==v?" selected":"")+'>'+STK[v]+'</option>'}).join("")+'</select></div>'
+'<label class="sp" for="pfnr">Trikotnummer</label><input class="t" id="pfnr" name="nr" type="number" min="0" max="99" inputmode="numeric" value="'+(q.nr!=null?+q.nr:"")+'"><button class="add">Profil speichern</button></form>'
:'<div class="kv"><span>Position</span><b>'+(POS[q.pos]||'–')+'</b></div>'+(q.pos!="g"?'<div class="kv"><span>Stockseite</span><b>'+(STK[q.stick]||'–')+'</b></div>':'')+'<div class="kv"><span>Trikotnummer</span><b>'+(q.nr!=null?+q.nr:'–')+'</b></div>')
+'<div class="sk"><div class="sp" style="margin-bottom:4px">Saison '+esc(S.sn||"")+' (bisher)</div>'+statLine(cur)+'</div>'
+(H.length?'<div class="sk"><button class="psh" data-psh="1" aria-expanded="'+(PSH==p)+'" aria-controls="pshl"><span>📚 Frühere Saisons <span class="sp">· '+H.length+(H.length==1?" Saison":" Saisons")+'</span></span><span aria-hidden="true">'+(PSH==p?"▴":"▾")+'</span></button>'+(PSH==p?'<div id="pshl">'+H.map(function(r){return '<div class="sp" style="margin-top:6px"><b>'+esc(r.season)+'</b>'+(r.team?' · '+esc(r.team):'')+'</div>'+statLine(r)}).join("")+'</div>':'')+'</div>':'')+(own?pwForm():'')+'</div>'}
// Overlay neu zeichnen; nicht während jemand im Formular tippt
function ovl(){var o=document.getElementById("ovl"),c=document.getElementById("ovc");if(!o)return;var on=!!me&&!PUB&&(PROF!=null||PROFE),ae=document.activeElement;
if(on&&!o.hidden&&c.contains(ae)&&/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))return;var was=!o.hidden;o.hidden=!on;document.body.classList.toggle("ovo",on);c.innerHTML=on?profCard():"";if(on&&!was){var x=c.querySelector(".pcl");if(x)x.focus()}}
// Durch die Profile blättern (aus Teams geöffnet): Wischen, Pfeiltasten oder ‹ ›; Reihenfolge wie in den Teams
var PDIR=0;
function profList(){return S.t.reduce(function(a,t){return a.concat(t.p.slice().sort(function(x,y){return x.localeCompare(y,"de")}))},[])}
function profNav(p){var L=profList(),i=L.indexOf(p);if(i<0||L.length<2)return "";return '<div class="pnav"><button class="x" data-pstep="-1" aria-label="Vorheriges Profil">‹</button><span class="sp">'+(i+1)+' / '+L.length+' · wischen zum Blättern</span><button class="x" data-pstep="1" aria-label="Nächstes Profil">›</button></div>'}
function profStep(d,keep){if(PROF==null||PROFE)return;var L=profList(),i=L.indexOf(PROF);if(i<0||L.length<2)return;PROF=L[(i+d+L.length)%L.length];PDIR=d;loadSeasons();render();PDIR=0;
if(keep){var b=document.querySelector('#ovc [data-pstep="'+d+'"]');if(b)b.focus()}}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("#ovc [data-pstep]");if(b)profStep(+b.dataset.pstep,true)});
document.addEventListener("keydown",function(e){var o=document.getElementById("ovl");if(!o||o.hidden||PROFE||/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement||{}).tagName||""))return;if(e.key=="ArrowRight"){e.preventDefault();profStep(1,false)}else if(e.key=="ArrowLeft"){e.preventDefault();profStep(-1,false)}});
(function(){var x0=null,y0=0;document.addEventListener("touchstart",function(e){x0=e.target.closest&&e.target.closest("#ovc")&&e.touches.length==1?e.touches[0].clientX:null;if(x0!=null)y0=e.touches[0].clientY},{passive:true});
document.addEventListener("touchend",function(e){if(x0==null)return;var t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)profStep(dx<0?1:-1,false)},{passive:true})})();
function ovClose(){if(PROF==null&&!PROFE)return;PROF=null;PROFE=false;render();var b=document.getElementById("lo");if(b&&!b.hidden)b.focus()}
// Benutzermenü oben rechts
function umTog(on){var m=document.getElementById("um"),b=document.getElementById("lo");if(!m)return;on=on==null?m.hidden:on;m.hidden=!on;b.setAttribute("aria-expanded",on);if(on){document.getElementById("ume").textContent=me&&me.email?me.email:"";var f=m.querySelector("button");if(f)f.focus()}}
document.addEventListener("click",function(e){var m=document.getElementById("um");if(m&&!m.hidden&&!e.target.closest(".umw"))umTog(false)});
document.addEventListener("keydown",function(e){if(e.key!="Escape")return;var m=document.getElementById("um");if(m&&!m.hidden){umTog(false);document.getElementById("lo").focus();return}if(PROF!=null||PROFE)ovClose()});
document.addEventListener("submit",function(e){if(e.target.id!="pwf"||!sb)return;e.preventDefault();var f=e.target,B=f.querySelector("button");if(f.elements.p1.value!=f.elements.p2.value){alert("Die Passwörter stimmen nicht überein.");return}
B.disabled=true;sb.auth.updateUser({password:f.elements.p1.value}).then(function(r){B.disabled=false;if(r.error){alert("Passwort nicht geändert: "+r.error.message);return}f.reset();toast("🔒 Passwort geändert.")})});
// Spielleitung: Saisonwerte aller Spieler ins Archiv übernehmen (ersetzt einen früheren Stand derselben Saison)
function archive(){if(!sb||ROLE!="admin")return;var P=allP(),pend=false;S.m.forEach(function(m,i){if(m.res[0]!=null&&m.res[1]!=null&&!actPts(i,m))pend=true});if(pend){alert("Die Monatswertungen werden noch geladen. Bitte in ein paar Sekunden nochmals tippen.");return}
if(!S.sn){alert("Bitte zuerst oben den Saisonnamen eintragen.");return}if(!confirm("Die Werte aller "+P.length+" Spieler für die Saison "+S.sn+" ins Spielerarchiv übernehmen? Ein früherer Stand dieser Saison wird ersetzt."))return;
sb.from("player_seasons").upsert(P.map(seasonRow)).then(function(r){if(r.error){alert("Nicht gespeichert: "+r.error.message);return}PSE=null;toast("📦 Saison "+esc(S.sn)+" ist im Spielerarchiv.");render()})}
// Import früherer Saisons ins Spielerarchiv (nur Spielleitung): JSON-Liste (oder {rows:[…]}) mit
// season, player, team, goals, assists, trainings, potm, rank_goals, rank_points, rank_trainings
function pimpRows(j){var L=Array.isArray(j)?j:j&&j.rows,seen={};if(!Array.isArray(L)||!L.length||L.length>2000)throw "Die Datei enthält keine Liste mit Saisonwerten.";
return L.map(function(r,i){var n="Eintrag "+(i+1)+": ";if(!r||typeof r!="object")throw n+"ungültig.";var o={season:String(r.season==null?"":r.season).trim(),player:String(r.player==null?"":r.player).trim()};
if(!o.season||o.season.length>20||!o.player||o.player.length>80)throw n+"Saison oder Spieler fehlt.";var k=o.season+"|"+o.player;if(seen[k])throw n+o.player+" kommt in der Saison "+o.season+" doppelt vor.";seen[k]=1;
o.team=r.team==null||r.team===""?null:String(r.team).trim().slice(0,80);
["goals","assists","trainings","potm"].forEach(function(f){var v=r[f]==null||r[f]===""?0:Number(r[f]);if(!Number.isInteger(v)||v<0||v>(f=="potm"?12:9999))throw n+f+" ist ungültig.";o[f]=v});
["rank_goals","rank_points","rank_trainings"].forEach(function(f){var v=r[f]==null||r[f]===""?null:Number(r[f]);if(v!=null&&(!Number.isInteger(v)||v<1))throw n+f+" ist ungültig.";o[f]=v});return o})}
document.addEventListener("change",function(e){var inp=e.target;if(!(inp.dataset||{}).pimp)return;var f=inp.files&&inp.files[0];if(!f||!sb||ROLE!="admin"){inp.value="";return}
f.text().then(function(t){var R,j;inp.value="";try{j=JSON.parse(t)}catch(x){alert("Import nicht möglich: Die Datei ist kein gültiges JSON.");return}try{R=pimpRows(j)}catch(x){alert("Import nicht möglich: "+x);return}
var sn=R.map(function(r){return r.season}).filter(function(s,i,L){return L.indexOf(s)==i}).sort();
if(!confirm(R.length+" Einträge für die Saison"+(sn.length>1?"s ":" ")+sn.join(", ")+" ins Spielerarchiv übernehmen? Einträge mit gleicher Saison und gleichem Spieler werden ersetzt."))return;
sb.from("player_seasons").upsert(R).then(function(r){if(r.error){alert("Nicht gespeichert: "+r.error.message);return}PSE=null;toast("📥 "+R.length+" Einträge im Spielerarchiv ("+esc(sn.join(", "))+").");render()})})});
function teams(){loadProf();if(!canTeam())return penStats()+catCard()+S.t.map(teamView).join("")+leadStats(true);var LC=leadCard();return gen()+termCard()+S.t.map(function(t,k){if(TED!=k)return teamView(t,k);return '<div class="card"><h3 class="'+(k?"tb":"ta")+'">Team '+(k+1)+' · '+t.p.length+' Spieler</h3><button class="add" data-ted="-1">✓ Fertig bearbeitet</button><input class="t" data-tn="'+k+'" aria-label="Teamname" value="'+esc(t.n)+'"><div class="sp" style="margin-top:4px">C = Captain · 🧤 = Torhüter · 🗑 = Spieler entfernen</div>'+'<div class="row" style="border:0"><span class="logo">'+(t.img?'<img src="'+img(t.img)+'">':'')+'</span><label class="add" style="margin:0;flex:1;text-align:center">Bild wählen<input type="file" accept="image/*" data-img="'+k+'" hidden></label>'+(t.img?'<button class="bd" data-rmimg="'+k+'">🗑</button>':'')+'</div>'
+t.p.map(function(p,j){return '<div class="row"><input class="t" data-pn="'+k+'" data-j="'+j+'" aria-label="Name Spieler '+(j+1)+'" value="'+esc(p)+'"><button class="x cpb'+(t.c==p?" on":"")+'" data-cap="'+k+'" data-p="'+esc(p)+'" title="Als Captain wählen" aria-pressed="'+(t.c==p)+'" aria-label="'+esc(p)+' als Captain wählen">C</button><button class="x gkb'+((t.gk||[]).indexOf(p)>=0?" on":"")+'" data-gkp="'+k+'" data-p="'+esc(p)+'" title="Torhüter" aria-label="'+esc(p)+' ist Torhüter" aria-pressed="'+((t.gk||[]).indexOf(p)>=0)+'">🧤</button><button class="bd" data-rm="'+k+'" data-j="'+j+'" data-p="'+esc(p)+'" title="Spieler entfernen" aria-label="'+esc(p)+' entfernen">🗑</button></div>'}).join("")
+'<button class="add" data-add="'+k+'">+ Spieler hinzufügen</button></div>'}).join("")+LC+leadStats(!LC)+inviteCard()+users()+noAcc()+catCard()+penStats()+bkCard()+mailCard()+backups()}
// Mitglieder per Einladungslink einladen (Spielleitung & Captains) – über die Edge Function "invite", ohne Mailversand
var INVD={player:"",role:"player"},INVL=null,INVK=null,INVM="";
function fnCall(name,body){return sb.functions.invoke(name,{body:body}).then(function(r){var c=r.error&&r.error.context;return c&&c.json?c.json().then(function(d){return{error:r.error,data:d}},function(){return r}):r})}
function invLink(t){return location.origin+location.pathname+"#einladung="+t}
function inviteCard(){if(!canTeam())return "";if(INVL==null){INVL=[];fnCall("invite",{action:"list"}).then(function(r){INVL=r.data&&r.data.items||[];render()})}
return '<div class="card"><h3>Mitglied einladen</h3><div class="sp">Erstelle einen Einladungslink und schicke ihn persönlich (z. B. per WhatsApp). Der Link ist 7 Tage gültig und nur einmal verwendbar.</div><form id="inv">'
+'<div class="two" style="margin-top:8px"><select class="t" name="player" aria-label="Spieler"><option value="">– Spieler später zuordnen –</option>'+allP().map(function(p){return '<option'+(INVD.player==p?" selected":"")+'>'+esc(p)+'</option>'}).join("")+'</select>'
+(ROLE=="admin"?'<select class="t" name="role" aria-label="Rolle">'+["player","captain","admin"].map(function(r){return '<option value="'+r+'"'+(INVD.role==r?" selected":"")+'>'+RL[r]+'</option>'}).join("")+'</select>':'<span class="sp" style="align-self:center">Rolle: Spieler</span>')+'</div>'
+'<button class="add">Einladungslink erstellen</button></form>'
+(INVK?'<div class="invk"><input class="t" readonly aria-label="Einladungslink" value="'+esc(invLink(INVK.t))+'"><div class="two"><button class="add" data-invcp="1">Kopieren</button>'+(navigator.share?'<button class="add" data-invsh="1">Teilen</button>':'')+'</div><div class="sp">'+esc(INVK.who)+' · gültig bis '+wd(INVK.exp.slice(0,10))+'. Wer den Link hat, kann ein Konto erstellen – nur persönlich weitergeben.</div></div>':'')
+(INVM?'<div class="sp invm" style="margin-top:8px">'+esc(INVM)+'</div>':'')
+(ROLE!="admin"?invList():'')+'</div>'}
function invList(){return (INVL&&INVL.length?'<div class="sk"><div class="sp" style="margin-bottom:4px">Offene Einladungen</div>'+INVL.map(function(x){return '<div class="row"><span class="nm">'+esc(x.player||"ohne Spieler")+' <span class="sp">'+RL[x.role]+' · bis '+wd(x.expires_at.slice(0,10))+'</span></span>'+(x.mine||ROLE=="admin"?'<button class="bd" data-invdel="'+x.id+'" aria-label="Einladung löschen">🗑</button>':'')+'</div>'}).join("")+'</div>':'')}
document.addEventListener("input",function(e){var f=e.target.form;if(f&&f.id=="inv")INVD[e.target.name]=e.target.value});
document.addEventListener("change",function(e){var f=e.target.form;if(f&&f.id=="inv")INVD[e.target.name]=e.target.value});
document.addEventListener("submit",function(e){if(e.target.id!="inv")return;e.preventDefault();var B=e.target.querySelector("button.add");B.disabled=true;var b={action:"create",player:INVD.player||null,role:ROLE=="admin"?INVD.role:"player"};
fnCall("invite",b).then(function(r){if(r.error||!r.data||!r.data.ok){INVM="✗ "+(r.data&&r.data.error||"Einladung fehlgeschlagen.");INVK=null}else{INVM="";INVK={t:r.data.token,exp:r.data.expires_at,who:(b.player||"Ohne Spieler")+" · "+RL[b.role]};INVD={player:"",role:"player"};INVL=null}render()})});
document.addEventListener("click",function(e){var b=e.target.closest("[data-invcp],[data-invsh],[data-invdel]");if(!b)return;
if(b.dataset.invcp){var I=document.querySelector(".invk input");(navigator.clipboard?navigator.clipboard.writeText(I.value):Promise.reject()).then(function(){b.textContent="✓ Kopiert"},function(){I.select()});return}
if(b.dataset.invsh){navigator.share({title:"Einladung",text:"Du bist eingeladen! Hier kannst du dein Konto erstellen:",url:invLink(INVK.t)}).catch(function(){});return}
if(!confirm("Einladung zurückziehen? Der Link funktioniert danach nicht mehr."))return;fnCall("invite",{action:"revoke",id:+b.dataset.invdel}).then(function(){INVL=null;INVK=null;render()})});
var MEM=null,RL={admin:"Spielleitung (Admin)",captain:"Captain",player:"Spieler"};
var HIST=null;
function backups(){if(ROLE!="admin")return "";if(HIST==null){HIST=[];sb.from("league_state_history").select("id,saved_at,reason").order("saved_at",{ascending:false}).limit(100).then(function(r){HIST=(r.data||[]).filter(function(h,i){return i<10||h.reason!="Änderung"});render()})}
var f=function(t){var d=new Date(t);return d.toLocaleDateString("de-CH")+" "+d.toLocaleTimeString("de-CH",{hour:"2-digit",minute:"2-digit"})};
return ''+acc("ds","Datensicherung")+'<div class="sp">Jede Änderung, jede Nacht und jedes Release wird automatisch gesichert. Aufbewahrt werden die 14 neuesten Sicherungen und alle der letzten 14 Tage. Beim Wiederherstellen wird der aktuelle Stand vorher ebenfalls gesichert.</div><button class="add" data-snap="1">Jetzt sichern</button>'+(HIST.length?HIST.map(function(h){return '<div class="row"><span class="nm">'+f(h.saved_at)+' <span class="sp">· '+esc(h.reason)+'</span></span><button class="x" style="font-size:13px" data-restore="'+h.id+'">Wiederherstellen</button></div>'}).join(""):'<div class="sp" style="margin-top:8px">Noch keine Sicherungen.</div>')+'</div>'}
function reloadState(){return sb.from("league_state").select("data").eq("id","main").maybeSingle().then(function(r){if(r.data&&r.data.data){adopt(r.data.data);try{localStorage.removeItem("ic_dirty")}catch(e){}}HIST=null;render()})}
function loadMem(){MEM=[];sb.from("members").select("user_id,email,role,player,resto,strafen").order("email").then(function(r){MEM=r.data||[];render()})}
// Nur Spielleitung: wer hat noch kein Konto? Massgebend ist die Zuordnung Konto → Spieler unter Benutzer & Rollen
function noAcc(){if(ROLE!="admin"||!MEM||!MEM.length)return "";var L=allP().filter(function(p){return !MEM.some(function(u){return u.player==p})}).sort(function(a,b){return a.localeCompare(b,"de")}),F=MEM.filter(function(u){return !u.player}).length,inv=function(p){return (INVL||[]).filter(function(x){return x.player==p})[0]},N=L.filter(function(p){return !inv(p)}).length;L.sort(function(a,b){return (inv(a)?1:0)-(inv(b)?1:0)});
return acc("na","Spieler ohne Konto <span class=\"sp\">· "+L.length+"</span>",1)+(L.length?'<div class="sp"><b>'+N+'</b> noch ohne Einladung, '+(L.length-N)+' mit offener Einladung. Abgelaufene Einladungen zählen nicht.</div>':'')+(F?'<div class="sp">'+F+(F==1?' Konto ist':' Konten sind')+' noch keinem Spieler zugeordnet. Das lässt sich in der Liste darüber ändern.</div>':'')+(L.length?L.map(function(p){var i=inv(p);return '<div class="row"><span class="nm">'+esc(p)+(i?' <span class="sp">eingeladen, gültig bis '+wd(i.expires_at.slice(0,10))+'</span>':'')+'</span>'+(i?'':'<button class="x" style="font-size:12px" data-invp="'+esc(p)+'">Einladen</button>')+'</div>'}).join(""):'<div class="sp">Alle Spieler haben ein Konto.</div>')+'</div>'}
function users(){if(ROLE!="admin")return "";if(MEM==null){setTimeout(loadMem,0);return ""}var all=S.t[0].p.concat(S.t[1].p).sort(function(a,b){return a.localeCompare(b,"de")});
return acc("us","Benutzer &amp; Rollen <span class=\"sp\">· "+MEM.length+"</span>")+'<div class="sp">Neue Mitglieder lädst du oben unter „Mitglied einladen“ per Link ein; sie erscheinen hier, sobald sie ihr Konto erstellt haben.</div>'+MEM.map(function(u){return '<div class="sk"><b class="nm" style="display:block">'+esc(u.email)+'</b><div class="two" style="margin-top:6px"><select class="t" data-mrole="'+u.user_id+'">'+["player","captain","admin"].map(function(r){return '<option value="'+r+'"'+(u.role==r?" selected":"")+'>'+RL[r]+'</option>'}).join("")+'</select><select class="t" data-mpl="'+u.user_id+'"><option value="">– kein Spieler –</option>'+all.map(function(p){return '<option'+(u.player==p?" selected":"")+'>'+esc(p)+'</option>'}).join("")+'</select></div><label class="row" style="border:0;padding:4px 0 0"><span class="nm sp">🍽️ Restaurant-Chef</span><input type="checkbox" data-mresto="'+u.user_id+'"'+(u.resto?" checked":"")+'></label><label class="row" style="border:0;padding:4px 0 0"><span class="nm sp">⚖️ Strafenchef</span><input type="checkbox" data-mstraf="'+u.user_id+'"'+(u.strafen?" checked":"")+'></label>'+(u.user_id==me.id?'':'<button class="add del" data-mdel="'+u.user_id+'">🗑 Benutzer löschen</button>')+'</div>'}).join("")+invList()+'</div>'}
function setMem(uid,k,v){var u=MEM.filter(function(x){return x.user_id==uid})[0],o=u[k];u[k]=v;sb.rpc("set_member",{uid:uid,new_role:u.role,new_player:u.player||null}).then(function(r){if(r.error){u[k]=o;alert(r.error.message)}else if(uid==me.id){REAL.role=u.role;applyRole();PLAYER=u.player}render()})}
function canTeam(){return ROLE=="admin"||ROLE=="captain"}
// Spielleitung kann die App so ansehen, wie Spieler sie sehen (nur Anzeige – die Rechte prüft der Server)
var REAL={role:"player",resto:false,strafen:false},VIEW=(function(){try{return localStorage.getItem("ic_view")||""}catch(e){return ""}})();
// Zusatzrollen (Restaurant-Chef, Strafenchef) gelten auch in der Spieleransicht
function applyRole(){var pv=REAL.role=="admin"&&VIEW=="player";ROLE=pv?"player":REAL.role;RESTO=REAL.resto;STRAF=REAL.strafen}
function viewBar(){if(PUB||REAL.role!="admin")return "";var pv=VIEW=="player";return '<div class="vw'+(pv?" pv":"")+'" role="group" aria-label="Ansicht"><span class="sp">'+(pv?"Du siehst die App als Spieler":"Ansicht")+'</span><button class="chip'+(pv?"":" on")+'" data-view="admin" aria-pressed="'+!pv+'">🛠 Spielleitung</button><button class="chip'+(pv?" on":"")+'" data-view="player" aria-pressed="'+pv+'">👤 Spieler</button></div>'}
// Termine (nur Spielleitung): Datum und Beginn aller Trainings und Match Days, Trainings einem anderen Monat zuteilen,
// Datum von Winter Event und Sommer Event wählen.
// Der Match Day eines Monats ist immer sein spätester Termin (Block nach Datum sortiert, siehe sortBlock); ändert sich dadurch ein
// Match Day, fragt mdGuard vorher nach. Ein zugeteiltes Training bleibt in seinem Monat, auch wenn sich sein Datum ändert.
// Winter Event: das Training am Datum wevD() (S.wev oder 2. Mittwoch im Dezember), nie ein Match Day.
// Sommer Event: S.evt, ausserhalb der Monate, Datum sevD() (S.sev oder 1. Freitag im Mai).
var TERM=false,TPAST={}; // TPAST[Monat]: vergangene Termine dieses Monats aufgeklappt
function hasRes(i){var r=S.m[i].res;return r[0]!=null||r[1]!=null}
function isWE(x){var e=evOn(x.d);return !!e&&e.n=="Winter Event"}
// Alt-Daten: liegt ein Training nach dem Match Day (vor dieser Regel zugeteilt), bleibt der Block bis zur nächsten Änderung so
function mdLate(T){return T.some(function(x){return x.d>T[T.length-1].d})}
function termRow(i,j){var T=S.m[i].tr,x=T[j],k=i+","+j,md=j==T.length-1,we=!md&&isWE(x),lb=md?'Match Day ⚑':we?'🎉 Winter Event':'Training';
return '<div class="tmr'+(md?' tmd':'')+'"><div class="sp"><b>'+lb+'</b> · '+wd(x.d)+'</div><div class="two"><input class="t" type="date" data-tmd="'+k+'" value="'+esc(x.d)+'" aria-label="Datum '+lb+' '+MON[i]+'"'+(we?' disabled':'')+'><input class="t" type="time" data-tmt="'+k+'" value="'+esc(tstart(x))+'" aria-label="Beginn '+lb+' '+MON[i]+'"></div>'
+(we?'<div class="sp">Datum unten bei „Winter Event“ ändern; der Monat ergibt sich aus dem Datum.</div>':'<select class="t" data-tmm="'+k+'" aria-label="Monat für '+(md?'den Match Day':'das Training')+' vom '+wd(x.d)+'">'+MON.map(function(n,q){return '<option value="'+q+'"'+(q==i?' selected':'')+'>'+n+'</option>'}).join("")+'</select>')+'</div>'}
function evRow(n,k,d,def,extra,hint){return '<div class="tmr tev"><div class="sp"><b>🎉 '+n+'</b> · '+wd(d)+(d==def?' · berechnet':' · gewählt')+'</div><div class="two"><input class="t" type="date" data-'+k+'="1" value="'+esc(d)+'" aria-label="Datum '+n+'">'+extra+'</div><div class="sp">'+hint+'</div></div>'}
function termCard(){if(ROLE!="admin")return "";var h='<div class="card" id="term"><h3>📅 Trainings und Spieldaten</h3>';
if(!TERM)return h+'<div class="sp">Datum und Beginn aller Trainings und Match Days ändern, Trainings einem anderen Monat zuteilen, Event-Daten wählen.</div><button class="add" data-term="1" aria-expanded="false">📅 Trainings und Spieldaten bearbeiten</button></div>';
var e=evTr();
return h+'<div class="sp">Der Match Day ist immer der späteste Termin eines Monats. Ein Training lässt sich einem anderen Monat zuteilen – Anwesenheit, Abmeldungen, Leitung, Gäste und Restaurant bleiben erhalten.</div>'
// Events zuoberst (vor den Monaten), damit die Daten der beiden Anlässe sofort sichtbar sind
+'<div class="sk" id="tev"><div class="tmh"><b>Events</b></div>'
+evRow("Winter Event","wev",wevD(),wevDef(),'','Das Training an diesem Datum ist der Winter Event (ohne Leitung). Gibt es dort noch kein Training, wandert das bisherige mit Anwesenheit dorthin. Ohne Wahl: 2. Mittwoch im Dezember.')
+evRow("Sommer Event","sev",e.d,sevDef(),'<input class="t" type="time" data-sevt="1" value="'+esc(tstart(e))+'" aria-label="Beginn Sommer Event">','Gehört zu keinem Monat. Ohne Wahl: 1. Freitag im Mai.')+'</div>'
+S.m.map(function(m,i){return '<div class="sk tmb" data-tmb="'+i+'"><div class="tmh"><b>'+MON[i]+'</b>'+(hasRes(i)?' <span class="sp">· Resultat eingetragen</span>':'')+(m.tr.length&&mdLate(m.tr)?' <span class="sp">· ⚠ Training nach dem Match Day – bei der nächsten Änderung wird der späteste Termin Match Day</span>':'')+'</div>'+(m.tr.length?(function(){var np=m.tr.filter(function(x){return x.d<TD}).length,op=!!TPAST[i];return (np?'<button class="lnk tpast" data-tpast="'+i+'" aria-expanded="'+op+'">'+(op?"▾ ":"▸ ")+np+(np==1?" vergangener Termin":" vergangene Termine")+(op?" ausblenden":" anzeigen")+'</button>':'')+m.tr.map(function(x,j){return x.d<TD&&!op?'':termRow(i,j)}).join("")})():'<div class="sp">Noch keine Trainings und kein Match Day.</div>')+'</div>'}).join("")
+'<button class="add" data-term="1" aria-expanded="true">✓ Fertig bearbeitet</button></div>'}
// Winter Event auf ein anderes Datum: gibt es dort ein Training, wird es der Event (das bisherige bleibt ein normales Training);
// sonst wandert das bisherige Event-Training mit seinen Daten dorthin (in den Block nach Datum). In der Saison, nie am Match Day.
function setWev(v){var Y=sy(),od=wevD(),ow=S.wev,put=function(){if(v==wevDef())delete S.wev;else S.wev=v};if(v==od)return false;
if(v<Y+"-09-01"||v>(Y+1)+"-04-30"){alert("Der Winter Event muss in der Saison liegen (September bis April).");return false}
if(isMD(v)){alert("Am "+wd(v)+" ist ein Match Day – der Winter Event kann nicht am Match Day sein.");return false}
if(v==sevD()){alert("Am "+wd(v)+" ist der Sommer Event.");return false}
var at=function(d){return allTr().filter(function(r){return !r.xe&&r.x.d==d})[0]},nx=at(v),ox=at(od);
if(nx||!ox||ox.md){put();toast("🎉 Winter Event am "+wd(v)+(nx?"":" (noch kein Training an diesem Datum)")+".");return true}
if(!mdGuard(function(){put();S.m[ox.mi].tr.splice(ox.ti,1);ox.x.d=v;placeTr(ox.x)})){if(ow==null)delete S.wev;else S.wev=ow;return false}
if(sb)sb.from("absence_reasons").update({d:v}).eq("d",od).then(function(){ABS=null;render()});toast("🎉 Winter Event vom "+wd(od)+" auf den "+wd(v)+" verschoben.");return true}
// Sommer Event: nicht an einem Training; S.evt.d folgt über evTr() dem gewählten Datum
function setSev(v){var Y=sy(),od=sevD();if(v==od)return false;
if(v<Y+"-09-01"||v>(Y+1)+"-08-31"){alert("Der Sommer Event muss in der Saison liegen (September bis August).");return false}
if(allTr().some(function(r){return !r.xe&&r.x.d==v})){alert("Am "+wd(v)+" gibt es schon ein Training.");return false}
if(v==sevDef())delete S.sev;else S.sev=v;evTr();if(sb)sb.from("absence_reasons").update({d:v}).eq("d",od).then(function(){ABS=null;render()});toast("🎉 Sommer Event am "+wd(v)+".");return true}
document.addEventListener("click",function(e){var p=e.target.closest&&e.target.closest("#term [data-tpast]");if(p){var q=+p.dataset.tpast;TPAST[q]=!TPAST[q];render();var c=document.querySelector('#term [data-tpast="'+q+'"]');if(c)c.focus({preventScroll:true})}});
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("#app [data-term]");if(!b||ROLE!="admin")return;TERM=!TERM;render();var c=document.querySelector("#term [data-term]");if(c)c.focus({preventScroll:!TERM})});
document.addEventListener("change",function(e){var t=e.target,D=t.dataset||{},v=String(t.value||"").trim();if(!t.closest||!t.closest("#term"))return;
if(D.wev!=null||D.sev!=null||D.sevt!=null){if(ROLE!="admin"||!v){render();return}var ok;
if(D.sevt!=null){ok=/^\d{2}:\d{2}$/.test(v);if(ok)evTr().t=v}else ok=isDay(v)&&(D.wev!=null?setWev(v):setSev(v));
if(ok){TSEL=null;save()}render();return}
var k=D.tmd||D.tmt||D.tmm;if(k==null)return;if(ROLE!="admin"){render();return}
var a=k.split(","),mi=+a[0],T=S.m[mi].tr,ti=+a[1],x=T[ti],md=ti==T.length-1;if(!x||!v){render();return}
if(D.tmt!=null){if(!/^\d{2}:\d{2}$/.test(v)){render();return}x.t=v}
else if(D.tmd!=null){if(isWE(x)||!isDay(v)){render();return}if(v==x.d)return;if(allTr().some(function(r){return r.x.d==v})){alert("Am "+wd(v)+" gibt es schon ein Training.");render();return}
var od=x.d;if(!mdGuard(function(){x.d=v;sortBlock(T)})){render();return}if(sb)sb.from("absence_reasons").update({d:v}).eq("d",od).then(function(){ABS=null;render()})}
else{var to=+v;if(isWE(x)||to==mi||!S.m[to]){render();return}var R=[mi,to].filter(hasRes).map(function(i){return MON[i]});
if(R.length&&!confirm("Im "+R.join(" und im ")+" ist schon ein Resultat eingetragen. Das Verschieben ändert dort Anwesenheitsbonus, Team-Duell und Spieler des Monats.\n\n"+(md?"Match Day":"Training")+" vom "+wd(x.d)+" trotzdem von "+MON[mi]+" nach "+MON[to]+" verschieben?")){render();return}
if(!mdGuard(function(){T.splice(ti,1);insTr(to,x)})){render();return}toast("📅 "+(md?"Match Day":"Training")+" vom "+wd(x.d)+" gehört jetzt zum "+MON[to]+(md&&S.m[mi].tr.length?" – im "+MON[mi]+" ist neu der späteste verbliebene Termin Match Day.":"."))}
TSEL=null;save();render()});
