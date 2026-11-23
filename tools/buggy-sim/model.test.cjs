// Run with: node tools/buggy-sim/model.test.cjs
// Exercise the same self-contained model the offline HTML runs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0].replace(/init\(\);\s*$/, '');
const context = vm.createContext({});
vm.runInContext(script,context);
const model = vm.runInContext('({conf,course,paintTrack,paintFraction,footprint,clearance,sweptMinimum,simulate,advance,normalized,readout,stripeResponse,assembly,coverage,scans,fitted,gate:straightGate(shared),dt,at,mountingIssue,partName,sense,casterVelocity,optical,crossesLineEnd,courseIssue,evaluateCandidate,scanCandidate,designIssue,driveLoad,straightGate,parseOutline,turnEnvelope,plateVertices,stageAt,stationPose,locateStation,stopRadius})',context);
function near(v, ref, tol){assert.ok(Math.abs(v-ref)<=tol,`${v} differs from ${ref} by more than ${tol}`);}

test('new workbook endpoint means, 2.7 kΩ feedback, background and ADC clipping',()=>{
  const c=model.conf('A',{sensorHeight:8.1});
  near(c.sensor.currentMA,3750/180,1e-9);
  near(model.readout(c.sensor,0,c.sensor.bg).voltage,(.28+.273+.282)/3,1e-8);
  near(model.readout(c.sensor,1,c.sensor.bg).voltage,(2.952+2.964+2.954)/3,1e-8);
  const bright=model.conf('A',{sensorHeight:8.1,light:'bright'});
  near(model.readout(bright.sensor,1,bright.sensor.bg).voltage,(2.952+2.964+2.954)/3+.004345-.000203,1e-8);
  const boosted=model.conf('A',{sensorHeight:8.1,load:3300});
  const out=model.readout(boosted.sensor,1,boosted.sensor.bg);
  assert.equal(out.adc,4095);assert.equal(out.over,true);assert.equal(out.rail,false);
  const saturated=model.conf('B',{load:10000,rxV:3.3});
  assert.equal(model.readout(saturated.sensor,1,saturated.sensor.bg).rail,true);
  const dim=model.conf('A',{sensorHeight:8.1,ledR:700});
  assert.ok(model.readout(dim.sensor,1,dim.sensor.bg).voltage<1);
  const washout=model.conf('A',{sensorHeight:28.3,ledR:700,light:'bright',threshold:.03});
  assert.equal(model.coverage(washout).invalid,'黑底已触发');
});

test('measured stripe crossings and intermediate heights propagate to PCB and replay',()=>{
  assert.equal(model.scans.low.points.length,29);assert.equal(model.scans.high.points.length,29);
  near(model.fitted.low.width,18.37772,.00001);near(model.fitted.high.width,19.23044,.00001);
  const t=model.course('gap');t.paint=model.paintTrack(t,17);
  for(const h of [8,8.1,13.3,20,28.3]){
    const c=model.conf('A',{sensorHeight:h,layout:'custom',customPositions:[{forward:0,right:0}]});
    const expected=18.37772+(h-13.3)*(19.23044-18.37772)/15;
    near(model.coverage(c).singleWidth,expected,.05); // Quantised black/white endpoints.
    for(const offset of [0,5,expected/2-.1,expected/2+.1,16]){
      const frame=model.sense({x:200-c.look,y:offset,a:0},c,t);
      near(frame.ns[0],model.optical(c,offset)[0],.002);
      assert.equal(frame.hits,Number(offset<expected/2));
    }
    for(const threshold of [.35,.65]){
      const updated=model.coverage({...c,threshold}).singleWidth;
      assert.ok(threshold<.5?updated>expected:updated<expected);
    }
  }
  assert.ok(model.evaluateCandidate(model.scanCandidate('A',[['sensorHeight',6]]),'gap').issue);
});

test('track area integration matches analytic straight, gap and endpoint responses',()=>{
  for(const opts of [{spatial:'box'},{sensorHeight:13.3},{sensorHeight:28.3}]){
    const c=model.conf('A',opts);
    const t=model.course('gap'),paint=model.paintTrack(t,c.line),sig=c.sensor.sigma;
    const g=(pos,w)=>sig?model.stripeResponse(pos,w,sig):
      Math.max(0,Math.min(pos+c.spot/2,w/2)-Math.max(pos-c.spot/2,-w/2))/c.spot;
    for(const y of [-14,-8.5,-5,0,5,8.5,14]){
      near(model.paintFraction({x:230,y},0,c,paint),g(y,c.line),4e-5);
      near(model.paintFraction({x:360,y},0,c,paint),g(y,c.line)*(1-g(0,6)),4e-5);
    }
    near(model.paintFraction({x:0,y:0},0,c,paint),.5*g(0,c.line),4e-5);
    near(model.paintFraction({x:-30,y:0},0,c,paint),0,1e-10);
  }
});

test('rotated rectangular footprint at a gap edge agrees with independent area sampling',()=>{
  const c=model.conf('A',{spatial:'box',spot:8,aspect:2}),t=model.course('gap');
  const pose={x:357,y:7,a:.71},N=300;
  let white=0;
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){
    const q=model.at(pose,16*((i+.5)/N-.5),8*((j+.5)/N-.5));
    if(Math.abs(q.y)<=8.5&&(q.x<357||q.x>363))white++;
  }
  near(model.paintFraction(pose,pose.a,c,model.paintTrack(t,17)),white/N**2,.001);
});

test('board edge, mirrored bends, cap and identical design control',()=>{
  near(model.assembly(model.conf('A')).edge,5.1,1e-8);
  near(model.assembly(model.conf('B',{layout:'row',pitch:10})).edge,.1,1e-8);
  const c=model.conf('B',{layout:'row',pitch:10,sensorHeight:13.3,wheelCap:.6});
  const left=model.simulate(c,'left'),right=model.simulate(c,'right');
  assert.equal(left.frames.length,right.frames.length);
  assert.ok(left.frames.some(f=>Math.abs(f.cmdRight-f.right)>.01||Math.abs(f.cmdLeft-f.left)>.01));
  left.frames.forEach((f,i)=>{near(f.left,right.frames[i].right,1e-6);near(f.y,-right.frames[i].y,1e-5);});
  const copy=model.simulate(model.conf('A',{pitch:10,sensorHeight:13.3,wheelCap:.6}),'left');
  assert.deepEqual(left.frames,copy.frames);
});

test('continuous gate bound contains dense integration; catches entry entirely between samples',()=>{
  const c=model.conf('B',{layout:'row',pitch:10}),r=model.simulate(c,'s'),parts=model.footprint(c);
  let minimum=Infinity;
  for(let i=0;i<r.frames.length-1;i++){
    const f=r.frames[i];
    for(let j=0;j<20;j++){
      const p=model.advance(f,(f.left+f.right)/2,(f.left-f.right)/c.axle,model.dt*j/20);
      const value=model.clearance(p,parts,r.track.gate);
      if(value!==null)minimum=Math.min(minimum,value);
    }
  }
  assert.ok(r.swept.low<=minimum+1e-9);near(minimum,r.swept.high,.03);
  assert.ok(r.swept.high-r.swept.low<=.101);
  const probe=[[[0,-1],[1,-1],[1,1],[0,1]]];
  const start={x:-2,y:140,a:0,t:0,left:1000,right:1000,clear:null};
  const end={...start,x:3,t:model.dt};
  const g={...model.gate,length:1};
  assert.equal(model.clearance(start,probe,g),null);assert.equal(model.clearance(end,probe,g),null);
  const swept=model.sweptMinimum([start,end],probe,g,100);
  near(swept.high,-1,1e-8);assert.ok(swept.low<=-1);
});

test('rear-axle datum drives the plate, wheel hubs, front ball support and PCB',()=>{
  const c=model.conf('A'),parts=model.footprint(c);
  const centre=part=>[0,1].map(i=>(part[0][i]+part[2][i])/2);
  assert.deepEqual(centre(parts[1]),[0,-c.axle/2]);
  assert.deepEqual(centre(parts[2]),[0,c.axle/2]);
  near(parts[1][1][0]-parts[1][0][0],76,1e-12);
  near(parts[0][0][0],-c.rearInset,1e-12);
  near(parts[0][1][0],c.length-c.rearInset,1e-12);
  assert.ok(centre(parts[0])[0]>0 && c.casterX>centre(parts[0])[0]);
  assert.deepEqual(centre(parts[10]),[c.length-c.rearInset-c.casterInset,0]);
  assert.equal(model.partName(10),'前万向轮座');
  for(const part of parts.slice(3,10))near(centre(part)[0],c.look,1e-12);
  const shifted=model.conf('A',{rearInset:c.rearInset+10});
  near(shifted.look,c.look-10,1e-12);near(shifted.casterX,c.casterX-10,1e-12);
  assert.equal(model.mountingIssue(c),'');
  for(const invalid of [{rearInset:c.length/2},{casterInset:c.length/2}]){
    assert.ok(model.mountingIssue({...c,...invalid}));
  }
  const rotated=model.advance({x:17,y:-11,a:0},0,Math.PI/2,1);
  near(model.casterVelocity(0,Math.PI/2,c).right,Math.PI*c.casterX/2,1e-12);
  near(model.casterVelocity(500,0,c).right,0,1e-12);
  near(rotated.x,17,1e-12);near(rotated.y,-11,1e-12);
  for(const x of [c.casterX,c.look]){const q=model.at(rotated,x,0);near(q.x,17,1e-12);near(q.y,-11+x,1e-12);}
});
test('mounting changes alter line sampling and the first part entering a finite gate',()=>{
  const t=model.course('gap'),c=model.conf('A',{spatial:'box'});
  t.paint=model.paintTrack(t,c.line);
  const p={x:360-c.look,y:0,a:0};
  assert.equal(model.sense(p,c,t).hits,0);
  assert.ok(model.sense(p,model.conf('A',{spatial:'box',rearInset:c.rearInset+12}),t).hits>0);
  const extended=model.conf('A',{casterInset:0,housingLength:44});
  const approach={x:-(extended.length-extended.rearInset)-16,y:0,a:0};
  const hit=model.clearance(approach,model.footprint(extended),model.gate,true);
  assert.equal(model.partName(hit.partIndex),'前万向轮座');
  assert.equal(model.clearance(approach,model.footprint(c),model.gate),null);
});

test('front and rear rows see the same continuous stripe but cross a break independently',()=>{
  const opts={spatial:'box',pitch:8},row=model.conf('A',opts);
  const stagger=model.conf('B',{...opts,layout:'stagger'});
  assert.deepEqual(model.optical(row,3),model.optical(stagger,3));
  const track=model.course('gap');track.paint=model.paintTrack(track,row.line);
  const atGap={x:360-row.look,y:0,a:0};
  assert.equal(model.sense(atGap,row,track).hits,0);
  assert.ok(model.sense(atGap,stagger,track).hits>0);
  const two=model.conf('A',{...opts,layout:'double'});
  const p={x:360-two.look-6,y:0,a:0};
  const {ns}=model.sense(p,two,track);
  assert.equal(ns[1],0);near(ns[4],1,.001);
  const q={x:track.end.x-two.look-6,y:0,a:0};
  assert.ok(model.crossesLineEnd({...q,x:q.x-.1},q,two,track.end));
  assert.equal(model.crossesLineEnd({...q,x:q.x-.1},q,row,track.end),false);
});
test('asymmetric layouts preserve channel order, signed capture limits and package clearance',()=>{
  const points=[{right:20,forward:0},{right:0,forward:8},{right:0,forward:-8},
    {right:-10,forward:0},{right:32,forward:8},{right:40,forward:-8}];
  const c=model.conf('B',{layout:'custom',customPositions:points,boardDepth:32,boardWidth:60});
  const area=model.coverage(c),fit=model.assembly(c),parts=model.footprint(c);
  near(area.low+area.extent,30,1e-6);
  near(fit.edge,-12.9,1e-9);near(fit.depth,2.9,1e-9);
  assert.ok(fit.gap>0 && fit.conflicts.has(5) && !fit.conflicts.has(1));
  points.forEach(({right,forward},i)=>{
    near(parts[4+i][0][0]+5.1,c.look+forward,1e-9);
    near(parts[4+i][0][1]+2.9,right,1e-9);
  });
  const overlap=model.assembly(model.conf('A',{layout:'custom',customPositions:points.map((p,i)=>i===2?points[1]:p)}));
  assert.ok(overlap.gap<0 && overlap.conflicts.has(1) && overlap.conflicts.has(2));
});

test('chassis-mounted channels keep axle coordinates when the PCB moves behind or beside the wheels',()=>{
  const points=[{mount:'body',right:-90,forward:-50},{mount:'pcb',right:4,forward:-2}];
  const make=(extra)=>model.conf('A',{layout:'custom',customPositions:points,...extra});
  for(const c of [make({}),make({sensorInset:200,boardRight:30})]){
    const parts=model.footprint(c);
    near(parts[4][0][0]+5.1,-50,1e-10);near(parts[4][0][1]+2.9,-90,1e-10);
    near(parts[5][0][0]+5.1,c.look-2,1e-10);near(parts[5][0][1]+2.9,c.boardRight+4,1e-10);
    near(model.assembly(c).edge,c.boardWidth/2-4-2.9,1e-10);
    assert.equal(model.mountingIssue(c),'');
  }
  const t=model.course('gap');const c=make({spatial:'box',customPositions:[{mount:'body',forward:-10,right:0}]});
  t.paint=model.paintTrack(t,c.line);assert.equal(model.sense({x:370,y:0,a:0},c,t).hits,0);
  assert.equal(model.sense({x:350,y:0,a:0},c,t).hits,1);
  assert.equal(model.footprint(c)[3].length,0);
  const many=make({customPositions:Array.from({length:8},(_,i)=>({mount:'body',forward:i*10,right:5}))});
  assert.equal(model.sense({x:250,y:0,a:0},many,t).ns.length,8);
  assert.equal(model.partName(11,8),'S8 封装');assert.equal(model.partName(12,8),'前万向轮座');
  const empty=make({customPositions:[]});
  assert.equal(model.simulate(empty,'gap').reason,'lost');
  assert.equal(model.coverage(empty).invalid,'无传感器');
});

test('course boundaries, experimental mode, and the stock-sheet reference',()=>{
  const c=model.conf('A');
  assert.equal(model.courseIssue(c,6),'');
  for(const change of [{line:13.9},{line:20.1},{bendRadius:49.9},{sRadius:49.9},{gateWidth:279.9},{gapSize:6.1},{grade:18}]){
    assert.ok(model.courseIssue({...c,...change},6));
    assert.equal(model.courseIssue({...c,...change,regime:'free'},6),'');
  }
  assert.ok(model.courseIssue(c,7));assert.equal(model.designIssue({...c,width:280}),'');
  assert.equal(model.courseIssue({...c,line:14,gapSize:0,grade:17.999},6),'');
});
test('track and wheel parameters reach the actual paint, clearance and kinematics',()=>{
  const c=model.conf('A',{gapSize:2,gateWidth:320,gateLength:300,driveDiameter:60,maxRPM:60,spatial:'box'});
  const r=model.simulate(c,'s');
  assert.equal(r.track.gate.half,160);assert.equal(r.track.gate.length,300);
  near(model.footprint(c)[1][0][0],-30,1e-12);
  near(r.frames[0].leftRPM,60,1e-9);near(r.frames[0].left,Math.PI*60,1e-9);
  const gap=model.course('gap',c);
  near(model.paintFraction({x:360,y:0},0,c,model.paintTrack(gap,c.line)),.6,1e-7);
  assert.ok(model.footprint(model.conf('A',{ballDiameter:45})).length>model.footprint(c).length);
});
test('scan captures mixed variables, independent slopes, and DR1 motor operating points',()=>{
  const c=model.scanCandidate('A',[['driveDiameter',65],['forward:3',48]]);
  near(c.positions[3].forward+c.look,48,1e-9);near(c.driveDiameter,65,1e-9);
  const load=model.driveLoad(c),hill=model.driveLoad({...c,grade:17});
  assert.ok(hill.current>load.current && hill.voltage>load.voltage);
  assert.ok(!model.driveLoad({...c,supplyV:.1}).ok);
  const result=model.evaluateCandidate(c,'gap');
  assert.ok(result.rpm>0 && result.staticClear>0);near(result.drive.current,load.current,1e-12);
  assert.ok(model.evaluateCandidate({...c,gapSize:7},'gap').issue);
});

test('a logging channel can see white for the entire run without steering or extending blind travel',()=>{
  const c=model.conf('A',{layout:'custom',customPositions:[{forward:0,right:0,role:'log'}]});
  const r=model.simulate(c,'gap'),last=r.frames.at(-1);
  assert.equal(r.reason,'lost');
  assert.ok(r.frames.every(f=>f.hits===1 && f.source==='none' && f.e===null));
  near(r.frames[r.lossFrame].lossTime,last.t,1e-12);
  assert.equal(r.reacquired,0);assert.equal(r.maxRecovery,null);
});

test('a second row can take over across a real gap and hand control back',()=>{
  const c=model.conf('A',{layout:'custom',spatial:'box',customPositions:[
    {right:0,forward:0,role:'steer'},{right:0,forward:-12,role:'backup'}
  ]});
  const r=model.simulate(c,'gap');
  assert.equal(r.reason,'end');assert.equal(r.reacquired,1);
  assert.ok(r.frames.some(f=>f.source==='backup'));assert.ok(r.maxRecovery>0);
  assert.equal(r.lossFrame,null);
});

test('outline datum, scaling, concavity, closure and invalid boundaries',()=>{
  const vertices='-20 -10;120 -10;120 18;10 18;10 10;-20 10;-20 -10';
  const shape=model.parseOutline(vertices);
  assert.equal(shape.length,140);assert.equal(shape.width,28);
  const config=model.conf('A',{...shape,rearInset:30,length:280,width:56});
  const p=model.plateVertices(config);
  near(p[0][0],-30,1e-12);near(p[2][0],250,1e-12);
  near(p[2][1],36,1e-12);near(p[3][0],30,1e-12);
  for(const bad of ['0 0;3 3;3 0;0 3','0 0;1 0;3 0','0 0;3 0;2 0;3 2;0 2','0 0;3 0;3 2;1 0;0 2','0 0;3 0;3 0;0 2','a 0;1 0;1 1'])assert.throws(()=>model.parseOutline(bad));
  // A side notch removes the top edge over the entire finite gate.
  const notch=[[0,0],[8,0],[8,12],[6,12],[6,4],[2,4],[2,12],[0,12]];
  const margin=model.clearance({x:-3,y:0,a:0},[notch],{x:0,y:0,a:0,length:2,half:10});
  near(margin,6,1e-12);
});
test('turn extremes at rest, half and full rotations',()=>{
  const parts=[[[3,4],[3,-4],[-3,-4],[-3,4]]];
  const rest=model.turnEnvelope(parts,80,0);
  assert.equal(rest.width,8);assert.equal(rest.depth,6);
  for(const a of [-360,-180,180,360]){
    const b=model.turnEnvelope(parts,0,a);near(b.width,10,1e-12);near(b.depth,10,1e-12);
  }
  const orbit=model.turnEnvelope(parts,30,360);
  near(orbit.width,2*Math.hypot(3,34),1e-12);
});
let largestSamplingDifference=0;
test.after(()=>console.log('Largest coordinate difference across 100 turn checks: '+largestSamplingDifference.toFixed(8)+' mm'));
for(let round=0;round<100;round++){
  test('CAD and sensor regression round '+String(round+1).padStart(3,'0'),()=>{
    // Independent seeded configurations. Each frame is checked against its ADC-derived readings.
    let state=41723+round;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const layouts=['row','double','distributed','vee','stagger','custom'];
    const layout=layouts[round%layouts.length],kind=['gap','s','left','right'][round%4];
    const modes=['steer','backup','log'],count=layout==='custom'?round%9:6;
    const roles=Array.from({length:count},(_,i)=>round%10===0?'log':round%10===1?'backup':round%10===2?'steer':modes[(i+round)%3]);
    const customPositions=Array.from({length:count},(_,i)=>({forward:random()*110-35,right:(i-(count-1)/2)*8,mount:'body'}));
    const c=model.conf('A',{layout,roles,customPositions,spatial:round%3?'lab':'box',
      pitch:5+random()*9,grade:random()*17,speed:.2+random()*.5,startYaw:(random()-.5)*10,startOffset:(random()-.5)*12,
      sensorHeight:8+(round%30)*.7,wheelCap:round%4?0:.4,line:14+random()*6,gapSize:random()*6});
    // An asymmetric notched plate, varied over the experiment. Compare each extremum
    // with a separate rigid transform sampled at no more than 0.2 degrees.
    const nose=85+random()*105,left=-25-random()*75,right=40+random()*65;
    const shape=model.parseOutline([[0,left],[nose,left/2],[nose,right],[nose*.65,right],
      [nose*.65,right*.4],[nose*.25,right*.4],[nose*.25,right],[0,right]].map(p=>p.join(' ')).join(';'));
    const design=model.conf('A',{...c,...shape,rearInset:random()*25,boardRight:random()*90-45});
    const parts=model.footprint(design),points=parts.flat(),radius=round%10?random()*350:0;
    const angle=(round%2?-1:1)*(round%11===0?360:random()*360),pivot=Math.sign(angle)*radius;
    const exact=model.turnEnvelope(parts,radius,angle),steps=Math.max(1,Math.ceil(Math.abs(angle)/.2));
    const rho=Math.max(...points.map(([x,y])=>Math.hypot(x,y-pivot)));
    const tolerance=rho*(angle*Math.PI/180/steps)**2/8+1e-9;
    const sampled={xmin:Infinity,xmax:-Infinity,ymin:Infinity,ymax:-Infinity};
    for(let i=0;i<=steps;i++){
      const a=angle*Math.PI/180*i/steps,co=Math.cos(a),si=Math.sin(a);
      for(const [x,y] of points){
        const X=x*co-(y-pivot)*si,Y=pivot+x*si+(y-pivot)*co;
        sampled.xmin=Math.min(sampled.xmin,X);sampled.xmax=Math.max(sampled.xmax,X);
        sampled.ymin=Math.min(sampled.ymin,Y);sampled.ymax=Math.max(sampled.ymax,Y);
      }
    }
    for(const key of Object.keys(sampled)){
      near(exact[key],sampled[key],tolerance);
      largestSamplingDifference=Math.max(largestSamplingDifference,Math.abs(exact[key]-sampled[key]));
    }
    const run=model.simulate(c,kind);
    assert.ok(run.frames.length>0 && ['lost','end','timeout'].includes(run.reason));
    let blindTime=0,worst=0,seen=false,lostAt=null,recovered=0,maxTravel=null;
    for(const [i,f] of run.frames.entries()){
      const on=Array.from(f.ns,n=>n+1e-10>=c.threshold);
      const primary=on.flatMap((hit,j)=>hit && roles[j]==='steer'?[j]:[]);
      const backup=on.flatMap((hit,j)=>hit && roles[j]==='backup'?[j]:[]);
      const use=primary.length?primary:backup;
      assert.equal(f.source,primary.length?'steer':backup.length?'backup':'none');
      assert.equal(f.hits,on.filter(Boolean).length);assert.equal(f.primary,primary.length);assert.equal(f.backup,backup.length);
      if(use.length){
        near(f.e,use.reduce((sum,j)=>sum+f.ns[j]*c.positions[j].right,0)/use.reduce((sum,j)=>sum+f.ns[j],0),1e-10);
      }else assert.equal(f.e,null);
      assert.ok(f.adc.every(q=>Number.isInteger(q)&&q>=0&&q<=4095));
      const next=run.frames[i+1],duration=next?next.t-f.t:0;
      blindTime=use.length?0:blindTime+duration;worst=Math.max(worst,blindTime);
      if(primary.length){
        if(lostAt!==null){recovered++;maxTravel=Math.max(maxTravel||0,f.distance-lostAt);lostAt=null;}
        seen=true;
      }else if(seen&&lostAt===null)lostAt=f.distance;
      if(next){
        near(next.distance-f.distance,(f.left+f.right)/2*duration,1e-8);
        near(next.a-f.a,(f.left-f.right)*duration/c.axle,1e-9);
      }
    }
    near(run.lossFrame===null?0:run.frames[run.lossFrame].lossTime,worst,1e-10);
    assert.equal(run.reacquired,recovered);
    if(maxTravel===null)assert.equal(run.maxRecovery,null);else near(run.maxRecovery,maxTravel,1e-9);
  });
}

test('interface language follows the browser unless the user saved a preference',()=>{
  const source=fs.readFileSync(path.join(__dirname,'locale.js'),'utf8');
  function label(languages,preference,blocked=false){
    const localStorage={getItem(){if(blocked)throw Error();return preference;}};
    return vm.runInNewContext(source+"\nSimLocale.translate('轮胎宽度')",{navigator:{languages},localStorage});
  }
  assert.equal(label(['zh-Hans','en-GB']), '轮胎宽度');
  assert.equal(label(['en-US','zh-CN']), 'Tyre width');
  assert.equal(label(['fr-FR','zh-TW']), '轮胎宽度');
  assert.equal(label(['fr-FR']), 'Tyre width');
  assert.equal(label(['en-GB'],'zh-CN'), '轮胎宽度');
  assert.equal(label(['zh-CN'],'en-GB'), 'Tyre width');
  assert.equal(label(['en-GB'],null,true), 'Tyre width');
});

test('course limits circuit geometry, optical gap and per-sensor transitions',()=>{
  const route=model.course('extreme'),c=model.conf('A',{spatial:'box',spot:2});
  const paint=model.paintTrack(route,17);route.paint=paint;
  assert.equal(route.sections.length,9);assert.equal(route.gate.half,140);assert.equal(route.tunnel.half,140);
  near(route.end.s,3531.238898038469,1e-9);
  const gaps=route.edges.filter(e=>!e.paint);
  assert.equal(gaps.length,1);near(gaps[0].end.s-gaps[0].start.s,6,1e-9);
  const gap=model.stationPose(route,route.stepStation);
  near(model.paintFraction(gap,gap.a,c,paint),0,1e-9);
  for(const e of route.edges.filter(e=>e.a0!==e.a1))near((e.end.s-e.start.s)/Math.abs(e.a1-e.a0),50,1e-8);
  const corners=route.edges.filter(e=>e.section==='corners');
  for(let i=1;i<corners.length;i++){near(Math.abs(corners[i].a0-corners[i-1].a1),Math.PI/4,1e-9);assert.ok(corners[i-1].end.s-corners[i-1].start.s>=50);}
  for(const s of [100,400,700,1020,1800,3000]){
    const p=model.stationPose(route,s);near(model.locateStation(p,route),s,.00001);
    assert.ok(model.paintFraction(p,p.a,c,paint)>.99);
  }
  const probe=model.conf('A',{spatial:'box',spot:2,layout:'custom',customPositions:[{mount:'body',right:0,forward:-8},{mount:'body',right:0,forward:8}]});
  const light=model.sense({x:340,y:0,a:0},probe,route);assert.ok(light.volts[1]>light.volts[0]);
  const pos={x:508,y:0,a:0},normal=model.sense(pos,probe,route),patch=model.sense(pos,{...probe,surfaceBlack:0,surfaceWhite:.4},route);
  assert.ok(patch.volts.every((v,i)=>v<normal.volts[i]));
});
test('full out-and-back, graded sections, finite tunnel, single BLE and independent stop radius',()=>{
  const c=model.conf('A',{sensorInset:82,controlRef:30,pitch:6,spatial:'box',speed:.4});
  const r=model.simulate(c,'extreme');
  assert.equal(r.reason,'stopInside');assert.equal(r.bleEvents,1);
  assert.equal(new Set(r.frames.filter(f=>f.phase==='home').map(f=>f.zone)).size,9);
  const spins=r.frames.filter(f=>f.phase==='pivot');
  assert.ok(spins.length>0);assert.ok(spins.every(f=>f.left===-f.right));
  const end=r.frames.at(-1);assert.equal(end.left,0);assert.equal(end.right,0);
  const farthest=Math.max(...model.footprint(c).flat().map(([x,y])=>Math.hypot(end.x+x*Math.cos(end.a)-y*Math.sin(end.a),end.y+x*Math.sin(end.a)+y*Math.cos(end.a))));
  near(r.stopDistance,farthest,1e-9);assert.ok(farthest<=200);
  for(const [section,phase,sign] of [['descent','out',-1],['descent','home',1],['climb','out',1],['climb','home',-1]]){
    assert.ok(r.frames.some(f=>f.zone===section&&f.phase===phase&&f.grade===sign*17.9));
  }
  assert.equal(model.simulate({...c,height:201},'extreme','tunnel').reason,'roof');
  assert.equal(model.simulate({...c,height:200},'extreme','tunnel').reason,'sectionEnd');
  assert.equal(model.simulate({...c,supplyV:1},'extreme','climb').reason,'supply');
  assert.equal(model.simulate(model.conf('A',{axle:290}),'extreme','tunnel').reason,'wall');
  assert.equal(model.simulate(model.conf('A',{length:300,sensorInset:180}),'extreme','parking').reason,'stopOutside');
});
test('100 candidate configurations can start independently on the limits circuit',()=>{
  const sections=['launch','joint','chicane','corners','climb','tunnel','descent','hairpins','return','parking'];
  for(let i=0;i<100;i++){
    const n=i%2?'A':'B',start=sections[i%10];
    const c=model.conf(n,{pitch:5+i%6,speed:.25+.05*(i%7),height:183+i%25,axle:110+i%45,
      controlRef:30+i%75,startOffset:i%9-4,light:i%4?'room':'bright',spatial:i%3===0?'box':'lab',sensorHeight:i%2?13.3:28.3});
    const r=model.simulate(c,'extreme',start),end=r.frames.at(-1);
    assert.ok(Number.isFinite(end.station)&&Number.isFinite(end.t));assert.ok(r.bleEvents<=1);
    assert.equal(r.frames[0].phase,start==='parking'?'home':'out');
    assert.ok(r.frames.every(f=>Number.isFinite(f.grade)&&f.ns.every(Number.isFinite)));
  }
});
