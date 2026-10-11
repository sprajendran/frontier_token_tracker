globalThis.TokenPricing={estimate(record,rates){if(record.input===null||record.output===null||record.source==='manual'&&record.status!=='completed')return null;
 const rate=rates.filter(r=>r.model===record.model&&r.provider===record.provider&&Date.parse(r.effective)<=record.timestamp).sort((a,b)=>Date.parse(b.effective)-Date.parse(a.effective))[0];
 if(!rate)return null;
 // Specialized cache/reasoning rates are deliberately not inferred from generic rates.
 if(Object.values(record.categories||{}).some(v=>v>0))return null;
 return {amount:(record.input*rate.input+record.output*rate.output)/1e6,currency:rate.currency,effective:rate.effective,kind:'hypothetical API equivalent'};
}};
