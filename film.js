// A closed film ribbon, projected from a trefoil centreline into the canvas.
(() => {
  const canvas = document.querySelector('#film');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const work = document.querySelector('#work');
  const turn = document.querySelector('#rotate');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const tau = 2 * Math.PI;
  const norm = a => { const l = Math.hypot(...a); return a.map(x => x/l); };
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const path = t => [(2+.77*Math.cos(3*t))*Math.cos(2*t),(2+.77*Math.cos(3*t))*Math.sin(2*t),.98*Math.sin(3*t)];
  const rings = 384, rows = [-1,-.92,-.78,-.71,-.60,.58,.72,.79,.92,1];
  const mesh = [];
  for(let i=0;i<rings;i++){
    const t=tau*i/rings, c=path(t), a=path(t+.001),b=path(t-.001);
    const tangent=norm(a.map((v,j)=>v-b[j])), side=norm(cross(tangent,[0,0,1])), up=cross(side,tangent);
    const angle=.65+.82*Math.sin(t*2-.3);
    const across=side.map((v,j)=>v*Math.cos(angle)+up[j]*Math.sin(angle));
    const normal=norm(cross(tangent,across));
    mesh.push(rows.map(s=>c.map((v,j)=>v+.54*s*across[j]+.075*(1-s*s)*normal[j])));
  }
  let yaw = -.35, pitch = .52, frame = 0, drag = null;
  let renderedProgress, renderedPose;

  function getScrollProgress(rect) {
    if (reduced.matches) return 0;
    const viewport = window.innerHeight;
    const center = rect.top + rect.height / 2;
    const start = Math.min(.63 * viewport, center + window.scrollY - .06 * viewport);
    const distance = (start - center) / (start - .20 * viewport);
    const progress = Math.max(0, Math.min(1, distance));
    return progress * progress * (3 - 2 * progress);
  }

  function paint(){
    frame=0;
    const dpr=Math.min(devicePixelRatio||1,2), rect=canvas.getBoundingClientRect();
    const {width, height} = rect;
    if(!width||!height)return;
    const progress = getScrollProgress(rect);
    if (progress !== renderedProgress) {
      // Let the orange edge of the film carry through to the work section.
      work.style.setProperty('--film-progress', progress);
      renderedProgress = progress;
    }
    const pose = [width, height, dpr, yaw, pitch, progress];
    if (renderedPose?.every((value, index) => value === pose[index])) return;
    renderedPose = pose;
    const w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    // Scroll offsets the camera without overwriting the user's rotation.
    const viewYaw = yaw + .56 * progress;
    const viewPitch = pitch - .18 * progress;
    const roll = -.36 + .24 * progress;
    const sx=Math.sin(viewPitch),cx=Math.cos(viewPitch),sy=Math.sin(viewYaw),cy=Math.cos(viewYaw),sz=Math.sin(roll),cz=Math.cos(roll);
    const scale=Math.min(width/6.65,height/6.25);
    const points=mesh.map(r=>r.map(([x,y,z])=>{
      const X=x*cy+z*sy,Z=z*cy-x*sy,Y=y*cx-Z*sx,depth=y*sx+Z*cx,rx=X*cz-Y*sz,ry=X*sz+Y*cz;
      const f=scale*11/(11-depth);
      return [rx,ry,depth,width*.50+rx*f,height*.47-ry*f];
    }));
    const faces=[];
    const sweepAngle = tau * (.12 + .63 * progress);
    const sweepStrength = .58 * Math.sin(Math.PI * progress);
    for(let i=0;i<rings;i++){
      const next=(i+1)%rings;
      const edgeLight = sweepStrength * Math.max(0, Math.cos(tau * i / rings - sweepAngle)) ** 18;
      for(let j=0;j<rows.length-1;j++){
        if((j===1||j===7)&&i%6<3)continue;
        const a=points[i][j],b=points[next][j],c=points[next][j+1],d=points[i][j+1];
        const n=norm(cross([b[0]-a[0],b[1]-a[1],b[2]-a[2]],[d[0]-a[0],d[1]-a[1],d[2]-a[2]]));
        if(n[2]<0)for(let k=0;k<3;k++)n[k]*=-1;
        const band=n[0]*.77+n[1]*.61+n[2]*.19;
        const shine=Math.exp(-Math.pow((band-.34)/.17,2))*.79+Math.exp(-Math.pow((band+.61)/.09,2))*.51;
        const diffuse=.15+.37*Math.max(0,n[0]*-.4+n[1]*.77+n[2]*.49);
        const v=Math.min(1,diffuse+shine);
        const rim=j===0||j===8, frameLine=i%32===0&&j===4;
        let color;
        if(rim||j===2||j===6){color=[Math.min(255,80+172*v+104*edgeLight),48+126*v+40*edgeLight,27+86*v+12*edgeLight];}
        else if(frameLine){color=[43+85*v,43+78*v,36+66*v];}
        else{const ink=j===4?.94:.80;color=[(35+210*v)*ink,(37+205*v)*ink,(35+190*v)*ink];}
        faces.push({q:[a,b,c,d],depth:(a[2]+b[2]+c[2]+d[2])/4,color:'rgb('+color.map(Math.round).join(',')+')'});
      }
    }
    faces.sort((a,b)=>a.depth-b.depth);ctx.lineJoin='round';ctx.lineWidth=.65;
    for(const face of faces){ctx.beginPath();face.q.forEach((p,k)=>k?ctx.lineTo(p[3],p[4]):ctx.moveTo(p[3],p[4]));ctx.closePath();ctx.fillStyle=ctx.strokeStyle=face.color;ctx.fill();ctx.stroke();}
  }
  const requestPaint=()=>{if(!frame)frame=requestAnimationFrame(paint);};
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=drag.pitch+(e.clientY-drag.y)*.008;requestPaint();});
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();yaw+=(e.key==='ArrowRight')*.18-(e.key==='ArrowLeft')*.18;pitch+=(e.key==='ArrowDown')*.18-(e.key==='ArrowUp')*.18;requestPaint();});
  turn.addEventListener('click',()=>{yaw+=.45;requestPaint();});
  window.addEventListener('scroll', () => {
    if (!reduced.matches) requestPaint();
  }, {passive: true});
  window.addEventListener('resize', requestPaint);
  reduced.addEventListener('change', requestPaint);
  new ResizeObserver(requestPaint).observe(canvas);
  paint();
})();
