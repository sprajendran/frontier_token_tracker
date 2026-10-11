globalThis.FrontierClient={async request(type,fields={}){const r=await chrome.runtime.sendMessage({type,...fields});if(!r?.ok)throw Error(r?.error||'Extension unavailable');return r;}};
