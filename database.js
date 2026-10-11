globalThis.TokenDB={
 async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const q=indexedDB.open('frontier-usage',1);q.onupgradeneeded=()=>{const s=q.result.createObjectStore('records',{keyPath:'id'});for(const k of ['timestamp','model','provider'])s.createIndex(k,k);};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});this.db.onversionchange=()=>{this.db.close();this.db=null;};return this.db;},
 async transaction(action){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Database transaction failed'));try{action(tx.objectStore('records'));}catch(e){tx.abort();reject(e);}});},
 async upsert(r){await this.transaction(s=>{const q=s.get(r.id);q.onsuccess=()=>{const old=q.result;if(old&&r.sequence<=old.sequence)return;if(old&&['completed','failed','interrupted'].includes(old.status)&&['started','streaming'].includes(r.status))return;s.put(r);};});},
 async import(rows){await this.transaction(s=>{for(const r of rows)s.put(r);});},
 async clear(){await this.transaction(s=>s.clear());},
 async all(since=0){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('records'),q=tx.objectStore('records').index('timestamp').getAll(IDBKeyRange.lowerBound(since));let result;q.onsuccess=()=>{result=q.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}
};
