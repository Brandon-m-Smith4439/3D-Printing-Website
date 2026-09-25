export function isPdfBytes(bytes:Uint8Array){
  return bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
}

export async function extractPdfText(bytes:Uint8Array){
  if(!isPdfBytes(bytes))throw new Error('The file does not contain a valid PDF signature.');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document=await pdfjs.getDocument({data:bytes,useWorkerFetch:false,isEvalSupported:false}).promise;
  const pages:string[]=[];
  try{
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
      const page=await document.getPage(pageNumber);
      const content=await page.getTextContent();
      pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));
      page.cleanup();
    }
  }finally{
    await document.destroy();
  }
  return pages.join('\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
