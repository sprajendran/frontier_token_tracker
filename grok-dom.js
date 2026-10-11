// Grok consumer tracking runs in the isolated world, independent of transport.
globalThis.GrokDomTracker={
 create({root=document,enabled=()=>false,emit,settleMs=2500,timeoutMs=300000,getUrl=()=>location.href}){
  const editors='[data-testid="chat-input"] [contenteditable="true"], [data-testid="chat-input"][contenteditable="true"], .ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea:not([aria-hidden="true"]):not([tabindex="-1"])';
  const userSelector='[data-testid="user-message"], [data-message-author-role="user"], .message-bubble.user, .message-bubble.human, [data-role="user"]';
  const users=()=>[...root.querySelectorAll(userSelector)];
  function responses(){
   const nodes=[...root.querySelectorAll('[data-testid="assistant-message"], [data-message-author-role="assistant"], .response-content-markdown, .message-bubble')].filter(n=>!n.closest(userSelector)&&!n.closest('[id^="response-"].items-end'));
   return nodes.filter(n=>!nodes.some(parent=>parent!==n&&parent.contains(n)));
  }
  const text=n=>(n?.querySelector('.response-content-markdown')||n)?.textContent?.trim()||'';
  const tokens=t=>Math.ceil(new TextEncoder().encode(t).length/4);
  let turn=null,pending=null,knownUsers=new Set(users()),lastStart=0;
  function publish(status){if(!turn||!enabled())return;turn.record.status=status;turn.record.sequence++;emit(structuredClone(turn.record));}
  function editorText(){const editor=[...root.querySelectorAll(editors)].find(n=>!n.closest('[aria-hidden="true"]')&&(n.value||n.textContent||'').trim());return (editor?.value||editor?.textContent||'').trim();}
  function prepare(prompt=editorText()){
   if(!enabled()||!prompt)return;
   pending={prompt,baseline:new Map(responses().map(n=>[n,text(n)])),url:getUrl(),time:Date.now()};
  }
  function start(prompt,baseline,url){
   if(!enabled()||!prompt||Date.now()-lastStart<500)return;
   if(turn&&!turn.completed)publish('interrupted');
   const now=Date.now();lastStart=now;
   turn={baseline,lastText:'',changedAt:now,startedAt:now,lastPublish:0,completed:false,url,record:{id:'capture:'+crypto.randomUUID(),provider:'xAI',model:'Grok (selected model unspecified)',timestamp:now,input:tokens(prompt),output:null,inputQuality:'estimated',outputQuality:'unavailable',transport:'dom',adapterVersion:'grok-dom-2',status:'started',sequence:0,categories:{}}};
   publish('started');
  }
  function confirm(){if(pending){const p=pending;pending=null;start(p.prompt,p.baseline,p.url);}}
  function tick(){
   const current=users(),added=current.filter(n=>!knownUsers.has(n));knownUsers=new Set(current);
   if(!enabled()){turn=null;pending=null;return;}
   if(pending&&Date.now()-pending.time>15000)pending=null;
   // A rendered user message confirms submission even for icon-only send buttons.
   if(added.length&&pending)confirm();
   if(!turn)return;
   if(getUrl()!==turn.url){
    const before=new URL(turn.url),after=new URL(getUrl());
    // Query/hash changes are UI updates. Creating a chat assigns its first ID.
    const samePath=before.pathname===after.pathname;
    const assigned=/^\/(?:(?:c|chat)(?:\/new)?)?\/?$/.test(before.pathname)&&/^\/(?:c|chat)\/[^/]+\/?$/.test(after.pathname);
    if(before.origin===after.origin&&(samePath||assigned))turn.url=getUrl();
    else{if(!turn.completed)publish('interrupted');turn=null;return;}
   }
   const changed=responses().filter(n=>!turn.baseline.has(n)||text(n)!==turn.baseline.get(n));
   const output=changed.map(text).filter(Boolean).join('\n');
   if(output&&output!==turn.lastText){turn.lastText=output;turn.changedAt=Date.now();turn.record.output=tokens(output);turn.record.outputQuality='estimated';if(Date.now()-turn.lastPublish>=1000||turn.completed){turn.lastPublish=Date.now();publish(turn.completed?'completed':'streaming');}}
   const busy=root.querySelector('button[aria-label*="stop" i], button[data-testid="stop-button"], [data-testid="assistant-message"][aria-busy="true"]');
   if(output&&!busy&&!turn.completed&&Date.now()-turn.changedAt>=settleMs){publish('completed');turn.completed=true;}
   if(Date.now()-turn.startedAt>=timeoutMs){if(!turn.completed)publish('interrupted');turn=null;}
  }
  function input(e){if(e.target.closest?.(editors))prepare();}
  function keydown(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target.closest?.(editors)){prepare();confirm();}}
  function click(e){const button=e.target.closest?.('button, [role="button"]');if(!button||button.disabled)return;const hint=[button.getAttribute('data-testid'),button.getAttribute('aria-label'),button.getAttribute('title')].join(' ');if(/send|submit/i.test(hint)){prepare();confirm();}}
  function submit(e){if(e.target.querySelector?.(editors)){prepare();confirm();}}
  const listeners=[['input',input],['keydown',keydown],['click',click],['submit',submit]];for(const [name,fn]of listeners)root.addEventListener(name,fn,true);
  const timer=setInterval(tick,250);
  return {tick,stop(){clearInterval(timer);for(const [name,fn]of listeners)root.removeEventListener(name,fn,true);turn=null;pending=null;}};
 }
};
