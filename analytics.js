globalThis.TokenAnalytics = {
  bucket(timestamp, interval) {
    const d = new Date(timestamp);
    d.setMinutes(0,0,0);
    if (interval !== 'hour') d.setHours(0);
    if (interval === 'week') d.setDate(d.getDate() - (d.getDay()+6)%7);
    if (interval === 'month') d.setDate(1);
    return d.getTime();
  },
  aggregate(records, {days=7,model='',source='',interval='day',now=Date.now()}={}) {
    const filtered = records.filter(r => r.timestamp <= now && (!days || r.timestamp >= now-days*86400000) && (!model || r.model===model) && (!source || r.source===source));
    const models = new Map(), buckets = new Map();
    let input=0,output=0;
    for (const r of filtered) {
      input+=r.input;output+=r.output;
      const key=JSON.stringify([r.provider,r.model]);
      const m=models.get(key)||{model:r.model,provider:r.provider,input:0,output:0,inputKnown:0,outputKnown:0,count:0};
      if(r.input!=null)m.inputKnown++;if(r.output!=null)m.outputKnown++;
      m.input+=r.input;m.output+=r.output;m.count++;models.set(key,m);
      const time=this.bucket(r.timestamp,interval), b=buckets.get(time)||{time,input:0,output:0,models:[]};
      let bm=b.models.find(m=>m.model===r.model&&m.provider===r.provider);
      if(!bm){bm={model:r.model,provider:r.provider,input:0,output:0};b.models.push(bm);}
      bm.input+=r.input;bm.output+=r.output;
      b.input+=r.input;b.output+=r.output;buckets.set(time,b);
    }
    const directions=Object.fromEntries(['input','output'].map(k=>[k,{known:filtered.filter(r=>r[k]!=null).length,missing:filtered.filter(r=>r[k]==null).length,estimated:filtered.filter(r=>r[k]!=null&&r[k+'Quality']==='estimated').length}]));
    return {input,output,directions,count:filtered.length,incomplete:filtered.filter(r=>r.input==null||r.output==null).length,interrupted:filtered.filter(r=>['interrupted','failed'].includes(r.status)).length,reported:filtered.filter(r=>r.source==='reported').length,estimated:filtered.filter(r=>r.source==='estimated').length,models:[...models.values()].sort((a,b)=>(b.input+b.output)-(a.input+a.output)),buckets:[...buckets.values()].sort((a,b)=>a.time-b.time)};
  }
};
