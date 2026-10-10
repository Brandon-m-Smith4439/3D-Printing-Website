export async function readLimitedBody(request:Request,maximum:number){
 if(Number(request.headers.get('content-length')||0)>maximum||!request.body)throw Error('Request too large or missing.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw Error('Request too large.');}chunks.push(value);}return Buffer.concat(chunks);}finally{reader.releaseLock();}
}
