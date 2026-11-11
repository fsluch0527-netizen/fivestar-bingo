/* 司会台本ビューア：script.md を一定間隔で取り直して自動更新する */
(function(){
var V = window.VENUE; // {id, name, md, repoPath}
var RAW = 'https://raw.githubusercontent.com/fsluch0527-netizen/fivestar-bingo/main/' + V.repoPath;
var API = 'https://api.github.com/repos/fsluch0527-netizen/fivestar-bingo/contents/' + V.repoPath + '?ref=main';
var EDIT = 'https://github.com/fsluch0527-netizen/fivestar-bingo/edit/main/' + V.repoPath;
var POLL_MS = 15000;
var LS = 'script:' + V.id;
var $ = function(s){return document.querySelector(s)};
var lastText = null, lastHashes = {}, firstRender = true;
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function inline(s){
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(【[^】]*】)/g,'<mark>$1</mark>');
  s = s.replace(/（\s*(要確認|仮)[^）]*）/g,function(m){return '<mark>'+m+'</mark>'});
  return s;
}
function hash(s){var h=0;for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0}return h}
function parse(md){
  var lines = md.replace(/\r/g,'').split('\n'), out = {title:'',intro:[],blocks:[]}, cur = null, i=0;
  while(i<lines.length){
    var ln = lines[i];
    if(/^# /.test(ln)){ out.title = ln.slice(2).trim(); i++; continue; }
    if(/^## /.test(ln)){ cur = {head: ln.slice(3).trim(), lines:[]}; out.blocks.push(cur); i++; continue; }
    (cur ? cur.lines : out.intro).push(ln); i++;
  }
  return out;
}
function body(lines){
  var h = '', i = 0, inList = false;
  function closeList(){ if(inList){h+='</ul>';inList=false} }
  while(i<lines.length){
    var ln = lines[i];
    if(/^\s*$/.test(ln)){ closeList(); i++; continue; }
    if(/^---+\s*$/.test(ln)){ closeList(); h+='<hr>'; i++; continue; }
    if(/^### /.test(ln)){ closeList(); h+='<h3>'+inline(ln.slice(4))+'</h3>'; i++; continue; }
    if(/^>/.test(ln)){
      closeList(); var q=[];
      while(i<lines.length && /^>/.test(lines[i])){ q.push(lines[i].replace(/^>\s?/,'')); i++; }
      h+='<blockquote>'+q.map(inline).join('<br>')+'</blockquote>'; continue;
    }
    if(/^\|/.test(ln)){
      closeList(); var rows=[];
      while(i<lines.length && /^\|/.test(lines[i])){ rows.push(lines[i]); i++; }
      var cells = function(r){ return r.replace(/^\||\|\s*$/g,'').split('|').map(function(c){return c.trim()}) };
      var hd = cells(rows[0]), bd = rows.slice(2).map(cells);
      h+='<div class="tw"><table><thead><tr>'+hd.map(function(c){return '<th>'+inline(c)+'</th>'}).join('')+'</tr></thead><tbody>'+
        bd.map(function(r){return '<tr>'+r.map(function(c){return '<td'+((c.length>14||hd.length<=4)?' class="wrap"':'')+'>'+inline(c)+'</td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>';
      continue;
    }
    if(/^\s*[-*] /.test(ln)){ if(!inList){h+='<ul>';inList=true} h+='<li>'+inline(ln.replace(/^\s*[-*] /,''))+'</li>'; i++; continue; }
    closeList(); h+='<p>'+inline(ln)+'</p>'; i++;
  }
  closeList(); return h;
}
function timeOf(head){ var m = head.match(/(\d{1,2}):(\d{2})/); return m ? (+m[1])*60+(+m[2]) : null; }
function getDone(){ try{return JSON.parse(localStorage.getItem(LS+':done')||'{}')}catch(e){return {}} }
function setDone(d){ try{localStorage.setItem(LS+':done',JSON.stringify(d))}catch(e){} }
function render(md, announce){
  var p = parse(md), done = getDone(), main = $('#main'), chips = $('#chips');
  var y = window.scrollY, newH = {}, html = '', ch = '';
  var times = p.blocks.map(function(b){return timeOf(b.head)});
  if(p.title){ document.title = p.title; $('#title').textContent = p.title; }
  if(p.intro.join('').trim()) html += '<div class="intro">'+body(p.intro)+'</div>';
  p.blocks.forEach(function(b,idx){
    var raw = b.head+'\n'+b.lines.join('\n'), hs = hash(raw), key = 'b'+idx+'_'+hash(b.head);
    newH[key] = hs;
    var isNotice = /^📢/.test(b.head);
    var plain = /^_/.test(b.head);
    var changed = !firstRender && lastHashes[key] !== undefined && lastHashes[key] !== hs;
    if(!firstRender && lastHashes[key] === undefined) changed = true;
    if(isNotice){
      var txt = b.lines.join('').replace(/\s/g,'');
      if(txt && !/^（?なし）?$/.test(txt) && !/^\(なし\)$/.test(txt)) html += '<div class="notice" id="'+key+'"><h2>'+inline(b.head)+'</h2>'+body(b.lines)+'</div>';
      return;
    }
    if(plain){ html += '<h2 class="plain" id="'+key+'">'+inline(b.head.replace(/^_/,''))+'</h2>'+body(b.lines); return; }
    var isDone = !!done[key];
    html += '<section class="blk'+(isDone?' done':'')+(changed?' changed':'')+'" id="'+key+'" data-t="'+(times[idx]===null?'':times[idx])+'"><h2 data-k="'+key+'"><span>'+inline(b.head)+'</span><span class="tg">'+(isDone?'済':'タップで済')+'</span></h2><div class="body">'+body(b.lines)+'</div></section>';
    if(times[idx]!==null) ch += '<a href="#'+key+'" data-k="'+key+'" data-t="'+times[idx]+'">'+b.head.match(/\d{1,2}:\d{2}/)[0]+'</a>';
  });
  main.innerHTML = html; chips.innerHTML = ch;
  lastHashes = newH; firstRender = false;
  window.scrollTo(0,y);
  markNow(); if(announce) toast('台本が更新されました（'+hhmm(new Date())+'）');
}
function hhmm(d){return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
function markNow(){
  var now = new Date(), m = now.getHours()*60+now.getMinutes(), cands = [].slice.call(document.querySelectorAll('section.blk[data-t]')).filter(function(s){return s.dataset.t!==''});
  var cur = null; cands.forEach(function(s){ if(+s.dataset.t <= m) cur = s; });
  document.querySelectorAll('section.blk.now,#chips a.now').forEach(function(e){e.classList.remove('now')});
  var d = new Date(); var isEventDay = (d.getFullYear()===2026 && d.getMonth()===10 && d.getDate()===12);
  if(cur && isEventDay){ cur.classList.add('now'); var c = document.querySelector('#chips a[data-k="'+cur.id+'"]'); if(c) c.classList.add('now'); }
  var done = getDone(); document.querySelectorAll('#chips a').forEach(function(a){ a.classList.toggle('done', !!done[a.dataset.k]); });
}
function toast(t){ var e=$('#toast'); e.textContent=t; e.style.display='block'; clearTimeout(toast._t); toast._t=setTimeout(function(){e.style.display='none'},4000); }
function setStatus(ok,msg){ var s=$('#status'); s.className = ok?'ok':'ng'; s.textContent = msg; }
function fetchText(url){ return fetch(url,{cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.text(); }); }
// 取得の優先順：①GitHub API（push直後に反映。304は回数制限に数えられない）②公開ページ③raw（最大5分遅れ）
function fetchApi(){ return fetch(API,{headers:{'Accept':'application/vnd.github.raw+json'},cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.text(); }); }
function load(announce){
  var t = Date.now();
  return fetchApi().catch(function(){ return fetchText(V.md+'?t='+t); }).catch(function(){ return fetchText(RAW+'?t='+t); }).then(function(text){
    try{localStorage.setItem(LS+':md',text)}catch(e){}
    setStatus(true,'最新 '+hhmm(new Date())+' 確認');
    if(text !== lastText){ var first = lastText===null; lastText = text; render(text, announce && !first); }
  }).catch(function(){
    setStatus(false,'オフライン（保存版を表示中）');
    if(lastText===null){ var c=null; try{c=localStorage.getItem(LS+':md')}catch(e){} if(c){ lastText=c; render(c,false);} else { $('#main').innerHTML='<p>読み込めませんでした。電波のよい場所で開き直してください。</p>'; } }
  });
}
document.addEventListener('click',function(e){
  var h = e.target.closest && e.target.closest('section.blk>h2');
  if(h){ var k = h.dataset.k, d = getDone(); if(d[k]) delete d[k]; else d[k] = 1; setDone(d); var s = h.parentNode; s.classList.toggle('done'); h.querySelector('.tg').textContent = d[k]?'済':'タップで済'; markNow(); }
});
// 文字サイズ
var fs = +(localStorage.getItem('script:fs')||18);
function applyFs(){ document.documentElement.style.setProperty('--fs', fs+'px'); try{localStorage.setItem('script:fs',fs)}catch(e){} }
$('#fsUp').onclick = function(){ fs=Math.min(30,fs+2); applyFs(); };
$('#fsDn').onclick = function(){ fs=Math.max(13,fs-2); applyFs(); };
$('#nowBtn').onclick = function(){ var n=document.querySelector('section.blk.now'); if(!n){ var d=getDone(), all=[].slice.call(document.querySelectorAll('section.blk')); n = all.filter(function(s){return !d[s.id]})[0]; } if(n) n.scrollIntoView({behavior:'smooth',block:'start'}); };
$('#refBtn').onclick = function(){ load(true).then(function(){ toast('最新の台本を確認しました'); }); };
$('#editBtn').href = EDIT;
$('#resetBtn').onclick = function(){ if(confirm('「済」の印をすべて外しますか？')){ setDone({}); render(lastText,false); } };
// 画面を消さない
var wl = null, wlBtn = $('#wlBtn');
if(!('wakeLock' in navigator)){ wlBtn.style.display='none'; }
wlBtn.onclick = function(){
  if(wl){ wl.release(); wl=null; wlBtn.classList.remove('on'); return; }
  navigator.wakeLock.request('screen').then(function(l){ wl=l; wlBtn.classList.add('on'); l.addEventListener('release',function(){ wl=null; wlBtn.classList.remove('on'); }); }).catch(function(){ toast('この端末では画面を消さない設定にできません'); });
};
document.addEventListener('visibilitychange',function(){ if(!document.hidden){ load(true); } });
applyFs(); load(false); setInterval(function(){ load(true); markNow(); }, POLL_MS);
})();
