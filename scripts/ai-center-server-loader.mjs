// Standalone Node worker is a trusted server entrypoint, outside Next's module loader.
export async function resolve(specifier,context,nextResolve) {
  if(specifier==='server-only')return {url:'data:text/javascript,export default {}',shortCircuit:true};
  return nextResolve(specifier,context);
}
