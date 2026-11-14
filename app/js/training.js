// Training: Leitung, An-/Abmeldung, Übersichten, Restaurant, Strafen
// Trainingsleitung: jedes Training ausser dem Match Day leitet ein Spieler. Einteilen kann nur die Spielleitung;
// alle anderen tragen unter „Meine Trainings“ nur sich selbst ein („Ich leite“/„Übernehmen“) oder wieder aus (der Server prüft das auch, keep_leads)
// Torhüter sind pro Team markiert (t.gk), Gastspieler pro Training (x.gs = [{n, gk}])
function isGK(p){return S.t.some(function(t){return (t.gk||[]).indexOf(p)>=0})}
function gkTag(p){return (isGK(p)?' <span title="Torhüter">🧤</span>':'')+crown(p)}
// 👑 führt die Anwesenheit an, Unihockey-Ball = meiste Skorerpunkte (Saison); bei Gleichstand mehrere; pro Darstellung einmal berechnet
var CRW=null;function leaders(fn){var P=allP(),v=P.map(fn),mx=Math.max.apply(null,v.concat(0));return mx>0?P.filter(function(q,i){return v[i]==mx}):[]}
function crown(p){if(!CRW)CRW={a:leaders(function(q){return tot("att",q)}),s:leaders(function(q){return tot("g",q)+tot("a",q)})};return (CRW.a.indexOf(p)>=0?' <span class="crw" title="Führt die Anwesenheit an">👑</span>':'')+(CRW.s.indexOf(p)>=0?' <span class="sko" title="Meiste Skorerpunkte" role="img" aria-label="Meiste Skorerpunkte">'+BALL+'</span>':'')}
// Kennzeichnung in Listen: C = Captain, 🧤 = Torhüter
function tags(p){return (S.t.some(function(t){return t.c==p})?' <b class="cpt" title="Captain">C</b>':'')+gkTag(p)}
// Wer kommt: vor Trainingsbeginn die Angemeldeten, danach die Bestätigten (falls schon bestätigt)
function trCount(x){var P=allP(),pl=confOpen(x)&&x.p.length?P.filter(function(p){return x.p.indexOf(p)>=0}):P.filter(function(p){return !isOff(x,p)}),gs=x.gs||[];
var gk=pl.filter(isGK).length+gs.filter(function(g){return g.gk}).length;return {all:pl.length+gs.length,gk:gk,field:pl.length+gs.length-gk,guests:gs.length}}
// Kurzübersicht unter „Meine Trainings“ (#102): wie viele kommen, über alle Teams, ohne Namen ausser verspätet/unsicher
var TSUM=null;
// Wer kommt (alle Teams + Gäste): Torhüter/Feldspieler gezählt, Verspätete und Unsichere – für die Kurzübersicht und die WhatsApp an die Leitung
function trWho(x){var P=allP(),pl=confOpen(x)&&x.p.length?P.filter(function(p){return x.p.indexOf(p)>=0}):P.filter(function(p){return !isOff(x,p)}),gs=(x.gs||[]).filter(function(g){return g&&g.n}),
gG=gs.filter(function(g){return g.gk}).length,gk=pl.filter(isGK).length+gG,nm=function(st){return pl.filter(function(p){return stOf(x,p)==st})};return {P:P,pl:pl,gs:gs,gG:gG,gk:gk,field:pl.length+gs.length-gk,v:nm("v"),u:nm("u")}}
function trSum(x,k){var w=trWho(x),P=w.P,pl=w.pl,gs=w.gs,gG=w.gG,v=w.v,u=w.u,gk=P.filter(isGK),f=P.filter(function(p){return !isGK(p)}),on=function(L){return pl.filter(function(p){return L.indexOf(p)>=0}).length},
row=function(l,a,b,c){return '<tr'+(c?' class="'+c+'"':'')+'><th scope="row">'+l+'</th><td><b>'+a+'</b> / '+b+'</td></tr>'};
return '<div class="tsum"><table class="mt"><tbody>'+row("🧤 Torhüter",w.gk,gk.length+gG)+row("Feldspieler",w.field,f.length+gs.length-gG)
+S.t.map(function(t,i){return row(esc(t.n),on(t.p),t.p.length,i?"tb":"ta")}).join("")
+(v.length?'<tr class="tsn"><th scope="row">⏰ Verspätet</th><td>'+v.map(esc).join(", ")+'</td></tr>':'')
+(u.length?'<tr class="tsn"><th scope="row">❔ Unsicher</th><td>'+u.map(esc).join(", ")+'</td></tr>':'')+'</tbody></table>'
+(gs.length?'<div class="sp">inkl. '+gs.length+(gs.length==1?' Gast':' Gäste')+'</div>':'')
+'<button class="lnk tdl" data-tjump="'+k+'">Details mit allen Namen</button></div>'}
function guestField(x){var G=x.gs||[],c=trCount(x);return '<div class="sk"><div class="kv"><b>Gastspieler</b><span class="sp">'+G.length+'</span></div><div class="pt">'+(G.map(function(g,i){return '<span class="pb in">'+esc(g.n)+(g.gk?' 🧤':'')+(me?' <button class="bd" data-tgdel="'+i+'" aria-label="'+esc(g.n)+' entfernen">🗑</button>':'')+'</span>'}).join("")||'<span class="sp">–</span>')+'</div>'
+(me?'<form id="tgs" class="tgs"><input class="t" name="n" placeholder="Name Gastspieler" aria-label="Name Gastspieler" maxlength="60" required><label class="gkl"><input type="checkbox" name="gk"> 🧤 Torhüter</label><button class="add">+ Gast</button></form>':'')+'</div>'
+'<div class="tot" data-tot>Total '+c.field+' Feldspieler · '+c.gk+' Torhüter'+(c.guests?' (inkl. '+c.guests+(c.guests==1?' Gast':' Gäste')+')':'')+'</div>'}
function allP(){return S.t[0].p.concat(S.t[1].p).sort(function(a,b){return a.localeCompare(b,"de")})}
// Statistik Trainingsleitung (Teams-Tab): geleitete und geplante Trainings pro Spieler, Match Days zählen nicht
// WhatsApp-Aufruf für Trainings ohne Leitung; der Link öffnet direkt „Meine Trainings“
function trLink(){return location.origin+location.pathname+"#trainings"}
function leadWa(L){var t=!L.length?"🙌 Alle kommenden Trainings haben eine Leitung – danke!\nWer auch mal leiten möchte: unter Meine Trainings „Ich leite“ tippen.\n"+trLink():"🙋 Wer leitet ein Training?\nFür "+(L.length==1?"dieses Training":"die nächsten "+L.length+" Trainings")+" fehlt noch eine Leitung:\n"+L.map(function(r){return "• "+wd(r.x.d)+", "+tstart(r.x)}).join("\n")+"\n\nÜbernimm eines mit „Ich leite“ unter Meine Trainings – danke! 💪\n"+trLink();return "https://wa.me/?text="+encodeURIComponent(t)}
// Spielleitung: nächstes Training mit Leitung (Match Day/Winter Event zählen nicht) – Info an die eingeteilte Person per WhatsApp, Zahlen wie in der Kurzübersicht
function nextLead(){return allTr().filter(function(r){return !noLead(r)&&!started(r.x)})[0]||null}
function leadInfoWa(x){var w=trWho(x),t="Hallo "+String(x.lead).split(" ")[0]+" 👋\nDu leitest das Training am "+wd(x.d)+", "+tstart(x)+" Uhr – danke! 🙌\n\nStand jetzt: "+w.field+" Feldspieler und "+w.gk+" Torhüter angemeldet"+(w.v.length?" · Verspätet: "+w.v.length:"")+(w.u.length?" · Unsicher: "+w.u.length:"")
+"\nBeim Abmeldeschluss (23 h vorher) bekommst du die definitive Zahl per Mail und Push.\n\nDenk an Einlaufen, Passübungen und deine 3 Übungen.\nAlle Details in der App:\n"+trLink();return "https://wa.me/?text="+encodeURIComponent(t)}
function leadInfoBtn(r){var n=ROLE=="admin"&&r.x.lead&&nextLead();return n&&n.x===r.x?'<a class="add wa lwa" data-lwa="1" href="'+esc(leadInfoWa(r.x))+'" target="_blank" rel="noopener">💬 Leitung per WhatsApp informieren</a>':''}
// WhatsApp-Knopf mit den nächsten drei Trainings ohne Leitung
function waBtn(){var OL=allTr().filter(function(r){return !noLead(r)&&!started(r.x)&&!r.x.lead}).sort(function(a,b){return a.x.d<b.x.d?-1:a.x.d>b.x.d?1:0});return '<a class="add wa" data-wa="1" href="'+esc(leadWa(OL.slice(0,3)))+'" target="_blank" rel="noopener">💬 Per WhatsApp um Leitung bitten</a>'}
// Statistik; den WhatsApp-Knopf zeigt sie nur, wo es keine Karte zum Einteilen gibt (wa=true)
function leadStats(wa){var T=allTr().filter(function(r){return !noLead(r)}),c={},OL;S.t.forEach(function(t,k){t.p.forEach(function(p){c[p]={p:p,k:k,d:0,f:0}})});
T.forEach(function(r){var z=c[r.x.lead];if(z){if(started(r.x))z.d++;else z.f++}});
var L=Object.keys(c).map(function(p){return c[p]}).sort(function(a,b){return b.d-a.d||b.f-a.f||a.p.localeCompare(b.p,"de")}),mx=Math.max(1,L.length?L[0].d:0),
OL=T.filter(function(r){return !started(r.x)&&!r.x.lead}).sort(function(a,b){return a.x.d<b.x.d?-1:a.x.d>b.x.d?1:0}),open=OL.filter(function(r){return r.x.d<=addDays(TD,28)}).length;
return acc("lst","Trainingsleitung · Statistik"+(open?" · ⚠️ "+open+" ohne Leitung":""),0)+'<div class="sp">Geleitete Trainings pro Spieler, dahinter bereits übernommene kommende Trainings. Match Days und Events zählen nicht.</div>'
+(open?'<div class="uc" style="margin-top:6px">⚠️ '+(open==1?'1 Training':open+' Trainings')+' in den nächsten 4 Wochen noch ohne Leitung</div>':'')+(wa?waBtn():'')
+L.map(function(r){return '<div class="row" data-lst="'+esc(r.p)+'"><span class="nm wr '+(r.k?"tb":"ta")+'">'+esc(r.p)+tags(r.p)+'</span><div class="bar sm"><div style="width:'+r.d/mx*100+'%"></div></div><b>'+r.d+'</b><span class="sp lf">'+(r.f?'+'+r.f+' geplant':'')+'</span></div>'}).join("")+'</div>'}
function addDays(d,n){var x=new Date(d+"T12:00:00");x.setDate(x.getDate()+n);return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0")}
function leadCard(){if(ROLE!="admin")return "";var L=allTr().filter(function(r){return !noLead(r)&&r.x.d>=TD}),open=L.filter(function(r){return !r.x.lead}).length;if(!L.length)return "";
return acc("tl","Trainingsleitung · Einteilen"+(open?' <span class="sp">· '+open+' offen</span>':""),0)+'<div class="sp">Wer welches Training leitet. Die eingeteilte Person bekommt direkt bei Abmeldeschluss (23 h vorher) eine Mail und eine Push mit der Anzahl Spieler und Torhüter, die Spielleitung in Kopie.</div>'+waBtn()+L.map(function(r){var x=r.x;return '<div class="row tlr"><span class="nm">'+wd(x.d)+' <span class="sp">'+tstart(x)+'</span></span><select class="t" data-lead="'+r.mi+','+r.ti+'" aria-label="Training '+wd(x.d)+' leitet"><option value="">– Leitung offen –</option>'+allP().map(function(p){return '<option'+(x.lead==p?" selected":"")+'>'+esc(p)+'</option>'}).join("")+'</select></div>'}).join("")+'</div>'}
function leadTxt(x){if(!x.lead)return '';var o=(x.ab||[]).indexOf(x.lead)>=0;return ' · <span class="ld">Leitung: '+esc(x.lead)+(o?' <b class="fl">⚠ abgemeldet</b>':'')+'</span>'}
function leadSel(mi,ti,x){if(ROLE!="admin")return '<div class="sp tlro" style="margin:8px 0 4px">'+(x.lead?'Leitung: <b>'+esc(x.lead)+'</b>':'– Leitung offen –')+' · Einteilen kann die Spielleitung, selbst übernehmen unter „Meine Trainings“.</div>';return '<div class="sp" style="margin:8px 0 4px">Training leitet</div><select class="t" data-lead="'+mi+','+ti+'" aria-label="Training leitet"><option value="">– Leitung offen –</option>'+allP().map(function(p){return '<option'+(x.lead==p?" selected":"")+'>'+esc(p)+'</option>'}).join("")+'</select>'}
// ── Training: An-/Abmeldung, Bestätigung der Anwesenheit, Übersichten ──
// Alle sind automatisch angemeldet. Selbst abmelden bis 23 h vor Trainingsbeginn (Spielleitung/Captains jederzeit).
// Ab Trainingsbeginn kann jede Person die Anwesenheit bestätigen – erst dann zählt sie für die Statistik.
var RESTO=false,TSTART="18:45",TALL=false,TSEL=null,TMON=null,LTS=null,NOTIFY=false;
function tstart(x){return x.t||TSTART}
function tms(x){return new Date(x.d+"T"+tstart(x)+":00").getTime()}
function started(x){return Date.now()>=tms(x)}
function confOpen(x){return Date.now()>=tms(x)-6*36e5} // Anwesenheit bestätigen geht ab 6 Stunden vor Beginn
function canOff(x){return Date.now()<tms(x)-23*36e5}
// Verspätet melden oder zurücknehmen: bis 30 Minuten vor Beginn (Abmelden bis 23 h vorher, Unsicher bis Beginn)
function canLate(x){return Date.now()<tms(x)-30*6e4}
function lateLock(x,p,st){return !canLate(x)&&(st=="v")!=(stOf(x,p)=="v")}
var LATEMSG="Verspätet melden oder zurücknehmen geht nur bis 30 Minuten vor Trainingsbeginn. Bitte melde dich direkt bei der Trainingsleitung.";
function allTr(){var L=[];S.m.forEach(function(m,mi){m.tr.forEach(function(x,ti){L.push({x:x,mi:mi,ti:ti,md:ti==m.tr.length-1})})});L.push({x:evTr(),mi:7,ti:"e",md:false,xe:true});return L.sort(function(a,b){return a.x.d<b.x.d?-1:a.x.d>b.x.d?1:0})}
// Sommer Event: liegt nach dem letzten Match, darum nicht in S.m (dort wäre es sonst der Match Day und zählte zur Anwesenheit)
// Event-Daten: von der Spielleitung gewählt (S.wev, S.sev – siehe termCard), sonst berechnet (2. Mittwoch im Dezember, 1. Freitag im Mai).
// S.evt.d folgt immer sevD(): so überschreibt evTr() ein gewähltes Datum nie, und ohne Wahl gilt wie bisher das berechnete.
function wevDef(){return nthWd(sy(),11,3,2)}
function sevDef(){return nthWd(sy()+1,4,5,1)}
function wevD(){return isDay(S.wev)?S.wev:wevDef()}
function sevD(){return isDay(S.sev)?S.sev:sevDef()}
function evTr(){var d=sevD(),e=S.evt||(S.evt={d:d,p:[]});e.d=d;if(!e.p)e.p=[];return e}
function noLead(r){return r.md||!!evOn(r.x.d)}
function evts(){return [{d:wevD(),n:"Winter Event"},{d:sevD(),n:"Sommer Event"}]}
function evOn(d){return evts().filter(function(e){return e.d==d})[0]}
function marks(r){var e=evOn(r.x.d);return (r.md?' · <b class="fl">Match Day ⚑</b>':'')+(e?' · <b class="ev">🎉 '+e.n+'</b>':'')}
function trKey(r){return r.mi+","+r.ti}
function trAt(k){var a=String(k).split(",");if(a[1]=="e")return {mi:+a[0],ti:"e",x:evTr(),md:false,xe:true};return {mi:+a[0],ti:+a[1],x:S.m[+a[0]].tr[+a[1]],md:+a[1]==S.m[+a[0]].tr.length-1}}
function isOff(x,p){return (x.ab||[]).indexOf(p)>=0}
// Status pro Training: x.st[Spieler] = "u" (unsicher) oder "v" (verspätet), zählt weiter als angemeldet
var TCH=null,ABF=null,ABFW="",ABFS="off",ABS=null;function stOf(x,p){return (x.st||{})[p]||""}
// Gründe für Abmelden und Unsicher (pro Training und Spieler einer): eigene geschützte Tabelle, die Saison-Daten sind öffentlich lesbar (lesen nur eingeloggte Mitglieder)
function abs(){if(ABS==null&&sb&&me){ABS=[];sb.from("absence_reasons").select("d,player,reason").order("d").then(function(r){ABS=r.data||[];render()})}return ABS||[]}
function absOf(d,p){return abs().filter(function(a){return a.d==d&&a.player==p})[0]}
function setSt(k,p,st){var x=trAt(k).x;if(started(x)){alert("Das Training hat schon begonnen.");return}if(lateLock(x,p,st)){alert(LATEMSG);return}var was=isOff(x,p),wu=stOf(x,p)=="u",nv=st=="v"&&stOf(x,p)!="v";if(was)setOff(k,p,false,st=="u");x.st=x.st||{};if(st)x.st[p]=st;else delete x.st[p];if(!Object.keys(x.st).length)delete x.st;save();act(1);
// Am Trainingstag verspätet: zuerst speichern (der Server prüft den gespeicherten Status), dann Push an Trainingsleitung und Spielleitung
if(nv&&x.d==TD&&sb&&me){clearTimeout(tm);push().then(function(r){if(!(r&&r.error))return sb.functions.invoke("notify",{body:{type:"late",d:x.d,player:p}})}).catch(function(){})}
if(wu&&st!="u"&&sb&&me)sb.from("absence_reasons").delete().match({d:x.d,player:p}).then(function(){ABS=null;render()});
if(st)toast(st=="u"?"Alles klar, du bist als unsicher eingetragen. Gib Bescheid, sobald du es weisst.":"Danke für die Info, bis später! ⏰");else if(!was)toast("Super, du bist fix dabei! 💪")}
function stChoose(k,x){var lk=!canLate(x),cv=stOf(x,PLAYER)=="v",dis=function(b){return b?' disabled':''};return '<div class="stc" role="group" aria-label="Status wählen"><button class="pb on" data-stt="'+k+'|on"'+dis(lk&&cv)+'>✓ Dabei</button><button class="pb un" data-stt="'+k+'|u"'+dis(lk&&cv)+'>❔ Unsicher</button><button class="pb ve" data-stt="'+k+'|v"'+dis(lk&&!cv)+'>⏰ Verspätet</button>'+(canTeam()||canOff(x)?'<button class="pb off" data-stt="'+k+'|off">✗ Abmelden</button>':'')+'</div>'+(lk?'<div class="sp stl">Verspätet melden oder zurücknehmen geht bis 30 Minuten vor Trainingsbeginn.</div>':'')+(ABF==k&&ABFW=="mine"?abForm(k):'')}
function abForm(k){var u=ABFS=="u",l=u?"Grund, warum du unsicher bist":"Grund der Abmeldung",a=ABS&&absOf(trAt(k).x.d,PLAYER);return '<form id="abf" class="abf" data-abk="'+k+'"><input class="t" name="g" placeholder="'+l+'" aria-label="'+l+'" maxlength="200" required value="'+esc(a?a.reason:"")+'"><div class="sp">Den Grund sehen nur du, die Captains und die Spielleitung. Er wird 30 Tage nach dem Training gelöscht.</div><div class="two"><button class="add'+(u?'':' del')+'">'+(u?'Unsicher melden':'Abmelden')+'</button><button type="button" class="add sec" data-stt="'+k+'|x">Abbrechen</button></div></form>'}
function abFocus(){var i=document.querySelector("#abf input");if(i)i.focus()}
document.addEventListener("change",function(e){if(e.target.id=="pfpos"){var w=document.querySelector("#proff [data-stick]");if(w)w.hidden=e.target.value=="g"}});
document.addEventListener("submit",function(e){if(e.target.id!="proff"||!PLAYER)return;e.preventDefault();var f=e.target,pos=f.elements.pos.value||null,nr=f.elements.nr.value.trim(),B=f.querySelector("button");
if(nr!==""&&!/^\d{1,2}$/.test(nr)){alert("Bitte eine Trikotnummer von 0 bis 99 eintragen.");return}
var row={player:PLAYER,pos:pos,stick:pos=="g"?null:(f.elements.stick.value||null),nr:nr===""?null:+nr,updated_at:new Date().toISOString()};B.disabled=true;
sb.from("player_profiles").upsert(row).then(function(r){B.disabled=false;if(r.error){alert("Profil nicht gespeichert: "+r.error.message);return}(PRF||(PRF={}))[PLAYER]=row;toast("👤 Profil gespeichert.");render()})});
document.addEventListener("submit",function(e){if(e.target.id!="abf")return;e.preventDefault();var f=e.target,k=f.dataset.abk,u=ABFS=="u",g=f.elements.g.value.trim();if(g.length<3){alert("Bitte gib einen kurzen Grund an.");return}var B=f.querySelector("button"),x=trAt(k).x;if(started(x)){alert("Das Training hat schon begonnen.");return}
if(!u&&!canTeam()&&!canOff(x)){alert("Abmelden ist nur bis 23 Stunden vor Trainingsbeginn möglich. Bitte melde dich direkt bei deinem Captain.");TCH=null;ABF=null;render();return}B.disabled=true;
sb.from("absence_reasons").upsert({d:x.d,player:PLAYER,reason:g}).then(function(r){if(r.error){B.disabled=false;alert((u?"Status":"Abmeldung")+" nicht gespeichert: "+r.error.message);return}if(u)setSt(k,PLAYER,"u");else setOff(k,PLAYER,true);TCH=null;ABF=null;ABS=null;render()})});
// An-/Abmelden mit Frist; meldet die Änderung an alle, die das abonniert haben
function setOff(k,p,off,keep){var r=trAt(k),x=r.x;if(started(x)){alert("Das Training hat schon begonnen.");return false}
if(off&&!canTeam()&&!canOff(x)){alert("Abmelden ist nur bis 23 Stunden vor Trainingsbeginn möglich. Bitte melde dich direkt bei deinem Captain.");return false}
x.ab=x.ab||[];var q=x.ab.indexOf(p);if(off&&q<0)x.ab.push(p);if(!off&&q>=0)x.ab.splice(q,1);if(off&&x.st){delete x.st[p];if(!Object.keys(x.st).length)delete x.st}save();
if(!off&&q>=0&&!keep&&sb&&me)sb.from("absence_reasons").delete().match({d:x.d,player:p}).then(function(){ABS=null;render()});
if(p==PLAYER){act(1);var ev=evOn(x.d),wo=ev?"zum "+ev.n:"ins Training",bl=' <span class="sko" aria-hidden="true">'+BALL+'</span>';toast(off?pick(["Schade, dass du am "+wd(x.d)+" nicht "+wo+" kommst. Bis zum nächsten Mal! 👋","Schade, wir werden dich am "+wd(x.d)+" vermissen! 😢","Abgemeldet für "+wd(x.d)+". Schade – nächstes Mal wieder?"+bl],x.d+p+Date.now()):pick(["Super, du bist am "+wd(x.d)+" wieder dabei!"+bl,"Schön, dass du am "+wd(x.d)+" kommst! 💪"],x.d+p+Date.now()))}
if(sb&&me)sb.functions.invoke("notify",{body:{type:"signup",d:x.d,t:tstart(x),player:p,off:off}}).catch(function(){});return true}
function myTr(){if(!PLAYER)return ROLE=="player"?'<div class="card"><h3>Meine Trainings</h3><div class="sp">Dein Konto ist noch keinem Spieler zugeordnet. Bitte die Spielleitung, das unter Teams → Benutzer &amp; Rollen zu erledigen – dann kannst du dich hier abmelden.</div></div>':"";
var L=allTr().filter(function(r){return r.x.d>=TD&&(!started(r.x)||RESTO&&r.x.d==TD)});
evts().forEach(function(e){if(e.d>=TD&&!L.some(function(r){return r.x.d==e.d}))L.push({ev:e,x:{d:e.d}})});
L.sort(function(a,b){return a.x.d<b.x.d?-1:1});if(!L.length)return "";var shown=TALL?L:L.slice(0,5);
var sk=streak(PLAYER);return acc("mytr","Meine Trainings",1)+(sk.b?'<div class="kv strk"><span>'+(sk.n?'🔥 '+sk.n+(sk.n==1?' Training':' Trainings')+' in Folge':'Neue Serie starten?')+'</span><span class="sp">Rekord: '+sk.b+'</span></div>':'')+'<div class="sp" style="margin-bottom:4px">Du bist automatisch angemeldet. Tippe auf deinen Status, um ihn zu ändern. Abmelden geht bis 23 Stunden vor Trainingsbeginn, Verspätet melden bis 30 Minuten vorher.</div>'+shown.map(function(r){
if(r.ev)return '<div class="row evr"><span class="nm">'+wd(r.x.d)+' · <b class="ev">🎉 '+r.ev.n+'</b></span></div>';
var x=r.x,o=isOff(x,PLAYER),st=stOf(x,PLAYER),ar=(o||st=="u")&&absOf(x.d,PLAYER),nl=noLead(r),me=!nl&&x.lead==PLAYER,k=trKey(r),late=!o&&!canOff(x);
var inf=(marks(r)+(nl?'':me?' · <b class="fl">Du leitest das Training</b>':leadTxt(x))).replace(/^ · /,"");
return '<div class="row tm'+(me?' lme':'')+'"><span class="nm wr"><button class="td lnk" data-tsum="'+k+'" aria-expanded="'+(TSUM==k)+'" aria-label="Wer kommt am '+wd(x.d)+'">'+wd(x.d)+' <span class="sp">'+tstart(x)+'</span></button><span class="ti">'+(inf?'<span class="tsep"> · </span>'+inf:'')+(late?'<br><span class="sp">Abmelden nicht mehr möglich (23 h vorher)</span>':'')+(ar?'<br><span class="sp">Grund: '+esc(ar.reason)+'</span>':'')+'</span></span>'
+(nl?'':'<button class="x" style="font-size:12px" data-leadme="'+k+'">'+(me?'Abgeben':x.lead?'Übernehmen':'Ich leite')+'</button>')
+'<button class="pb'+(o?" off":st=="u"?" un":st=="v"?" ve":" on")+(late?" lt":"")+'" data-abw="'+k+'" aria-expanded="'+(TCH==k)+'">'+(o?"✗ abgemeldet":st=="u"?"❔ unsicher":st=="v"?"⏰ verspätet":"✓ angemeldet")+'</button></div>'+leadInfoBtn(r)+(TCH==k?stChoose(k,x):'')+(TSUM==k?trSum(x,k):'')
+(RESTO&&!r.xe?'<div class="rsr"><input class="t" list="restos" data-restok="'+k+'" placeholder="🍽️ Restaurant nach dem Training" aria-label="Restaurant am '+wd(x.d)+'" value="'+esc(x.r||"")+'"></div>':'')}).join("")
+(L.length>5?'<button class="add" data-tall="1">'+(TALL?'Weniger zeigen':'Alle Trainings zeigen ('+L.length+')')+'</button>':'')+'</div>'}
// Übersicht pro Training: angemeldet / abgemeldet / bestätigt, nach Mannschaft
function trOverview(){var L=allTr();if(!L.length)return "";var U=canTeam()?L.filter(function(r){return !r.xe&&started(r.x)&&!r.x.p.length}):[];if(TSEL==null){var n=L.filter(function(r){return r.x.d>=TD})[0]||L[L.length-1];TSEL=trKey(n)}
var r=trAt(TSEL);if(!r.x){TSEL=null;return trOverview()}if(TSEL!==LTS){TMON=r.mi;LTS=TSEL}var x=r.x,go=confOpen(x)&&!r.xe,k=TSEL,edit=canTeam();
var h='<div class="card" id="tov"><h3>Übersicht pro Training</h3>'+(U.length?'<div class="uc"><b>⚠️ '+(U.length==1?'1 Training ist':U.length+' Trainings sind')+' noch nicht bestätigt</b><div class="pt">'+U.map(function(q){return '<button class="pb in'+(trKey(q)==k?' sel':'')+'" data-tgo="'+trKey(q)+'">'+wd(q.x.d)+'</button>'}).join("")+'</div></div>':'')+'<div class="chips tsm">'+MON.map(function(n,i){return S.m[i].tr.length?'<button class="chip'+(i==r.mi?" on":"")+'" data-tsm="'+i+'">'+n.slice(0,3)+(DBL.indexOf(i)>=0?" ×2":"")+'</button>':''}).join("")+'</div>'
+'<div class="pt tch">'+L.filter(function(q){return q.mi==r.mi}).map(function(q){var e=evOn(q.x.d);return '<button class="pb'+(trKey(q)==k?" on":" in")+'" data-tgo="'+trKey(q)+'"'+(e?' title="'+esc(e.n)+'"':'')+'>'+q.x.d.slice(8)+'.'+q.x.d.slice(5,7)+'.'+(q.md?' ⚑':'')+(e?' 🎉':'')+'</button>'}).join("")+'</div>'+blkInfo(r.mi);
h+='<div class="sp" style="margin-top:6px">'+wd(x.d)+' · Beginn '+tstart(x)+marks(r)+'</div>';
if(!noLead(r))h+=leadSel(r.mi,r.ti,x);if(!r.xe)h+=restoField(x);
h+=[0,1].map(function(t){var P=S.t[t].p,on=P.filter(function(p){return !isOff(x,p)}),off=P.filter(function(p){return isOff(x,p)}),ok=P.filter(function(p){return x.p.indexOf(p)>=0});
var chip=function(p){var c=x.p.indexOf(p)>=0,o=isOff(x,p),s=stOf(x,p);return '<button class="pb'+(go?(c?" on":""):(o?" off":s=="u"?" un":s=="v"?" ve":" in"))+'" data-tp="'+esc(p)+'">'+(go?(c?"✓ ":""):(o?"✗ ":s=="u"?"❔ ":s=="v"?"⏰ ":""))+esc(p)+tags(p)+'</button>'},nst=function(k){return on.filter(function(p){return stOf(x,p)==k}).length},lbl=function(n,t){return n?' · '+n+' '+t:''},why=function(pre){return function(p){var a=absOf(x.d,p);return a?'<div class="sp abr"><b>'+pre+esc(p)+':</b> '+esc(a.reason)+'</div>':''}};
return '<div class="sk"><div class="kv tsh"><b class="'+(t?"tb":"ta")+'">'+(S.t[t].img?'<img class="sl" src="'+img(S.t[t].img)+'" alt="">':"")+esc(S.t[t].n)+'</b><span class="sp">'+(go?ok.length+' bestätigt · ':'')+on.length+' angemeldet'+(function(n){return n?' (🧤 '+n+')':''})(on.filter(isGK).length)+lbl(nst("u"),"unsicher")+lbl(nst("v"),"verspätet")+' · '+off.length+' abgemeldet</span></div>'
+'<div class="sp">Angemeldet</div><div class="pt">'+(on.map(chip).join("")||'<span class="sp">–</span>')+'</div>'+on.filter(function(p){return stOf(x,p)=="u"}).map(why("❔ ")).join("")
+(off.length?'<div class="sp">Abgemeldet</div><div class="pt">'+off.map(chip).join("")+'</div>'+off.map(why("")).join(""):'')+(go?'<button class="add" data-allc="'+t+'">Alle Angemeldeten von '+esc(S.t[t].n)+' bestätigen</button>':'')+'</div>'}).join("");
if(ABF==k&&ABFW=="ov")h+=abForm(k);
h+=guestField(x);
h+=r.xe?'<div class="sp" style="margin-top:6px">Der Sommer Event zählt nicht zur Anwesenheit und braucht keine Leitung.</div>':go?'<div class="sp" style="margin-top:6px">Tippe auf einen Namen, um die Anwesenheit zu bestätigen. Nur bestätigte Anwesenheit zählt.</div>'
:'<div class="sp" style="margin-top:6px">Anwesenheit bestätigen ist ab 6 Stunden vor Trainingsbeginn ('+wd(x.d)+', '+tstart(x)+') möglich.'+(edit?' Als '+(ROLE=="admin"?"Spielleitung":"Captain")+' kannst du Spieler hier an- und abmelden.':'')+'</div>';
if(!r.xe)h+=penField(x);
if(edit&&!r.xe)h+='<div class="sk"><div class="sp" style="margin-bottom:4px">Datum &amp; Beginn'+(r.md?' (Match Day)':'')+'</div><div class="two"><input class="t" type="date" data-tdt="1" value="'+x.d+'" aria-label="Datum"><input class="t" type="time" data-ttm="1" value="'+tstart(x)+'" aria-label="Beginn"></div>'+'</div><button class="add" data-tadd="1">+ Training hinzufügen</button>'+(r.md?'':'<button class="add del tdel" data-tdel="1">🗑 Dieses Training löschen …</button>');
return h+'</div>'}
// Monatsübersicht der An- und Abwesenheiten
function trMonth(){if(TMON==null)TMON=cur;var m=S.m[TMON],T=m.tr,past=T.filter(function(x){return started(x)});
var cnt=function(p){var a=0,o=0,f=0;T.forEach(function(x){var c=x.p.indexOf(p)>=0,ab=isOff(x,p);if(c)a++;if(ab)o++;if(started(x)&&x.p.length&&!c&&!ab)f++});return [a+(m.base[p]||0),o,f]};
return '<div class="card"><h3>Monatsübersicht</h3><div class="chips" style="padding:0 0 6px">'+MON.map(function(n,i){return '<button class="chip'+(i==TMON?" on":"")+'" data-tmon="'+i+'">'+n.slice(0,3)+'</button>'}).join("")+'</div>'+blkInfo(TMON)
+'<div class="sp">'+T.length+' Trainings, davon '+past.length+' vorbei'+(function(u){return u?' · <b class="fl">'+u+' noch nicht bestätigt</b>':''})(past.filter(function(x){return !x.p.length}).length)+(Object.keys(m.base).length?' · inkl. übernommene Anwesenheit':'')+'</div>'
+[0,1].map(function(t){return '<table class="mt"><tr><th class="'+(t?"tb":"ta")+'">'+(S.t[t].img?'<img class="sl" src="'+img(S.t[t].img)+'" alt="">':"")+esc(S.t[t].n)+'</th><th title="anwesend (bestätigt)">✓</th><th title="abgemeldet">✗</th><th title="gefehlt ohne Abmeldung">–</th></tr>'
+S.t[t].p.map(function(p){var c=cnt(p);return '<tr><td>'+esc(p)+tags(p)+(full(m,p)?' <span class="fm" title="100% Anwesenheit">💯🎉</span>':"")+'</td><td>'+c[0]+'</td><td>'+c[1]+'</td><td'+(c[2]?' class="fl"':'')+'>'+c[2]+'</td></tr>'}).join("")+'</table>'}).join("")
+'<div class="sp">✓ anwesend (bestätigt) · ✗ abgemeldet · – gefehlt ohne Abmeldung (zählt erst, wenn das Training bestätigt ist) · 💯🎉 jedes Training und den Match Day besucht</div></div>'}
// Alle Benachrichtigungen an einem Ort: Push aktivieren und An-/Abmeldungen
function notifyCard(){if(!me)return "";var pc=pushBody();return '<div class="card"><h3>Benachrichtigungen</h3>'+(pc?pc:'<div class="sp">✓ Push-Nachrichten sind auf diesem Gerät aktiv: 3 Tage vor dem Match Day und sobald das Resultat feststeht.</div>')
+'<label class="row" style="border:0;margin-top:6px"><span class="nm wr">Zusätzlich bei An- und Abmeldungen informieren</span><input type="checkbox" data-ntf="1"'+(NOTIFY?" checked":"")+'></label>'+(PUSH===true?'':'<div class="sp">Funktioniert, sobald Push-Nachrichten aktiviert sind.</div>')+'</div>'}
// Restaurant nach dem Training: eintragen dürfen Restaurant-Chef und Spielleitung, Vorschläge aus früheren Einträgen
function restos(){var c={};allTr().forEach(function(r){var n=(r.x.r||"").trim();if(n)c[n]=(c[n]||0)+1});return c}
function restoField(x){var can=RESTO||ROLE=="admin";if(!can)return x.r?'<div class="kv" style="margin-top:6px"><span class="sp">🍽️ Restaurant</span><b>'+esc(x.r)+'</b></div>':'';
return '<div class="sp" style="margin:8px 0 4px">🍽️ Restaurant nach dem Training</div><input class="t" list="restos" data-resto="1" placeholder="Restaurant eintragen" value="'+esc(x.r||"")+'"><datalist id="restos">'+Object.keys(restos()).sort(function(a,b){return a.localeCompare(b,"de")}).map(function(n){return '<option value="'+esc(n)+'">'}).join("")+'</datalist>'}
// Restaurant (Rangliste, nur Mitglieder): wie oft wir nach dem Training im Restaurant waren, Rangliste der Lokale (nur vergangene Trainings)
// und aufklappbar die letzten 5 Besuche (vergangene Trainings)
function restoBoard(){if(PUB)return "";var V=allTr().filter(function(r){return (r.x.r||"").trim()&&r.x.d<=TD}).sort(function(a,b){return a.x.d<b.x.d?1:-1}),c={};V.forEach(function(r){var n=r.x.r.trim();c[n]=(c[n]||0)+1});var L=Object.keys(c).map(function(n){return{n:n,v:c[n]}}).sort(function(a,b){return b.v-a.v||a.n.localeCompare(b.n,"de")}),t="Restaurants",open=MORE[t];
var n=allTr().filter(function(r){return !r.xe&&started(r.x)}).length,lv="Letzte Besuche",lo=MORE[lv];
if(!L.length)return '<div class="card"><h3>'+t+'</h3><div class="sp">Noch kein Restaurant eingetragen. Das Restaurant trägt der Restaurant-Chef unter Training → Übersicht pro Training ein.</div></div>';
// Donut: die 5 häufigsten Lokale in fester Farbreihenfolge (--rs1…--rs5), der Rest als „Andere“ (grau). Legende mit Anzahl und Anteil.
var S5=L.slice(0,5).map(function(r,i){return{n:r.n,v:r.v,c:"var(--rs"+(i+1)+")"}}),rest=L.slice(5),rv=rest.reduce(function(a,r){return a+r.v},0);if(rv)S5.push({n:"Andere ("+rest.length+")",v:rv,c:"var(--mu)",o:1});
var tot=V.length,R=52,C=2*Math.PI*R,gap=S5.length>1?2:0,pos=0,pc=function(v){return Math.round(v/tot*100)+" %"};
var arcs=S5.map(function(s){var l=s.v/tot*C,d='<circle class="rsa" r="'+R+'" cx="70" cy="70" fill="none" stroke="'+s.c+'" stroke-width="22" stroke-dasharray="'+Math.max(l-gap,0.5).toFixed(2)+' '+(C-Math.max(l-gap,0.5)).toFixed(2)+'" stroke-dashoffset="'+(-pos).toFixed(2)+'"><title>'+esc(s.n)+': '+s.v+'× ('+pc(s.v)+')</title></circle>';pos+=l;return d}).join("");
var svg='<svg class="rsd" viewBox="0 0 140 140" role="img" aria-label="Restaurant-Besuche nach Lokal: '+esc(S5.map(function(s){return s.n+' '+s.v+'×'}).join(", "))+'"><g transform="rotate(-90 70 70)">'+arcs+'</g><text x="70" y="68" text-anchor="middle" class="rsn">'+tot+'×</text><text x="70" y="86" text-anchor="middle" class="rsl">Besuche</text></svg>';
var leg='<div class="rsg">'+S5.map(function(s){return '<div class="rsi"><i style="background:'+s.c+'"></i><span class="nm">'+(s.o?'':'🍽️ ')+esc(s.n)+'</span><b>'+s.v+'×</b><span class="sp">'+pc(s.v)+'</span></div>'}).join("")+'</div>';
return '<div class="card"><h3>'+t+'</h3><div class="kv"><span>Wir waren im Restaurant</span><b data-rtot>'+tot+'×</b></div><div class="sp" style="margin-bottom:6px">bei '+n+' Trainings bisher</div><div class="rsw">'+svg+leg+'</div>'
+(L.length>5?'<button class="add" data-more="'+t+'" aria-expanded="'+!!open+'">'+(open?'▾ ':'▸ ')+'Alle Lokale ('+L.length+')</button>'+(open?L.map(function(r){return '<div class="row" data-ra><span class="rk">'+(1+L.filter(function(z){return z.v>r.v}).length)+'</span><span class="nm">🍽️ '+esc(r.n)+'</span><b>'+r.v+'×</b></div>'}).join(""):''):'')
+'<button class="add" data-more="'+lv+'" aria-expanded="'+!!lo+'">'+(lo?'▾ ':'▸ ')+lv+'</button>'+(lo?V.slice(0,5).map(function(r){return '<div class="row" data-rv><span class="nm">🍽️ '+esc(r.x.r.trim())+'</span><span class="sp">'+wd(r.x.d)+'</span></div>'}).join(""):'')+'</div>'}
// ── Strafen: pro Training / Match Day einem Spieler zugeordnet (Tabelle penalties, nicht öffentlich) ──
// Eintragen, als bezahlt markieren, löschen: Strafenchef, Captains, Spielleitung (serverseitig per RLS). Lesen: alle Mitglieder.
var STRAF=false,PEN=null,PND={p:"",g:"",b:""};
function canFine(){return STRAF||canTeam()}
function chf(v){return "CHF "+(+v).toFixed(2)}
function penAmt(x){return x.item?esc(x.item):chf(x.amount)} // Sachstrafe (z. B. Kiste Bier) oder Geldbetrag
// Strafenkatalog (Tabelle penalty_catalog): pflegen dürfen Spielleitung und Strafenchef, auswählen alle, die Strafen eintragen
var CAT=null,CATE=null;function cat(){if(CAT==null&&sb&&me){CAT=[];sb.from("penalty_catalog").select("id,reason,amount,item").order("reason").then(function(r){CAT=r.data||[];render()})}return CAT||[]}
function canCat(){return ROLE=="admin"||STRAF}
function catCard(){if(!me)return "";var L=cat(),ed=canCat();if(!ed&&!L.length)return "";return '<div class="card"><h3>Strafenkatalog</h3><div class="sp">'+(ed?'Beim Eintragen einer Strafe wählst du aus diesem Katalog; Grund und Betrag werden übernommen.':'Diese Strafen gelten im Training.')+'</div>'
+(L.map(function(c){if(CATE==c.id)return '<form id="cate" class="pen sk" data-id="'+c.id+'"><input class="t" name="g" aria-label="Grund" value="'+esc(c.reason)+'" maxlength="120" required><input class="t" name="b" type="number" inputmode="decimal" min="0" max="1000" step="0.5" aria-label="Betrag in CHF" placeholder="CHF" value="'+(c.item?'':+c.amount)+'"><input class="t" name="i" aria-label="Sachstrafe" placeholder="oder Sachstrafe, z. B. Kiste Bier" maxlength="60" value="'+esc(c.item||"")+'"><div class="two"><button class="add">Speichern</button><button type="button" class="add sec" data-catedit="">Abbrechen</button></div></form>';
return '<div class="row catr"><span class="nm wr">'+esc(c.reason)+'</span><b class="'+(c.item?'sp catitem':'catamt')+'">'+(c.item?esc(c.item):'CHF '+(+c.amount))+'</b>'+(ed?'<button class="x" data-catedit="'+c.id+'" aria-label="'+esc(c.reason)+' bearbeiten">✎</button><button class="bd" data-catdel="'+c.id+'" aria-label="'+esc(c.reason)+' löschen">🗑</button>':'')+'</div>'}).join("")||'<div class="sp" style="margin-top:6px">Noch keine Einträge.</div>')
+(ed?'<form id="catf" class="pen"><input class="t" name="g" aria-label="Grund" placeholder="Grund, z. B. zu spät" maxlength="120" required><input class="t" name="b" type="number" inputmode="decimal" min="0" max="1000" step="0.5" aria-label="Betrag in CHF" placeholder="CHF"><input class="t" name="i" aria-label="Sachstrafe" placeholder="oder Sachstrafe, z. B. Kiste Bier" maxlength="60"><button class="add">+ Eintrag</button></form>':'')+'</div>'}
function pens(){if(PEN==null&&sb&&me){PEN=[];sb.from("penalties").select("id,d,player,reason,amount,item,paid").order("created_at").then(function(r){PEN=r.data||[];render()})}return PEN||[]}
function reasons(){var c={};pens().forEach(function(p){c[p.reason]=(c[p.reason]||0)+1});return Object.keys(c).sort(function(a,b){return c[b]-c[a]||a.localeCompare(b,"de")})}
function lastAmt(g){var L=pens().filter(function(x){return x.reason==g});return L.length?String(+L[L.length-1].amount):""}
function penField(x){if(!me)return "";var L=pens().filter(function(p){return p.d==x.d}),can=canFine();if(!L.length&&!can)return "";
return '<div class="sk"><div class="sp" style="margin-bottom:4px">⚖️ Strafen</div>'+L.map(function(p){return '<div class="row pnr"><span class="nm">'+esc(p.player)+' <span class="sp">'+esc(p.reason)+'</span></span><b class="'+(p.paid?"sp":"fl")+'">'+penAmt(p)+'</b>'
+(can?'<button class="x" style="font-size:12px" data-pnpay="'+p.id+'">'+(p.paid?"✓ bezahlt":"offen")+'</button><button class="bd" data-pndel="'+p.id+'" aria-label="Strafe löschen">🗑</button>':(p.paid?' <span class="sp">✓ bezahlt</span>':''))+'</div>'}).join("")
+(can?'<form id="pen" class="pen"><select class="t" name="p" aria-label="Spieler" required><option value="">– Spieler –</option>'+allP().map(function(p){return '<option'+(PND.p==p?" selected":"")+'>'+esc(p)+'</option>'}).join("")+'</select>'
+(cat().length?'<select class="t" name="k" aria-label="Strafe aus dem Katalog"><option value="">– aus dem Strafenkatalog –</option>'+cat().map(function(c){return '<option value="'+c.id+'"'+(String(PND.k)==String(c.id)?" selected":"")+'>'+esc(c.reason)+' · '+penAmt(c)+'</option>'}).join("")+'</select>':'')
+'<input class="t" name="g" list="pgr" aria-label="Grund" placeholder="Grund, z. B. zu spät" maxlength="120" required value="'+esc(PND.g)+'"><datalist id="pgr">'+reasons().map(function(g){return '<option value="'+esc(g)+'">'}).join("")+'</datalist>'
+'<input class="t" name="b" type="number" inputmode="decimal" min="0" max="1000" step="0.5" aria-label="Betrag in CHF" placeholder="CHF" required value="'+esc(PND.b)+'"'+(PND.i?' hidden':'')+'>'+(PND.i?'<b class="pitem">'+esc(PND.i)+'</b>':'')+'<button class="add">+ Strafe</button></form>':'')+'</div>'}
// Übersicht pro Spieler: offen / total, Top 5 + „Zeige mehr“
function penBoard(){if(!me)return "";var c={};pens().forEach(function(p){var z=c[p.player]=c[p.player]||{o:0,t:0,it:{}};if(p.item){if(!p.paid)z.it[p.item]=(z.it[p.item]||0)+1;return}z.t+=+p.amount;if(!p.paid)z.o+=+p.amount});
var items=function(o){return Object.keys(o).map(function(k){return o[k]+"× "+esc(k)}).join(", ")},allIt={};Object.keys(c).forEach(function(n){Object.keys(c[n].it).forEach(function(k){allIt[k]=(allIt[k]||0)+c[n].it[k]})});
var L=Object.keys(c).map(function(n){return{n:n,o:c[n].o,t:c[n].t,it:c[n].it}}).sort(function(a,b){return b.o-a.o||b.t-a.t||a.n.localeCompare(b.n,"de")});if(!L.length)return "";
var t="Strafen",open=MORE[t],shown=open?L:L.slice(0,5),so=0,st=0;L.forEach(function(r){so+=r.o;st+=r.t});var mine=PLAYER&&c[PLAYER];
return '<div class="card"><h3>'+t+'</h3><div class="sp" style="margin-bottom:4px">Total '+chf(st)+' · offen '+chf(so)+(Object.keys(allIt).length?' + '+items(allIt):'')+(mine?' · <b>du: '+chf(mine.o)+' offen</b>':'')+'</div>'
+shown.map(function(r){return '<div class="row'+(r.n==PLAYER?' lme':'')+'"><span class="nm">⚖️ '+esc(r.n)+'</span><span class="sp">'+chf(r.t)+' total'+(Object.keys(r.it).length?' · '+items(r.it):'')+'</span><b class="'+(r.o||Object.keys(r.it).length?"fl":"sp")+'">'+(r.o?chf(r.o)+' offen':Object.keys(r.it).length?'offen':'✓ bezahlt')+'</b></div>'}).join("")
+(L.length>5?'<button class="add" data-more="'+t+'">'+(open?'Weniger zeigen':'Zeige mehr ('+L.length+')')+'</button>':'')+'</div>'}
// Strafen-Statistik über alle Trainings: Total, bezahlt/offen und die häufigsten Gründe
function penStats(){if(!me)return "";var L=pens();if(!L.length)return "";var g={},tr={},t=0,o=0,it={};L.forEach(function(p){tr[p.d]=1;var k=(p.reason||"Ohne Grund").trim()||"Ohne Grund",z=g[k]=g[k]||{n:0,b:0,it:{}};z.n++;if(p.item){z.it[p.item]=(z.it[p.item]||0)+1;it[p.item]=(it[p.item]||0)+1}else{z.b+=+p.amount;t+=+p.amount;if(!p.paid)o+=+p.amount}});
var nt=Object.keys(tr).length,its=function(x){return Object.keys(x).map(function(k){return x[k]+"× "+esc(k)}).join(", ")},R=Object.keys(g).map(function(k){return{k:k,n:g[k].n,b:g[k].b,it:g[k].it}}).sort(function(a,b){return b.n-a.n||b.b-a.b||a.k.localeCompare(b.k,"de")});
return acc("pst","Strafen-Statistik")+'<div class="kv"><span>Strafen</span><b>'+L.length+'</b></div><div class="kv"><span>Trainings mit Strafen</span><b>'+nt+'</b></div><div class="kv"><span>Pro Training mit Strafen</span><b>'+(L.length/nt).toFixed(1)+'</b></div><div class="kv"><span>Total</span><b>'+chf(t)+'</b></div><div class="kv"><span>Bezahlt</span><b>'+chf(t-o)+'</b></div><div class="kv"><span>Offen</span><b class="'+(o?"fl":"sp")+'">'+chf(o)+'</b></div>'+(Object.keys(it).length?'<div class="kv"><span>Sachstrafen</span><b>'+its(it)+'</b></div>':'')
+'<div class="sp" style="margin:10px 0 4px">Nach Grund</div>'+R.map(function(r){return '<div class="row"><span class="nm">'+esc(r.k)+'</span><span class="sp">'+[r.b?chf(r.b):"",its(r.it)].filter(Boolean).join(" · ")+'</span><b>'+r.n+'×</b></div>'}).join("")+'</div>'}
function penForm(e){var f=e.target.form;if(!f||f.id!="pen")return;var n=e.target.name;PND[n]=e.target.value;
if(n=="k"){var kc=cat().filter(function(c){return String(c.id)==e.target.value})[0];if(kc){PND.g=kc.reason;PND.b=String(+kc.amount);PND.i=kc.item||"";render()}return}
if(n=="g"||n=="b")PND.i="";if(n=="g"&&!PND.b){PND.b=lastAmt(PND.g.trim());f.elements.b.value=PND.b}}
document.addEventListener("submit",function(e){if(e.target.id!="tgs")return;e.preventDefault();var f=e.target,n=f.elements.n.value.trim().slice(0,60);if(!n)return;var x=trAt(TSEL).x;(x.gs||(x.gs=[])).push({n:n,gk:f.elements.gk.checked});save();render()});
document.addEventListener("submit",function(e){if(e.target.id!="catf")return;e.preventDefault();var f=e.target,g=f.elements.g.value.trim(),it=f.elements.i.value.trim(),a=it?0:parseFloat(String(f.elements.b.value).replace(",","."));if(!g||!(a>=0)){alert("Bitte Grund und Betrag oder Sachstrafe angeben.");return}
sb.from("penalty_catalog").insert({reason:g,amount:a,item:it||null}).then(function(r){if(r.error){alert(/duplicate|unique/i.test(r.error.message)?"„"+g+"“ ist schon im Katalog.":"Eintrag konnte nicht gespeichert werden: "+r.error.message);return}CAT=null;render()})});
document.addEventListener("submit",function(e){if(e.target.id!="cate")return;e.preventDefault();var f=e.target,g=f.elements.g.value.trim(),it=f.elements.i.value.trim(),a=it?0:parseFloat(String(f.elements.b.value).replace(",","."));if(!g||!(a>=0)){alert("Bitte Grund und Betrag oder Sachstrafe angeben.");return}
sb.from("penalty_catalog").update({reason:g,amount:a,item:it||null}).eq("id",+f.dataset.id).then(function(r){if(r.error){alert(/duplicate|unique/i.test(r.error.message)?"„"+g+"“ ist schon im Katalog.":"Änderung konnte nicht gespeichert werden: "+r.error.message);return}CATE=null;CAT=null;render()})});
document.addEventListener("input",penForm);document.addEventListener("change",penForm);
document.addEventListener("submit",function(e){if(e.target.id!="pen")return;e.preventDefault();var B=e.target.querySelector("button.add"),a=parseFloat(String(PND.b).replace(",","."));
if(!PND.p||!PND.g.trim()||!(a>=0)){alert("Bitte Spieler, Grund und Betrag angeben.");return}B.disabled=true;
sb.from("penalties").insert({d:trAt(TSEL).x.d,player:PND.p,reason:PND.g.trim(),amount:PND.i?0:a,item:PND.i||null}).then(function(r){B.disabled=false;if(r.error){alert("Strafe konnte nicht gespeichert werden: "+r.error.message);return}PND={p:"",g:"",b:"",i:""};PEN=null;render()})});
document.addEventListener("click",function(e){var b=e.target.closest("[data-pnpay],[data-pndel]");if(!b)return;
if(b.dataset.pnpay){var p=pens().filter(function(x){return x.id==b.dataset.pnpay})[0];p.paid=!p.paid;render();sb.from("penalties").update({paid:p.paid}).eq("id",p.id).then(function(r){if(r.error){p.paid=!p.paid;alert(r.error.message);render()}});return}
if(!confirm("Strafe löschen?"))return;sb.from("penalties").delete().eq("id",+b.dataset.pndel).then(function(r){if(r.error){alert(r.error.message);return}PEN=null;render()})});
