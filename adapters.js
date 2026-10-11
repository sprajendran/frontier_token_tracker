(() => {
 const providers={'chatgpt.com':'OpenAI','claude.ai':'Anthropic','gemini.google.com':'Google','aistudio.google.com':'Google','grok.com':'xAI','www.perplexity.ai':'Perplexity','chat.deepseek.com':'DeepSeek','chat.mistral.ai':'Mistral','openrouter.ai':'OpenRouter'};
 function extract(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.map(extract).join('\n');if(!value||typeof value!=='object')return '';return extract(value.text??value.content??value.parts??'');}
 globalThis.ProviderAdapters={
  match(url,method){if(!['POST','GET'].includes(method.toUpperCase()))return false;const target=new URL(url,location.href),path=target.pathname;if(target.hostname==='chat.deepseek.com'||location.hostname==='chat.deepseek.com')return method.toUpperCase()==='POST'&&/^\/api\/v0\/chat\/(?:completion|continue)\/?$/.test(path);if(/history|list|feedback|title|count_tokens/i.test(path))return false;if(method.toUpperCase()==='POST'&&/^\/rest\/app-chat\/conversations\/(?:new|[^/]+\/responses)$/.test(path))return true;return method.toUpperCase()==='POST'?/completion|generateContent|streamGenerateContent|\/messages(?:\/|$)|\/responses(?:\/|$)|\/conversation(?:\/|$)|\/completion(?:\/|$)|\/chat(?:\/|$)/i.test(path):/\/stream(?:\/|$)|streamGenerateContent/.test(path);},
  create(request={},transport='fetch',context={}){
   let targetHostname;try{targetHostname=new URL(context.url,location.href).hostname;}catch{}
   const provider=providers[context.hostname||location.hostname]||providers[targetHostname]||'Unknown',inputText=extract(request.messages||request.contents||request.prompt||request.input||(provider==='xAI'?request.message:''));
   let urlModel;try{urlModel=decodeURIComponent(new URL(context.url,location.href).pathname.match(/\/models\/([^/:]+):(?:streamGenerateContent|generateContent)/)?.[1]||'');}catch{}
   const r={id:'capture:'+crypto.randomUUID(),model:typeof request.model==='string'?request.model:provider==='xAI'&&typeof request.modelName==='string'?request.modelName:urlModel||provider+' (unspecified)',provider,timestamp:Date.now(),input:null,output:null,inputQuality:'unavailable',outputQuality:'unavailable',status:'started',sequence:0,transport,adapterVersion:'2.3',categories:{}};
   let outputText='',last=0,patchPath='',patchOperation='',role='assistant';
   const count=v=>Number.isSafeInteger(v)&&v>=0;
   let deepPath='',deepOperation='APPEND',fragments=[],legacyAnswer='',legacyThinking='';
   function deepText(value){
    if(typeof value==='string')return value;
    if(value&&typeof value==='object'&&!Array.isArray(value))return typeof value.text==='string'?value.text:typeof value.content==='string'?value.content:null;
    return null;
   }
   function updateFragment(index,text){
    // Some streams start text before sending the fragment container.
    if(index===-1&&!fragments.length)fragments.push({type:'RESPONSE',content:''});
    const resolved=index<0?fragments.length+index:index;
    if(resolved>=0&&fragments[resolved]){fragments[resolved].content=deepOperation==='APPEND'?(fragments[resolved].content||'')+text:text;refreshFragments();}
   }
   function deepParse(v){
    if(!v||typeof v!=='object')return;
    if(Array.isArray(v)){v.forEach(deepParse);return;}
    if(!Object.prototype.hasOwnProperty.call(v,'v')){
     if(v.response)deepParse(v.response);
     if(typeof v.model==='string'&&v.model.trim())r.model=v.model;
     if(Array.isArray(v.fragments)){fragments=v.fragments.map(f=>({...f}));deepPath='response/fragments/-1/content';deepOperation='APPEND';refreshFragments();}
     else if(typeof v.content==='string'){legacyAnswer=v.content;refreshLegacy();deepPath='response/content';deepOperation='APPEND';}
     if(typeof v.thinking_content==='string'){legacyThinking=v.thinking_content;refreshLegacy();}
     if(v.usage)parse({usage:v.usage});
     return;
    }
    if(typeof v.p==='string')deepPath=v.p.replace(/^\//,'');
    if(typeof v.o==='string')deepOperation=v.o.toUpperCase();
    if(/^(?:response\/)?usage$/.test(deepPath)&&v.v&&typeof v.v==='object'){parse({usage:v.v});return;}
    if(deepOperation==='BATCH'&&Array.isArray(v.v)){
     const base=deepPath;for(const patch of v.v)deepParse({...patch,o:patch.o||'SET',p:patch.p?.startsWith('response/')?patch.p:[base,patch.p].filter(Boolean).join('/')});deepPath=base;deepOperation='BATCH';return;
    }
    if(/^(?:response\/)?fragments$/.test(deepPath)&&Array.isArray(v.v)&&v.v.some(f=>typeof f.p==='string')){v.v.forEach(deepParse);return;}
    if(/^(?:response\/)?fragments$/.test(deepPath)&&Array.isArray(v.v)){
     const items=v.v.map(f=>({...f}));if(deepOperation==='APPEND')fragments.push(...items);else fragments=items;deepPath='response/fragments/-1/content';deepOperation='APPEND';refreshFragments();return;
    }
    const whole=deepPath.match(/^(?:response\/)?fragments\/(-?\d+)$/);
    if(whole&&v.v&&typeof v.v==='object'&&!Array.isArray(v.v)){
     const index=Number(whole[1]),resolved=index<0?fragments.length+index:index;
     if(resolved>=0&&resolved<=fragments.length){fragments[resolved]={...v.v};refreshFragments();deepPath=deepPath+'/content';deepOperation='APPEND';}return;
    }
    const part=deepPath.match(/^(?:response\/)?fragments\/(-?\d+)\/content$/);
    const text=deepText(v.v);
    if(part&&text!==null){
     updateFragment(Number(part[1]),text);return;
    }
    if((!deepPath||/^(?:response\/)?(?:content|thinking_content|reasoning_content)$/.test(deepPath))&&text!==null){
     if(!deepPath){updateFragment(-1,text);return;}
     if(/(?:thinking|reasoning)_content$/.test(deepPath))legacyThinking=deepOperation==='APPEND'?legacyThinking+text:text;
     else legacyAnswer=deepOperation==='APPEND'?legacyAnswer+text:text;
     refreshLegacy();return;
    }
    if((!deepPath||deepPath==='response')&&v.v&&typeof v.v==='object')deepParse(v.v);
   }
   function refreshLegacy(){outputText=legacyThinking+legacyAnswer;}
   function refreshFragments(){outputText=fragments.filter(f=>['RESPONSE','THINK','TEMPLATE_RESPONSE'].includes(f.type)).map(f=>typeof f.content==='string'?f.content:'').join('');}
   function parse(v){if(typeof v==='string'){if(role==='assistant'&&patchOperation==='append'&&/\/content\/parts\/\d+$/.test(patchPath))outputText+=v;return;}if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(parse);return;}
    if(provider==='DeepSeek'&&(Object.prototype.hasOwnProperty.call(v,'v')||v.response||v.fragments||typeof v.content==='string'||typeof v.thinking_content==='string')){deepParse(v);return;}
    if(provider==='xAI'){
     if(v.result){parse(v.result);return;}
     if(typeof v.token==='string')outputText+=v.token;
     if(v.modelResponse){parse(v.modelResponse);if(typeof v.modelResponse.message==='string')outputText=v.modelResponse.message;return;}
     if(typeof v.modelName==='string')r.model=v.modelName;
    }
    // Consumer ChatGPT wraps message snapshots and JSON patches in `v`.
    if(Object.prototype.hasOwnProperty.call(v,'v')){
     if(typeof v.p==='string')patchPath=v.p;
     if(typeof v.o==='string')patchOperation=v.o;
     if(v.v&&typeof v.v==='object'){parse(v.v);return;}
     if(typeof v.v==='string'&&/\/author\/role$/.test(patchPath)){role=v.v;return;}
     if(typeof v.v==='string'&&/(?:model_slug|model)$/.test(patchPath)){r.model=v.v;return;}
     if(typeof v.v==='string'&&/\/content\/parts\/\d+$/.test(patchPath)&&role==='assistant'){
      if(patchOperation==='append')outputText+=v.v;else if(['replace','add'].includes(patchOperation))outputText=v.v;
     }
     return;
    }
    if(typeof v.model==='string')r.model=v.model;
    if(typeof v.metadata?.model_slug==='string')r.model=v.metadata.model_slug;
    if(typeof v.author?.role==='string')role=v.author.role;
    const u=v.usage||v.usageMetadata;
    if(u){const i=u.input_tokens??u.prompt_tokens??u.promptTokenCount;let o=u.output_tokens??u.completion_tokens;
     if(o===undefined&&count(u.candidatesTokenCount))o=u.candidatesTokenCount+(u.thoughtsTokenCount||0);
     if(count(i)){r.input=i+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0);r.inputQuality='reported';}
     if(count(o)){r.output=o;r.outputQuality='reported';}
     for(const [k,n]of [['cachedInput',u.cache_read_input_tokens??u.cachedContentTokenCount??u.prompt_tokens_details?.cached_tokens],['cacheCreation',u.cache_creation_input_tokens],['reasoning',u.thoughtsTokenCount??u.completion_tokens_details?.reasoning_tokens]])if(count(n))r.categories[k]=n;
    }
    if(typeof v.delta?.text==='string')outputText+=v.delta.text;
    if(v.type==='response.output_text.delta'&&typeof v.delta==='string')outputText+=v.delta;
    for(const c of v.choices||[])outputText+=extract(c.delta?.content??c.message?.content);
    for(const c of v.candidates||[])outputText+=extract(c.content?.parts);
    if(Array.isArray(v.content))outputText+=extract(v.content);
    if(v.author?.role==='assistant'&&v.content?.parts)outputText=extract(v.content.parts);
    if(Array.isArray(v.output))v.output.forEach(parse);
    if(v.message){parse(v.message);if(v.message.author?.role==='assistant')outputText=extract(v.message.content?.parts);}
    if(v.response)parse(v.response);
   }
   return {record:r,parse,snapshot(status,force=false){const now=Date.now();if(!force&&now-last<1000)return null;last=now;r.status=status;r.sequence++;if(r.inputQuality!=='reported'&&inputText){r.input=Math.ceil(new TextEncoder().encode(inputText).length/4);r.inputQuality='estimated';}if(r.outputQuality!=='reported'&&(outputText||r.outputQuality==='estimated')){r.output=Math.ceil(new TextEncoder().encode(outputText).length/4);r.outputQuality='estimated';}return structuredClone(r);}};
  },
  parser(adapter,type){let buffer='',bytes=0;const streaming=/event-stream|ndjson|jsonl/.test(type)||(adapter.record.provider==='xAI'&&/json/.test(type)),sse=type.includes('event-stream');let data=[];function json(t){try{adapter.parse(JSON.parse(t));}catch{}}function line(l){if(!sse){json(l);return;}if(!l){if(data.length)json(data.join('\n'));data=[];}else if(l.startsWith('data:'))data.push(l.slice(5).replace(/^ /,''));}return {push(chunk,done=false){bytes+=chunk.length;if(bytes>16*1024*1024)throw Error('Observer size limit');buffer+=chunk;if(streaming){const lines=buffer.split(/\r?\n/);buffer=lines.pop();lines.forEach(line);if(done){if(buffer)line(buffer);line('');buffer='';}}else if(done){json(buffer);buffer='';}}};}
 };
})();
