(() => {
 if(window.__frontierCaptureV2)return;window.__frontierCaptureV2=true;
 let enabled=false;const active=new Set();
 const post=(adapter,status,force=false)=>{const record=adapter.snapshot(status,force);if(record)window.postMessage({channel:'frontier-tokens-v2',type:'usage',record},location.origin);};
 window.addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.channel==='frontier-control-v2'){enabled=e.data.enabled===true;if(!enabled)for(const cancel of active)cancel();}});
 const original=window.fetch;
 window.fetch=async function(...args){
  const url=String(args[0]?.url||args[0]),method=args[1]?.method||args[0]?.method||'GET';
  const observe=enabled&&!['gemini.google.com','grok.com'].includes(location.hostname)&&ProviderAdapters.match(url,method);let body=args[1]?.body,request={};
  if(observe&&body===undefined&&args[0] instanceof Request){try{body=await args[0].clone().text();}catch{}}
  if(typeof body==='string'&&body.length<1024*1024){try{request=JSON.parse(body);}catch{}}
  const adapter=observe?ProviderAdapters.create(request,'fetch',{url}):null;
  if(adapter)post(adapter,'started',true);
  let response;try{response=await original.apply(this,args);}catch(e){if(adapter)post(adapter,e.name==='AbortError'?'interrupted':'failed',true);throw e;}
  if(!adapter||!enabled)return response;
  if(!response.ok){post(adapter,'failed',true);return response;}
  const type=response.headers.get('content-type')||'';
  if(!/json|event-stream|ndjson/.test(type)||!response.body){post(adapter,'completed',true);return response;}
  (async()=>{const reader=response.clone().body.getReader(),decoder=new TextDecoder(),parser=ProviderAdapters.parser(adapter,type);let cancelled=false;const cancel=()=>{cancelled=true;reader.cancel().catch(()=>{});};active.add(cancel);
   try{while(true){const {done,value}=await reader.read();if(cancelled)return;parser.push(decoder.decode(value,{stream:!done}),done);if(done)break;post(adapter,'streaming');}post(adapter,'completed',true);}catch{post(adapter,'interrupted',true);reader.cancel().catch(()=>{});}finally{active.delete(cancel);reader.releaseLock();}
  })().catch(()=>post(adapter,'failed',true));return response;
 };
 const proto=XMLHttpRequest.prototype,open=proto.open,send=proto.send;
 const state=new WeakMap();
 proto.open=function(method,url,...rest){state.set(this,{method,url:String(url)});return open.call(this,method,url,...rest);};
 proto.send=function(body){const ctx=state.get(this);if(!enabled||['gemini.google.com','grok.com'].includes(location.hostname)||!ctx||!ProviderAdapters.match(ctx.url,ctx.method))return send.call(this,body);
  let request={};try{request=JSON.parse(body);}catch{}const adapter=ProviderAdapters.create(request,'xhr',{url:ctx.url});let parser,offset=0,failed=false;post(adapter,'started',true);
  const read=done=>{if(!enabled)return;try{const type=this.getResponseHeader('content-type')||'';if(!/json|event-stream|ndjson/.test(type))return;if(this.responseType==='json'){if(done)adapter.parse(this.response);return;}if(this.responseType&&this.responseType!=='text')return;parser ||=ProviderAdapters.parser(adapter,type);const text=this.responseText;parser.push(text.slice(offset),done);offset=text.length;}catch{failed=true;}};
  const progress=()=>{read(false);post(adapter,'streaming');},error=()=>{failed=true;};
  const finish=()=>{read(true);if(enabled)post(adapter,failed||this.status===0?'interrupted':this.status>=400?'failed':'completed',true);for(const [name,fn]of listeners)this.removeEventListener(name,fn);};
  const listeners=[['progress',progress],['error',error],['abort',error],['loadend',finish]];for(const [name,fn]of listeners)this.addEventListener(name,fn);
  try{return send.call(this,body);}catch(e){finish();throw e;}
 };
 const NativeEventSource=window.EventSource;
 if(NativeEventSource){window.EventSource=new Proxy(NativeEventSource,{construct(Target,args){const source=Reflect.construct(Target,args);if(!enabled||['gemini.google.com','grok.com'].includes(location.hostname)||!ProviderAdapters.match(String(args[0]),'GET'))return source;let adapter=ProviderAdapters.create({},'eventsource'),finished=false;post(adapter,'started',true);
   source.addEventListener('open',()=>{if(finished&&enabled){adapter=ProviderAdapters.create({},'eventsource');finished=false;post(adapter,'started',true);}});
   const handler=e=>{if(!enabled||finished)return;try{adapter.parse(JSON.parse(e.data));post(adapter,'streaming');if(['message_stop','response.completed','done'].includes(e.type)){post(adapter,'completed',true);finished=true;}}catch{}};
   for(const name of ['message','message_start','message_delta','content_block_delta','message_stop','response.completed','done'])source.addEventListener(name,handler);
   source.addEventListener('error',()=>{if(enabled&&!finished){post(adapter,'interrupted',true);finished=true;}});const close=source.close;source.close=function(){if(enabled&&!finished){post(adapter,'interrupted',true);finished=true;}return close.call(this);};return source;
 }});}
})();
