'use strict';

const { chromium } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  const page=await context.newPage();
  const cspReports=[];
  page.on('request',request=>{
    try{
      if(!request.url().includes('/.netlify/functions/csp-report'))return;
      const raw=request.postData()||'';
      const parsed=raw?JSON.parse(raw):null;
      const report=parsed?.['csp-report']||parsed||{};
      cspReports.push({
        directive:report['violated-directive']||report.violatedDirective||'',
        effectiveDirective:report['effective-directive']||report.effectiveDirective||'',
        blockedUri:report['blocked-uri']||report.blockedURL||report.blockedUri||'',
        sourceFile:report['source-file']||report.sourceFile||'',
        lineNumber:report['line-number']||report.lineNumber||null,
        disposition:report.disposition||''
      });
    }catch(_){ }
  });
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{
    offline:false,
    latency:150,
    downloadThroughput:200000,
    uploadThroughput:90000,
    connectionType:'cellular4g'
  });
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});

  await page.addInitScript(()=>{
    const rect=r=>r?{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}:null;
    const label=node=>{
      if(!node||node.nodeType!==1)return null;
      const id=node.id?`#${node.id}`:'';
      const classes=node.classList&&node.classList.length?'.'+[...node.classList].slice(0,3).join('.'):'';
      return `${String(node.tagName||'').toLowerCase()}${id}${classes}`.slice(0,180);
    };
    const fontState=()=>({
      status:document.fonts?.status||'unsupported',
      inter400:Boolean(document.fonts?.check?.('400 16px Inter')),
      inter700:Boolean(document.fonts?.check?.('700 16px Inter')),
      inter900:Boolean(document.fonts?.check?.('900 16px Inter'))
    });
    window.__ntPerf={lcp:0,cls:0,longTasks:[],layoutShifts:[],fontEvents:[]};
    try{
      window.__ntPerf.fontEvents.push({type:'init',at:Math.round(performance.now()),...fontState()});
      document.fonts?.addEventListener?.('loading',()=>window.__ntPerf.fontEvents.push({type:'loading',at:Math.round(performance.now()),...fontState()}));
      document.fonts?.addEventListener?.('loadingdone',()=>window.__ntPerf.fontEvents.push({type:'loadingdone',at:Math.round(performance.now()),...fontState()}));
      document.fonts?.addEventListener?.('loadingerror',()=>window.__ntPerf.fontEvents.push({type:'loadingerror',at:Math.round(performance.now()),...fontState()}));
      document.fonts?.ready?.then(()=>window.__ntPerf.fontEvents.push({type:'ready',at:Math.round(performance.now()),...fontState()}));
    }catch(_){ }
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__ntPerf.lcp=Math.max(window.__ntPerf.lcp,e.startTime||0)}).observe({type:'largest-contentful-paint',buffered:true})}catch(_){ }
    try{new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        if(e.hadRecentInput)continue;
        window.__ntPerf.cls+=(e.value||0);
        if(window.__ntPerf.layoutShifts.length<20){
          window.__ntPerf.layoutShifts.push({
            value:Number((e.value||0).toFixed(4)),
            startTime:Math.round(e.startTime||0),
            font:fontState(),
            sources:(e.sources||[]).slice(0,8).map(source=>({
              node:label(source.node),
              previousRect:rect(source.previousRect),
              currentRect:rect(source.currentRect)
            }))
          });
        }
      }
    }).observe({type:'layout-shift',buffered:true})}catch(_){ }
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__ntPerf.longTasks.push({start:e.startTime,duration:e.duration})}).observe({type:'longtask',buffered:true})}catch(_){ }
  });

  const started=Date.now();
  const response=await page.goto(BASE+'/',{waitUntil:'load',timeout:120000});
  await page.waitForTimeout(2500);
  const data=await page.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0];
    const paints=Object.fromEntries(performance.getEntriesByType('paint').map(x=>[x.name,x.startTime]));
    const resources=performance.getEntriesByType('resource').map(r=>({
      name:new URL(r.name).pathname,
      host:new URL(r.name).host,
      initiatorType:r.initiatorType,
      duration:Math.round(r.duration),
      transferSize:r.transferSize||0,
      decodedBodySize:r.decodedBodySize||0
    }));
    const heavy=[...resources].sort((a,b)=>(b.duration-a.duration)).slice(0,25);
    const fontResources=resources.filter(r=>/fonts\.(?:googleapis|gstatic)\.com/i.test(r.host)||/\.(?:woff2?|ttf|otf)(?:$|\?)/i.test(r.name));
    const bytes=resources.reduce((n,r)=>n+(r.transferSize||r.decodedBodySize||0),0);
    const scripts=resources.filter(r=>r.initiatorType==='script');
    const images=resources.filter(r=>r.initiatorType==='img');
    const longTasks=window.__ntPerf?.longTasks||[];
    const layoutShifts=window.__ntPerf?.layoutShifts||[];
    const fontEvents=window.__ntPerf?.fontEvents||[];
    return {
      domContentLoaded:Math.round(nav?.domContentLoadedEventEnd||0),
      load:Math.round(nav?.loadEventEnd||0),
      fcp:Math.round(paints['first-contentful-paint']||0),
      lcp:Math.round(window.__ntPerf?.lcp||0),
      cls:Number((window.__ntPerf?.cls||0).toFixed(4)),
      domNodes:document.getElementsByTagName('*').length,
      productCards:document.querySelectorAll('.product-card').length,
      resourceCount:resources.length,
      scriptRequests:scripts.length,
      imageRequests:images.length,
      transferredKB:Math.round(bytes/1024),
      longTaskCount:longTasks.length,
      totalBlockingApproxMs:Math.round(longTasks.reduce((n,t)=>n+Math.max(0,t.duration-50),0)),
      fontEvents,
      fontResources,
      layoutShifts,
      heavy
    };
  });
  const uniqueReports=[...new Map(cspReports.map(report=>[JSON.stringify(report),report])).values()];
  console.log('[performance-probe] HTTP',response?.status(),'wallMs',Date.now()-started);
  console.log('[performance-probe]',JSON.stringify(data,null,2));
  console.log('[performance-probe:csp]',JSON.stringify({count:cspReports.length,unique:uniqueReports},null,2));
  await browser.close();
})().catch(err=>{console.error('[performance-probe] FAIL',err);process.exit(1)});
