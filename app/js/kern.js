// Daten, Format-Version und Speichern/Zusammenführen mit dem Server
var MON=["September","Oktober","November","Dezember","Januar","Februar","März","April"],DBL=[3,7],DT=[[],[],["2026-10-21","2026-10-28","2026-11-04"],["2026-11-11","2026-11-18","2026-11-25","2026-12-02"],["2026-12-09","2026-12-16","2026-12-23","2027-01-06"],["2027-01-13","2027-01-20","2027-01-27","2027-02-03"],["2027-02-10","2027-02-17","2027-02-24","2027-03-03"],["2027-03-10","2027-03-17","2027-03-24","2027-03-31","2027-04-07"]];
var L=["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Michael Vetter","Stefan Keller","Thomas Allemann","Othmar Oeler"],
N=["Manuel Ammann","Silvan Frey","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Cornel Eberle","Beat Rentsch","Tobias Keller"];
function mk(){return{tr:[],base:{},gs:[],ref:"",pre:[0,0],res:[null,null],g:{},a:{}}}
function def(){var s={t:[{n:"Lochball Legenden",c:L[0],p:L.slice()},{n:"SpVgg Nieder",c:N[0],p:N.slice()}],m:[]};for(var i=0;i<8;i++)s.m.push(mk());
var A=[[[4,4,3,3,0,3,0,3],[3,1,4,4,3,2,3,4]],[[5,5,4,5,2,5,4,4],[3,3,6,4,5,4,3,4]],[[1,1,1,0,1,1,1,1],[1,1,1,1,1,1,1,1]]];
A.forEach(function(r,i){[L,N].forEach(function(P,k){P.forEach(function(p,j){s.m[i].base[p]=r[k][j]})})});
s.m[0].pre=[1,3];s.m[0].res=[3,11];s.m[1].pre=[3,1];s.m[1].res=[9,5];s.m.forEach(function(m,i){m.tr=DT[i].map(function(d){return{d:d,p:[]}})});return s}
var S=fix(def()),cl={},tab="rang",cur=1,ot=-1,tm=null,sq=0,sb=null,me=null,live=null,ROLE="player",PLAYER=null,PREV=null,PUSH=null,CID=Math.random().toString(36).slice(2);
// Daten vom Server gelten als fremd: Zahlen und Formatfelder werden hier in ihre Form gebracht, damit sie ohne esc() dargestellt werden dürfen.
function nu(x){x=typeof x=="number"||typeof x=="string"?+x:0;return isFinite(x)?x:0}
function nuL(a,n){a=Array.isArray(a)?a:[];var r=[];for(var i=0;i<n;i++)r.push(a[i]==null?null:nu(a[i]));return r}
function nuM(o){var r={};if(o&&typeof o=="object"&&!Array.isArray(o))Object.keys(o).forEach(function(k){r[k]=nu(o[k])});return r}
function strs(a){return (Array.isArray(a)?a:[]).filter(function(x){return typeof x=="string"})}
function isTr(x){return !!x&&typeof x=="object"&&!Array.isArray(x)&&/^\d{4}-\d{2}-\d{2}$/.test(x.d)}
function cleanTr(x){x.p=strs(x.p);if(x.n!=null)x.n=nu(x.n);if(x.ab!=null)x.ab=strs(x.ab);if(x.t!=null&&!/^\d{2}:\d{2}$/.test(x.t))delete x.t;["r","lead"].forEach(function(k){if(x[k]!=null&&typeof x[k]!="string")delete x[k]});
if(x.st!=null){var st={};if(typeof x.st=="object")Object.keys(x.st).forEach(function(p){if(x.st[p]=="u"||x.st[p]=="v")st[p]=x.st[p]});x.st=st}
if(x.gs!=null)x.gs=(Array.isArray(x.gs)?x.gs:[]).filter(function(g){return g&&typeof g.n=="string"})}
function clean(s){s.sn=String(s.sn);s.t.forEach(function(t){t.n=String(t.n);t.p=strs(t.p);if(t.gk!=null)t.gk=strs(t.gk);if(t.c!=null&&typeof t.c!="string")delete t.c});
s.m.forEach(function(m){m.res=nuL(m.res,2);m.pre=nuL(m.pre,2).map(nu);m.g=nuM(m.g);m.a=nuM(m.a);m.base=nuM(m.base);m.ref=typeof m.ref=="string"?m.ref:"";m.gs=(Array.isArray(m.gs)?m.gs:[]).filter(function(g){return g&&typeof g.n=="string"&&typeof g.k=="string"&&(g.t===0||g.t===1)});if(m.ff!==0&&m.ff!==1)delete m.ff;if(m.kp!=null)m.kp=Array.isArray(m.kp)?m.kp.map(function(L){return L==null?null:strs(L)}):[null,null];if(m.anw!=null)m.anw=nuM(m.anw);m.tr.forEach(cleanTr)});delete s.stk;
if(isTr(s.evt))cleanTr(s.evt);else delete s.evt;
// Event-Daten der Spielleitung (S.wev Winter Event, S.sev Sommer Event): nur ein gültiges Datum, sonst gilt das berechnete
["wev","sev"].forEach(function(k){if(s[k]!=null&&!isDay(s[k]))delete s[k]});return s}
function isDay(v){if(typeof v!="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;var x=new Date(v+"T12:00:00Z");return !isNaN(x)&&x.toISOString().slice(0,10)==v}
function fix(s){if(s.sn==null)s.sn="26/27";s.t.forEach(function(t){t.p=strs(t.p)});var all=s.t[0].p.concat(s.t[1].p);s.t.forEach(function(t){if(!t.c)t.c=t.p[0];t.p.sort(function(a,b){return a.localeCompare(b,"de")})});s.m.forEach(function(m,i){if(!m.tr){m.base=i<2?(m.att||{}):{};m.tr=DT[i].map(function(d){return{d:d,p:[]}});delete m.att}m.tr=(Array.isArray(m.tr)?m.tr:[]).filter(isTr);if(!m.ref)m.ref="";if(!m.gs)m.gs=[];m.tr.forEach(function(x){if(x.abs){x.p=x.abs.length?all.filter(function(q){return x.abs.indexOf(q)<0}):[];delete x.abs}})});return migrate(clean(s))}
// Datenformat-Version. Bei jeder Format-Änderung SV erhöhen und hier migrieren – alte Daten bleiben erhalten.
// Daten einer neueren App-Version werden nie mit einem älteren Format überschrieben (NEWER → nur lesen).
var SV=2,NEWER=false;
function migrate(s){var v=+s.v||1;if(v>SV){NEWER=true;return s}
if(v<2){v=2}/* 1→2: Versionsfeld eingeführt, Inhalte unverändert */
s.v=v;return s}
// BASE = letzter Stand vom Server. Gespeichert wird nur, was sich gegenüber BASE geändert hat: Änderungen anderer bleiben erhalten,
// auch wenn dieses Gerät lange einen alten Stand offen hatte. Ohne BASE (Backup laden) gilt der eigene Stand.
var BASE=null;
function clone(o){return JSON.parse(JSON.stringify(o))}
function same(a,b){return JSON.stringify(a)==JSON.stringify(b)}
function isObj(x){return !!x&&typeof x=="object"&&!Array.isArray(x)}
function mgList(b,m,t,id){var B=Array.isArray(b)?b:[],has=function(L,x){return L.some(function(y){return id(y)==id(x)})},get=function(L,x){return L.filter(function(y){return id(y)==id(x)})[0]},r=[];t.forEach(function(x){if(!has(B,x)||has(m,x))r.push(has(m,x)?merge3(get(B,x),get(m,x),x):x)});m.forEach(function(x){if(!has(r,x)&&!has(B,x))r.push(x)});return r}
function merge3(b,m,t){if(same(m,b))return t;if(same(t,b)||same(m,t))return m;
if(Array.isArray(m)&&Array.isArray(t)){var A=m.concat(t);if(A.every(function(x){return x===null||typeof x!="object"}))return mgList(b,m,t,function(x){return x});
var k=["d","k","n"].filter(function(q){return A.every(function(x){return isObj(x)&&x[q]!=null})})[0];if(k){var r=mgList(b,m,t,function(x){return x[k]});
// Trainings eines Monats: rein nach Datum – der späteste Termin ist der Match Day (siehe sortBlock)
return k=="d"?r.sort(function(x,y){return x.d<y.d?-1:1}):r}
if(m.length==t.length)return m.map(function(x,i){return merge3(Array.isArray(b)?b[i]:undefined,x,t[i])});return m}
if(isObj(m)&&isObj(t)){var o={},B=isObj(b)?b:{};Object.keys(m).concat(Object.keys(t)).forEach(function(q){var v=merge3(B[q],m[q],t[q]);if(v!==undefined)o[q]=v});return o}
return m}
function load(){try{var j=localStorage.getItem("ic_state");if(j)S=fix(JSON.parse(j));var q=localStorage.getItem("ic_base");BASE=q?JSON.parse(q):null}catch(e){}}
function store(){try{localStorage.setItem("ic_state",JSON.stringify(S))}catch(e){}}
function setBase(d){BASE=clone(d);try{localStorage.setItem("ic_base",JSON.stringify(BASE))}catch(e){}}
function adopt(d){S=fix(d);setBase(S);store()}
function idle(){return !document.activeElement||!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)}
function save(){store();sq++;try{localStorage.setItem("ic_dirty","1")}catch(e){}clearTimeout(tm);tm=setTimeout(push,400)}
// Speichern fehlgeschlagen (offline oder wiederholter Konflikt): einmal Bescheid geben; nachgeholt wird automatisch (siehe later)
var SFAIL=false;function saveFail(r){if(r&&r.error&&!SFAIL){SFAIL=true;toast(r.error.conflict?"⏳ Andere haben gleichzeitig gespeichert. Deine Änderung ist noch nicht gespeichert und wird automatisch nachgeholt.":"⚠️ Nicht gespeichert – keine Verbindung. Wird automatisch nachgeholt, sobald du wieder online bist.")}return r}
// Speichern mit Nachholen: PIF zählt laufende Speichervorgänge. Bleibt danach eine Änderung offen, steht im Kopf
// „Noch nicht gespeichert“, und es wird mit wachsender Pause (2 s, 5 s, 15 s, dann jede Minute) erneut zusammengeführt und gespeichert.
var PIF=0,RT=null,RN=0,RD=[2e3,5e3,15e3,6e4];
function push(n){tm=null;if(!sb||!me||NEWER||MAINT)return Promise.resolve({});PIF++;return push1(n||0).then(function(r){PIF--;later(r);return r},function(e){PIF--;later({error:e||{}});throw e})}
function later(r){if(!isDirty()){RN=0;clearTimeout(RT);RT=null;pend(false);return}if(tm||PIF||!(r&&r.error))return;pend(true);clearTimeout(RT);
RT=setTimeout(function(){RT=null;if(isDirty()&&!tm&&!PIF&&me)push()},RD[Math.min(RN++,RD.length-1)])}
function pend(on){var e=document.getElementById("sync");if(e)e.hidden=!on}
function noRetry(){clearTimeout(RT);RT=null;RN=0;SFAIL=false;pend(false)}
function push1(n){var s=sq,mine=clone(S);return sb.from("league_state").select("data,updated_at").eq("id","main").maybeSingle().then(function(q){if(q.error)return saveFail(q);
var sv=q.data,cas=sv&&sv.updated_at,d=sv?fix(merge3(BASE||sv.data,mine,sv.data)):mine,row={data:d,client:CID,updated_by:me.id,updated_at:new Date().toISOString()};
return (cas?sb.from("league_state").update(row).eq("id","main").eq("updated_at",sv.updated_at).select("id"):sb.from("league_state").upsert(Object.assign({id:"main"},row))).then(function(r){
// Vom Server abgelehnt (fehlende Rechte): nicht endlos neu versuchen, sondern den gültigen Stand laden
if(r.error){if(/Nur Admins|Ungültige Daten/.test(r.error.message||"")){alert(r.error.message+". Der aktuelle Stand wird neu geladen.");return reloadState().then(function(){return r})}return saveFail(r)}
// Jemand anderes war schneller: mit dem neuen Stand nochmals zusammenführen. Nach drei Wiederholungen als Fehler melden,
// damit die Änderung nicht still ungespeichert bleibt (später erneut, siehe later)
if(cas&&!(r.data&&r.data.length))return n<3?push1(n+1):saveFail({data:r.data,error:{message:"Konflikt beim Speichern",conflict:true}});
SFAIL=false;var more=s!=sq,neu=!same(d,mine);setBase(d);S=fix(more?merge3(mine,S,d):clone(d));store();if(!more)try{localStorage.removeItem("ic_dirty")}catch(e){}if(neu&&idle())render();return r})})}
function isDirty(){try{return!!localStorage.getItem("ic_dirty")}catch(e){return false}}
// Tagesdatum (lokal). Eine installierte PWA bleibt oft tagelang offen: newDay() (start.js) setzt TD neu, sobald ein neuer Tag ist
function heute(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
var TD=heute();
function nxt(m){var i=m.tr.findIndex(function(x){return x.d>=TD});return i<0?m.tr.length-1:i}
function isMD(d){return S.m.some(function(m){return m.tr.length&&m.tr[m.tr.length-1].d==d})}
