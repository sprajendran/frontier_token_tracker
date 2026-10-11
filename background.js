importScripts('schema.js','database.js','pricing.js');
const ready=(async()=>{await TokenDB.open();const old=await chrome.storage.local.get(['records','migratedV2']);if(!old.migratedV2){if(old.records?.length){const rows=old.records.map(TokenSchema.normalize);rows.forEach(TokenSchema.validate);await TokenDB.import(rows);}await chrome.storage.local.set({migratedV2:true});await chrome.storage.local.remove('records');}await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});if(!await chrome.alarms.get('refresh-badge'))chrome.alarms.create('refresh-badge',{periodInMinutes:5});})();
const sites=new Set(['chatgpt.com','claude.ai','gemini.google.com','aistudio.google.com','grok.com','www.perplexity.ai','chat.deepseek.com','chat.mistral.ai','openrouter.ai']),limits=new Map();
async function badge(){const records=await TokenDB.all(Date.now()-86400000),total=records.reduce((n,r)=>n+(r.input||0)+(r.output||0),0);await chrome.action.setBadgeText({text:total>=1e6?(total/1e6).toFixed(1)+'M':total>=1000?Math.round(total/1000)+'k':total?String(total):''});await chrome.action.setBadgeBackgroundColor({color:'#18785f'});}
function notify(){chrome.runtime.sendMessage({type:'changed'}).catch(()=>{});}
chrome.alarms.onAlarm.addListener(()=>ready.then(badge).catch(console.error));
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 (async()=>{await ready;if(!msg||typeof msg.type!=='string')throw Error('Invalid command');const internal=sender.url?.startsWith(chrome.runtime.getURL('')),settings=await chrome.storage.local.get({enabled:true,overlay:true,rates:[]});
 if(!internal){const host=new URL(sender.url).hostname;if(!sites.has(host)||!sender.tab)throw Error('Unsupported sender');if(msg.type==='settings')return {enabled:settings.enabled,overlay:settings.overlay};if(msg.type!=='usage')throw Error('Forbidden command');if(!settings.enabled)return {ignored:true};const key=sender.tab.id+':'+sender.frameId,now=Date.now(),l=limits.get(key)||{time:now,count:0};if(now-l.time>60000){l.time=now;l.count=0;}if(++l.count>240)throw Error('Capture rate limit');limits.set(key,l);if(limits.size>1000)limits.delete(limits.keys().next().value);const r=TokenSchema.normalize(msg.record);TokenSchema.validate(r);if(!r.id.startsWith('capture:')||r.source==='manual')throw Error('Invalid capture record');r.site=host;r.tabId=sender.tab.id;r.frameId=sender.frameId;r.id=host+':'+r.id;await TokenDB.upsert(r);notify();await badge();return {};}
 switch(msg.type){
 case 'settings':return settings;
 case 'saveSettings':{const s=msg.settings;if(typeof s.enabled!=='boolean'||typeof s.overlay!=='boolean'||!Array.isArray(s.rates)||s.rates.length>1000)throw Error('Invalid settings');for(const r of s.rates)if(typeof r.model!=='string'||!r.model.trim()||typeof r.provider!=='string'||!r.provider.trim()||!Number.isFinite(Date.parse(r.effective))||!['input','output'].every(k=>Number.isFinite(r[k])&&r[k]>=0)||r.currency!=='USD')throw Error('Invalid pricing: provider, model, effective date, nonnegative USD rates required');await chrome.storage.local.set({enabled:s.enabled,overlay:s.overlay,rates:s.rates});notify();return {};}
 case 'query':return {records:(await TokenDB.all(msg.since||0)).map(r=>({...r,cost:TokenPricing.estimate(r,settings.rates)}))};
 case 'record':{const r=TokenSchema.normalize(msg.record);TokenSchema.validate(r);if(r.source!=='manual')throw Error('Manual record required');await TokenDB.upsert(r);break;}
 case 'import':{if(!Array.isArray(msg.records)||msg.records.length>100000)throw Error('Invalid import');const rows=msg.records.map(TokenSchema.normalize);rows.forEach(TokenSchema.validate);await TokenDB.import(rows);break;}
 case 'clear':await TokenDB.clear();break;
 case 'openDashboard':await chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')});return {};
 default:throw Error('Unknown command');}
 notify();await badge();return {};
 })().then(r=>reply({ok:true,...r}),e=>reply({ok:false,error:e.message}));return true;
});
ready.then(badge).catch(console.error);
