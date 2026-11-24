// User programs run in a disposable worker. Only the wheel/sensor ABI is linked.
const ControllerFiles=(()=>{
  const library=new Map();
  const example=`// Save as controller.cpp (also valid C). Port the same step logic to your firmware.
// One call per 5 ms. Sensor indices start at zero. Positive offsets point right.
#ifdef __cplusplus
extern "C" {
#endif
double sensor(int i);       // normalised reflectance, 0..1
int adc(int i);             // 12-bit ADC
double right_mm(int i);     // relative to chassis centre
double forward_mm(int i);   // relative to rear axle
int role(int i);            // 0 primary, 1 backup, 2 log only
double left_mps(void);      // previous applied wheel speeds
double right_mps(void);
void wheels(double left, double right); // signed m/s, call on every step
// Optional: override the default threshold detector used for loss and recovery.
// source: 0 lost, 1 primary, 2 backup. The offset is in mm, positive right.
void tracking(int source, double offset_mm);

void step(double dt, double speed, double axle_mm, int count) {
    static double curvature = 0.0;
    double sum = 0.0, weighted = 0.0;
    int source = 0;
    for (int group = 0; group < 2 && source == 0; ++group) {
        for (int i = 0; i < count; ++i) {
            double n = sensor(i);
            if (role(i) == group && n >= 0.5) {
                sum += n;
                weighted += n * right_mm(i);
            }
        }
        if (sum > 0.0) source = group + 1;
    }
    double offset = source ? weighted / sum : 0.0;
    tracking(source, offset);
    if (source) {
        curvature = 2.0 * offset / (30.0 * 30.0);
        if (curvature > 0.035) curvature = 0.035;
        if (curvature < -0.035) curvature = -0.035;
    }
    wheels(speed * (1.0 + curvature * axle_mm / 2.0),
           speed * (1.0 - curvature * axle_mm / 2.0));
}
#ifdef __cplusplus
}
#endif
`;
  function workerTask(source,message,timeout,signal){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(Error('Cancelled'));return;}
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const worker=new Worker(url,{type:'module'});
      const finish=(fn,arg)=>{
        clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        worker.terminate();URL.revokeObjectURL(url);fn(arg);
      };
      const cancel=()=>finish(reject,Error('Cancelled'));
      const timer=setTimeout(()=>finish(reject,Error('Controller worker timed out')),timeout);
      signal?.addEventListener('abort',cancel,{once:true});
      worker.onmessage=({data})=>data.error?finish(reject,Error(data.error)):finish(resolve,data.value);
      worker.onerror=e=>finish(reject,Error(e.message||'Worker failed'));
      try{worker.postMessage(message);}catch(e){finish(reject,e);}
    });
  }
  async function compileSource({source,cpp}){
    const {runClang}=await import('https://cdn.jsdelivr.net/npm/@yowasp/clang@21.1.4-3/gen/bundle.js');
    const name=cpp?'controller.cpp':'controller.c',decoder=new TextDecoder();
    let diagnostic='';
    try{
      const files=await runClang([cpp?'clang++':'clang','-O1','-nostdlib','-Wl,--no-entry','-Wl,--export=step',
        '-Wl,--allow-undefined','-Wl,--max-memory=16777216',name,'-o','controller.wasm'],{[name]:source},
        {stderr:chunk=>{if(chunk)diagnostic+=decoder.decode(chunk);}});
      if(!files['controller.wasm'])throw Error('Missing controller.wasm');
      return files['controller.wasm'];
    }catch(e){throw Error(diagnostic.trim()||e.message);}
  }
  const handler=fn=>'self.onmessage=async({data})=>{try{self.postMessage({value:await ('+fn.toString()+')(data)})}catch(e){self.postMessage({error:String(e.message||e)})}}';
  const allowed=['sensor','adc','right_mm','forward_mm','role','left_mps','right_mps','tracking','wheels'];
  async function add(file,signal){
    const wasm=/\.wasm$/i.test(file.name);
    if(!wasm&&!/\.(?:c|cc|cpp|cxx)$/i.test(file.name))throw Error('Choose a .c, .cpp or .wasm file');
    if(file.size>2*1024*1024)throw Error('File exceeds 2 MiB');
    const bytes=wasm?new Uint8Array(await file.arrayBuffer()):
      await workerTask(handler(compileSource),{source:await file.text(),cpp:!file.name.endsWith('.c')},180000,signal);
    const module=await WebAssembly.compile(bytes);
    if(!WebAssembly.Module.exports(module).some(e=>e.kind==='function'&&e.name==='step'))throw Error('Missing C export: step');
    for(const imp of WebAssembly.Module.imports(module)){
      if(imp.module!=='env'||imp.kind!=='function'||!allowed.includes(imp.name))throw Error('Unsupported controller import: '+imp.name);
    }
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    const id=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
    if(!signal.aborted)library.set(id,{name:file.name,module});
    return id;
  }
  function runGuest({c,kind,startId,module}){
    let reading,previous,command;
    const position=i=>{if(!c.positions[i])throw Error('Sensor index out of range: '+i);return c.positions[i];};
    const env={
      sensor:i=>{position(i);return reading.ns[i];},adc:i=>{position(i);return reading.adc[i];},
      right_mm:i=>position(i).right,forward_mm:i=>c.look+position(i).forward,
      role:i=>['steer','backup','log'].indexOf(position(i).role),
      left_mps:()=>(previous?.left??0)/1000,right_mps:()=>(previous?.right??0)/1000,
      wheels:(l,r)=>{command=[l,r];},
      tracking:(source,offset)=>{
        if(![0,1,2].includes(source)||!Number.isFinite(offset))throw Error('Invalid tracking observation');
        reading.source=['none','steer','backup'][source];reading.e=source?offset:null;
      }
    };
    const instance=new WebAssembly.Instance(module,{env});
    return simulate(c,kind,startId,(s,ds,last)=>{
      reading=s;previous=last;command=null;
      instance.exports.step(dt,c.speed,c.axle,c.positions.length);
      if(!command)throw Error('step() must call wheels(left, right)');
      return command;
    });
  }
  function run(c,kind,startId,signal){
    const model=document.getElementById('simModel').textContent;
    return workerTask(model+'\n'+handler(runGuest),{c,kind,startId,module:library.get(c.controllerId).module},15000,signal);
  }
  function download(){
    const url=URL.createObjectURL(new Blob([example],{type:'text/plain'}));
    const a=document.createElement('a');a.href=url;a.download='controller.cpp';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {add,run,download,choices:()=>Array.from(library,([id,entry])=>[id,entry.name])};
})();
