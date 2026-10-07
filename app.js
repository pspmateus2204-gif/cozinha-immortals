(()=>{
'use strict';

if(!window.DV_DATA){document.body.innerHTML='<p style="color:white;padding:20px">Erro: base de receitas não carregada.</p>';return}

const DATA=window.DV_DATA;
const RECIPES=DATA.recipes;
const ING=DATA.ingredients;
const ING_MAP=Object.fromEntries(ING.map(x=>[x.name,x]));
const CATS=['Aperitivo','Prato principal','Sobremesa'];
const MAX_BONUS={'Aperitivo':5,'Prato principal':30,'Sobremesa':50};
const rarityWeight={'Comum':1,'Ótimo':2,'Raro':3,'Épico':4,'Lendário':6,'Mítico':9,'Imortal':13};
const KEY='slayer_dv_kitchen_v3';
const OLD_KEY='slayer_dv_kitchen_v2';
const CHEFS=[
  {name:'Cedric',label:'Chef Cedric',items:['Morango','Cana-de-açúcar'],desc:'Morango e Cana-de-açúcar'},
  {name:'Rosa',label:'Chef Rosa',items:['Milho','Amendoim'],desc:'Milho e Amendoim'},
  {name:'Gene',label:'Chef Gene',items:['Camarão','Arroz'],desc:'Camarão e Arroz'},
  {name:'Arwen',label:'Chef Arwen',items:['Batata','Tomate'],desc:'Batata e Tomate'}
];
const CHEF_ITEM_SOURCE=new Set(CHEFS.map(c=>c.name));
const ELEMENT_ING={fire:'Pimenta',water:'Atum',wind:'Manjericão',earth:'Cacau'};

const base={
  stock:Object.fromEntries(ING.map(i=>[i.name,0])),
  completed:[],guildByDate:{},guildPlansByDate:{},history:{},categoryOverride:{},selectedChefByDate:{},stockCheckedByDate:{},guildCheckedByDate:{},
  settings:{goal:'dv',elementPriority:'none',allowMultiple:true,useGuildPlans:true}
};

function clone(v){return JSON.parse(JSON.stringify(v))}
function normalizeHistory(history){
  const out={};
  for(const [k,v] of Object.entries(history||{})){
    if(Array.isArray(v)) out[k]=v.filter(Boolean);
    else if(v&&typeof v==='object'&&v.recipe) out[k]=[v];
  }
  return out;
}
function normalizeState(raw={}){
  const s={...clone(base),...raw};
  s.stock={...base.stock,...(raw.stock||{})};
  s.completed=Array.isArray(raw.completed)?[...new Set(raw.completed)]:[];
  s.guildByDate=raw.guildByDate||{};
  s.guildPlansByDate=raw.guildPlansByDate||{};
  s.history=normalizeHistory(raw.history);
  s.categoryOverride=raw.categoryOverride||{};
  s.selectedChefByDate=raw.selectedChefByDate||{};
  s.stockCheckedByDate=raw.stockCheckedByDate||{};
  s.guildCheckedByDate=raw.guildCheckedByDate||{};
  s.settings={...base.settings,...(raw.settings||{})};
  if(raw.goal&&!raw.settings?.goal)s.settings.goal=raw.goal==='balanced'?'dv':raw.goal;
  if(s.settings.goal==='balanced')s.settings.goal='dv';
  return s;
}
let state;
try{
  const current=JSON.parse(localStorage.getItem(KEY)||'null');
  const old=current?null:JSON.parse(localStorage.getItem(OLD_KEY)||'null');
  state=normalizeState(current||old||{});
}catch{state=normalizeState({})}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
save();

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function dateKey(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dd}`}
function todayKey(){return dateKey(new Date())}
function parseDateKey(k){const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)}
function addDaysKey(k,n){const d=parseDateKey(k);d.setDate(d.getDate()+n);return dateKey(d)}
function fmtDate(k){return parseDateKey(k).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}

function autoCategoryFor(k=todayKey()){
  const dow=parseDateKey(k).getDay();
  if(dow===2)return 'Aperitivo';
  if(dow===3)return 'Prato principal';
  if(dow===4)return 'Sobremesa';
  return null;
}
function dayType(k=todayKey()){return state.categoryOverride[k]||autoCategoryFor(k)}
function cookingDatesFromToday(){
  const start=parseDateKey(todayKey()),dow=start.getDay(),dates=[];
  if(dow>=2&&dow<=4){
    for(let d=dow;d<=4;d++)dates.push(addDaysKey(todayKey(),d-dow));
    return dates;
  }
  let delta=(2-dow+7)%7;
  if(delta===0)delta=7;
  const tue=addDaysKey(todayKey(),delta);
  return [tue,addDaysKey(tue,1),addDaysKey(tue,2)];
}
function nextCookingInfo(){
  const dates=cookingDatesFromToday(),k=dates[0];
  return {date:k,category:autoCategoryFor(k)};
}
function selectedChef(k=todayKey()){return state.selectedChefByDate[k]||''}
function stockChecked(k=todayKey()){return !!state.stockCheckedByDate[k]}
function guildChecked(k=todayKey()){return !!state.guildCheckedByDate[k]}
function hasAnyStock(stock=state.stock){return ING.some(i=>(Number(stock[i.name])||0)>0)}
function flowReady(){return !!dayType()&&!!selectedChef()&&hasAnyStock()&&stockChecked()&&guildChecked()}

function counts(r){const o={};for(const i of r.ingredients)o[i]=(o[i]||0)+1;return o}
function selections(name,stock=state.stock){const i=ING_MAP[name];return i?Math.floor((Number(stock[name])||0)/i.cost):0}
function rawCostFor(r){const o={};for(const [i,n] of Object.entries(counts(r)))o[i]=n*ING_MAP[i].cost;return o}
function canWithStock(r,stock=state.stock){return Object.entries(counts(r)).every(([i,n])=>selections(i,stock)>=n)}
function missingWithStock(r,stock=state.stock){const out=[];for(const [i,n] of Object.entries(counts(r))){const have=selections(i,stock);if(have<n)out.push({name:i,raw:(n-have)*ING_MAP[i].cost,source:ING_MAP[i].source,selections:n-have})}return out}
function consumeStock(stock,r){const out={...stock};for(const [i,v] of Object.entries(rawCostFor(r)))out[i]=Math.max(0,(Number(out[i])||0)-v);return out}
function recipeText(r,raw=false){return Object.entries(counts(r)).map(([i,n])=>raw?`${i} ${n*ING_MAP[i].cost}`:`${n>1?n+'× ':''}${i}`).join(' + ')}
function cookedFor(k=todayKey()){return Array.isArray(state.history[k])?state.history[k]:[]}
function cookedNames(k=todayKey()){return new Set(cookedFor(k).map(x=>x.recipe))}
function guildDone(k=todayKey()){return state.guildByDate[k]||[]}
function guildPlans(k=todayKey()){return state.guildPlansByDate[k]||[]}
function reservedRecipes(k=todayKey()){
  const set=new Set(guildDone(k));
  if(state.settings.useGuildPlans)for(const p of guildPlans(k))if(p.recipe)set.add(p.recipe);
  return set;
}
function currentFlowStep(){if(!dayType())return 1;if(!selectedChef())return 2;if(!hasAnyStock()||!stockChecked())return 3;if(!guildChecked())return 4;return 5}

function scarcity(r,stock=state.stock){
  let s=0;
  for(const [i,n] of Object.entries(counts(r))){const avail=Math.max(selections(i,stock),.25);s+=(rarityWeight[ING_MAP[i].rarity]||1)*(n/avail)}
  return s;
}
function weightedCost(r){return Object.entries(counts(r)).reduce((s,[i,n])=>s+n*(rarityWeight[ING_MAP[i].rarity]||1),0)}
function elementUse(r){const ing=ELEMENT_ING[state.settings.elementPriority];return ing?(counts(r)[ing]||0):0}
function surplusUse(r,stock){
  let s=0;
  for(const [i,n] of Object.entries(counts(r))){const have=selections(i,stock),w=rarityWeight[ING_MAP[i].rarity]||1;s+=n*Math.max(1,Math.min(8,have/Math.max(1,n)))/w}
  return s;
}
function recipeUtility(r,stock=state.stock,goal=state.settings.goal){
  const fresh=state.completed.includes(r.name)?0:1;
  const nb=(r.bonusPct/(MAX_BONUS[r.type]||r.bonusPct))*100;
  const sc=scarcity(r,stock), wc=weightedCost(r), eu=elementUse(r), em=r.emblem/1000;
  if(goal==='discover')return fresh*1000+nb*2+em*2-sc*3-eu*20;
  if(goal==='bonus')return r.bonusPct*100+fresh*8+em-sc*2-eu*20;
  if(goal==='emblem')return r.emblem+nb*5+fresh*20-sc*20-eu*150;
  if(goal==='save')return fresh*12+nb*.8+em*2-wc*35-sc*20-eu*120;
  if(goal==='leftovers')return surplusUse(r,stock)*90+nb*1.5+em*2-fresh*-2-eu*10;
  return nb*2.6+em*3+fresh*10-sc*5-eu*28;
}
function canCookMoreOn(k=todayKey()){return state.settings.allowMultiple||cookedFor(k).length===0}
function eligibleRecipes(k,stock=state.stock){
  if(!canCookMoreOn(k))return [];
  const cat=dayType(k),reserved=reservedRecipes(k),made=cookedNames(k);
  return RECIPES.filter(r=>r.type===cat&&!reserved.has(r.name)&&!made.has(r.name)&&canWithStock(r,stock));
}
function immediateCandidates(k=todayKey(),stock=state.stock){return eligibleRecipes(k,stock).sort((a,b)=>recipeUtility(b,stock)-recipeUtility(a,stock)||b.bonusPct-a.bonusPct||a.id-b.id)}

function buildCyclePlan(){
  const dates=cookingDatesFromToday();
  let best={score:-Infinity,steps:[],finalStock:{...state.stock}};
  const recur=(idx,stock,steps,score)=>{
    if(idx===dates.length){if(score>best.score)best={score,steps:clone(steps),finalStock:{...stock}};return}
    const k=dates[idx];
    const candidates=eligibleRecipes(k,stock).sort((a,b)=>recipeUtility(b,stock)-recipeUtility(a,stock));
    const options=[null,...candidates];
    for(const r of options){
      const before={...stock};
      const after=r?consumeStock(stock,r):{...stock};
      const u=r?recipeUtility(r,stock):0;
      const step={date:k,category:dayType(k),recipe:r,beforeStock:before,afterStock:after,utility:u};
      recur(idx+1,after,[...steps,step],score+u);
    }
  };
  recur(0,{...state.stock},[],0);
  best.totalEmblems=best.steps.reduce((s,x)=>s+(x.recipe?.emblem||0),0);
  best.totalRecipes=best.steps.filter(x=>x.recipe).length;
  return best;
}
function planBestForToday(){return buildCyclePlan().steps.find(s=>s.date===todayKey())?.recipe||null}
function missingScore(r,stock=state.stock){return missingWithStock(r,stock).reduce((s,x)=>s+(rarityWeight[ING_MAP[x.name].rarity]||1)*Math.max(1,x.raw/ING_MAP[x.name].cost),0)}
function sourceTip(m){
  if(m.source===selectedChef())return `${m.source} hoje`;
  if(CHEF_ITEM_SOURCE.has(m.source))return `${m.source} (outro chef)`;
  return m.source;
}
function why(r,plan){
  const bits=[];
  bits.push(state.completed.includes(r.name)?'receita já desbloqueada':'receita nova para você');
  bits.push(`+${r.bonusPct}% ${r.effect}`);
  bits.push(`${r.emblem.toLocaleString('pt-BR')} emblemas`);
  const immediate=immediateCandidates()[0];
  if(immediate&&immediate.id!==r.id)bits.push('escolhida pelo plano do ciclo para preservar opções futuras');
  const el=ELEMENT_ING[state.settings.elementPriority];
  if(el&&!r.ingredients.includes(el))bits.push(`preserva ${el}`);
  if(scarcity(r)<2)bits.push('baixo impacto no estoque');
  return bits.join(' · ');
}

function stockInputCard(i,extraClass=''){
  const activeSource=i.source===selectedChef()? ' active-source':'';
  return `<div class="stock-card ${extraClass}${activeSource}"><div><div class="stock-title">${esc(i.name)}</div><div class="stock-meta">${esc(i.rarity)} · ${i.cost}/seleção · <b>${selections(i.name)} sel.</b>${activeSource?' · fonte de hoje':''}</div></div><div class="qty-controls"><input type="number" min="0" step="1" inputmode="numeric" enterkeyhint="done" data-ing="${esc(i.name)}" value="${Number(state.stock[i.name])||0}"><button type="button" class="qty-btn" data-qty="${esc(i.name)}" data-delta="-${i.cost}">−${i.cost}</button><button type="button" class="qty-btn" data-qty="${esc(i.name)}" data-delta="${i.cost}">+${i.cost}</button></div></div>`;
}
function updateSelectionLabel(input){const card=input.closest('.stock-card');const meta=card?.querySelector('.stock-meta b');if(meta)meta.textContent=`${selections(input.dataset.ing)} sel.`}
function bindStockInputs(root){
  root.querySelectorAll('input[data-ing]').forEach(x=>{
    x.oninput=()=>{state.stock[x.dataset.ing]=Math.max(0,Number(x.value)||0);state.stockCheckedByDate[todayKey()]=false;save();updateSelectionLabel(x);renderFlowProgress();renderMobileBar()};
    x.onchange=()=>{state.stock[x.dataset.ing]=Math.max(0,Number(x.value)||0);state.stockCheckedByDate[todayKey()]=false;save();refreshDecisionPanels()};
  });
  root.querySelectorAll('[data-qty]').forEach(b=>b.onclick=()=>{
    const name=b.dataset.qty,delta=Number(b.dataset.delta)||0;state.stock[name]=Math.max(0,(Number(state.stock[name])||0)+delta);state.stockCheckedByDate[todayKey()]=false;save();renderInventory();refreshDecisionPanels();
  });
}
function renderInventory(){
  const regularNames=['Ovo','Trigo','Alface','Carne','Leite'];
  const chefNames=new Set(CHEFS.flatMap(c=>c.items));
  const regular=document.getElementById('regularInventory');regular.innerHTML=regularNames.map(n=>stockInputCard(ING_MAP[n])).join('');bindStockInputs(regular);
  const chefBox=document.getElementById('chefInventory'),active=selectedChef();
  chefBox.innerHTML=CHEFS.map(c=>`<div class="chef-select ${active===c.name?'active':''}" data-chef="${c.name}"><div class="chef-head"><div class="chef-name">${c.name==='Rosa'?'👩‍🍳':'👨‍🍳'} ${esc(c.label)}</div><div class="chef-check">${active===c.name?'✓':''}</div></div><div class="chef-preview">${c.items.map(esc).join('<span>•</span>')}</div><div class="chef-hint">${esc(c.desc)}${active===c.name?'<br>Fonte de reposição ativa hoje.':'<br>Clique para selecionar.'}</div></div>`).join('');
  chefBox.querySelectorAll('[data-chef]').forEach(card=>card.onclick=()=>{state.selectedChefByDate[todayKey()]=card.dataset.chef;state.stockCheckedByDate[todayKey()]=false;save();renderAll(true)});
  const chefStock=document.getElementById('chefStockInventory');chefStock.innerHTML=ING.filter(i=>chefNames.has(i.name)).map(i=>stockInputCard(i)).join('');bindStockInputs(chefStock);
  const special=document.getElementById('specialInventory');special.innerHTML=ING.filter(i=>!regularNames.includes(i.name)&&!chefNames.has(i.name)).map(i=>stockInputCard(i)).join('');bindStockInputs(special);
  document.getElementById('chefStatus').innerHTML=active?`Chef selecionado: <b>${esc(CHEFS.find(c=>c.name===active)?.label||active)}</b>`:'Nenhum chef selecionado.';
}

function renderGuild(){
  const k=todayKey(),cat=dayType(),done=guildDone(k),plans=guildPlans(k);
  const sel=document.getElementById('guildAdd');sel.innerHTML=cat?'<option value="">Selecione...</option>'+RECIPES.filter(r=>r.type===cat&&!done.includes(r.name)).map(r=>`<option>${esc(r.name)}</option>`).join(''):'<option value="">Sem cozinha hoje</option>';sel.disabled=!cat;
  document.getElementById('guildChips').innerHTML=done.length?done.map(n=>`<span class="chip">${esc(n)} <button data-rm-guild="${esc(n)}">×</button></span>`).join(''):'<span class="small">Nenhum prato feito informado.</span>';
  document.querySelectorAll('[data-rm-guild]').forEach(b=>b.onclick=()=>{state.guildByDate[k]=done.filter(x=>x!==b.dataset.rmGuild);save();renderGuild();refreshDecisionPanels()});
  const ps=document.getElementById('guildPlanRecipe');ps.innerHTML=cat?'<option value="">Prato...</option>'+RECIPES.filter(r=>r.type===cat).map(r=>`<option>${esc(r.name)}</option>`).join(''):'<option value="">Sem cozinha hoje</option>';ps.disabled=!cat;
  document.getElementById('guildPlanList').innerHTML=plans.length?plans.map((p,i)=>`<div class="guild-plan-item ${p.done?'done':''}"><input type="checkbox" data-plan-done="${i}" ${p.done?'checked':''}><div><b>${esc(p.member||'Membro')}</b><small>${esc(p.recipe)}${p.done?' · feito':' · planejado'}</small></div><button class="icon-btn" data-plan-rm="${i}" title="Remover">×</button></div>`).join(''):'<div class="small">Nenhum prato planejado.</div>';
  document.querySelectorAll('[data-plan-done]').forEach(x=>x.onchange=()=>{plans[Number(x.dataset.planDone)].done=x.checked;state.guildPlansByDate[k]=plans;save();renderGuild();refreshDecisionPanels()});
  document.querySelectorAll('[data-plan-rm]').forEach(x=>x.onclick=()=>{plans.splice(Number(x.dataset.planRm),1);state.guildPlansByDate[k]=plans;save();renderGuild();refreshDecisionPanels()});
}
function addGuildPlan(){
  const member=document.getElementById('guildMember').value.trim(),recipe=document.getElementById('guildPlanRecipe').value;if(!member||!recipe){toast('Informe membro e prato.');return}
  const k=todayKey();state.guildPlansByDate[k]=[...(state.guildPlansByDate[k]||[]),{member,recipe,done:false}];state.guildCheckedByDate[k]=false;save();document.getElementById('guildMember').value='';document.getElementById('guildPlanRecipe').value='';renderGuild();refreshDecisionPanels();
}
async function copyDiscord(){
  const k=todayKey(),plans=guildPlans(k),done=guildDone(k),cat=dayType(k)||'Sem cozinha';let txt=`DRAGON VALLEY — ${fmtDate(k)} — ${cat.toUpperCase()}\n`;
  if(plans.length){txt+=plans.map(p=>`${p.done?'✅':'🟡'} ${p.member} → ${p.recipe}`).join('\n')+'\n'}
  if(done.length)txt+=`\nJá feitos: ${done.join(' / ')}\n`;
  const my=cookedFor(k);if(my.length)txt+=`Meu(s) prato(s): ${my.map(x=>x.recipe).join(' / ')}\n`;
  try{await navigator.clipboard.writeText(txt);toast('Plano copiado para o Discord.')}catch{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Plano copiado.')}
}

function renderTodayCooks(){
  const list=cookedFor();if(!list.length)return '';
  return `<div class="today-cooks"><div class="sectionTitle">Cozinhado hoje (${list.length})</div>${list.map((h,i)=>`<div class="today-cook"><span>${esc(h.recipe)} · +${h.bonusPct||0}%</span><button class="btn bad tiny" data-undo-cook="${i}">Desfazer</button></div>`).join('')}</div>`;
}
function renderRecommendation(){
  const box=document.getElementById('recommendation');
  if(!dayType()){
    const n=nextCookingInfo();
    box.innerHTML=`<div class="recommend"><div class="eyebrow">Calendário Dragon Valley</div><div class="recname">Hoje não tem cozinha</div><div class="why">Calendário fixo: terça = Aperitivo, quarta = Prato principal, quinta = Sobremesa.<br>Próxima cozinha: <b>${fmtDate(n.date)} · ${esc(n.category)}</b>.</div></div>`;
    return;
  }
  if(!selectedChef()){box.innerHTML=`<div class="recommend"><div class="eyebrow">Etapa 2 de 5</div><div class="recname">Escolha o chef</div><div class="why">O chef define a fonte de reposição do dia; ele não bloqueia ingredientes que já estão no estoque.</div>${renderTodayCooks()}</div>`;return}
  if(!hasAnyStock()){box.innerHTML=`<div class="recommend"><div class="eyebrow">Etapa 3 de 5</div><div class="recname">Informe o estoque</div><div class="why">Preencha os ingredientes que já possui.</div>${renderTodayCooks()}</div>`;return}
  if(!stockChecked()){box.innerHTML=`<div class="recommend"><div class="eyebrow">Etapa 3 de 5</div><div class="recname">Confirme o estoque</div><div class="why">Quando terminar os valores, toque em <b>Estoque preenchido — continuar</b>.</div>${renderTodayCooks()}</div>`;return}
  if(!guildChecked()){box.innerHTML=`<div class="recommend"><div class="eyebrow">Etapa 4 de 5</div><div class="recname">Confira a guilda</div><div class="why">Informe pratos feitos/planejados para evitar duplicação e confirme.</div>${renderTodayCooks()}</div>`;return}
  if(!canCookMoreOn()){box.innerHTML=`<div class="recommend"><div class="eyebrow">Limite configurado</div><div class="recname">Dia encerrado</div><div class="why">A opção de múltiplas receitas está desligada e já existe um prato lançado hoje. Ative-a em Estratégia para continuar.</div>${renderTodayCooks()}</div>`;bindDynamic();return}
  const plan=buildCyclePlan(),r=plan.steps.find(s=>s.date===todayKey())?.recipe;
  if(!r){
    const has=eligibleRecipes(todayKey(),state.stock).length>0;
    box.innerHTML=`<div class="recommend"><div class="eyebrow">Estratégia do ciclo</div><div class="recname">${has?'Poupar hoje':'Nenhuma disponível'}</div><div class="why">${has?'Com o objetivo atual, guardar os ingredientes produz um plano melhor para os próximos dias.':'Nenhuma receita perfeita disponível com o estoque e reservas atuais.'}</div>${renderTodayCooks()}</div>`;bindDynamic();return;
  }
  const raw=rawCostFor(r),after=consumeStock(state.stock,r),cooks=cookedFor().length;
  box.innerHTML=`<div class="recommend"><div class="eyebrow">${cooks?'Próxima melhor receita':'Melhor opção de hoje'}</div><div class="recname">${esc(r.name)}</div><div class="recipeLine">${esc(recipeText(r))}</div><div class="pills"><span class="pill ${state.completed.includes(r.name)?'':'ok'}">${state.completed.includes(r.name)?'Já desbloqueada':'Nova para você'}</span><span class="pill gold">+${r.bonusPct}% ${esc(r.effect)}</span><span class="pill">${r.emblem.toLocaleString('pt-BR')} emblemas</span><span class="pill blue">Plano do ciclo</span></div><div class="why"><b>Por quê:</b> ${esc(why(r,plan))}.<br><b>Custo real:</b> ${Object.entries(raw).map(([i,v])=>`${esc(i)} ${v}`).join(' · ')}</div><div class="after">${Object.keys(raw).map(i=>`<div class="delta"><b>${esc(i)}</b>${Number(state.stock[i])||0} → ${after[i]}</div>`).join('')}</div><div class="row" style="margin-top:11px"><button class="btn primary" data-cook="${r.id}">Cozinhei este prato</button><button class="btn" data-details="${r.id}">Ver detalhes</button></div>${renderTodayCooks()}</div>`;
  bindDynamic();
}
function renderTodayRecipes(){
  const el=document.getElementById('todayRecipes');
  if(!dayType()){document.getElementById('candidateCount').textContent='';el.innerHTML='<div class="flow-lock">Hoje não há cozinha. Terça = Aperitivo, quarta = Prato principal, quinta = Sobremesa.</div>';return}
  if(!flowReady()){document.getElementById('candidateCount').textContent='';el.innerHTML='<div class="flow-lock">Conclua Chef, Estoque e Guilda para liberar as opções.</div>';return}
  const list=immediateCandidates();document.getElementById('candidateCount').textContent=`${list.length} possível(is)`;
  if(list.length){el.innerHTML=list.map(r=>`<div class="possible-item"><b>${esc(r.name)}</b><div class="sub">${esc(recipeText(r))}</div><div class="pills"><span class="pill gold">+${r.bonusPct}%</span><span class="pill">${r.emblem.toLocaleString('pt-BR')} emblemas</span>${state.completed.includes(r.name)?'<span class="pill">Já feita</span>':'<span class="pill ok">Nova</span>'}</div><div class="recipeActions"><button class="btn tiny" data-details="${r.id}">Detalhes</button><button class="btn primary tiny" data-cook="${r.id}">Cozinhar</button></div></div>`).join('');bindDynamic();return}
  const reserved=reservedRecipes(),made=cookedNames();
  const all=RECIPES.filter(r=>r.type===dayType()&&!reserved.has(r.name)&&!made.has(r.name)).sort((a,b)=>missingScore(a)-missingScore(b)).slice(0,3);
  el.innerHTML='<div class="no-possible">Nenhum prato disponível com o estoque atual.</div>'+all.map(r=>`<div class="possible-item"><b>${esc(r.name)}</b><div class="sub">${missingWithStock(r).map(x=>`Falta ${x.raw} ${esc(x.name)} · ${esc(sourceTip(x))}`).join('<br>')}</div><button class="btn tiny" data-details="${r.id}" style="margin-top:6px">Ver receita</button></div>`).join('');bindDynamic();
}

function stepHtml(step,i,full=false){
  const r=step.recipe,today=step.date===todayKey();
  if(!r)return `<div class="plan-day ${today?'today':''}"><div class="plan-head"><strong>${fmtDate(step.date)} · ${esc(step.category)}</strong><span class="pill">Dia ${i+1}</span></div><div class="plan-recipe">Guardar ingredientes</div><small>Sem receita-alvo no plano com o objetivo atual.</small></div>`;
  const spent=rawCostFor(r);
  return `<div class="plan-day ${today?'today':''}"><div class="plan-head"><strong>${fmtDate(step.date)} · ${esc(step.category)}</strong><span class="pill ${today?'gold':''}">Dia ${i+1}</span></div><div class="plan-recipe">${esc(r.name)}</div><div class="pills"><span class="pill gold">+${r.bonusPct}%</span><span class="pill">${r.emblem.toLocaleString('pt-BR')} emblemas</span>${state.completed.includes(r.name)?'<span class="pill">já conhecida</span>':'<span class="pill ok">nova</span>'}</div>${full?`<div class="plan-score">Consumo: ${Object.entries(spent).map(([k,v])=>`${esc(k)} ${v}`).join(' · ')}</div>`:''}</div>`;
}
function renderCyclePlan(){
  const plan=buildCyclePlan();
  document.getElementById('cycleMini').innerHTML=plan.steps.map((s,i)=>`<div class="cycle-mini-item"><strong>${fmtDate(s.date)} · ${esc(s.category)}</strong><small>${s.recipe?`${esc(s.recipe.name)} · +${s.recipe.bonusPct}%`:'Guardar ingredientes'}</small></div>`).join('');
  document.getElementById('cyclePlan').innerHTML=plan.steps.map((s,i)=>stepHtml(s,i,true)).join('');
  document.getElementById('planSummary').textContent=`${plan.totalRecipes} alvo(s) · ${plan.totalEmblems.toLocaleString('pt-BR')} emblemas`;
  const rows=ING.filter(i=>(Number(state.stock[i.name])||0)>0||(Number(plan.finalStock[i.name])||0)>0).map(i=>{const a=Number(state.stock[i.name])||0,b=Number(plan.finalStock[i.name])||0;return `<div class="projected-item ${a!==b?'changed':''}"><b>${esc(i.name)}</b>${a} → ${b}</div>`}).join('');
  document.getElementById('projectedStock').innerHTML=rows||'<div class="small">Sem estoque informado.</div>';
}
function refreshDecisionPanels(){renderRecommendation();renderTodayRecipes();renderCyclePlan();renderAllRecipes();renderFlowProgress();renderMobileBar();}

function recipeCard(r,full=false){
  const can=canWithStock(r),reserved=reservedRecipes().has(r.name),done=state.completed.includes(r.name),cooked=cookedNames().has(r.name),miss=missingWithStock(r);
  const canCook=can&&r.type===dayType()&&!reserved&&!cooked&&flowReady()&&canCookMoreOn();
  return `<div class="recipe ${can?'can':''} ${reserved?'guild':''}"><div><h4>${esc(r.name)} <span class="rarity rar-${esc(r.rarity)}">· ${esc(r.rarity)}</span></h4><div class="sub">${esc(recipeText(r))}</div><div class="pills"><span class="pill">${esc(r.type)}</span><span class="pill gold">+${r.bonusPct}%</span><span class="pill">${r.emblem.toLocaleString('pt-BR')} emblemas</span>${done?'<span class="pill ok">✓ Desbloqueada</span>':''}${reserved?'<span class="pill bad">🏰 Reservada</span>':''}${cooked?'<span class="pill gold">🍳 Hoje</span>':''}</div><div class="recipeActions">${full?`<button class="btn tiny" data-toggle-done="${r.id}">${done?'Desmarcar concluída':'Marcar concluída'}</button>`:''}<button class="btn tiny" data-details="${r.id}">Detalhes</button>${r.type===dayType()&&!reserved?`<button class="btn tiny" data-guild="${r.id}">Guilda já fez</button>`:''}${canCook?`<button class="btn primary tiny" data-cook="${r.id}">Cozinhar</button>`:''}</div></div><div class="right"><div class="status ${can?'ok':'no'}">${cooked?'Cozinhado hoje':reserved?'Reservado':can?'Dá para fazer':'Faltam ingredientes'}</div>${!can&&miss.length?`<div class="sub">${miss.map(x=>`${esc(x.name)}: ${x.raw}`).join('<br>')}</div>`:''}</div></div>`;
}
function renderAllRecipes(){
  const q=norm(document.getElementById('search').value),t=document.getElementById('fType').value,rr=document.getElementById('fRarity').value,st=document.getElementById('fState').value;
  const list=RECIPES.filter(r=>{const hay=norm([r.name,r.nameEn,...r.ingredients].join(' '));return(!q||hay.includes(q))&&(!t||r.type===t)&&(!rr||r.rarity===rr)&&(!st||(st==='can'&&canWithStock(r))||(st==='new'&&!state.completed.includes(r.name))||(st==='done'&&state.completed.includes(r.name)))});
  document.getElementById('allRecipes').innerHTML=list.length?list.map(r=>recipeCard(r,true)).join(''):'<div class="small">Nenhuma receita encontrada.</div>';
  const done=state.completed.length;document.getElementById('progressMetrics').innerHTML=`<div class="metric"><strong>${done}/63</strong><span>receitas concluídas</span></div>${CATS.map(c=>`<div class="metric"><strong>${state.completed.filter(n=>RECIPES.find(r=>r.name===n)?.type===c).length}/21</strong><span>${esc(c)}</span></div>`).join('')}`;
  bindDynamic();
}
function renderIngredients(){document.getElementById('ingRows').innerHTML=ING.map(i=>{const n=RECIPES.filter(r=>r.ingredients.includes(i.name)).length;return `<tr><td><b>${esc(i.name)}</b><div class="small">${esc(i.nameEn)}</div></td><td class="rarity rar-${esc(i.rarity)}">${esc(i.rarity)}</td><td>${i.cost}</td><td>${esc(i.source)}</td><td>${esc(i.runeEffect)}</td><td>${n}</td></tr>`}).join('')}
function renderHistory(){
  const keys=Object.keys(state.history).sort().reverse();
  document.getElementById('historyList').innerHTML=keys.length?keys.map(k=>{const arr=cookedFor(k),total=arr.reduce((s,h)=>s+Number(h.emblem||0),0);return `<div class="hist"><div class="hist-head"><div><b>${k.split('-').reverse().join('/')}</b><small>${arr.length} receita(s)</small></div><span>${total.toLocaleString('pt-BR')} 🏅</span></div><div class="hist-items">${arr.map(h=>`<div class="hist-item"><span>${esc(h.recipe)} · ${esc(h.category||'')} · +${h.bonusPct||0}%</span><span>${Number(h.emblem||0).toLocaleString('pt-BR')}</span></div>`).join('')}</div></div>`}).join(''):'<div class="small">Nenhum prato lançado ainda.</div>';
}
function renderFlowProgress(){
  const step=currentFlowStep(),cooks=cookedFor().length;
  document.getElementById('flowDay').textContent=dayType()||'Sem cozinha';document.getElementById('flowChef').textContent=selectedChef()?`Chef ${selectedChef()}`:'pendente';document.getElementById('flowStock').textContent=stockChecked()?'confirmado':hasAnyStock()?'confirmar':'pendente';document.getElementById('flowGuild').textContent=guildChecked()?`${reservedRecipes().size} reservado(s)`:'pendente';document.getElementById('flowResult').textContent=cooks?`${cooks} cozido(s)`:flowReady()?'liberado':'bloqueado';
  document.querySelectorAll('.flow-step').forEach((el,i)=>{const n=i+1;el.classList.toggle('done',n<step||(n===3&&stockChecked())||(n===4&&guildChecked())||cooks>0);el.classList.toggle('current',n===step&&cooks===0);el.classList.toggle('locked',n>step&&cooks===0)});
  const ss=document.getElementById('stockConfirmStatus');ss.textContent=stockChecked()?'Estoque confirmado. Se alterar algum valor, confirme novamente.':'Confirme quando terminar de informar os ingredientes.';ss.classList.toggle('ok',stockChecked());
  const gs=document.getElementById('guildConfirmStatus');gs.textContent=guildChecked()?'Guilda conferida para hoje.':'Adicione os pratos feitos/planejados ou confirme que não há outros.';gs.classList.toggle('ok',guildChecked());
  document.getElementById('stockSection').classList.toggle('step-highlight',step===3);document.getElementById('guildCard').classList.toggle('step-highlight',step===4);
}
function renderMobileBar(){
  const label=document.getElementById('mobileRecLabel'),name=document.getElementById('mobileRecName'),sub=document.getElementById('mobileRecSub'),btn=document.getElementById('mobileRecAction');let target='dayPicker';
  if(!dayType()){const n=nextCookingInfo();label.textContent='Sem cozinha hoje';name.textContent='Próxima: '+n.category;sub.textContent=fmtDate(n.date)+' · terça/quarta/quinta fixos';target='dayPicker'}
  else if(!selectedChef()){label.textContent='Próxima etapa';name.textContent='Escolha o chef';sub.textContent='Etapa 2 de 5';target='chefDayBox'}
  else if(!hasAnyStock()||!stockChecked()){label.textContent='Próxima etapa';name.textContent=hasAnyStock()?'Confirme o estoque':'Informe o estoque';sub.textContent='Etapa 3 de 5';target='stockSection'}
  else if(!guildChecked()){label.textContent='Próxima etapa';name.textContent='Confira a guilda';sub.textContent='Etapa 4 de 5';target='guildCard'}
  else if(!canCookMoreOn()){label.textContent='Dia encerrado';name.textContent=cookedFor().map(x=>x.recipe).join(' / ');sub.textContent='Múltiplas receitas desativadas';target='recommendation'}
  else{const r=planBestForToday();label.textContent=cookedFor().length?'Próxima receita':'Melhor prato';name.textContent=r?r.name:'Poupar / nenhuma opção';sub.textContent=r?`+${r.bonusPct}% · ${r.emblem.toLocaleString('pt-BR')} emblemas`:'Veja o plano do ciclo';target='recommendation'}
  btn.onclick=()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'center'});
}

function renderSettings(){
  document.getElementById('goal').value=state.settings.goal;document.getElementById('elementPriority').value=state.settings.elementPriority;document.getElementById('allowMultiple').checked=!!state.settings.allowMultiple;document.getElementById('useGuildPlans').checked=!!state.settings.useGuildPlans;
  const over=state.categoryOverride[todayKey()],auto=autoCategoryFor();
  document.getElementById('dayCaption').innerHTML=over?`Hoje está em modo manual: <b>${esc(over)}</b>. ${auto?`Automático seria ${esc(auto)}.`:'Hoje não é um dia automático de cozinha.'}`:auto?`Calendário automático: <b>${esc(auto)}</b>.`:'Hoje não há cozinha automática. Próximo ciclo começa na terça com Aperitivo.';
  const qtd=cookingDatesFromToday().length;
  document.getElementById('autoDayText').innerHTML=`Calendário fixo: <b>terça = Aperitivo · quarta = Prato principal · quinta = Sobremesa</b>. O plano mostra ${qtd} dia(s) restante(s)/próximo(s) de cozinha. ${state.settings.elementPriority!=='none'?`Preservação elemental ativa: <b>${esc(ELEMENT_ING[state.settings.elementPriority])}</b>.`:'Sem preservação elemental.'}`;
}
function renderAll(refreshInventory=true){
  document.getElementById('dayType').value=dayType()||'';document.querySelectorAll('.day-btn').forEach(b=>b.classList.toggle('active',b.dataset.cat===dayType()));
  renderSettings();if(refreshInventory)renderInventory();renderGuild();renderRecommendation();renderTodayRecipes();renderCyclePlan();renderAllRecipes();renderHistory();renderFlowProgress();renderMobileBar();bindDynamic();
}

function markGuild(id){const r=RECIPES.find(x=>x.id===id),k=todayKey();if(!r)return;state.guildByDate[k]=[...new Set([...(state.guildByDate[k]||[]),r.name])];state.guildCheckedByDate[k]=false;save();renderGuild();refreshDecisionPanels()}
function toggleDone(id){const r=RECIPES.find(x=>x.id===id);if(!r)return;state.completed=state.completed.includes(r.name)?state.completed.filter(x=>x!==r.name):[...state.completed,r.name];save();renderAllRecipes();renderRecommendation();renderCyclePlan()}
function cook(id){
  const r=RECIPES.find(x=>x.id===id);if(!r||!flowReady())return;if(!canCookMoreOn()){toast('Múltiplas receitas estão desativadas.');return}if(cookedNames().has(r.name)){toast('Você já lançou esta receita hoje.');return}if(reservedRecipes().has(r.name)){toast('Receita reservada pela guilda.');return}if(!canWithStock(r)){toast('Estoque insuficiente.');return}
  if(!confirm(`Confirmar ${r.name}? O estoque será descontado automaticamente.`))return;
  const raw=rawCostFor(r),wasNew=!state.completed.includes(r.name);for(const [i,v] of Object.entries(raw))state.stock[i]=Math.max(0,(Number(state.stock[i])||0)-v);if(wasNew)state.completed.push(r.name);
  const k=todayKey();state.history[k]=[...(state.history[k]||[]),{recipe:r.name,recipeId:r.id,category:r.type,bonusPct:r.bonusPct,emblem:r.emblem,spent:raw,wasNew,createdAt:new Date().toISOString()}];save();renderAll(true);
}
function undoCook(index){
  const k=todayKey(),arr=cookedFor(k),h=arr[index];if(!h)return;if(!confirm(`Desfazer ${h.recipe} e devolver os ingredientes ao estoque?`))return;
  for(const [i,v] of Object.entries(h.spent||{}))state.stock[i]=(Number(state.stock[i])||0)+v;arr.splice(index,1);state.history[k]=arr;
  if(h.wasNew){const exists=Object.values(state.history).flat().some(x=>x.recipe===h.recipe);if(!exists)state.completed=state.completed.filter(x=>x!==h.recipe)}
  save();renderAll(true);
}
function openDetails(id){
  const r=RECIPES.find(x=>x.id===id);if(!r)return;const miss=missingWithStock(r),raw=rawCostFor(r),el=ELEMENT_ING[state.settings.elementPriority],usesEl=el&&r.ingredients.includes(el);
  document.getElementById('modalTitle').textContent=r.name;document.getElementById('modalBody').innerHTML=`<div class="small">Original: ${esc(r.nameEn)}</div><div class="pills"><span class="pill">${esc(r.type)}</span><span class="pill rarity rar-${esc(r.rarity)}">${esc(r.rarity)}</span><span class="pill gold">+${r.bonusPct}%</span><span class="pill">${r.emblem.toLocaleString('pt-BR')} emblemas</span></div>${usesEl?`<div class="callout" style="margin-top:10px">A estratégia atual está preservando <b>${esc(el)}</b>; esta receita consome esse ingrediente.</div>`:''}<div class="sep"></div><div class="sectionTitle">Receita perfeita</div><div>${esc(recipeText(r))}</div><div class="small" style="margin-top:5px">Custo bruto: ${Object.entries(raw).map(([i,v])=>`${esc(i)} ${v}`).join(' · ')}</div><div class="sep"></div><div class="sectionTitle">Com seu estoque</div>${canWithStock(r)?'<div class="pill ok">Dá para fazer agora</div>':miss.map(x=>`<div class="plan-day"><b>Falta ${x.raw} ${esc(x.name)}</b><div class="small">Onde buscar: ${esc(sourceTip(x))}</div></div>`).join('')}<div class="sep"></div><div class="sectionTitle">Ingredientes</div>${Object.entries(counts(r)).map(([i,n])=>`<div class="plan-day"><b>${n}× ${esc(i)}</b><div class="small">${esc(ING_MAP[i].rarity)} · ${ING_MAP[i].cost}/seleção · ${esc(ING_MAP[i].source)}</div></div>`).join('')}`;document.getElementById('modal').classList.add('open');
}
function parseStockText(){
  const txt=norm(document.getElementById('pasteStock').value);let found=0;
  for(const i of ING){let v=null;for(const a of [i.name,i.nameEn].map(norm)){const re=new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[:=-]?\\s*(\\d+)','i');const m=txt.match(re);if(m){v=Number(m[1]);break}}if(v!==null){state.stock[i.name]=v;found++}}
  if(!found){toast('Não consegui identificar ingredientes.');return}state.stockCheckedByDate[todayKey()]=false;save();renderAll(true);toast(`${found} ingrediente(s) atualizado(s).`);
}
function exportData(){const blob=new Blob([JSON.stringify({version:3,exportedAt:new Date().toISOString(),state},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`slayer-dv-v15-backup-${todayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importData(file){const rd=new FileReader();rd.onload=()=>{try{const o=JSON.parse(rd.result);state=normalizeState(o.state||o);save();renderAll(true);toast('Backup importado.')}catch{toast('Backup inválido.')}};rd.readAsText(file)}
function bindDynamic(){
  document.querySelectorAll('[data-details]').forEach(b=>b.onclick=()=>openDetails(Number(b.dataset.details)));
  document.querySelectorAll('[data-guild]').forEach(b=>b.onclick=()=>markGuild(Number(b.dataset.guild)));
  document.querySelectorAll('[data-cook]').forEach(b=>b.onclick=()=>cook(Number(b.dataset.cook)));
  document.querySelectorAll('[data-toggle-done]').forEach(b=>b.onclick=()=>toggleDone(Number(b.dataset.toggleDone)));
  document.querySelectorAll('[data-undo-cook]').forEach(b=>b.onclick=()=>undoCook(Number(b.dataset.undoCook)));
}
function activateTab(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===id));window.scrollTo({top:0,behavior:'smooth'})}

// Navegação e eventos fixos
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));
document.querySelectorAll('[data-tab-jump]').forEach(b=>b.onclick=()=>activateTab(b.dataset.tabJump));
document.querySelectorAll('[data-flow-target]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.flowTarget)?.scrollIntoView({behavior:'smooth',block:'center'}));
document.querySelectorAll('.day-btn').forEach(b=>b.onclick=()=>{state.categoryOverride[todayKey()]=b.dataset.cat;save();renderAll(false)});
document.getElementById('useAutoDay').onclick=()=>{delete state.categoryOverride[todayKey()];save();renderAll(false)};
document.getElementById('goal').onchange=e=>{state.settings.goal=e.target.value;save();refreshDecisionPanels();renderSettings()};
document.getElementById('elementPriority').onchange=e=>{state.settings.elementPriority=e.target.value;save();refreshDecisionPanels();renderSettings()};
document.getElementById('allowMultiple').onchange=e=>{state.settings.allowMultiple=e.target.checked;save();refreshDecisionPanels();renderSettings()};
document.getElementById('useGuildPlans').onchange=e=>{state.settings.useGuildPlans=e.target.checked;save();refreshDecisionPanels();renderSettings()};
document.getElementById('guildAdd').onchange=e=>{if(e.target.value){const r=RECIPES.find(x=>x.name===e.target.value);if(r)markGuild(r.id);e.target.value=''}};
document.getElementById('clearGuild').onclick=()=>{state.guildByDate[todayKey()]=[];state.guildCheckedByDate[todayKey()]=false;save();renderGuild();refreshDecisionPanels()};
document.getElementById('addGuildPlan').onclick=addGuildPlan;document.getElementById('copyDiscord').onclick=copyDiscord;
document.getElementById('confirmGuild').onclick=()=>{state.guildCheckedByDate[todayKey()]=true;save();renderAll(false);document.getElementById('recommendation').scrollIntoView({behavior:'smooth',block:'center'})};
document.getElementById('confirmStock').onclick=()=>{if(!hasAnyStock()){toast('Informe pelo menos um ingrediente.');return}state.stockCheckedByDate[todayKey()]=true;save();renderAll(false);document.getElementById('guildCard').scrollIntoView({behavior:'smooth',block:'center'})};
document.getElementById('clearChef').onclick=()=>{delete state.selectedChefByDate[todayKey()];state.stockCheckedByDate[todayKey()]=false;save();renderAll(true)};
document.getElementById('clearStock').onclick=()=>{if(confirm('Zerar todo o estoque?')){state.stock={...base.stock};state.stockCheckedByDate[todayKey()]=false;save();renderAll(true)}};
document.getElementById('pasteToggle').onclick=()=>document.getElementById('quickPaste').classList.toggle('hidden');document.getElementById('parseStock').onclick=parseStockText;
document.getElementById('loadMyProgress').onclick=()=>{state.completed=[...new Set([...state.completed,'Sanduíche de Ovo','Cereais','Sukiyaki','Churrasco do Zeke'])];save();renderAllRecipes();renderCyclePlan();renderRecommendation()};
['search','fType','fRarity','fState'].forEach(id=>document.getElementById(id).addEventListener(id==='search'?'input':'change',renderAllRecipes));
document.getElementById('exportData').onclick=exportData;document.getElementById('importData').onchange=e=>e.target.files[0]&&importData(e.target.files[0]);
document.getElementById('closeModal').onclick=()=>document.getElementById('modal').classList.remove('open');document.getElementById('modal').onclick=e=>{if(e.target.id==='modal')e.currentTarget.classList.remove('open')};

renderIngredients();renderAll(true);
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(()=>{});
})();