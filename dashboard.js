const $ = id => document.getElementById(id), fmt = n => n.toLocaleString();
let records=[], days=7, rates=[];
function text(tag,value) {const el=document.createElement(tag);el.textContent=value;return el;}
function modelColor(m) {
  let hash=0;for(const c of JSON.stringify([m.provider,m.model]))hash=(hash*31+c.charCodeAt(0))>>>0;
  return `hsl(${hash%360}, 55%, 45%)`;
}
function render() {
  const a=TokenAnalytics.aggregate(records,{days,model:$('model').value,source:$('source').value,interval:$('interval').value});
  for (const [id,value] of Object.entries({input:a.input,output:a.output,total:a.input+a.output,requests:a.count})) $(id).textContent=fmt(value);
  $('accuracy').textContent=`${fmt(a.reported)} reported · ${fmt(a.incomplete)} missing counts`;
  const selected=records.filter(r=>r.timestamp<=Date.now()&&(!days||r.timestamp>=Date.now()-days*86400000)&&(!$('model').value||r.model===$('model').value)&&(!$('source').value||r.source===$('source').value));
  const priced=selected.map(r=>r.cost).filter(Boolean);
  $('diagnostics').textContent=`${a.interrupted} interrupted/failed requests · ${a.incomplete} requests with unavailable input or output. Missing counts are excluded from totals. Hypothetical API-equivalent cost: ${priced.length?'$'+priced.reduce((n,p)=>n+p.amount,0).toFixed(4)+' USD across '+priced.length+' priced records':'unavailable (configure rates in settings)'}.`;
  $('models').replaceChildren();$('empty').hidden=!!a.count;
  for (const m of a.models) {
    const row=document.createElement('tr'), name=text('td',m.model);name.append(text('small',m.provider));row.append(name);
    for (const value of [m.input,m.output,m.input+m.output,m.count]) row.append(text('td',fmt(value)));
    const share=(m.input+m.output)/(a.input+a.output||1)*100,cell=text('td',share.toFixed(1)+'%'),bar=text('span',''),fill=text('span','');bar.className='share';fill.style.width=share+'%';bar.append(fill);cell.prepend(bar);row.append(cell);$('models').append(row);
  }
  const buckets=a.buckets.slice(-60),max=Math.max(1,...buckets.flatMap(b=>[b.input,b.output]));
  $('chart').replaceChildren();
  let legend=$('chart-model-legend');
  if(!legend){legend=text('div','');legend.id='chart-model-legend';legend.className='model-legend';$('chart').after(legend);}
  legend.replaceChildren();
  for(const m of a.models){const item=text('span',`${m.model} (${m.provider})`),swatch=text('i','');swatch.className='dot';swatch.style.background=modelColor(m);item.prepend(swatch);legend.append(item);}
  for (const b of buckets) {
    const modelDetails=b.models.map(m=>`${m.model} (${m.provider}): Input ${fmt(m.input)}, Output ${fmt(m.output)}`).join('\n');
    const el=text('div','');el.className='bucket';el.title=`${new Date(b.time).toLocaleString()}: Input ${fmt(b.input)}, Output ${fmt(b.output)}\n${modelDetails}`;
    el.tabIndex=0;el.setAttribute('aria-label',el.title);
    for (const kind of ['input','output']) {
      const bar=text('div','');bar.className='bar '+kind;bar.style.height=(b[kind]/max*100)+'%';
      for(const m of [...b.models].sort((a,b)=>JSON.stringify([a.provider,a.model]).localeCompare(JSON.stringify([b.provider,b.model])))){
        if(!m[kind])continue;
        const segment=text('div','');segment.className='model-segment';segment.style.height=(m[kind]/b[kind]*100)+'%';segment.style.backgroundColor=modelColor(m);
        segment.title=`${new Date(b.time).toLocaleString()}\n${m.model} (${m.provider})\n${kind==='input'?'Input':'Output'}: ${fmt(m[kind])} tokens\n${(m[kind]/b[kind]*100).toFixed(1)}% of ${kind} in this period\nModel total: ${fmt(m.input+m.output)} tokens`;
        segment.tabIndex=0;segment.setAttribute('aria-label',segment.title);bar.append(segment);
      }
      el.append(bar);
    }
    const label=text('label',new Date(b.time).toLocaleString(undefined,$('interval').value==='hour'?{hour:'numeric'}:{month:'short',day:'numeric'}));
    const modelLabel=text('small',b.models.map(m=>m.model).join(', '));modelLabel.className='bucket-models';label.append(modelLabel);el.append(label);$('chart').append(el);
  }
  if (!buckets.length) $('chart').append(text('p','Your usage timeline will appear here.'));
  $('chart-note').textContent=`Local timezone · ${$('interval').selectedOptions[0].text} buckets with activity · ${a.buckets.length>60?'Showing latest 60 buckets · ':''}Input on the left, striped output on the right. Hover a segment for model and token details.`;
}
async function load() {
  const [saved,settings]=await Promise.all([FrontierClient.request('query'),FrontierClient.request('settings')]);records=saved.records||[];rates=settings.rates||[];$('enabled').checked=settings.enabled!==false;
  const chosen=$('model').value;$('model').replaceChildren(new Option('All models',''));
  [...new Set(records.map(r=>r.model))].sort().forEach(m=>$('model').add(new Option(m,m)));
  $('model').value=chosen;render();
}
async function send(msg) {const result=await chrome.runtime.sendMessage(msg);if(!result?.ok) throw Error(result?.error||'Unable to save');}
$('ranges').addEventListener('click',e=>{if(!e.target.dataset.days)return;days=Number(e.target.dataset.days);$('ranges').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===e.target));render();});
['model','source','interval'].forEach(id=>$(id).addEventListener('change',render));
$('enabled').addEventListener('change',async()=>{try{const s=await FrontierClient.request('settings');await FrontierClient.request('saveSettings',{settings:{enabled:$('enabled').checked,overlay:s.overlay,rates:s.rates}});}catch(e){$('status').textContent=e.message;}});
$('export').addEventListener('click',async()=>{try{const {records:all}=await FrontierClient.request('query');const url=URL.createObjectURL(new Blob([JSON.stringify({version:2,records:all},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='frontier-token-usage.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('status').textContent=e.message;}});
$('import').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>30*1024*1024)throw Error('File exceeds 30 MB');const data=JSON.parse(await file.text());await send({type:'import',records:Array.isArray(data)?data:data.records});$('status').textContent='Usage imported. Duplicate IDs are merged.';}catch(err){$('status').textContent=err.message;}finally{e.target.value='';}});
const date=new Date();date.setMinutes(date.getMinutes()-date.getTimezoneOffset());document.querySelector('[name=date]').value=date.toISOString().slice(0,16);
$('manual').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await send({type:'record',record:{id:crypto.randomUUID(),model:f.get('model').trim(),provider:f.get('provider').trim(),input:Number(f.get('input')),output:Number(f.get('output')),timestamp:new Date(f.get('date')).getTime(),source:'manual'}});$('status').textContent='Usage added.';}catch(err){$('status').textContent=err.message;}});
$('clear').addEventListener('click',async()=>{if(confirm('Permanently delete all token history stored on this device? Export a backup first if needed.')){await send({type:'clear'});$('status').textContent='Local history deleted.';}});
let pending=false;function refresh(){if(pending)return;pending=true;setTimeout(()=>{pending=false;load().catch(e=>{$('status').textContent=e.message;});},250);}
chrome.runtime.onMessage.addListener(m=>{if(m.type==='changed')refresh();});load().catch(e=>{$('status').textContent=e.message;});setInterval(render,60000);
