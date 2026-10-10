const {CenterStore}=await import('../lib/ai-center/store.ts');
const store=new CenterStore();
try {console.log(JSON.stringify(store.claim()));}finally {store.close();}
