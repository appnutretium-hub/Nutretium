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
    window.__ntPerf={lcp:0,cls:0,longTasks:[]};
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__ntPerf.lcp=Math.max(window.__ntPerf.lcp,e.startTime||0)}).observe({type:'largest-contentful-paint',buffered:true})}catch(_){ }
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__ntPerf.cls+=(e.value||0)}).observe({type:'layout-shift',buffered:true})}catch(_){ }
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
      initiatorType:r.initiatorType,
      duration:Math.round(r.duration),
      transferSize:r.transferSize||0,
      decodedBodySize:r.decodedBodySize||0
    }));
    const heavy=[...resources].sort((a,b)=>(b.duration-a.duration)).slice(0,20);
    const bytes=resources.reduce((n,r)=>n+(r.transferSize||r.decodedBodySize||0),0);
    const scripts=resources.filter(r=>r.initiatorType==='script');
    const images=resources.filter(r=>r.initiatorType==='img');
    const longTasks=window.__ntPerf?.longTasks||[];
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
      heavy
    };
  });
  const uniqueReports=[...new Map(cspReports.map(report=>[JSON.stringify(report),report])).values()];
  console.log('[performance-probe] HTTP',response?.status(),'wallMs',Date.now()-started);
  console.log('[performance-probe]',JSON.stringify(data,null,2));
  console.log('[performance-probe:csp]',JSON.stringify({count:cspReports.length,unique:uniqueReports},null,2));
  await browser.close();
})().catch(err=>{console.error('[performance-probe] FAIL',err);process.exit(1)});
