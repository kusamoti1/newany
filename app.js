const STORAGE_KEY = 'any-planner-web-faithful-v1.7';
const APP_VERSION = 'v1.8.2';
const $ = (s)=>document.querySelector(s);
const BUILTIN_TEMPLATES = [];
const DEMO_TITLES = new Set(['弁当','依頼者へメール返信','17日資料作成','資料作成','明日の準備']);
const FILTERS = [
  { key:'all', label:'全部' },
  { key:'work', label:'仕事' },
  { key:'home', label:'家' },
  { key:'personal', label:'個人' },
  { key:'recent', label:'履歴' },
  { key:'custom', label:'登録' },
];
const state = {
  selected: todayISO(),
  monthCursor: startOfMonth(new Date()),
  editorId: null,
  settings: { wake:'07:00', sleep:'23:00' },
  tasks: [],
  pendingImage: '',
  templateFilter: 'all',
  customTemplates: [],
  recentTitles: []
};

function todayISO(){ const d=new Date(); return iso(d); }
function pad2(n){ return String(n).padStart(2,'0'); }
function iso(d){ const x=new Date(d.getFullYear(), d.getMonth(), d.getDate()); return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}`; }
function parseISO(v){ const [y,m,d]=v.split('-').map(Number); return new Date(y,m-1,d); }
function plusDays(v,n){ const d=parseISO(v); d.setDate(d.getDate()+n); return iso(d); }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function jpMonth(d){ return `${d.getMonth()+1}月`; }
function jpMonthYear(d){ return `${d.getFullYear()}年${d.getMonth()+1}月`; }
function normalizeTitle(v){ return String(v||'').trim().replace(/\s+/g,' '); }
function uniqueTitles(list){ return [...new Set(list.map(normalizeTitle).filter(Boolean))]; }
function shortCaption(v){ const d=parseISO(v); return `${d.getMonth()+1}月${d.getDate()}日(${['日','月','火','水','木','金','土'][d.getDay()]})`; }
function normalizeTimeValue(v, fallback){
  const base = String(v || fallback || '00:00');
  const m = base.match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return fallback || '00:00';
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return `${hh}:${String(mm).padStart(2,'0')}`;
}
function railCaption(v){
  const t = normalizeTimeValue(v, '00:00').split(':');
  return `${Number(t[0])}:${t[1]}`;
}
function toMinutes(v){
  const t = normalizeTimeValue(v, '00:00').split(':').map(Number);
  return t[0]*60 + t[1];
}
function fromMinutes(total){
  const clamped = Math.min(23*60+59, Math.max(0, total));
  const h = Math.floor(clamped/60);
  const m = clamped%60;
  return `${h}:${String(m).padStart(2,'0')}`;
}
function buildRailTimes(wake, sleep){
  const start = toMinutes(wake);
  let end = toMinutes(sleep);
  if(end <= start) end = Math.min(start + 16*60, 23*60+59);
  const result = [fromMinutes(start)];
  let tick = Math.ceil((start + 1) / 60) * 60;
  while(tick < end){
    result.push(fromMinutes(tick));
    tick += 60;
  }
  const endLabel = fromMinutes(end);
  if(result[result.length-1] !== endLabel) result.push(endLabel);
  return result;
}

function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    if(Array.isArray(raw.tasks)) state.tasks=raw.tasks;
    if(raw.settings) Object.assign(state.settings, raw.settings);
    if(Array.isArray(raw.customTemplates)) state.customTemplates = raw.customTemplates.map(t=>({ id:t.id||uid(), title:normalizeTitle(t.title), category:t.category||'personal' })).filter(t=>t.title);
    if(Array.isArray(raw.recentTitles)) state.recentTitles = uniqueTitles(raw.recentTitles).slice(0, 12);
    migrateDemoData(raw);
  }catch{}
  seed();
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    tasks: state.tasks,
    settings: state.settings,
    customTemplates: state.customTemplates,
    recentTitles: state.recentTitles,
    migrationNoDemoSeed: true
  }));
}
function seed(){
  if(state.tasks.length || state.customTemplates.length || state.recentTitles.length) return;
  save();
}

function migrateDemoData(raw){
  if(raw?.migrationNoDemoSeed === true) return;
  const before = JSON.stringify({ tasks:state.tasks, customTemplates:state.customTemplates, recentTitles:state.recentTitles });
  state.tasks = state.tasks.filter(task=>!isDemoSeedTask(task));
  state.customTemplates = state.customTemplates.filter(template=>!DEMO_TITLES.has(normalizeTitle(template.title)));
  state.recentTitles = state.recentTitles.filter(title=>!DEMO_TITLES.has(normalizeTitle(title)));
  const after = JSON.stringify({ tasks:state.tasks, customTemplates:state.customTemplates, recentTitles:state.recentTitles });
  if(before !== after){
    save();
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks: state.tasks,
      settings: state.settings,
      customTemplates: state.customTemplates,
      recentTitles: state.recentTitles,
      migrationNoDemoSeed: true
    }));
  }
}
function isDemoSeedTask(task){
  const title = normalizeTitle(task?.title);
  if(!DEMO_TITLES.has(title)) return false;
  if(title === '弁当') return normalizeTitle(task?.note) === '次にやること';
  if(title === '依頼者へメール返信') return normalizeTitle(task?.note) === '15分';
  if(title === '17日資料作成') return !normalizeTitle(task?.note);
  return true;
}

function recordRecentTitle(title){
  const normalized = normalizeTitle(title);
  if(!normalized) return;
  state.recentTitles = [normalized, ...state.recentTitles.filter(t=>t !== normalized)].slice(0, 12);
}
function saveCurrentAsTemplate(){
  const title = normalizeTitle($('#taskTitle').value);
  if(!title) return;
  const category = $('#templateCategory').value || 'personal';
  const exists = state.customTemplates.some(t => t.title === title && t.category === category);
  if(!exists){
    state.customTemplates.unshift({ id:uid(), title, category });
    state.customTemplates = state.customTemplates.slice(0, 30);
  }
  recordRecentTitle(title);
  save();
  renderQuickTemplates();
  renderTemplateManager();
}
function deleteTemplate(id){
  state.customTemplates = state.customTemplates.filter(t=>t.id!==id);
  save();
  renderQuickTemplates();
  renderTemplateManager();
}
function templateSource(){
  const recentItems = state.recentTitles.map((title, index)=>({ id:`r${index}`, title, category:'recent' }));
  const customItems = state.customTemplates.map(t=>({ ...t, category: t.category || 'custom' }));
  return [...BUILTIN_TEMPLATES, ...customItems, ...recentItems];
}
function filteredTemplates(){
  const items = templateSource();
  if(state.templateFilter === 'all') return items;
  if(state.templateFilter === 'custom') return state.customTemplates;
  if(state.templateFilter === 'recent') return state.recentTitles.map((title, index)=>({ id:`r${index}`, title, category:'recent' }));
  return items.filter(t=>t.category === state.templateFilter);
}

function dayTasks(){ return state.tasks.filter(t=>!t.later && t.date===state.selected).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')); }
function laterTasks(){ return state.tasks.filter(t=>t.later); }

function renderHeader(){
  const d=parseISO(state.selected);
  $('#heroDay').textContent=d.getDate();
  $('#heroMonthInline').textContent=jpMonth(d);
  $('#heroYear').textContent=d.getFullYear();
  $('#heroMonthTitle').textContent=jpMonthYear(d);
  const openCount = state.tasks.filter(t=>!t.done).length;
  const doneCount = state.tasks.filter(t=>t.done).length;
  $('#openCount').textContent=`未完了 ${openCount}件`;
  $('#doneCount').textContent=`完了 ${doneCount}件`;
  const appVersion = $('#appVersion'); if(appVersion) appVersion.textContent = APP_VERSION;
  $('#wakeCardTime').textContent=state.settings.wake;
  $('#sleepCardTime').textContent=state.settings.sleep;
  syncSettingInputs();
}
function syncSettingInputs(){
  const wake = $('#wakeTime');
  const sleep = $('#sleepTime');
  if(wake) wake.value = state.settings.wake;
  if(sleep) sleep.value = state.settings.sleep;
}
function renderWeek(){
  const strip=$('#weekStrip'); strip.innerHTML='';
  const d=parseISO(state.selected); const start=new Date(d); start.setDate(d.getDate()-d.getDay());
  for(let i=0;i<7;i++){
    const x=new Date(start); x.setDate(start.getDate()+i); const xIso=iso(x);
    const el=document.createElement('button'); el.className='week-item'+(xIso===state.selected?' active':'')+(xIso===todayISO()?' today':'');
    el.innerHTML=`<div class="week-label">${['日','月','火','水','木','金','土'][x.getDay()]}</div><div class="week-bubble"><div class="week-num">${x.getDate()}</div></div>`;
    el.onclick=()=>{state.selected=xIso; state.monthCursor=startOfMonth(parseISO(state.selected)); render();};
    strip.appendChild(el);
  }
}
function renderQuickTemplates(){
  const cats = $('#categoryStrip');
  const list = $('#templateList');
  if(!cats || !list) return;
  cats.innerHTML=''; list.innerHTML='';
  FILTERS.forEach(filter=>{
    const b=document.createElement('button');
    b.className='category-chip'+(state.templateFilter===filter.key?' active':'');
    b.textContent=filter.label;
    b.onclick=()=>{ state.templateFilter=filter.key; renderQuickTemplates(); };
    cats.appendChild(b);
  });
  const items = filteredTemplates();
  if(!items.length){
    list.innerHTML='<div class="template-empty">まだ登録がありません</div>';
    return;
  }
  items.slice(0, 18).forEach(item=>{
    const b=document.createElement('button');
    b.className='template-pill';
    b.innerHTML=`<span>${escapeHtml(item.title)}</span><small>${labelForCategory(item.category)}</small>`;
    b.onclick=()=>openEditorWithTemplate(item);
    list.appendChild(b);
  });
}
function labelForCategory(category){
  return ({ work:'仕事', home:'家', personal:'個人', custom:'登録', recent:'履歴' })[category] || '登録';
}
function openEditorWithTemplate(item){
  openEditor();
  $('#taskTitle').value = item.title;
  if(item.category && item.category !== 'recent' && item.category !== 'custom') $('#templateCategory').value = item.category;
}
function renderRail(){
  const rail=$('#timeRail'); rail.innerHTML='';
  const wake = normalizeTimeValue(state.settings.wake, '07:00');
  const sleep = normalizeTimeValue(state.settings.sleep, '23:00');
  const times = buildRailTimes(wake, sleep).map(railCaption);
  const slotHeight = Math.max(34, Math.min(58, Math.floor(520 / Math.max(1, times.length - 1))));
  times.forEach(t=>{
    const row=document.createElement('div');
    row.className='rail-time';
    row.style.height = `${slotHeight}px`;
    row.textContent=t;
    row.innerHTML += '<span class="rail-dot"></span>';
    rail.appendChild(row);
  });
  const now=new Date(); $('#currentTimeBadge').textContent=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}
function renderTimeline(){
  const list=$('#timelineList'); list.innerHTML='';
  dayTasks().forEach(t=>{
    const row=document.createElement('div'); row.className='task-row';
    row.innerHTML=`<div class="task-time">${t.time||'--:--'}</div><article class="task-card"><div class="task-main"><div class="task-title">${escapeHtml(t.title)}</div><div class="task-meta">${t.done?'完了':'未完了'}${t.note?` ・ ${escapeHtml(t.note)}`:''}</div>${t.image?`<img class="task-image" src="${t.image}" alt="添付画像">`:''}<div class="task-actions"></div></div><button class="check-btn ${t.done?'is-done':''}"></button></article>`;
    row.querySelector('.check-btn').onclick=()=>{ t.done=!t.done; if(t.done) recordRecentTitle(t.title); save(); render(); };
    const act=row.querySelector('.task-actions');
    act.append(btn(t.done?'未完了':'完了',()=>{ t.done=!t.done; if(t.done) recordRecentTitle(t.title); save(); render(); }));
    act.append(btn('編集',()=>openEditor(t.id)));
    act.append(btn('あとで',()=>{ t.later=true; delete t.date; delete t.time; save(); render(); }));
    act.append(btn('削除',()=>{ state.tasks=state.tasks.filter(x=>x.id!==t.id); save(); render(); }));
    list.appendChild(row);
  });
}
function renderLater(){
  const list=$('#laterList'); list.innerHTML='';
  laterTasks().forEach(t=>{
    const card=document.createElement('div'); card.className='later-card';
    card.innerHTML=`<div><div class="later-title">${escapeHtml(t.title)}</div><div class="task-meta">${t.note?escapeHtml(t.note):'時間未定'}</div>${t.image?`<img class="later-image" src="${t.image}" alt="添付画像">`:''}</div><div class="task-actions"></div>`;
    const act=card.querySelector('.task-actions');
    act.append(btn('今日',()=>placeLater(t, state.selected, state.settings.wake)));
    act.append(btn('明日',()=>placeLater(t, plusDays(state.selected,1), state.settings.wake)));
    act.append(btn('今夜',()=>placeLater(t, state.selected, '20:00')));
    act.append(btn('編集',()=>openEditor(t.id)));
    list.appendChild(card);
  });
}
function renderTemplateManager(){
  const wrap = $('#customTemplateList');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!state.customTemplates.length){
    wrap.innerHTML='<div class="template-empty">登録したタスクはまだありません</div>';
    return;
  }
  state.customTemplates.forEach(item=>{
    const row=document.createElement('div');
    row.className='custom-template-row';
    row.innerHTML=`<div><div class="custom-template-title">${escapeHtml(item.title)}</div><div class="custom-template-meta">${labelForCategory(item.category)}</div></div>`;
    const del=btn('削除',()=>deleteTemplate(item.id));
    row.appendChild(del);
    wrap.appendChild(row);
  });
}
function placeLater(t,date,time){ t.later=false; t.date=date; t.time=time; recordRecentTitle(t.title); save(); render(); }
function btn(label,fn){ const b=document.createElement('button'); b.className='mini-btn'; b.textContent=label; b.onclick=fn; return b; }
function syncImagePreview(){
  const wrap=$('#imagePreviewWrap');
  const img=$('#imagePreview');
  if(state.pendingImage){ img.src=state.pendingImage; wrap.classList.remove('hidden'); }
  else { img.removeAttribute('src'); wrap.classList.add('hidden'); }
}
function openEditor(id=null){
  state.editorId=id;
  const t=id?state.tasks.find(x=>x.id===id):null;
  $('#taskTitle').value=t?.title||'';
  $('#taskNote').value=t?.note||'';
  $('#taskDate').value=t?.date||state.selected;
  $('#taskTime').value=t?.time||state.settings.wake;
  $('#taskLater').checked=t?.later||false;
  $('#templateCategory').value='work';
  state.pendingImage=t?.image||'';
  $('#taskImage').value='';
  syncImagePreview();
  $('#editorState').textContent=(t?.later?'あとで':'予定');
  $('#editor').classList.remove('hidden');
}
function saveTask(){
  const title = normalizeTitle($('#taskTitle').value) || '無題';
  const payload={
    id: state.editorId || uid(),
    title,
    note: $('#taskNote').value.trim(),
    later: $('#taskLater').checked,
    done: false,
    image: state.pendingImage || ''
  };
  if(!payload.later){ payload.date=$('#taskDate').value||state.selected; payload.time=$('#taskTime').value||state.settings.wake; }
  else { delete payload.date; delete payload.time; }
  if(state.editorId){
    const old=state.tasks.find(x=>x.id===state.editorId);
    payload.done=old?.done||false;
    const merged={...old,...payload};
    if(payload.later){ delete merged.date; delete merged.time; }
    state.tasks=state.tasks.map(x=>x.id===state.editorId?merged:x);
  } else {
    state.tasks.push(payload);
  }
  recordRecentTitle(title);
  $('#editor').classList.add('hidden');
  state.editorId=null;
  save();
  render();
}
function renderCalendar(){
  const grid=$('#calendarGrid'); grid.innerHTML=''; $('#calendarTitle').textContent=jpMonthYear(state.monthCursor);
  const first=startOfMonth(state.monthCursor); const start=new Date(first); start.setDate(1-first.getDay());
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const id=iso(d); const cell=document.createElement('button'); cell.className='calendar-cell'+(id===state.selected?' active':'');
    const has=state.tasks.some(t=>!t.later && t.date===id);
    cell.innerHTML=`<div>${d.getDate()}</div>${has?'<span class="dot"></span>':''}`;
    cell.onclick=()=>{state.selected=id; $('#monthSheet').classList.add('hidden'); render();};
    grid.appendChild(cell);
  }
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function wire(){
  $('#todayBtn').onclick=()=>{state.selected=todayISO(); state.monthCursor=startOfMonth(new Date()); render();};
  $('#todayChip').onclick=()=>{state.selected=todayISO(); state.monthCursor=startOfMonth(new Date()); render();};
  $('#openMonth').onclick=()=>{ renderCalendar(); $('#monthSheet').classList.remove('hidden'); };
  $('#openSettings').onclick=()=>$('#settingsSheet').classList.remove('hidden');
  $('#closeMonth').onclick=()=>$('#monthSheet').classList.add('hidden');
  $('#closeSettings').onclick=()=>$('#settingsSheet').classList.add('hidden');
  $('#manageTemplates').onclick=()=>{ renderTemplateManager(); $('#templateSheet').classList.remove('hidden'); };
  $('#closeTemplateSheet').onclick=()=>$('#templateSheet').classList.add('hidden');
  $('#monthPrev').onclick=()=>{ state.monthCursor=new Date(state.monthCursor.getFullYear(),state.monthCursor.getMonth()-1,1); renderCalendar(); };
  $('#monthNext').onclick=()=>{ state.monthCursor=new Date(state.monthCursor.getFullYear(),state.monthCursor.getMonth()+1,1); renderCalendar(); };
  $('#closeEditor').onclick=()=>{ state.editorId=null; state.pendingImage=''; $('#taskImage').value=''; syncImagePreview(); $('#editor').classList.add('hidden'); };
  $('#taskImage').onchange=(e)=>{
    const file=e.target.files && e.target.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>{ state.pendingImage=String(reader.result||''); syncImagePreview(); };
    reader.readAsDataURL(file);
  };
  $('#removeImage').onclick=()=>{ state.pendingImage=''; $('#taskImage').value=''; syncImagePreview(); };
  $('#saveTask').onclick=saveTask;
  $('#saveTemplate').onclick=saveCurrentAsTemplate;
  $('#floatingAdd').onclick=()=>openEditor();
  const railQuickAdd = $('#railQuickAdd'); if(railQuickAdd) railQuickAdd.onclick=()=>openEditor();
  $('#addLater').onclick=()=>{ openEditor(); $('#taskLater').checked=true; $('#editorState').textContent='あとで'; };
  document.querySelectorAll('.soft-pill').forEach(b=>b.onclick=()=>$('#taskTime').value=b.dataset.time);
  $('#taskLater').onchange=(e)=>$('#editorState').textContent=e.target.checked?'あとで':'予定';
  const applyWakeTime=(value)=>{
    if(!value) return;
    state.settings.wake=value;
    $('#wakeCardTime').textContent=value;
    renderRail();
    save();
  };
  const applySleepTime=(value)=>{
    if(!value) return;
    state.settings.sleep=value;
    $('#sleepCardTime').textContent=value;
    renderRail();
    save();
  };
  $('#wakeTime').oninput=e=>applyWakeTime(e.target.value);
  $('#wakeTime').onchange=e=>applyWakeTime(e.target.value);
  $('#sleepTime').oninput=e=>applySleepTime(e.target.value);
  $('#sleepTime').onchange=e=>applySleepTime(e.target.value);
}
function render(){
  state.monthCursor=startOfMonth(parseISO(state.selected));
  renderHeader();
  renderWeek();
  renderQuickTemplates();
  renderRail();
  renderTimeline();
  renderLater();
}
load(); wire(); render();
