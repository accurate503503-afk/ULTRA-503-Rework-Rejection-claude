const $=id=>document.getElementById(id);
let scanStream=null, photoStream=null, photos=[], lastPdfBlob=null, lastPdfName='';
function isSecureCameraContext(){return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)}
function toast(msg){const t=$('toast');t.textContent=msg;t.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display='none',3200)}
function val(id){return $(id).value.trim()}
function setv(id,v){$(id).value=v??''}
function batchRoot(s){let x=(s||'').trim();x=x.replace(/^Batch\s+/i,'');const m=x.match(/^([A-Za-z0-9]+)/);return m?m[1]:(x||'UNKNOWN').replace(/\s+/g,'-').slice(0,30)}
function dateStamp(d=new Date()){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`}
function sectionValues(){return [...$('section').selectedOptions].map(o=>o.value).filter(Boolean)}
function setSections(values){const set=new Set(values||[]);[...$('section').options].forEach(o=>o.selected=set.has(o.value))}
function updateNotif(){const raw=val('ucBatch');if(!raw){$('notificationNo').textContent='QN-—-—';return}const root=batchRoot(raw);$('notificationNo').textContent=`QN-${root}-${dateStamp()}`}
function parseQR(raw){
  raw=(raw||'').replace(/^id\s*=\s*"[^"]*"\s*/i,'').trim();
  const p=raw.split('?').map(x=>x.replace(/^['"]|['"]$/g,'').trim());
  // Route Card format: plant/order/part/.../drawing/description/PO/line/POqty/heat/material/UCbatch/batchqty/unit
  if(p.length<10){toast('QR format not recognized. You can use Manual Route Card Entry.');return false}
  setv('plant',p[1]||'0503');setv('partNo',p[3]);setv('drawingRev',p[5]);setv('description',p[6]);
  setv('poNo',p[7]);setv('poLine',p[8]);setv('poQty',p[9]);setv('heatNo',p[10]);
  setv('ucBatch',p[12]||p[11]);setv('batchQty',p[13]||'');setv('totalQty',p[13]||p[9]||'');setv('unit',p[14]||'NOS');
  updateNotif();toast('Route Card data loaded.');
  return true;
}
async function startScanner(){
  stopScanner();
  if(!isSecureCameraContext()){
    $('scanner').classList.remove('hidden');
    $('scanMsg').textContent='Live QR scanning requires the HTTPS GitHub Pages address. Please open the app from its HTTPS website.';
    $('mobileNotice').textContent='Please use the HTTPS ULTRA@503 website for QR scanning.';
    $('mobileNotice').classList.remove('hidden');
    return;
  }
  $('scanner').classList.remove('hidden');
  $('mobileNotice').classList.add('hidden');
  $('scanMsg').textContent='Starting rear camera…';
  try{
    // Prefer the rear camera on Android. Do not over-constrain resolution.
    scanStream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{exact:'environment'},width:{ideal:1920},height:{ideal:1080},focusMode:{ideal:'continuous'}},
      audio:false
    });
  }catch(e){
    try{
      scanStream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},focusMode:{ideal:'continuous'}},audio:false
      });
    }catch(e2){
      $('scanMsg').textContent='Camera unavailable: '+e2.message;
      toast('Camera could not start. Allow camera permission in Chrome.');
      return;
    }
  }
  const v=$('video');
  v.setAttribute('playsinline','');
  v.muted=true;
  v.srcObject=scanStream;
  await v.play();
  try{
    const track=scanStream.getVideoTracks()[0];
    const caps=track.getCapabilities?track.getCapabilities():{};
    const advanced=[];
    if(caps.focusMode&&caps.focusMode.includes('continuous')) advanced.push({focusMode:'continuous'});
    if(caps.zoom&&caps.zoom.max>=1.5) advanced.push({zoom:Math.min(1.8,caps.zoom.max)});
    if(advanced.length) await track.applyConstraints({advanced});
  }catch(e){}
  $('scanMsg').textContent='Hold the Route Card QR inside the white box. Move closer until the QR fills most of the box. Keep the card steady for 1–2 seconds.';
  window.__scanBusy=false;
  requestAnimationFrame(scanLoop);
}

async function decodeScanFrame(v){
  if(!v.videoWidth||!v.videoHeight)return null;

  // First use the browser's native QR detector when available. Chrome on Android
  // can decode small/rotated QR codes more reliably than a full-frame jsQR pass.
  if('BarcodeDetector' in window){
    try{
      if(!window.__qrDetector) window.__qrDetector=new BarcodeDetector({formats:['qr_code']});
      const found=await window.__qrDetector.detect(v);
      if(found&&found.length&&found[0].rawValue)return found[0].rawValue;
    }catch(e){}
  }

  if(!window.jsQR)return null;

  const vw=v.videoWidth, vh=v.videoHeight;
  const c=$('scanCanvas');
  const ctx=c.getContext('2d',{willReadFrequently:true});

  // Try the center scan window first, then the whole frame. The Route Card QR
  // is often relatively small on a phone screen, so crop + upscale improves detection.
  const crops=[
    [Math.round(vw*.18),Math.round(vh*.12),Math.round(vw*.64),Math.round(vh*.76)],
    [Math.round(vw*.08),Math.round(vh*.08),Math.round(vw*.84),Math.round(vh*.84)],
    [0,0,vw,vh]
  ];
  for(const [sx,sy,sw,sh] of crops){
    const maxSize=1600;
    const scale=Math.min(2.5,maxSize/Math.max(sw,sh));
    c.width=Math.max(1,Math.round(sw*scale));
    c.height=Math.max(1,Math.round(sh*scale));
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(v,sx,sy,sw,sh,0,0,c.width,c.height);
    const img=ctx.getImageData(0,0,c.width,c.height);
    for(const inversionAttempts of ['attemptBoth','dontInvert']){
      const code=jsQR(img.data,img.width,img.height,{inversionAttempts});
      if(code&&code.data)return code.data;
    }
  }
  return null;
}

async function scanLoop(){
  if(!scanStream||$('scanner').classList.contains('hidden'))return;
  if(!window.__scanBusy){
    window.__scanBusy=true;
    try{
      const raw=await decodeScanFrame($('video'));
      if(raw){
        $('qrText').value=raw;
        parseQR(raw);
        stopScanner();
        toast('QR code scanned successfully.');
        return;
      }
    }finally{window.__scanBusy=false;}
  }
  setTimeout(()=>requestAnimationFrame(scanLoop),120);
}
function stopScanner(){if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null} $('video').srcObject=null;$('scanner').classList.add('hidden')}
async function openPhotoCamera(){
  if(!isSecureCameraContext()){toast('Live camera needs HTTPS. Use Add Photo to take a picture with the phone camera.');$('galleryInput').setAttribute('capture','environment');$('galleryInput').click();return}
  try{photoStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600},height:{ideal:1200}},audio:false});$('photoModal').classList.remove('hidden');$('photoVideo').srcObject=photoStream;await $('photoVideo').play()}catch(e){toast('Camera unavailable: '+e.message)}
}
function closePhoto(){if(photoStream){photoStream.getTracks().forEach(t=>t.stop());photoStream=null}$('photoVideo').srcObject=null;$('photoModal').classList.add('hidden')}
function addBlob(blob){const url=URL.createObjectURL(blob);photos.push({blob,url});renderPhotos()}
function renderPhotos(){$('photoGrid').innerHTML='';photos.forEach((p,i)=>{const d=document.createElement('div');d.className='photo-item';d.innerHTML=`<img src="${p.url}" alt="Photo ${i+1}"><button class="remove-photo" aria-label="Remove">×</button>`;d.querySelector('button').onclick=()=>{URL.revokeObjectURL(p.url);photos.splice(i,1);renderPhotos()};$('photoGrid').appendChild(d)});$('photoCount').textContent=`${photos.length} photo${photos.length===1?'':'s'}`}
$('scanBtn').onclick=startScanner;$('stopScan').onclick=stopScanner;$('parseBtn').onclick=()=>parseQR($('qrText').value);
$('section').addEventListener('change',()=>updateNotif());
$('ucBatch').addEventListener('input',()=>updateNotif());
$('takePhoto').onclick=openPhotoCamera;$('closePhoto').onclick=closePhoto;
$('capturePhoto').onclick=()=>{const v=$('photoVideo'),c=$('photoCanvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);c.toBlob(b=>{addBlob(b);closePhoto()},'image/jpeg',.88)}
$('addPhoto').onclick=()=>$('galleryInput').click();
$('galleryInput').onchange=e=>{[...e.target.files].forEach(f=>addBlob(f));e.target.value=''}
$('reworkQty').oninput=validateRemarks;$('rejectQty').oninput=validateRemarks;
function validateRemarks(){const rw=+val('reworkQty')||0,rj=+val('rejectQty')||0; $('reworkRemark').required=rw>0;$('rejectRemark').required=rj>0}
function collect(){validateRemarks();const rw=+val('reworkQty')||0,rj=+val('rejectQty')||0;if(!val('partNo'))return 'Part Number is required.';if(!val('ucBatch'))return 'UC Batch No. is required to generate the Notification No.';if(rw>0&&!val('reworkRemark'))return 'Please enter Rework Issue / Remark.';if(rj>0&&!val('rejectRemark'))return 'Please enter Reject Issue / Remark.';if(!sectionValues().length)return 'Please select at least one Responsible Section.';if(!val('customer'))return 'Please select Customer Name.';return null}
async function imageBytes(blob){return new Uint8Array(await blob.arrayBuffer())}
async function createPDF(){
  const err=collect();if(err){toast(err);return}
  if(!window.PDFLib){toast('PDF library not loaded. Check internet connection and retry.');return}
  $('pdfStatus').textContent='Creating A4 PDF…';
  try{
    const {PDFDocument,StandardFonts,rgb}=PDFLib;const pdf=await PDFDocument.create();const page=pdf.addPage([595.28,841.89]);const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const green=rgb(0,.608,.302),light=rgb(.94,.98,.95),yellow=rgb(1,.97,.55),red=rgb(1,.82,.82),black=rgb(.08,.1,.09),grey=rgb(.38,.43,.4);
    // logo — embedded once and reused on every page (page 1 + photo pages)
    let logoImg=null;
    try{const logoBytes=await fetch('ultra-logo.png').then(r=>r.arrayBuffer());logoImg=await pdf.embedPng(logoBytes)}catch{}
    function drawLogo(pg,x,y,maxW,maxH){if(!logoImg)return;const scale=Math.min(maxW/logoImg.width,maxH/logoImg.height);pg.drawImage(logoImg,{x,y,width:logoImg.width*scale,height:logoImg.height*scale})}
    drawLogo(page,38,775,150,55);
    page.drawText('ULTRA@503',{x:205,y:805,size:22,font:bold,color:green});page.drawText('INTERNAL REWORK / REJECTION NOTIFICATION',{x:205,y:785,size:11,font:bold,color:black});
    page.drawText($('notificationNo').textContent,{x:205,y:765,size:10,font:bold,color:grey});
    let y=730;const margin=38,w=519;
    page.drawRectangle({x:margin,y:y-10,width:w,height:24,color:green});page.drawText('ROUTE CARD DETAILS',{x:margin+9,y:y-2,size:11,font:bold,color:rgb(1,1,1)});y-=35;
    const qtyWithUnit=id=>val(id)?`${val(id)} ${val('unit')||''}`.trim():'';
    const rows=[['Part Number',val('partNo')],['Customer PO No.',val('poNo')],['PO Line No.',val('poLine')],['UC Batch No. & Job Serial No.',val('ucBatch')],['Heat No. / HT Lot No.',val('heatNo')],['PO Qty',qtyWithUnit('poQty')],['Total Qty',qtyWithUnit('totalQty')],['Customer Name',val('customer')],['Responsible Section',sectionValues().join(', ')]];
    const rowH=25;rows.forEach((r,i)=>{const yy=y-i*rowH;page.drawRectangle({x:margin,y:yy-rowH+3,width:w,height:rowH,color:i%2?light:rgb(1,1,1),borderColor:rgb(.82,.86,.83),borderWidth:.6});page.drawText(r[0],{x:margin+8,y:yy-14,size:7.5,font:bold,color:grey});page.drawText(r[1]||'—',{x:margin+175,y:yy-13,size:8.5,font,color:black,maxWidth:335})});y-=rows.length*rowH+14;
    page.drawText('QUANTITY DISPOSITION',{x:margin,y:y,size:11,font:bold,color:black});y-=10;
    const boxW=(w-12)/2,boxH=78;
    page.drawRectangle({x:margin,y:y-boxH,width:boxW,height:boxH,color:yellow,borderColor:rgb(.78,.64,0),borderWidth:1.5});page.drawRectangle({x:margin+boxW+12,y:y-boxH,width:boxW,height:boxH,color:red,borderColor:rgb(.75,.1,.1),borderWidth:1.5});
    page.drawText('REWORK QTY',{x:margin+12,y:y-20,size:10,font:bold,color:black});page.drawText(String(+val('reworkQty')||0),{x:margin+12,y:y-54,size:25,font:bold,color:black});
    page.drawText('REJECT QTY',{x:margin+boxW+24,y:y-20,size:10,font:bold,color:black});page.drawText(String(+val('rejectQty')||0),{x:margin+boxW+24,y:y-54,size:25,font:bold,color:black});y-=boxH+18;
    const remarks=[['Rework Issue / Remark',val('reworkRemark')],['Reject Issue / Remark',val('rejectRemark')],['General Non-Conformance / Issue',val('generalIssue')]];
    for(const [title,text] of remarks){page.drawText(title,{x:margin,y,size:9,font:bold,color:green});y-=14;const lines=wrap(text||'—',88);for(const line of lines.slice(0,3)){page.drawText(line,{x:margin,y,size:8.5,font,color:black});y-=12}y-=5}
    y=Math.max(y,92);
    page.drawRectangle({x:margin,y:y-54,width:w,height:54,color:light,borderColor:rgb(.82,.86,.83),borderWidth:.8});
    page.drawText('NC CONFIRMATION / VERIFICATION',{x:margin+10,y:y-13,size:9,font:bold,color:green});
    page.drawText('NC Confirm by:',{x:margin+10,y:y-32,size:8,font:bold,color:grey});page.drawText(val('ncConfirmBy')||'—',{x:margin+100,y:y-32,size:8.5,font,color:black,maxWidth:150});
    page.drawText('Verify by:',{x:margin+275,y:y-32,size:8,font:bold,color:grey});page.drawText(val('verifyBy')||'—',{x:margin+335,y:y-32,size:8.5,font,color:black,maxWidth:165});
    page.drawLine({start:{x:margin,y:36},end:{x:margin+w,y:36},thickness:.8,color:green});page.drawText('ULTRA@503  |  Ultra Corpotech Pvt. Ltd.',{x:margin,y:22,size:8,font:bold,color:green});
    for(let i=0;i<photos.length;i+=4){const pg=pdf.addPage([595.28,841.89]);drawLogo(pg,38,795,90,32);pg.drawText('ULTRA@503 — NON-CONFORMANCE PHOTOGRAPHS',{x:135,y:812,size:12,font:bold,color:green});pg.drawText($('notificationNo').textContent,{x:135,y:797,size:9,font,color:grey});const positions=[[38,410],[305,410],[38,105],[305,105]];for(let j=0;j<4&&i+j<photos.length;j++){const p=photos[i+j];const bytes=await imageBytes(p.blob);let img;try{img=await pdf.embedJpg(bytes)}catch{img=await pdf.embedPng(bytes)}const [x,yy]=positions[j],cw=252,ch=275,sc=Math.min(cw/img.width,ch/img.height);pg.drawRectangle({x,y:yy,width:cw,height:ch,borderColor:rgb(.78,.83,.8),borderWidth:1,color:rgb(.98,.99,.98)});pg.drawImage(img,{x:x+(cw-img.width*sc)/2,y:yy+(ch-img.height*sc)/2,width:img.width*sc,height:img.height*sc});pg.drawText(`Photo ${i+j+1}`,{x:x+8,y:yy-14,size:8,font:bold,color:grey})}pg.drawLine({start:{x:38,y:36},end:{x:557,y:36},thickness:.8,color:green});pg.drawText('ULTRA@503  |  Ultra Corpotech Pvt. Ltd.',{x:38,y:22,size:8,font:bold,color:green})}
    const bytes=await pdf.save();lastPdfBlob=new Blob([bytes],{type:'application/pdf'});lastPdfName=`${$('notificationNo').textContent}.pdf`;
    $('downloadPdf').disabled=false;$('sharePdf').disabled=false;$('pdfStatus').textContent=`PDF ready: ${lastPdfName} (${(lastPdfBlob.size/1024).toFixed(0)} KB)`;toast('PDF created successfully.')
  }catch(e){console.error(e);$('pdfStatus').textContent='PDF creation failed: '+e.message;toast('PDF creation failed. See browser console for details.')}
}
function downloadPDF(){if(!lastPdfBlob)return;const a=document.createElement('a');a.href=URL.createObjectURL(lastPdfBlob);a.download=lastPdfName;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('PDF download started.')}
async function sharePDF(){
  if(!lastPdfBlob)return;
  const file=new File([lastPdfBlob],lastPdfName,{type:'application/pdf'});
  const shareText=[
    'ULTRA@503 Internal Rework / Rejection Notification',
    `Part No.: ${val('partNo')||'—'}`,
    `PO No.: ${val('poNo')||'—'}`,
    `UC Batch No.: ${val('ucBatch')||'—'}`,
    `Notification No.: ${$('notificationNo').textContent}`
  ].join('\n');
  try{
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      await navigator.share({title:lastPdfName,text:shareText,files:[file]});
      toast('PDF shared with Part No., PO No. and UC Batch No.');
    }else{
      downloadPDF();
      toast('File sharing is not supported by this browser; PDF downloaded instead.');
    }
  }catch(e){
    if(e.name!=='AbortError')toast('Share cancelled or unavailable. Try Download PDF.');
  }
}
function wrap(s,n){const words=s.split(/\s+/),out=[];let line='';for(const w of words){if((line+' '+w).trim().length>n){out.push(line);line=w}else line=(line+' '+w).trim()}if(line)out.push(line);return out}
function createNewEntry(){
  if(!confirm('Start a new entry? Current unsaved data will be cleared.')) return;
  stopScanner();closePhoto();
  ['partNo','drawingRev','description','poNo','poLine','poQty','heatNo','ucBatch','batchQty','totalQty','qrText','reworkRemark','rejectRemark','generalIssue','ncConfirmBy','verifyBy'].forEach(id=>setv(id,''));
  setv('plant','0503');setv('unit','NOS');setv('reworkQty','0');setv('rejectQty','0');setv('customer','');setSections([]);
  photos.forEach(p=>URL.revokeObjectURL(p.url));photos=[];renderPhotos();lastPdfBlob=null;lastPdfName='';$('downloadPdf').disabled=true;$('sharePdf').disabled=true;$('pdfStatus').textContent='No PDF created yet.';$('mobileNotice').classList.add('hidden');updateNotif();validateRemarks();toast('New entry ready.');
}
$('createPdf').onclick=async()=>{updateNotif();await createPDF()};$('newEntry').onclick=createNewEntry;
$('downloadPdf').onclick=downloadPDF;$('sharePdf').onclick=sharePDF;
window.addEventListener('online',()=>{$('onlineStatus').textContent='ONLINE'});window.addEventListener('offline',()=>{$('onlineStatus').textContent='OFFLINE'});
updateNotif();validateRemarks();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
