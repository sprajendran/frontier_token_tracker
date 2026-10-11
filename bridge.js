(() => {
 let settings={enabled:false,overlay:true},badge,last=null,count=0,windowStart=Date.now();
 function display(message){if(!settings.overlay||!settings.enabled){badge?.remove();badge=null;return;}if(!document.documentElement)return;
  if(!badge){badge=document.createElement('div');const root=badge.attachShadow({mode:'closed'}),style=document.createElement('style');style.textContent=':host{position:fixed;bottom:18px;right:18px;z-index:2147483647}span{display:block;background:#102f32;color:#d6f3e8;padding:10px 14px;border-radius:10px;font:12px system-ui;box-shadow:0 2px 10px #0003}';const label=document.createElement('span');root.append(style,label);badge.label=label;document.documentElement.append(badge);}badge.label.textContent=message;
 }
 async function sync(){try{const r=await chrome.runtime.sendMessage({type:'settings'});if(!r.ok)throw Error(r.error);settings=r;window.postMessage({channel:'frontier-control-v2',enabled:r.enabled},location.origin);display(last||'Frontier · observing supported requests');}catch{display('Frontier · extension unavailable; reload tab');}}
 async function persist(value){if(!settings.enabled)return;
  try{if(JSON.stringify(value).length>12000)throw Error('Oversized event');if(Date.now()-windowStart>60000){count=0;windowStart=Date.now();}if(++count>240)throw Error('Capture rate limit');const record=TokenSchema.normalize(value);TokenSchema.validate(record);let result;
   for(let attempt=0;attempt<3;attempt++){try{result=await chrome.runtime.sendMessage({type:'usage',record});break;}catch(err){if(attempt===2)throw err;await new Promise(r=>setTimeout(r,200*(attempt+1)));}}
   if(!result?.ok)throw Error(result?.error||'Save failed');last=`${record.model} · in ${record.input??'?'} (${record.inputQuality}) · out ${record.output??'?'} (${record.outputQuality}) · ${record.status}`;display(last);
  }catch(err){last='Frontier · '+err.message;display(last);}
 }
 window.addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.channel==='frontier-tokens-v2'&&e.data.type==='usage')persist(e.data.record);});
 if(location.hostname==='gemini.google.com')GeminiDomTracker.create({enabled:()=>settings.enabled,emit:persist});
 if(location.hostname==='grok.com')GrokDomTracker.create({enabled:()=>settings.enabled,emit:persist});
 document.addEventListener('DOMContentLoaded',()=>display(last||'Frontier · observing supported requests'));sync();setInterval(sync,5000);
})();
