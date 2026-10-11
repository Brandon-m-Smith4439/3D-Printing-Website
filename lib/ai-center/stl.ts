import {z} from 'zod';
type Point=[number,number,number];
type Triangle=[Point,Point,Point];
export const traySchema=z.object({width:z.number().min(20).max(150),length:z.number().min(20).max(150),height:z.number().min(5).max(50),wall:z.number().min(1.2).max(8),base:z.number().min(1.2).max(8)}).strict().refine(v=>v.wall*2<Math.min(v.width,v.length)&&v.base<v.height,'Walls/base must leave an interior.');
function normal([a,b,c]:Triangle):Point {const u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);return [u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];}
export function inspectStl(data:Buffer) {
 if(!data.length||data.length>1_000_000)throw Error('STL must be at most 1 MB.');
 const triangles:Triangle[]=[];
 const count=data.length>=84?data.readUInt32LE(80):0;
 if(count>0&&84+count*50===data.length){
  if(count>20_000)throw Error('Too many triangles.');
  for(let t=0;t<count;t++){const points:Point[]=[];for(let v=0;v<3;v++){const at=84+t*50+12+v*12;points.push([data.readFloatLE(at),data.readFloatLE(at+4),data.readFloatLE(at+8)]);}triangles.push(points as Triangle);}
 }else{
  const text=data.toString('utf8');
  if(!/^\s*solid\b/.test(text)||!text.includes('endsolid'))throw Error('Invalid STL format.');
  const facets=[...text.matchAll(/facet\s+normal\s+[^\n]+\s+outer\s+loop\s+([\s\S]*?)\s+endloop\s+endfacet/g)];
  if(!facets.length||facets.length>20_000)throw Error('Invalid triangle count.');
  for(const f of facets){const vertices=[...f[1].matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)];if(vertices.length!==3)throw Error('Invalid triangle.');triangles.push(vertices.map(v=>[Number(v[1]),Number(v[2]),Number(v[3])]) as Triangle);}
 }
 const min:Point=[Infinity,Infinity,Infinity],max:Point=[-Infinity,-Infinity,-Infinity];
 const edges=new Map<string,{count:number;orientation:number}>();
 let volume=0;
 for(const tri of triangles){
  for(const p of tri)for(let i=0;i<3;i++){if(!Number.isFinite(p[i]))throw Error('Vertices must be finite.');if(Math.abs(p[i])>10000)throw Error('Coordinates exceed 10000 mm.');min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  if(Math.hypot(...normal(tri))<1e-9)throw Error('Degenerate triangle.');
  const keys=tri.map(p=>p.map(v=>Object.is(v,-0)?0:v).join(','));
  for(let i=0;i<3;i++){const a=keys[i],b=keys[(i+1)%3],key=a<b?`${a}|${b}`:`${b}|${a}`;const edge=edges.get(key)||{count:0,orientation:0};edge.count++;edge.orientation+=a<b?1:-1;edges.set(key,edge);}
  const [a,b,c]=tri;volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 }
 if([...edges.values()].some(e=>e.count!==2||e.orientation!==0))throw Error('STL must have closed, consistently oriented edges.');
 if(Math.abs(volume)<1e-6)throw Error('STL has zero enclosed volume.');
 return {triangles:triangles.length,closed:true,sizeMm:max.map((v,i)=>v-min[i]),volumeMm3:Math.abs(volume),limitations:'Structural checks only. Self-intersections, tolerances, strength, slicer settings and printability require slicer review and a physical print test. STL units are assumed millimeters.'};
}
export function generateTray(input:z.infer<typeof traySchema>):Buffer {
 const v=traySchema.parse(input),xs=[0,v.wall,v.width-v.wall,v.width],ys=[0,v.wall,v.length-v.wall,v.length],zs=[0,v.base,v.height];
 const solid=(x:number,y:number,z:number)=>x>=0&&x<3&&y>=0&&y<3&&z>=0&&z<2&&(z===0||x!==1||y!==1);
 const tris:Triangle[]=[];
 for(let x=0;x<3;x++)for(let y=0;y<3;y++)for(let z=0;z<2;z++){
  if(!solid(x,y,z))continue;
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const neighbor=[x,y,z];neighbor[axis]+=sign;if(solid(neighbor[0],neighbor[1],neighbor[2]))continue;
   const arrays=[xs,ys,zs],cell=[x,y,z],u=(axis+1)%3,w=(axis+2)%3;
   const corners=[[0,0],[1,0],[1,1],[0,1]].map(([du,dw])=>{const p:Point=[0,0,0];p[axis]=arrays[axis][cell[axis]+(sign===1?1:0)];p[u]=arrays[u][cell[u]+du];p[w]=arrays[w][cell[w]+dw];return p;});
   if(sign===-1)corners.reverse();tris.push([corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]);
  }
 }
 const out=Buffer.alloc(84+50*tris.length);out.write('Mesh Harbor original parametric tray - untested prototype');out.writeUInt32LE(tris.length,80);
 tris.forEach((tri,i)=>{const at=84+i*50,n=normal(tri),len=Math.hypot(...n);[n.map(c=>c/len),...tri].flat().forEach((c,j)=>out.writeFloatLE(c,at+j*4));});
 inspectStl(out);return out;
}
