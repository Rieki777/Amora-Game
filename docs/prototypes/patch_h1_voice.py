#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H1. Maia gets a voice, and a way to be read instead.

WHAT THIS IS. Three tiers with graceful decay, lifted in shape from
regen-civics-clean/client/src/components/companion/{useVoice,kokoroVoices,
hostedVoices}.ts and server/lib/tts.ts, and rewritten for a single HTML file
with no bundler:

  1  hosted signature voices  DARK. `live:false`, so nothing is fetched, nothing
                              is spent, and turning them on later is one flag.
  2  Kokoro, in the browser   the shipping voice. kokoro-js is imported from a
                              pinned CDN on the first tap, never at boot.
  3  device speechSynthesis   the floor. Zero network, speaks immediately, and
                              carries every line the tiers above cannot.

AND THE READ-INSTEAD TOGGLE IS THE POINT, not an accessibility footnote: Rye
asked for "a voice box if they don't wanna actually hear". It ships DEFAULTED
TO READ. That default is what makes the whole feature free: a visitor who never
taps it costs the same as before this patch, and the artifact keeps making
exactly one network request in its life.

CAPTIONS ALWAYS RENDER. maiaSay writes the line into #maiaLog first and asks
for sound second, so nothing spoken is ever the only copy of what she said.

WHY THE FIRST TAP IS THE ONLY PLACE THE ENGINE MAY LOAD. Two facts point the
same way. Browsers refuse to play audio that no gesture asked for, and the
Kokoro model is a ~90 MB download. So the tap is both the permission and the
budget, and mvKokoroUsable() refuses on file:// as well, which is where every
QA suite runs: the gates stay offline and deterministic.

Re-runnable. Every edit is guarded, applies once, and prints apply or skip.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, "grounds-v0.html")

src = io.open(ART, encoding="utf-8").read()
orig = src
applied, skipped = [], []


def edit(name, anchor, new, count=1, mode="after", guard=None):
    """Replace/insert against an EXACT-COUNT anchor. `guard` present == done."""
    global src
    if guard is not None and guard in src:
        skipped.append(name)
        return
    n = src.count(anchor)
    if n != count:
        print("ABORT %s: anchor found %d times, expected %d" % (name, n, count))
        print("  anchor: %r" % (anchor[:110],))
        sys.exit(2)
    if mode == "after":
        src = src.replace(anchor, anchor + new, 1)
    elif mode == "before":
        src = src.replace(anchor, new + anchor, 1)
    else:
        src = src.replace(anchor, new, 1)
    applied.append(name)


# ---------------------------------------------------------------- 1. the CSS
CSS_ANCHOR = "  #maiaHead .min{margin-left:auto;color:var(--gold);font-size:13px;padding:2px 6px}\n"
CSS_NEW = """  /* The read-instead toggle. It lives in her header because it is a fact
     about Maia and not about the page, and it is a real <button> so a
     keyboard and a screen reader both find it. The `+ .min` rule beats the
     bare `.min` rule above on specificity, which is how the minimise dash
     gives up its auto margin to the control that now sits before it. */
  #maiaHead .mvb{margin-left:auto;appearance:none;font-family:inherit;cursor:pointer;
    font-size:9.5px;letter-spacing:.14em;font-variant:small-caps;white-space:nowrap;
    color:var(--parch);background:rgba(236,208,138,.1);border:1px solid rgba(201,162,94,.45);
    border-radius:10px;padding:2px 8px}
  #maiaHead .mvb:hover{background:rgba(236,208,138,.24)}
  #maiaHead .mvb[aria-pressed="true"]{color:#1c2f1a;background:var(--gold-b);border-color:var(--gold-b)}
  #maiaHead .mvb+.min{margin-left:6px}
"""

edit("css: the voice toggle", CSS_ANCHOR, CSS_NEW, guard="#maiaHead .mvb{")

# --------------------------------------------------------------- 2. the markup
HTML_ANCHOR = '    <span class="min" id="maiaMin">'
HTML_NEW = (
    '    <button class="mvb" id="maiaVoice" type="button" aria-pressed="false"\n'
    '      data-tip="Maia can say this out loud, or stay written down. Your choice, remembered.">'
    "◍ read</button>\n"
)

edit("markup: the voice toggle", HTML_ANCHOR, HTML_NEW, mode="before",
     guard='id="maiaVoice"')

# ----------------------------------------------------------- 3. the voice module
VOICE_ANCHOR = "const mlog=$('maiaLog');\n"

VOICE_NEW = r"""/* ---------- MAIA'S VOICE: three tiers, and a way to read instead ----------

   The ladder, best first, each one falling to the next without a word to the
   person listening:

     1  hosted signature voices   DARK today. See MV_HOSTED.
     2  Kokoro, in this browser   the shipping voice, loaded on the first tap.
     3  device speechSynthesis    the floor. No network, no download, no wait.

   READ IS THE DEFAULT AND THAT IS THE DESIGN. Sound is something a person
   asks for. Until they do, this file behaves exactly as it did before the
   voice existed: no engine, no CDN, no audio element, and the single
   /api/map/walk-log POST is still the only request it ever makes.

   THE TAP IS THE PERMISSION AND THE BUDGET. No browser will play audio a
   gesture did not ask for, and the Kokoro weights are about 90 MB. Both facts
   name the same moment, so the first tap on the toggle is the only place the
   engine is allowed to load. */
const MV_KEY='amora-maia-voice';
const MVOICE={mode:'read',tier:null,engine:'idle'};
window.MVOICE=MVOICE;

/* TIER 1. Dark, and cheap to keep dark: `live` is false, so mvHosted() returns
   before it can build a request. Rye's call, carried over from the site: the
   key is added and nobody is paying yet. Turning these on is this one flag
   plus a route that answers {audio:<base64>,mime}. */
const MV_HOSTED={live:false,endpoint:'/api/map/tts',voice:'maia'};
function mvHostedLive(){return !!(MV_HOSTED.live&&MV_HOSTED.endpoint)}
window.mvHostedLive=mvHostedLive;

/* TIER 2. Pinned to the version the site already ships (kokoro-js ^1.2.1) so
   the two voices are the same voice. q8 on WASM keeps the one-time download
   near 90 MB; fp32 on WebGPU avoids q8's artifacts where the device has it. */
const MV_KOKORO={esm:'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
  model:'onnx-community/Kokoro-82M-v1.0-ONNX',voice:'af_bella',wait:12000};

/* Every reason to not even try. file:// is first because that is where every
   QA suite runs: the gates stay offline, and a suite that measures requests
   keeps measuring the same one. */
function mvKokoroUsable(){
  if(location.protocol==='file:')return false;
  if(typeof WebAssembly==='undefined')return false;
  if(navigator.onLine===false)return false;
  return true}
window.mvKokoroUsable=mvKokoroUsable;

let MV_SEQ=0,MV_AUDIO=null,MV_URL=null,MV_KTTS=null,MV_KLOAD=null;

/* Markup in, speech out. Deliberately a string transform and NOT innerHTML on
   a detached node: assigning innerHTML fires <img onerror> even off-document,
   and this function is handed lines that came over the bridge. */
function mvStrip(html){
  const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"};
  return String(html==null?'':html)
    .replace(/<br\s*\/?>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&([a-z]+|#\d+);/gi,function(m,e){return ENT[e.toLowerCase()]||' '})
    .replace(/\s+/g,' ').trim()}
window.mvStrip=mvStrip;

function mvCleanAudio(){
  if(MV_AUDIO){try{MV_AUDIO.pause()}catch(_){}MV_AUDIO=null}
  if(MV_URL){try{URL.revokeObjectURL(MV_URL)}catch(_){}MV_URL=null}}

/* Stop everything the ladder could have started. Called on every new line, on
   the toggle going quiet, and when a walk ends. */
function mvStop(){MV_SEQ++;mvCleanAudio();
  try{if('speechSynthesis'in window)speechSynthesis.cancel()}catch(_){}
  MVOICE.tier=null}
window.mvStop=mvStop;

function mvTier(t){MVOICE.tier=t}

function mvPlayBlob(blob,seq){return new Promise(function(res){
  if(seq!==MV_SEQ)return res();
  mvCleanAudio();
  let url;try{url=URL.createObjectURL(blob)}catch(_){return res()}
  const a=new Audio(url);MV_AUDIO=a;MV_URL=url;
  a.onended=function(){res()};a.onerror=function(){res()};
  const p=a.play();if(p&&p.catch)p.catch(function(){res()})})}

async function mvHosted(t,seq){
  if(!mvHostedLive())return false;
  try{
    const r=await fetch(MV_HOSTED.endpoint,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({voice:MV_HOSTED.voice,text:t})});
    if(!r.ok)return false;
    const d=await r.json();
    if(!d||!d.audio)return false;
    const bytes=Uint8Array.from(atob(d.audio),function(c){return c.charCodeAt(0)});
    if(seq!==MV_SEQ)return true;
    mvTier('hosted');
    await mvPlayBlob(new Blob([bytes],{type:d.mime||'audio/mpeg'}),seq);
    return true}
  catch(_){return false}}

/* Load once, and never make a sentence wait longer than MV_KOKORO.wait for it.
   A slow first load is answered by the device voice while the engine keeps
   loading in the background for the line after. */
function mvKokoroReady(){
  if(MV_KTTS)return Promise.resolve(true);
  if(MVOICE.engine==='failed')return Promise.resolve(false);
  if(!MV_KLOAD){
    MVOICE.engine='loading';mvPaint();
    MV_KLOAD=(async function(){try{
      const m=await import(MV_KOKORO.esm);
      const K=m&&(m.KokoroTTS||(m.default&&m.default.KokoroTTS));
      if(!K)throw new Error('kokoro-js exposed no KokoroTTS');
      const gpu=!!(navigator.gpu);
      MV_KTTS=await K.from_pretrained(MV_KOKORO.model,
        {dtype:gpu?'fp32':'q8',device:gpu?'webgpu':'wasm'});
      MVOICE.engine='ready';mvPaint();return true}
    catch(err){
      /* A warning, never a toast. Someone who asked to hear her still hears
         her, in the device voice, and has nothing to fix. */
      console.warn('[maia] the in-browser voice engine did not load; the device voice takes the line',err);
      MVOICE.engine='failed';mvPaint();return false}})()}
  return Promise.race([MV_KLOAD,new Promise(function(r){setTimeout(function(){r(false)},MV_KOKORO.wait)})])}

async function mvKokoroSpeak(t,seq){
  if(!MV_KTTS)return false;
  let played=false;
  try{
    /* Sentence by sentence, so the first audio lands while the rest is still
       being made. */
    for await(const chunk of MV_KTTS.stream(t,{voice:MV_KOKORO.voice})){
      if(seq!==MV_SEQ)return true;
      const blob=(chunk&&chunk.audio&&chunk.audio.toBlob)?chunk.audio.toBlob():null;
      if(!blob)continue;
      if(!played){played=true;mvTier('kokoro')}
      await mvPlayBlob(blob,seq);
      if(seq!==MV_SEQ)return true}
    return played}
  catch(err){return played}}

const MV_SHE=/(female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|zira|hazel|susan|allison|ava|joana|luciana|paulina|monica|amelie|anna|ellen|milena|catherine|kate|libby|aria|jenny|sonia)/i;
function mvDeviceVoice(){try{
  const all=speechSynthesis.getVoices()||[];
  const en=all.filter(function(v){return /^en/i.test(v.lang||'')});
  return en.find(function(v){return MV_SHE.test(v.name||'')})||en[0]||all[0]||null}
  catch(_){return null}}

function mvDevice(t,seq){
  if(!('speechSynthesis'in window))return false;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(t);
    const v=mvDeviceVoice();if(v)u.voice=v;
    u.rate=1;u.pitch=1.02;
    u.onstart=function(){if(seq===MV_SEQ)mvTier('device')};
    speechSynthesis.speak(u);return true}
  catch(_){return false}}

async function mvSpeakAsync(text){
  if(MVOICE.mode!=='hear')return;
  const t=mvStrip(text);
  if(!t)return;
  mvStop();
  const seq=MV_SEQ;
  if(mvHostedLive()){
    if(await mvHosted(t,seq))return;
    if(seq!==MV_SEQ)return}
  if(mvKokoroUsable()){
    const ready=await mvKokoroReady();
    if(seq!==MV_SEQ)return;
    if(ready&&await mvKokoroSpeak(t,seq))return;
    if(seq!==MV_SEQ)return}
  mvDevice(t,seq)}

/* The synchronous door every caller uses. Nothing above may reject into a
   caller's lap: a voice that throws must cost silence and nothing else. */
function mvSpeak(text){try{const p=mvSpeakAsync(text);if(p&&p.catch)p.catch(function(){})}catch(_){}}
window.mvSpeak=mvSpeak;

function mvPaint(){
  const b=$('maiaVoice');if(!b)return;
  const hear=MVOICE.mode==='hear';
  b.setAttribute('aria-pressed',hear?'true':'false');
  b.textContent=hear?(MVOICE.engine==='loading'?'♪ warming':'♪ hear'):'◍ read';
  b.title=hear?'Maia is speaking out loud. Tap to read her instead.'
              :'Maia is written down. Tap to hear her out loud.'}
window.mvPaint=mvPaint;

function mvMode(next){
  MVOICE.mode=(next==='hear')?'hear':'read';
  try{localStorage.setItem(MV_KEY,MVOICE.mode)}catch(_){}
  if(MVOICE.mode==='read'){mvStop();mvPaint();return}
  mvPaint();
  if(mvKokoroUsable())mvKokoroReady();
  mvSpeak('I am here. I will say the village out loud as we walk.')}
window.mvMode=mvMode;

(function mvBoot(){
  try{const saved=localStorage.getItem(MV_KEY);if(saved==='hear'||saved==='read')MVOICE.mode=saved}catch(_){}
  const b=$('maiaVoice');
  /* stopPropagation because the whole header is the minimise control. */
  if(b)b.onclick=function(e){e.stopPropagation();mvMode(MVOICE.mode==='hear'?'read':'hear')};
  mvPaint();
  /* A saved 'hear' is a past gesture, not a present one, so the engine still
     waits for a tap. The device floor speaks until then, which is exactly
     what an autoplay-blocked page can honour. */
})();
"""

edit("js: the three-tier voice", VOICE_ANCHOR, VOICE_NEW, mode="before",
     guard="const MV_KEY='amora-maia-voice';")

# --------------------------------------------- 4. maiaSay speaks what it writes
SAY_OLD = (
    "function maiaSay(html,from){const d=document.createElement('div');d.className='mline'+(from==='me'?' me':'');\n"
    "  d.innerHTML=(from==='me'?'':'<span class=\"from\">maia</span>')+html;mlog.appendChild(d);mlog.scrollTop=1e9;\n"
    "  while(mlog.children.length>40)mlog.firstChild.remove()}\n"
)
SAY_NEW = (
    "/* `say` is the spoken line when the written one carries controls with it:\n"
    "   a journey stop writes her words plus three buttons and a counter, and\n"
    "   \"walk on stay here 1 of 8\" is not something a resident says out loud.\n"
    "   Absent, the spoken line is the written one with its markup taken off.\n"
    "   THE CAPTION IS WRITTEN FIRST, ALWAYS. Sound is asked for after the line\n"
    "   is already on screen, so nobody depends on hearing it. */\n"
    "function maiaSay(html,from,say){const d=document.createElement('div');d.className='mline'+(from==='me'?' me':'');\n"
    "  d.innerHTML=(from==='me'?'':'<span class=\"from\">maia</span>')+html;mlog.appendChild(d);mlog.scrollTop=1e9;\n"
    "  while(mlog.children.length>40)mlog.firstChild.remove();\n"
    "  if(from!=='me')mvSpeak(say==null?mvStrip(html):say);\n"
    "  return d}\n"
)

edit("js: maiaSay speaks what it writes", SAY_OLD, SAY_NEW, mode="replace",
     guard="function maiaSay(html,from,say)")

# ------------------------------------------------------------------------ write
if src != orig:
    io.open(ART, "w", encoding="utf-8", newline="").write(src)

print("H1 voice:")
for a in applied:
    print("  apply  " + a)
for s in skipped:
    print("  skip   " + s + " (already present)")
print("  bytes  %+d" % (len(src.encode("utf-8")) - len(orig.encode("utf-8"))))
