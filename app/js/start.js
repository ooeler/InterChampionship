// Anmeldung, Wartungsmodus, Start der App, Saison-Effekte
// Einladungslink: Token prüfen, dann Konto mit Mail und Passwort erstellen (kein Mailversand nötig)
function endJoin(){JOIN=null;history.replaceState(null,"",location.pathname+location.search)}
function joinCheck(){fnCall("invite",{action:"check",token:JOIN}).then(function(r){var W=document.querySelector("#auth .jw");if(!W)return;var d=r.data||{};
if(r.error||!d.ok){W.textContent=d.error||"Der Einladungslink konnte nicht geprüft werden. Bitte später nochmals versuchen.";return}
W.textContent="Du bist eingeladen"+(d.player?" als "+d.player:"")+(d.role&&d.role!="player"?" ("+RL[d.role]+")":"")+". Erstelle jetzt dein Konto – mit deiner Mail-Adresse und einem Passwort.";document.querySelector("#auth form[data-f=join]").hidden=false})}
document.getElementById("auth").addEventListener("click",function(e){var b=e.target.closest("[data-af],[data-oa]");if(!b)return;if(b.dataset.af){if(b.dataset.af=="public")showPublic();else ascr(b.dataset.af);return}
b.disabled=true;sb.auth.signInWithOAuth({provider:b.dataset.oa,options:{redirectTo:location.origin+location.pathname}}).then(function(r){b.disabled=false;if(r.error)document.querySelector("#auth .err").textContent=aerr(r.error.message)})});
document.getElementById("auth").addEventListener("submit",function(e){e.preventDefault();var f=e.target,F=f.elements,E=f.querySelector(".err"),B=f.querySelector("button");E.textContent="";B.disabled=true;
function done(r,ok){B.disabled=false;if(r.error)E.textContent=ok?r.error.message:ok===false?"Anmeldung fehlgeschlagen: E-Mail oder Passwort falsch.":r.error.message}
if(f.dataset.f=="login")sb.auth.signInWithPassword({email:F.email.value.trim(),password:F.pw.value}).then(function(r){done(r,false)});
else if(f.dataset.f=="forgot")sb.auth.resetPasswordForEmail(F.email.value.trim(),{redirectTo:location.origin+location.pathname}).then(function(r){done(r);if(!r.error)E.textContent="Falls diese Adresse eingeladen ist, kommt gleich eine Mail mit einem Link."});
else if(f.dataset.f=="join"){if(F.p1.value!=F.p2.value){B.disabled=false;E.textContent="Die Passwörter stimmen nicht überein.";return}var em=F.email.value.trim(),pw=F.p1.value;
fnCall("invite",{action:"join",token:JOIN,email:em,password:pw}).then(function(r){if(r.error||!r.data||!r.data.ok){B.disabled=false;E.textContent=r.data&&r.data.error||"Registrierung fehlgeschlagen.";return}
endJoin();sb.auth.signInWithPassword({email:r.data.email||em,password:pw}).then(function(x){done(x,false)})})}
else if(f.dataset.f=="setpw"){if(F.p1.value!=F.p2.value){B.disabled=false;E.textContent="Die Passwörter stimmen nicht überein.";return}
sb.auth.updateUser({password:F.p1.value}).then(function(r){done(r);if(r.error)return;INV=false;history.replaceState(null,"",location.pathname);start()})}});
// Ohne Login: nur die Rangliste, nur lesen (Daten sind öffentlich lesbar, siehe Migration 03)
// Wartungsmodus (Release-Workflow schaltet public.app_status.maintenance ein und aus)
var MAINT=false,MT=null;
function maint(){if(!sb)return;sb.from("app_status").select("maintenance").eq("id","main").maybeSingle().then(function(r){if(r&&!r.error)setMaint(!!(r.data&&r.data.maintenance))},function(){})}
function setMaint(on){if(MAINT&&!on){location.reload();return}MAINT=on;document.getElementById("wart").hidden=!on;clearInterval(MT);if(on)MT=setInterval(maint,20000)}
function watchMaint(){maint();try{sb.channel("status").on("postgres_changes",{event:"*",schema:"public",table:"app_status"},function(p){if(p.new)setMaint(!!p.new.maintenance)}).subscribe()}catch(e){}document.addEventListener("visibilitychange",function(){if(!document.hidden)maint()})}
var PUB=false;
(function(){var u=logoMem(),e=document.querySelector("#splash img");if(u&&e)e.src=u})();
function showPublic(){PUB=true;hideSplash();var a=document.getElementById("auth");a.hidden=true;a.innerHTML="";document.body.classList.remove("lo");load();render();
sb.rpc("public_league").then(function(r){if(r.data){S=fix(r.data);render()}})}
// Link aus dem WhatsApp-Aufruf: nach dem Anmelden direkt zu „Meine Trainings“
var GOTR=/^#trainings$/.test(location.hash),GOSP=(location.hash.match(/^#spieltag=([0-7])$/)||[])[1],SPGO=null;
// Link #spieltag=<Monat> (z. B. aus der WhatsApp-Nachricht zur Skorerliste): nach dem Login direkt dieser Spieltag
function spGo(){cur=SPGO;ot=nxt(S.m[cur]);render();var sk=document.querySelector(".skban")||document.querySelector("#app .score");if(sk)sk.scrollIntoView({block:"start"})}
// Kommt der Ligastand erst nach dem Login, setzt goNow() den Monat zurück – dann den Link-Monat erneut wählen
function goTr(){if(GOSP!=null){SPGO=+GOSP;GOSP=null;history.replaceState(null,"",location.pathname);tab="spiel";SPED=-1;spGo();return}if(!GOTR)return;GOTR=false;history.replaceState(null,"",location.pathname);tab="train";ACC.mytr=true;render();var h=document.querySelector("h3[data-acc=mytr]");if(h)h.scrollIntoView({block:"start"})}
function start(){PUB=false;SPGO=null;hideSplash();var a=document.getElementById("auth");a.hidden=true;a.innerHTML="";document.body.classList.remove("lo");load();if(!BASE)try{localStorage.removeItem("ic_dirty")}catch(e){}goNow();render();
setTimeout(function(){sb.rpc("me").then(function(r){var d=r.data||{};REAL={role:d.role||"player",resto:!!d.resto,strafen:!!d.strafen};applyRole();PLAYER=d.player||null;PREV=d.prev_seen||null;NOTIFY=!!d.notify_changes;LEADCC=d.lead_cc!==false;render();goTr();fbDone();act()});pushState();
sb.from("league_state").select("data").eq("id","main").maybeSingle().then(function(r){if(r.error)return;if(r.data&&r.data.data&&!isDirty()){adopt(r.data.data);goNow();if(SPGO!=null){spGo();SPGO=null}else render()}else push()});
stop();live=sb.channel("league").on("postgres_changes",{event:"*",schema:"public",table:"league_state",filter:"id=eq.main"},function(p){var n=p.new;if(!n||!n.data||n.client==CID||tm||isDirty())return;adopt(n.data);if(idle())render()}).subscribe()},0)}
function stop(){if(live){sb.removeChannel(live);live=null}}
addEventListener("online",function(){if(isDirty())push()});
// Zurück in der App: Hintergrund-Verbindungen brechen auf dem Handy ab, darum den Stand frisch holen
document.addEventListener("visibilitychange",function(){if(document.hidden||!sb||!me||PUB||tm||isDirty())return;sb.from("league_state").select("data").eq("id","main").maybeSingle().then(function(r){if(!r.error&&r.data&&r.data.data&&!tm&&!isDirty()){adopt(r.data.data);if(idle())render()}})});
(function(){var C=window.IM_CONFIG||{};if(!C.url||!C.key||!window.supabase){ascr("cfg");return}
sb=supabase.createClient(C.url,C.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});watchMaint();
sb.auth.onAuthStateChange(function(ev,s){var u=s&&s.user;if(ev=="PASSWORD_RECOVERY")INV=true;if(ev=="USER_UPDATED")return;
setTimeout(function(){if(!u){me=null;stop();if(JOIN){ascr("join");return}if(!HERR){showPublic();return}ascr("login",HERR&&aerr(decodeURIComponent(HERR.replace(/\+/g," "))));HERR=null;if(/error/.test(location.hash))history.replaceState(null,"",location.pathname);return}
if(JOIN)endJoin();var nw=!me||me.id!=u.id;me=u;if(INV)ascr("setpw");else if(nw)start()},0)})})();
// Saison-Effekte: an besonderen Tagen fliegt ab und zu ein Emoji durchs Bild, Advent (Mütze auf Let’s Fly), Schnee an manchen Wintertagen
var FX={"01-01":["🎆","🥂"],"01-06":["👑","🐫"],"02-14":["❤️","💘"],"08-01":["🇨🇭","🎆"],"10-31":["👻","🎃"],"12-06":["🎅","🎁"],"12-24":["🎄","🎁"],"12-25":["🎄","🎁"],"12-26":["🎄","⭐"],"12-31":["🎆","🥂"]};
function easter(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(y,Math.floor(n/31)-1,n%31+1)}
function fxDay(d){var x=new Date(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8)),t=Math.round((x-easter(x.getFullYear()))/864e5);return t>=-2&&t<=1?["🐰","🥚"]:FX[d.slice(5)]}
function isAdvent(d){var y=+d.slice(0,4),a=new Date(y,11,24-new Date(y,11,24).getDay()-21);return new Date(y,+d.slice(5,7)-1,+d.slice(8))>=a&&d.slice(5)<="12-24"}
function isSnow(d){return /^(12|01|02)/.test(d.slice(5))&&pick([1,0,0],d+"schnee")==1}
function spook(L){if(document.hidden)return;var b=document.createElement("div"),e=document.createElement("span");b.id="spook";if(Math.random()<.5)b.className="rv";b.setAttribute("aria-hidden","true");e.style.top=12+Math.random()*60+"%";e.textContent=L[Math.random()<.5?0:1];b.append(e);document.body.append(b);e.addEventListener("animationend",function(){b.remove()})}
function snow(){var b=document.createElement("div");b.id="snow";b.setAttribute("aria-hidden","true");for(var i=0;i<40;i++){var f=document.createElement("i"),z=3+Math.random()*5;f.style.cssText="left:"+Math.random()*100+"%;width:"+z+"px;height:"+z+"px;animation-duration:"+(6+Math.random()*5)+"s;animation-delay:"+Math.random()*9+"s";b.append(f)}document.body.append(b);setTimeout(function(){b.remove()},21e3)}
(function(){document.querySelector("header .tag").classList.toggle("xm",isAdvent(TD));if(calm())return;var F=fxDay(TD);if(F){var go=function(){spook(F);setTimeout(go,4e4+Math.random()*5e4)};setTimeout(go,2500)}if(isSnow(TD))setTimeout(snow,1500)})();
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js").catch(function(){});
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(function(){});
