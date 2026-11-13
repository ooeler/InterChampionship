// Animationen, Logo, Zeichnen (render) und Bedienung
// ── Animationen ──
var LTAB=null,MOREN=null,BALLT=null;
var BALL='<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#fff" stroke="#d4d4d4" stroke-width="1.5"/>'+[[20,8],[10,14],[30,14],[20,20],[8,26],[32,26],[14,32],[26,32],[20,30],[13,22],[27,22]].map(function(p){return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="2.6" fill="#c9c9c9"/>'}).join("")+'</svg>';
function calm(){return window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches}
// Am Match Day fliegt ab und zu ein Unihockey-Ball über den Bildschirm
function balls(){var on=!PUB&&me&&isMD(TD)&&!calm();if(!on){clearTimeout(BALLT);BALLT=null;return}if(BALLT)return;BALLT=setTimeout(function fly(){
if(document.hidden||document.querySelector(".ball")){BALLT=setTimeout(fly,4000);return}
var b=document.createElement("div"),W=innerWidth,H=innerHeight,ltr=Math.random()<.5,y0=H*(.25+Math.random()*.5),peak=H*(.08+Math.random()*.2);b.className="ball";b.innerHTML=BALL;document.body.appendChild(b);
var x0=ltr?-50:W+10,x1=ltr?W+10:-50,mid=(x0+x1)/2,rot=ltr?900:-900;
var a=b.animate([{transform:"translate("+x0+"px,"+y0+"px) rotate(0)"},{transform:"translate("+mid+"px,"+peak+"px) rotate("+rot/2+"deg)"},{transform:"translate("+x1+"px,"+(y0+H*.15)+"px) rotate("+rot+"deg)"}],{duration:2200,easing:"cubic-bezier(.3,.1,.6,1)"});
a.onfinish=function(){b.remove()};BALLT=setTimeout(fly,9000+Math.random()*9000)},BALLT===null?2500:0)}
// Akkordeon: Karte gleitet von der alten auf die neue Höhe (auf und zu)
var SLIDE=null;function slide(){var s=SLIDE;SLIDE=null;if(!s)return;var h3=document.querySelector("#app "+s.q),c=h3&&h3.closest(".card");if(!c||!c.animate||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var nh=c.offsetHeight;if(Math.abs(nh-s.h)<2)return;c.style.overflow="hidden";c.style.boxSizing="border-box";var a=c.animate([{height:s.h+"px"},{height:nh+"px"}],{duration:Math.round(Math.min(420,Math.max(240,Math.abs(nh-s.h)*.5))),easing:"cubic-bezier(.25,.8,.3,1)"});
a.onfinish=a.oncancel=function(){c.style.overflow="";c.style.boxSizing=""}}
// Club-Logo überall: das hochgeladene Bild (S.logo), lokal gemerkt für Ladebildschirm und Anmeldung, sonst logo.png
var LOGOPX=640;/* gross genug für den Ladebildschirm auf scharfen Handy-Displays */
function logoMem(){try{return img(localStorage.getItem("ic_logo"))}catch(e){return ""}}
function clubLogo(){return img(S.logo)||logoMem()||"logo.png"}
function logoShow(){var u=img(S.logo),i=document.querySelector("link[rel=icon]"),a=document.querySelector("link[rel=apple-touch-icon]"),c=clubLogo(),q=c=="logo.png"?"":c;if(i)i.href=q||"icon-192.png";if(a)a.href=q||"apple-touch-icon.png";if(u&&u!=logoMem())try{localStorage.setItem("ic_logo",u)}catch(e){}}
// Tastatur und Screenreader: Fokus nach dem Neuzeichnen wieder auf dasselbe Element (erkannt an den data-Attributen)
function focusKey(){var a=document.activeElement;if(!a||a==document.body||!/^(BUTTON|A|H3)$/.test(a.tagName)||!a.closest("#app,#nav"))return null;var k=a.tagName.toLowerCase();for(var i=0;i<a.attributes.length;i++){var t=a.attributes[i];if(/^data-/.test(t.name))k+="["+t.name+'="'+CSS.escape(t.value)+'"]'}return k==a.tagName.toLowerCase()?null:(a.closest("#nav")?"#nav ":"#app ")+k}
function a11yAcc(){document.querySelectorAll("#app h3[data-acc],#app h3[data-tg]").forEach(function(h){h.tabIndex=0;h.setAttribute("role","button");h.setAttribute("aria-expanded",!h.parentElement.classList.contains("cl"))})}
// Textfelder speichern bei "change", also beim Verlassen. Tippt man direkt danach einen Knopf an, kommt "change" schon beim mousedown;
// baute render() dann #app neu auf, ginge der folgende click ins Leere (der Knopf unter dem Finger ist ersetzt). Darum wartet ein solches
// Neuzeichnen, bis die Maus bzw. der Finger losgelassen und der click verarbeitet ist (window-Listener läuft nach allen document-Listenern).
var PDN=0,INCHG=false,RLATER=false;function pRel(){PDN=0;if(RLATER)render()}
document.addEventListener("mousedown",function(){PDN=Date.now()},true);document.addEventListener("mouseup",function(){setTimeout(pRel,0)},true);addEventListener("click",pRel);
document.addEventListener("change",function(e){var t=e.target;INCHG=t.tagName=="TEXTAREA"||t.tagName=="INPUT"&&/^(text|search|email|url|tel|number|)$/.test(t.getAttribute("type")||"")},true);addEventListener("change",function(){INCHG=false});
function render(){if(INCHG&&PDN&&Date.now()-PDN<5000){RLATER=true;return}RLATER=false;var FK=focusKey();CRW=null;SK=null;if(PUB&&tab!="info"&&tab!="hall")tab="rang";if(tab=="team"&&!me)tab="rang";var h=viewBar()+(NEWER?'<div class="card upd"><h3>Neue Version verfügbar</h3><div class="sp">Die Daten wurden mit einer neueren App-Version gespeichert. Bitte neu laden, damit nichts verloren geht. Bis dahin werden keine Änderungen gespeichert.</div><button class="add" data-reload="1">Jetzt neu laden</button></div>':'')+(tab=="spiel"?spiel():tab=="rang"?rang():tab=="info"?info():tab=="train"?training():tab=="hall"?hall():teams());
var app=document.getElementById("app");app.innerHTML=h;if(tab!=LTAB){app.classList.remove("fx");void app.offsetWidth;app.classList.add("fx");LTAB=tab}
if(MOREN!=null){app.querySelectorAll(".card").forEach(function(c){var h3=c.querySelector("h3");if(h3&&h3.textContent==MOREN)c.querySelectorAll(".row").forEach(function(r,i){if(i>=5)r.classList.add("nw")})});MOREN=null}
balls();ovl();var smc=document.getElementById("smc");if(smc)drawSM(smc,S.m[cur]);if(tab=="rang")document.querySelectorAll("#app .card").forEach(function(c,i){c.querySelector("h3").dataset.tg=i;if(cl[i])c.classList.add("cl")});slide();
document.getElementById("hi").textContent=hello();document.getElementById("lo").title=me&&me.email?"Angemeldet als "+me.email:"";
document.getElementById("lo").hidden=PUB;document.getElementById("li").hidden=!PUB;document.getElementById("hi").hidden=PUB;document.getElementById("nav").hidden=false;document.body.classList.toggle("nonav",false);
document.getElementById("nav").innerHTML=[["spiel","⚡","Spieltag"],["train",BALL,"Training"],["rang","🏆","Rangliste"],["team","👥","Teams"],["info","ℹ️","Infos"],["hall","🏛️","Hall"]].filter(function(x){return !PUB||x[0]=="rang"||x[0]=="info"||x[0]=="hall"}).map(function(x){return '<button class="'+(tab==x[0]?"on":"")+'" data-tab="'+x[0]+'"><i>'+x[1]+'</i>'+x[2]+'</button>'}).join("");
document.getElementById("sub").textContent=S.t[0].n+" vs "+S.t[1].n;document.getElementById("h1").innerHTML='Herren Inter <span>'+esc(S.sn)+'</span>';var cg=document.getElementById("clogo");cg.hidden=!S.logo;if(S.logo)cg.src=img(S.logo);logoShow();document.title="Herren Inter "+S.sn;
document.querySelectorAll(".chips").forEach(function(c){var o=c.querySelector(".on");if(o)c.scrollLeft=o.offsetLeft-c.offsetLeft-(c.clientWidth-o.offsetWidth)/2});
a11yAcc();if(FK){var fe=document.querySelector(FK);if(fe)fe.focus({preventScroll:true})}}
document.addEventListener("keydown",function(e){var h=e.target;if((e.key=="Enter"||e.key==" ")&&h.matches&&h.matches("h3[data-acc],h3[data-tg]")){e.preventDefault();h.click()}});
document.addEventListener("click",function(e){var d=e.target.closest("[data-tab],[data-c],[data-k],[data-add],[data-rm],[data-ot],[data-ab],[data-dtr],[data-atr],[data-clrb],[data-cap],[data-tg],[data-all],[data-gs],[data-kp],[data-rg],[data-rmimg],[data-rs],[data-exp],[data-lo],[data-um],[data-myprof],[data-push],[data-notify],[data-sm],[data-smdl],[data-ff],[data-fbk],[data-abw],[data-snap],[data-restore],[data-reload],[data-leadme],[data-tall],[data-rcf],[data-tp],[data-allc],[data-tadd],[data-tdel],[data-tmon],[data-inst],[data-rgk],[data-resdel],[data-tmail],[data-tpush],[data-hse],[data-hsd],[data-hpd],[data-hlb],[data-hgo],[data-invp],[data-infoe],[data-infos],[data-infom],[data-infox],[data-infor],[data-stt],[data-recap],[data-catdel],[data-catedit],[data-view],[data-mdel],[data-gkp],[data-tgdel],[data-tsm],[data-acc],[data-tgo],[data-more],[data-login],[data-sped],[data-tjump],[data-prof],[data-ted],[data-arch],[data-tsum]");if(!d)return;var D=d.dataset;
if(D.login){ascr("login");return}
if(D.more!=null){MORE[D.more]=!MORE[D.more];if(MORE[D.more])MOREN=D.more}else
if(D.tsum!=null){TSUM=TSUM==D.tsum?null:D.tsum}else if(D.prof!=null){if(!D.prof){ovClose();return}PROF=D.prof;PROFE=false;render();return}else if(D.ted!=null){TED=+D.ted;PROF=null}else if(D.arch){archive();return}else if(D.sped){SPED=SPED==cur?-1:cur}else if(D.tjump!=null){TSEL=D.tjump;TMON=+D.tjump.split(",")[0];LTS=TSEL;render();var tv=document.getElementById("tov");if(tv)tv.scrollIntoView({behavior:calm()?"auto":"smooth",block:"start"});return}else if(D.tall){TALL=!TALL}else if(D.rcf){RCF=!RCF}else if(D.tmon!=null){TMON=+D.tmon;var QM=allTr().filter(function(q){return q.mi==TMON});if(QM.length){TSEL=trKey(QM.filter(function(q){return q.x.d>=TD})[0]||QM[QM.length-1]);LTS=TSEL}}else if(D.inst){if(INST){var ip=INST;ip.prompt();ip.userChoice.then(function(){INST=null;render()})}return}else if(D.tpush){d.disabled=true;fnCall("notify",{type:"testpush"}).then(function(r){d.disabled=false;var e=r.error&&((r.data&&r.data.error)||r.error.message),x=r.data||{};alert(e?"Test-Benachrichtigung nicht verschickt: "+e:"Test-Benachrichtigung an "+x.sent+" von "+x.devices+(x.devices==1?" Gerät":" Geräten")+" verschickt."+(x.errors&&x.errors.length?"\nFehler: "+x.errors.join(", "):""))});return}else if(D.tmail){d.disabled=true;fnCall("notify",{type:"testmail"}).then(function(r){d.disabled=false;var e=r.error&&((r.data&&r.data.error)||r.error.message);alert(e?"Test-Mail nicht verschickt: "+e:"Test-Mail an "+r.data.to+" verschickt. Bitte Posteingang und Spam-Ordner prüfen.")});return}else if(D.tgo!=null){TSEL=D.tgo}else if(D.tsm!=null){TMON=+D.tsm;var Q=allTr().filter(function(q){return q.mi==+D.tsm});TSEL=trKey(Q.filter(function(q){return q.x.d>=TD})[0]||Q[Q.length-1])}else if(D.acc){ACC[D.acc]=d.closest(".card").classList.contains("cl");SLIDE={q:'h3[data-acc="'+D.acc+'"]',h:d.closest(".card").offsetHeight}}else
if(D.tp!=null){var tr=trAt(TSEL),tx=tr.x;if(confOpen(tx)&&!tr.xe){var ci=tx.p.indexOf(D.tp);ci<0?tx.p.push(D.tp):tx.p.splice(ci,1);save()}else if(D.tp==PLAYER&&!isOff(tx,D.tp)){if(!canTeam()&&!canOff(tx)){alert("Abmelden ist nur bis 23 Stunden vor Trainingsbeginn möglich. Bitte melde dich direkt bei deinem Captain.");return}ABF=ABF==TSEL?null:TSEL;ABFS="off";ABFW="ov";render();abFocus();return}else if(canTeam()||D.tp==PLAYER){setOff(TSEL,D.tp,!isOff(tx,D.tp))}else{alert("An- und abmelden können nur die Spieler selbst sowie Spielleitung und Captains.");return}}else
if(D.allc!=null){var ax=trAt(TSEL).x;S.t[+D.allc].p.forEach(function(p){if(!isOff(ax,p)&&ax.p.indexOf(p)<0)ax.p.push(p)});save()}else
if(D.tadd){if(!canTeam())return;var base=TSEL?trAt(TSEL).x.d:TD,nd=new Date(base+"T12:00:00"),ds;do{nd.setDate(nd.getDate()+1);ds=nd.toISOString().slice(0,10)}while(allTr().some(function(r){return r.x.d==ds}));var nx={d:ds,p:[]},tk;if(!mdGuard(function(){tk=placeTr(nx)})){render();return}TSEL=tk;save()}else
if(D.tdel){if(!canTeam()||!confirm("Training löschen?"))return;var dl=trAt(TSEL);S.m[dl.mi].tr.splice(dl.ti,1);TSEL=null;save()}else
if(D.reload){location.reload();return}
if(D.snap){sb.rpc("snapshot_league",{reason:"manuell"}).then(function(r){if(r.error)alert(r.error.message);HIST=null;render()});return}
if(D.restore){if(!confirm("Diese Version wiederherstellen? Der aktuelle Stand wird vorher gesichert."))return;clearTimeout(tm);sb.rpc("restore_league_state",{hid:+D.restore}).then(function(r){if(r.error){alert(r.error.message);return}reloadState().then(function(){alert("Version wiederhergestellt.")})});return}
if(D.leadme){var li=D.leadme.split(","),lx=S.m[+li[0]].tr[+li[1]];if(lx.lead==PLAYER)delete lx.lead;else if(!lx.lead||confirm(lx.lead+" leitet dieses Training. Selbst übernehmen?"))lx.lead=PLAYER;save();act(1)}else
if(D.abw){if(started(trAt(D.abw).x)){alert("Das Training hat schon begonnen.");return}TCH=TCH==D.abw?null:D.abw;ABF=null}else if(D.stt){var sq=D.stt.split("|");if(sq[1]!="x"&&sq[1]!="off"&&lateLock(trAt(sq[0]).x,PLAYER,sq[1]=="on"?"":sq[1])){alert(LATEMSG);return}if(sq[1]=="x"){ABF=null}else if(sq[1]=="off"||sq[1]=="u"){ABF=sq[0];ABFS=sq[1];ABFW="mine";render();abFocus();return}else{setSt(sq[0],PLAYER,sq[1]=="on"?"":sq[1]);TCH=null;ABF=null}}else
if(D.fbk){FBD.kind=D.fbk;FBM=null}else
if(D.resdel){var rm=S.m[cur];if(!confirm("Resultat "+MON[cur]+" ("+(rm.res[0]==null?"–":rm.res[0])+" : "+(rm.res[1]==null?"–":rm.res[1])+") wirklich löschen?\n\nTore, Assists und Pre-Game-Siege bleiben erhalten."))return;rm.res=[null,null];save()}else
if(D.ff!=null){if(!confirm(S.t[+D.ff].n+" tritt nicht an – Forfait 0 : 5?"))return;var fr=[5,5];fr[+D.ff]=0;S.m[cur].res=fr;S.m[cur].ff=+D.ff;save()}else
if(D.smdl){smDl();return}
if(D.exp){exp();return}
if(D.push){enablePush();return}
if(D.notify){var mo=cur;if(!confirm("Resultat jetzt per Push an alle melden?"))return;clearTimeout(tm);push().then(function(){return sb.functions.invoke("notify",{body:{type:"result",month:mo}})}).then(function(r){alert(r&&r.error?"Senden fehlgeschlagen.":"Push-Nachricht wurde verschickt.")});return}
if(D.invp!=null){INVD.player=D.invp;render();var nf=document.getElementById("inv");if(nf)nf.scrollIntoView({block:"center"});return}
if(D.hgo!=null){var hk="hs"+D.hgo;ACC[hk]=true;render();var ht=document.querySelector('#app h3[data-acc="'+hk+'"]');if(ht)ht.scrollIntoView({behavior:calm()?"auto":"smooth",block:"start"});return}
if(D.hlb!=null){HLB=D.hlb||null}else if(D.hse!=null){HE=D.hse||null;HLG=null;render();scrollTo(0,0);return}else if(D.hsd){if(!confirm("Saison "+D.hsd+" mit allen Fotos löschen?"))return;sb.from("hall_seasons").delete().eq("season",D.hsd).then(function(r){if(r.error)alert(r.error.message);HS=null;delete HP[D.hsd];render()});return}else if(D.hpd){if(!confirm("Foto löschen?"))return;sb.from("hall_photos").delete().eq("id",+D.hpd).then(function(r){if(r.error)alert(r.error.message);HP[D.hsn]=null;render()});return}else if(D.infoe!=null){IE=D.infoe==""?null:D.infoe=="new"?"new":+D.infoe;INFOD=IE==null||IE=="new"?{t:"",b:""}:infoSecs(S.info||INFO_MD)[IE]}else if(D.infos){var iL=infoSecs(S.info||INFO_MD),iT=INFOD.t.trim(),iB=INFOD.b.trim();ACC["inf:"+iT]=true;if(!iT&&!iB){alert("Der Abschnitt darf nicht leer sein.");return}if(!iT&&(IE=="new"||iL[IE].t)){alert("Bitte gib dem Abschnitt einen Titel.");return}if(IE=="new")iL.push({t:iT,b:iB});else iL[IE]={t:iT,b:iB};infoSet(iL,"Infos gespeichert.")}else if(D.infom){var mL=infoSecs(S.info||INFO_MD),mI=IE+ +D.infom,mS=mL[IE];mL[IE]=mL[mI];mL[mI]=mS;infoSet(mL,"Reihenfolge gespeichert.");IE=mI}else if(D.infox){var xL=infoSecs(S.info||INFO_MD);if(xL.length<2){alert("Die Infos dürfen nicht leer sein.");return}if(!confirm("Abschnitt „"+(xL[IE].t||"ohne Titel")+"“ löschen?"))return;xL.splice(IE,1);infoSet(xL,"Abschnitt gelöscht.")}else if(D.infor){if(!confirm("Eigenen Text verwerfen und den Standardtext wiederherstellen?"))return;delete S.info;IE=null;save()}else
if(D.recap){recapShare(+D.recap);return}
if(D.view!=null){VIEW=D.view=="player"?"player":"";try{VIEW?localStorage.setItem("ic_view",VIEW):localStorage.removeItem("ic_view")}catch(e){}applyRole();render();scrollTo(0,0);return}
if(D.mdel){var du=(MEM||[]).filter(function(x){return x.user_id==D.mdel})[0];if(!du||!confirm("Benutzer „"+du.email+"“ endgültig löschen?\n\nDas Konto wird entfernt und kann sich nicht mehr anmelden. Spieler, Statistik und Strafen bleiben erhalten."))return;d.disabled=true;sb.rpc("delete_member",{uid:D.mdel}).then(function(r){if(r.error){d.disabled=false;alert(r.error.message);return}MEM=null;render()});return}
if(D.um){umTog();return}
if(D.myprof){umTog(false);PROF=PLAYER||null;PROFE=true;loadProf();render();return}
if(D.lo){umTog(false);PROF=null;PROFE=false;if(confirm("Abmelden?")){stop();ROLE="player";PLAYER=null;MEM=null;PEN=null;CAT=null;CATE=null;ABS=null;TCH=null;ABF=null;HS=null;HP={};AP={};HE=null;HLB=null;STRAF=false;RESTO=false;REAL={role:"player",resto:false,strafen:false};HIST=null;SM=false;tab="rang";try{localStorage.removeItem("ic_state");localStorage.removeItem("ic_base");localStorage.removeItem("ic_dirty")}catch(e){}BASE=null;S=fix(def());var so=function(){sb.auth.signOut()};
if(PUSH===true)navigator.serviceWorker.ready.then(function(r){return r.pushManager.getSubscription()}).then(function(s){return s&&sb.from("push_subscriptions").delete().eq("endpoint",s.endpoint).then(function(){return s.unsubscribe()})}).then(so,so);else so();PUSH=null;PREV=null}return}
if(D.sm){SM=!SM}
else if(D.tab){SPED=-1;TED=-1;PROF=null;if(D.tab=="train"&&tab!="train"){PEN=null;ABS=null}if(D.tab=="hall"&&tab!="hall"){HS=null;HP={};HLB=null}tab=D.tab;scrollTo(0,0)}else if(D.c){cur=+D.c;SPED=-1;ot=nxt(S.m[cur])}
else if(D.ot!=null){ot=ot===+D.ot?-1:+D.ot}
else if(D.ab!=null){var ab=S.m[cur].tr[+D.ab].p,q=ab.indexOf(D.p);q<0?ab.push(D.p):ab.splice(q,1);save()}
else if(D.dtr!=null){if(confirm("Training löschen?")){S.m[cur].tr.splice(+D.dtr,1);ot=-1;save()}}
else if(D.atr){var T=S.m[cur].tr,l=T.length?new Date(T[T.length-1].d):new Date();l.setDate(l.getDate()+7);T.push({d:l.toISOString().slice(0,10),p:[]});ot=T.length-1;save()}
else if(D.clrb){S.m[cur].base={};save()}
else if(D.tg!=null){SLIDE={q:'h3[data-tg="'+D.tg+'"]',h:d.closest(".card").offsetHeight};cl[D.tg]=!cl[D.tg]}
else if(D.rmimg!=null){var rk=D.rmimg;if(rk=="club"){delete S.logo;try{localStorage.removeItem("ic_logo")}catch(e){}}else if(rk=="sp")delete S.sp;else delete S.t[+rk].img;save()}
else if(D.rs!=null){var l2=lead(S.m[cur]);S.m[cur].res=[l2[0]+gsum(S.m[cur],0),l2[1]+gsum(S.m[cur],1)];save()}
else if(D.all!=null){S.m[cur].tr[+D.all].p=S.t[0].p.concat(S.t[1].p);save()}
else if(D.gs!=null){var gn=(prompt("Name des Gastspielers")||"").trim();if(gn)S.m[cur].gs.push({n:gn,t:+D.gs,k:"★"+gn,gk:confirm(gn+" als Torhüter erfassen?\n\nOK = Torhüter · Abbrechen = Feldspieler")});save()}
else if(D.kp!=null){kpSet(+D.kp,D.p)}
else if(D.rgk!=null){var RG=S.m[cur].gs[+D.rgk];RG.gk=!RG.gk;save()}
else if(D.rg!=null){var G=S.m[cur].gs,gk=G[+D.rg].k;delete S.m[cur].g[gk];delete S.m[cur].a[gk];G.splice(+D.rg,1);save()}
else if(D.cap!=null){S.t[+D.cap].c=D.p;save()}
else if(D.gkp!=null){var GT=S.t[+D.gkp],G=GT.gk||(GT.gk=[]),gq=G.indexOf(D.p);gq<0?G.push(D.p):G.splice(gq,1);save()}
else if(D.catedit!=null){CATE=D.catedit?+D.catedit:null;render();var cf=document.querySelector("#cate input[name=g]");if(cf)cf.focus();return}
else if(D.catdel!=null){var cd=cat().filter(function(c){return String(c.id)==D.catdel})[0];if(cd&&confirm("„"+cd.reason+"“ aus dem Katalog löschen?"))sb.from("penalty_catalog").delete().eq("id",+D.catdel).then(function(r){if(r.error)alert(r.error.message);CAT=null;render()});return}
else if(D.tgdel!=null){var gx=trAt(TSEL).x;(gx.gs||[]).splice(+D.tgdel,1);save()}
else if(D.k){var m=S.m[cur],v=+D.d,k=D.k,t=+D.t;if(k=="pre"){if(v>0&&preFull(m,t))return;m.pre[t]=Math.max(0,Math.min(3,m.pre[t]+v))}else if(k=="res")m.res[t]=Math.max(0,(m.res[t]||0)+v),m.res[1-t]==null&&(m.res[1-t]=0);else m[k][D.p]=Math.max(0,(m[k][D.p]||0)+v);save()}
else if(D.add){S.t[+D.add].p.push("Neuer Spieler "+(S.t[+D.add].p.length+1));fix(S);save()}
else if(D.rm){var P=S.t[+D.rm].p,rj=D.p!=null&&P.indexOf(D.p)>=0?P.indexOf(D.p):+D.j,nm=P[rj];if(nm!=null&&confirm(nm+" entfernen?")){P.splice(rj,1);if(S.t[+D.rm].c==nm)S.t[+D.rm].c=P[0]||"";var RG=S.t[+D.rm].gk||[];if(RG.indexOf(nm)>=0)RG.splice(RG.indexOf(nm),1);save()}}
var y=scrollY;render();scrollTo(0,y)});
function exp(){var n="interchampionship-"+String(S.sn).replace(/\W+/g,"-")+"-"+TD+".json",f=new File([JSON.stringify(S)],n,{type:"application/json"});
if(navigator.canShare&&navigator.canShare({files:[f]})){navigator.share({files:[f],title:n}).catch(function(){});return}
give(f)}
function give(f){var a=document.createElement("a");a.href=URL.createObjectURL(f);a.download=f.name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)}
// Wischen nach links/rechts wechselt den Reiter der Hauptnavigation (nicht in Eingabefeldern, waagrecht scrollbaren Bereichen und am Bildschirmrand)
(function(){var x0=null,y0=0;
function hscroll(el){for(;el&&el!=document.body;el=el.parentElement){if(/^(INPUT|SELECT|TEXTAREA|CANVAS)$/.test(el.tagName))return true;if(el.scrollWidth>el.clientWidth+2){var o=getComputedStyle(el).overflowX;if(o=="auto"||o=="scroll")return true}}return false}
document.addEventListener("touchstart",function(e){x0=null;if(e.touches.length!=1||document.body.classList.contains("lo")||document.body.classList.contains("ovo"))return;var t=e.touches[0],m=document.getElementById("um");
if(!e.target.closest||!e.target.closest("#app")||(m&&!m.hidden)||t.clientX<24||t.clientX>innerWidth-24||hscroll(e.target))return;x0=t.clientX;y0=t.clientY},{passive:true});
document.addEventListener("touchend",function(e){if(x0==null)return;var t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;x0=null;if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*2)return;
var B=[].slice.call(document.querySelectorAll("#nav [data-tab]")),i=B.findIndex(function(b){return b.dataset.tab==tab}),n=B[i+(dx<0?1:-1)];if(i>=0&&n)n.click()},{passive:true})})();
