// Gemini consumer pages use a private RPC protocol. Estimate visible text for
// a user-initiated turn, with one record per turn and no history scraping.
globalThis.GeminiDomTracker = {
  create({root=document,enabled=()=>false,emit,settleMs=2500,timeoutMs=180000}) {
    const editorSelector='rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea';
    const responses=()=>[...root.querySelectorAll('model-response')];
    const text=node=>node?.querySelector('message-content')?.textContent?.trim()||node?.querySelector('.markdown')?.textContent?.trim()||'';
    const tokens=value=>Math.ceil(new TextEncoder().encode(value).length/4);
    let turn=null,lastStarted=0;
    function modelLabel() {
      const selector='[data-test-id="bard-mode-menu-button"], [data-test-id="model-selector"], bard-mode-switcher button, .input-area-switch-label';
      const node=root.querySelector(selector);
      const label=(node?.textContent||node?.getAttribute('aria-label')||'').trim().replace(/expand_more|keyboard_arrow_down/g,'').replace(/\s+/g,' ').trim().slice(0,90);
      return label ? (/gemini/i.test(label)?label:'Gemini · '+label) : 'Gemini (selected model unspecified)';
    }
    function publish(status) {
      if(!turn||!enabled())return;
      turn.record.status=status;turn.record.sequence++;
      emit(structuredClone(turn.record));
    }
    function start() {
      if(!enabled()||Date.now()-lastStarted<500)return;
      const editor=root.querySelector(editorSelector),prompt=(editor?.value||editor?.textContent||'').trim();
      if(!prompt)return;
      if(turn){if(!turn.completed)publish('interrupted');turn=null;}
      lastStarted=Date.now();
      turn={baseline:new Map(responses().map(n=>[n,text(n)])),lastText:'',changedAt:Date.now(),startedAt:Date.now(),lastPublish:0,completed:false,url:location.href,record:{id:'capture:'+crypto.randomUUID(),provider:'Google',model:modelLabel(),timestamp:Date.now(),input:tokens(prompt),output:null,inputQuality:'estimated',outputQuality:'unavailable',transport:'dom',adapterVersion:'gemini-dom-1',status:'started',sequence:0,categories:{}}};
      publish('started');
    }
    function tick() {
      if(!turn)return;
      if(!enabled()){turn=null;return;}
      if(location.href!==turn.url){
        // Gemini assigns a conversation URL after the first prompt in a new chat.
        const before=new URL(turn.url),after=new URL(location.href);
        if(before.origin===after.origin&&/^\/app\/?$/.test(before.pathname)&&after.pathname.startsWith('/app/'))turn.url=location.href;
        else {turn=null;return;}
      }
      const candidates=responses().filter(n=>!turn.baseline.has(n)||text(n)!==turn.baseline.get(n));
      const output=text(candidates.at(-1));
      if(output&&output!==turn.lastText){
        turn.lastText=output;turn.changedAt=Date.now();turn.record.output=tokens(output);turn.record.outputQuality='estimated';
        if(Date.now()-turn.lastPublish>=1000||turn.completed){turn.lastPublish=Date.now();publish(turn.completed?'completed':'streaming');}
      }
      const stop=root.querySelector('[data-test-id="stop-button"], button[aria-label*="stop" i], model-response[aria-busy="true"]');
      if(output&&!stop&&!turn.completed&&Date.now()-turn.changedAt>=settleMs){publish('completed');turn.completed=true;}
      // Keep following this turn after an idle completion: a pause in streaming
      // must not permanently discard a later chunk or create another record.
      if(Date.now()-turn.startedAt>=timeoutMs){if(!turn.completed)publish('interrupted');turn=null;}
    }
    function keydown(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target.closest?.(editorSelector))start();}
    function click(e){const button=e.target.closest?.('button, [role="button"]');if(!button||button.disabled)return;const hint=[button.getAttribute('data-test-id'),button.getAttribute('aria-label'),button.getAttribute('title')].join(' ');if(/send-button|send message|send prompt|^\s*send\s*$/i.test(hint))start();}
    function submit(){start();}
    root.addEventListener('keydown',keydown,true);root.addEventListener('click',click,true);root.addEventListener('submit',submit,true);
    const timer=setInterval(tick,250);
    return {start,tick,stop(){clearInterval(timer);root.removeEventListener('keydown',keydown,true);root.removeEventListener('click',click,true);root.removeEventListener('submit',submit,true);turn=null;}};
  }
};
