export function servicePlan(env=process.env,args=[]) {
  if(args.length&&(args.length!==2||!['-p','--port'].includes(args[0])))throw Error('Only -p/--port is supported by the service launcher.');
  const port=args[1]||env.PORT||'3000';
  if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw Error('Invalid server port.');
  const plan=[{name:'web',args:['node_modules/next/dist/bin/next','start','-H','0.0.0.0','-p',port]}];
  if(env.AI_CENTER_WORKER_ENABLED==='true')plan.push({name:'worker',args:['--experimental-strip-types','scripts/ai-center-worker.mjs','--watch']});
  return plan;
}
