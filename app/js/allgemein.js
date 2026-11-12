// Begrüssung, Hilfsfunktionen, Akkordeon, Mail-Test, Vorschläge, Installation
// Begrüssung je nach Tageszeit und Anlass; Varianten wechseln täglich (pro Person stabil, kein Flackern)
// Wer im Leaderboard vorne ist, wird an manchen Tagen mit Titel begrüsst (z. B. „Hallo Knipser Silvan!“)
var LT={att:[["Hallo Anwesenheitskönig","Hoi Trainingsweltmeister","Salü Dauerbrenner","Hallo Mister 100 Prozent"],"👑"],sk:[["Hallo Topskorer","Hoi Punktesammler","Salü Skorerkönig","Hallo Spielmacher"],"🏆"],g:[["Hallo Knipser","Hoi Torjäger","Salü Goalgetter","Hallo Vollstrecker"],"🎯"]};
// Hat in den letzten 3 bestätigten Trainings gefehlt
function missing(){if(!PLAYER)return false;var L=allTr().filter(function(r){return r.x.d<TD&&r.x.p.length}).slice(-3);return L.length==3&&L.every(function(r){return r.x.p.indexOf(PLAYER)<0})}
function leadTitle(k){if(!PLAYER)return null;var C=[];if(leaders(function(q){return tot("att",q)}).indexOf(PLAYER)>=0)C.push("att");if(leaders(function(q){return tot("g",q)+tot("a",q)}).indexOf(PLAYER)>=0)C.push("sk");if(leaders(function(q){return tot("g",q)}).indexOf(PLAYER)>=0)C.push("g");
if(!C.length||pick([1,1,0],k+"lt")==0)return null;var c=LT[pick(C,k+"c")];return [pick(c[0],k),c[1]]}
// Kurze Meldung unten am Bildschirm (6 s, antippen schliesst sie)
var TT=null;function toast(t){var e=document.getElementById("toast");e.innerHTML=t;e.hidden=false;e.classList.remove("in");void e.offsetWidth;e.classList.add("in");clearTimeout(TT);TT=setTimeout(function(){e.hidden=true},6000)}
document.addEventListener("click",function(e){if(e.target.id=="toast"){clearTimeout(TT);e.target.hidden=true}});
// Messen in St. Gallen (Daten jedes Jahr hier nachtragen; OLMA 2027 noch nicht offiziell bestätigt)
var FAIR=[["OLMA","2026-10-08","2026-10-18","🐄"],["OFFA","2027-04-21","2027-04-25","🌷"],["OLMA","2027-10-14","2027-10-24","🐄"]];
var GR={morgen:["Guten Morgen","Hallo","Hoi"],tag:["Hallo","Hoi","Salü"],abend:["Guten Abend","Hallo","Hoi"],bier:["Viel Spass beim Bier","Prost","Zum Wohl"]};
function pick(a,k){var x=0;for(var i=0;i<k.length;i++)x=(x*31+k.charCodeAt(i))%9973;return a[x%a.length]}
function hello(){var u=me&&me.user_metadata||{},n=(PLAYER||u.full_name||u.name||"").split(" ")[0]||(me&&me.email||"").split("@")[0].split(/[._+-]/)[0],d=new Date(),h=d.getHours(),mi=h*60+d.getMinutes();n=n?n.charAt(0).toUpperCase()+n.slice(1):"";
var w=n?"Hallo "+n:"Hallo",sp=n?" "+n:"",k=TD+n,T=allTr().filter(function(r){return r.x.d==TD})[0],st=T?(function(t){return +t.slice(0,2)*60+ +t.slice(3,5)})(tstart(T.x)):0;
if(PREV&&Date.now()-new Date(PREV).getTime()>30*864e5)return w+", willkommen zurück!";
if(T&&mi>=st+105&&mi<24*60)return pick(GR.bier,k)+sp+"! 🍺";
if(T&&mi>=st-30)return T.md?"Guter Match"+sp+"! ⚑":"Gutes Training"+sp+"! 🏑";
if(h>=23||h<4)return "Hallo Nachtschwärmer"+sp+"! 🌙";
if(T)return T.md?w+", heute ist Match Day! ⚑":w+", heute ist Training! 🏑";
if(h<7)return "Hallo Frühaufsteher"+sp+"! ☀️";
var fa=FAIR.filter(function(f){return TD>=f[1]&&TD<=f[2]})[0];if(fa&&pick([1,1,0],k+"fa"))return pick(["Schöne ","Viel Spass an der "],k)+fa[0]+sp+"! "+fa[3];
if(d.getDay()==5&&pick([1,0],k+"fr"))return "Happy Friday"+sp+"! 🎉";
var lt=leadTitle(k);if(lt)return lt[0]+sp+"! "+lt[1];
if(missing()&&pick([1,0],k+"mw"))return pick(["Hallo"+sp+", komm mal wieder ins Training!","Hoi"+sp+", wir vermissen dich im Training!","Salü"+sp+", das Training wartet auf dich!"],k)+" 🏑";
return pick(h<11?GR.morgen:h<18?GR.tag:GR.abend,k)+sp+"!"}
var CUT=null; // gesetzt: Stand vor diesem Datum (für ▲/▼ in der Rangliste)
// Öffentliche Sicht (public_league): pro Training nur die Anzahl (n), pro Monat die Anwesenheit pro Spieler (m.anw). Ohne Namenslisten und ohne Trainingsserie (🔥 nur für Mitglieder).
function sums(){return S.m.some(function(m){return !!m.anw})}
// 100% im abgeschlossenen Monat: alle Termine besucht, auch die vor der App übernommenen (base). Der Match Day zählt, sobald er bestätigt ist.
function full(m,p){var T=m.tr,pre=Math.max.apply(null,[0].concat(Object.values(m.base)));return T.length>0&&T.every(function(x){return (x.d<TD||x.d==TD&&confOpen(x))&&(m.anw||x.p.indexOf(p)>=0)})&&(!m.anw||(m.anw[p]||0)-(m.base[p]||0)==T.length)&&(m.base[p]||0)>=pre}
// Trainings-Serie: bestätigte Trainings in Folge (Match Days zählen, ohne Bestätigung zählt ein Training nicht). Nur für Mitglieder: in der öffentlichen Sicht keine Serie.
var SK=null;function streak(p){if(!SK&&sums())SK={};if(!SK){SK={};var T=allTr().filter(function(r){return !r.xe&&r.x.d<=TD&&r.x.p.length});allP().forEach(function(q){var n=0,b=0;T.forEach(function(r){n=r.x.p.indexOf(q)>=0?n+1:0;if(n>b)b=n});SK[q]={n:n,b:b}})}return SK[p]||{n:0,b:0}}
function fire(p){var n=streak(p).n;return n>=3?' <span class="fire" title="'+n+' Trainings in Folge">🔥'+n+'</span>':''}
function fullBadge(p){var ms=MON.filter(function(n,i){return full(S.m[i],p)});return ms.length?'<span class="fm" title="100% Anwesenheit: '+ms.join(", ")+'">💯🎉'+(ms.length>1?"×"+ms.length:"")+'</span>':""}
function an(m,p){if(m.anw)return m.anw[p]||0;return (m.base[p]||0)+m.tr.filter(function(x){return x.d<=TD&&(!CUT||x.d<CUT)&&x.p.indexOf(p)>=0}).length}
function lastEv(){var l="";S.m.forEach(function(m){m.tr.forEach(function(x){if(x.d<=TD&&x.d>l)l=x.d})});return l}
function sum(m,t){return S.t[t].p.reduce(function(a,p){return a+an(m,p)},0)}
function avg(m,t){var n=S.t[t].p.length;return n?sum(m,t)/n:0}
function bonus(m){var a=avg(m,0),b=avg(m,1);return a>b?[1,0]:b>a?[0,1]:a>0?[1,1]:[0,0]}
function lead(m){var b=bonus(m);return[b[0]+m.pre[0],b[1]+m.pre[1]]}
function win(m){return m.res[0]==null||m.res[1]==null||m.res[0]==m.res[1]?-1:m.res[0]>m.res[1]?0:1}
function pts(from,to){var r=[0,0];for(var i=from;i<=to;i++){var m=S.m[i],f=DBL.indexOf(i)>=0?2:1;if(m.res[0]==null||m.res[1]==null)continue;if(m.res[0]==m.res[1]){r[0]+=f;r[1]+=f}else r[m.res[0]>m.res[1]?0:1]+=f}return r}
// Nur echte, in der App erzeugte Bilder zulassen – verhindert eingeschleusten Code über Bild-Attribute
function img(u){return typeof u=="string"&&/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(u)?u:""}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function stp(k,t,p,v,full){return '<div class="st"><button data-k="'+k+'" data-t="'+t+'" data-p="'+esc(p)+'" data-d="-1">−</button><span>'+v+'</span><button data-k="'+k+'" data-t="'+t+'" data-p="'+esc(p)+'" data-d="1"'+(full?' disabled':'')+'>+</button></div>'}
// Pre-Games: jedes Team nimmt höchstens 3 Punkte mit (Unentschieden: beide Teams +1)
function preFull(m,t){return m.pre[t]>=3}
function gsum(m,t){return S.t[t].p.concat(m.gs.filter(function(g){return g.t==t}).map(function(g){return g.k})).reduce(function(a,p){return a+(m.g[p]||0)},0)}
function im(k,src,lab){return '<div class="row" style="border:0"><span class="logo">'+(src?'<img src="'+img(src)+'">':'')+'</span><label class="add" style="margin:0;flex:1;text-align:center">'+lab+'<input type="file" accept="image/*" data-img="'+k+'" hidden></label>'+(src?'<button class="bd" data-rmimg="'+k+'">🗑</button>':'')+'</div>'}
function gen(){return '<div class="card"><h3>Allgemein</h3><div class="sp">Saison</div><input class="t" data-sn="1" placeholder="z. B. 26/27" value="'+esc(S.sn)+'">'+im("club",S.logo,"Club-Logo wählen")+im("sp",S.sp,"Teamsponsor-Bild wählen")+(ROLE=="admin"?'<button class="add" data-arch="1">📦 Saison ins Spielerarchiv übernehmen</button><div class="sp">Am Saisonende: speichert Tore, Skorerpunkte, Trainings und Spieler des Monats jedes Spielers fürs Profil.</div><label class="add blk">📥 Frühere Saisons importieren (Datei)<input type="file" accept=".json,application/json" data-pimp="1" hidden></label><div class="sp">JSON-Datei mit Saisonwerten pro Spieler. Einträge mit gleicher Saison und gleichem Spieler werden ersetzt.</div>':'')+'</div>'}
// Aufklappbare Karten (Akkordeon), standardmässig zugeklappt
var ACC={};function acc(k,t,dflt,cls){var o=ACC[k]==null?!!dflt:ACC[k];return '<div class="card'+(o?'':' cl')+'"><h3 data-acc="'+k+'"'+(cls?' class="'+cls+'"':'')+'>'+t+'</h3>'}
// Spielleitung: prüft die Mail-Einrichtung (SMTP/Mailomat oder Brevo) mit einer Beispiel-Mail fürs nächste Training an die eigene Adresse
// Kopie der Trainingsleitungs-Mail: pro Spielleitung ein- und ausschaltbar (Standard: ein)
var LEADCC=true;
document.addEventListener("change",function(e){if(!e.target.dataset||!e.target.dataset.leadcc||!sb)return;var on=e.target.checked,c=e.target;c.disabled=true;sb.rpc("set_lead_cc",{on_cc:on}).then(function(r){c.disabled=false;if(r.error){c.checked=!on;alert("Nicht gespeichert: "+r.error.message);return}LEADCC=on;toast(on?"✉️ Du bekommst die Mails an die Trainingsleitung in Kopie.":"Keine Kopie mehr der Mails an die Trainingsleitung.")})});
function mailCard(){if(ROLE!="admin")return "";return acc("mt","Mail und Benachrichtigung testen")+'<div class="sp">Schickt dir die Mail, die die Trainingsleitung beim Abmeldeschluss des nächsten Trainings bekommt – zum Prüfen der Einrichtung (Brevo).</div><label class="ccl"><input type="checkbox" data-leadcc="1"'+(LEADCC?" checked":"")+'> Mails an die Trainingsleitung in Kopie (CC) erhalten</label><button class="add" data-tmail="1">✉️ Test-Mail an mich</button><div class="sp" style="margin-top:8px">Schickt eine Push-Nachricht an alle deine Geräte, auf denen Benachrichtigungen aktiviert sind.</div><button class="add" data-tpush="1">🔔 Test-Benachrichtigung an mich</button></div>'}
function bkCard(){return acc("bk","Backup")+'<div class="sp">Die Daten liegen in der Cloud und werden automatisch gesichert. Hier kannst du zusätzlich eine Kopie als Datei speichern oder laden.</div><button class="add" data-exp="1">Backup speichern / teilen</button><label class="add blk">Backup laden<input type="file" accept=".json,application/json" data-imp="1" hidden></label></div>'}
function nthWd(y,mo,wd,n){var d=new Date(y,mo,1);while(d.getDay()!=wd)d.setDate(d.getDate()+1);d.setDate(d.getDate()+7*(n-1));return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function sy(){var x=/^(\d\d)\/\d\d$/.exec(S.sn);return x?2000+ +x[1]:+TD.slice(0,4)-(+TD.slice(5,7)<8?1:0)}
function mst(n,z,a,b,v){var p=pts(a,b),d=true;for(var i=a;i<=b;i++)if(S.m[i].res[0]==null||S.m[i].res[1]==null)d=false;var c=d&&p[0]!=p[1]?(p[0]>p[1]?0:1):-1;return '<div class="kv"><span>'+n+' ('+z+')</span><b>'+p[0]+' : '+p[1]+'</b></div>'+(c>=0?'<div class="kv"><span>🏆 '+n+'</span><b class="'+(c?"tb":"ta")+'">'+(S.t[c].img?'<img class="sl" src="'+img(S.t[c].img)+'">':'')+esc(S.t[c].n)+'</b></div>':d?'<div class="kv"><span>🏆 '+n+'</span><b>Unentschieden</b></div>':'')+(c>=0&&v?'<div class="sp" style="text-align:right;margin-bottom:4px">'+esc(S.t[1-c].n)+' organisiert '+v+'</div>':'')}
function nextMD(){var r=null;S.m.forEach(function(m,i){var d=m.tr.length?m.tr[m.tr.length-1].d:null;if(d&&d>=TD&&(!r||d<r.d))r={d:d,i:i}});return r}
function wd(d){return ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(d+"T12:00:00").getDay()]+", "+fd(d)}
function ablauf(m){var d=m.tr.length?m.tr[m.tr.length-1].d:null;if(!d)return "";return '<div class="card"><h3>Ablauf Matchtag · '+wd(d)+'</h3>'+[["18:45","Einlaufen / Einschiessen"],["18:55","3 × Pre-Game à 10 min, dazwischen 5 min Pause"],["19:40","Hauptmatch à 20 min (letzte 3 min effektiv)"],["20:30","Matchtag im Restaurant ausklingen lassen"]].map(function(x){return '<div class="kv"><b style="min-width:52px">'+x[0]+'</b><span style="flex:1">'+x[1]+'</span></div>'}).join("")+(d>=TD?avail(m.tr[m.tr.length-1]):'')+'</div>'}
// Wer ist am Matchtag dabei? (Abmeldungen der Spieler)
function avail(x){var ab=x.ab||[];return '<div class="sk">'+[0,1].map(function(t){var P=S.t[t].p,o=P.filter(function(p){return ab.indexOf(p)>=0});return '<div class="kv"><span class="'+(t?"tb":"ta")+'">'+esc(S.t[t].n)+'</span><b>'+(P.length-o.length)+' von '+P.length+' dabei</b></div>'+(o.length?'<div class="sp" style="text-align:right">abgemeldet: '+o.map(esc).join(", ")+'</div>':'')}).join("")+'</div>'}
// ── Verbesserungsvorschläge → GitHub-Issue (über die Edge Function "feedback") ──
var FBD={kind:"idee",title:"",text:""},FBM=null,FBL=null;
var FBS={neu:"wird erfasst …",erfasst:"Issue",fehler:"Fehler beim Erfassen",umgesetzt:"✓ umgesetzt",geschlossen:"erledigt"};
// Hinweis, wenn ein eigener Vorschlag umgesetzt wurde (einmal pro Vorschlag, Mail schickt der Server)
function fbDone(){sb.from("feedback").select("id,title,status").order("created_at",{ascending:false}).limit(10).then(function(r){var seen=[];try{seen=JSON.parse(localStorage.getItem("ic_fbseen")||"[]")}catch(e){}var d=(r.data||[]).filter(function(x){return x.status=="umgesetzt"&&seen.indexOf(x.id)<0})[0];if(!d)return;toast((/^🐞/.test(d.title)?"🎉 Danke für deinen Hinweis! ":"🎉 Danke für deine coole Idee! ")+"„"+esc(d.title)+"“ wurde umgesetzt.");try{localStorage.setItem("ic_fbseen",JSON.stringify(seen.concat(d.id)))}catch(e){}})}
function fbList(){if(FBL==null){FBL=[];sb.rpc("recent_feedback").then(function(r){FBL=r.data||[];if(FBL.length)render()})}
if(!FBL.length)return "";return '<div class="sk"><div class="sp" style="margin-bottom:4px">Letzte Vorschläge</div>'+FBL.map(function(x){return '<div class="row"><span class="nm">'+esc(x.title)+(x.mine?' <span class="sp">· von dir</span>':'')+'</span><span class="sp">'+(x.status=="erfasst"&&x.issue_url?'<a href="'+esc(x.issue_url)+'" target="_blank" rel="noopener">Issue #'+x.issue_number+'</a>':esc(FBS[x.status]||x.status))+'</span></div>'}).join("")+'</div>'}
function fbCard(){return '<div class="card"><h3>Verbesserungsvorschlag</h3><div class="sp">Idee oder Fehler? Dein Vorschlag wird als GitHub-Issue erfasst, und wir lösen ihn gemeinsam.</div><form id="fb"><div class="pt">'+[["idee","💡 Idee"],["fehler","🐞 Fehler"]].map(function(k){return '<button type="button" class="pb'+(FBD.kind==k[0]?" on":"")+'" data-fbk="'+k[0]+'">'+k[1]+'</button>'}).join("")+'</div><input class="t" name="title" aria-label="Titel" placeholder="Kurzer Titel" maxlength="100" minlength="3" required value="'+esc(FBD.title)+'"><textarea class="t" name="text" aria-label="Beschreibung" placeholder="Was soll besser werden? (optional)" maxlength="4000" style="margin-top:8px">'+esc(FBD.text)+'</textarea><button class="add">Vorschlag senden</button>'+(FBM?'<div class="sp fbm" style="margin-top:8px">'+FBM+'</div>':'')+'</form>'+fbList()+'</div>'}
document.addEventListener("input",function(e){var f=e.target.form;if(f&&f.id=="fb")FBD[e.target.name]=e.target.value});
document.addEventListener("submit",function(e){if(e.target.id!="fb")return;e.preventDefault();var B=e.target.querySelector("button.add");B.disabled=true;
act(1);sb.functions.invoke("feedback",{body:{kind:FBD.kind,title:FBD.title,text:FBD.text}}).then(function(r){var c=r.error&&r.error.context;return c&&c.json?c.json().then(function(d){return{error:r.error,data:d}},function(){return r}):r}).then(function(r){
if(r.error||!r.data||!r.data.queued){FBM="Senden fehlgeschlagen"+(r.data&&r.data.error?": "+esc(r.data.error):".")}else{FBM="Danke! Dein Vorschlag wird in wenigen Minuten als GitHub-Issue erfasst.";FBD={kind:"idee",title:"",text:""};FBL=null}render()})});
// App installieren: Android/Chrome über den Installations-Dialog, iPhone mit Anleitung (Safari erlaubt keinen Dialog)
var INST=null;
window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();INST=e;if(tab=="info")render()});
window.addEventListener("appinstalled",function(){INST=null;if(tab=="info")render()});
function isApp(){return (window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true}
function installCard(){if(isApp())return "";var ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
return '<div class="card inst"><h3>📲 App installieren</h3><div class="sp">Auf dem Startbildschirm startet Herren Inter wie eine richtige App: schneller, im Vollbild und mit Push-Nachrichten.</div>'
+(INST?'<button class="add" data-inst="1">📲 Jetzt installieren</button>'
:ios?'<ol class="steps"><li>Diese Seite in <b>Safari</b> öffnen</li><li>Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil nach oben)</li><li><b>Zum Home-Bildschirm</b> wählen</li><li>Oben rechts auf <b>Hinzufügen</b> tippen</li></ol>'
:'<ol class="steps"><li>Diese Seite in <b>Chrome</b> öffnen</li><li>Oben rechts auf das Menü <b>⋮</b> tippen</li><li><b>App installieren</b> bzw. <b>Zum Startbildschirm hinzufügen</b> wählen</li></ol>')+'</div>'}
