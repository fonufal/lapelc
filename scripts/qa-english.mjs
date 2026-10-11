import { chromium, webkit } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const base='http://127.0.0.1:8765';
const enRoutes={
 'index.html':'index.html','laboratorio.html':'laboratory.html','pesquisa.html':'research.html',
 'infraestrutura.html':'facilities.html','eeg.html':'eeg.html',
 'rastreamento-ocular.html':'eye-tracking.html','medidas-comportamentais.html':'behavioral-measures.html',
 'pessoas.html':'people.html','producao.html':'publications.html','contato.html':'contact.html'
};
const nav=['Laboratory','Research','Facilities','People','Publications','Contact'];
const failures=[],results=[];
await mkdir('artifacts/qa',{recursive:true});
for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});
 try {
  for(const width of [390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width<600,hasTouch:width<600});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   for(const [pt,en] of Object.entries(enRoutes)){
    errors.length=0;
    const response=await page.goto(base+'/en/'+en,{waitUntil:'domcontentloaded',timeout:30000});
    const issues=[];
    if(!response?.ok())issues.push('HTTP '+response?.status());
    const check=await page.evaluate(()=>{
     const h1=document.querySelector('h1');
     const nav=[...document.querySelectorAll('nav.nav > a')];
     const en=document.querySelector('.language strong');
     const pt=document.querySelector('.language a[hreflang="pt-BR"]');
     const target=new URL(pt?.getAttribute('href')||'',location.href);
     return {
      lang:document.documentElement.lang, title:document.title,heading:h1?.innerText,
      headingWidth:h1?.scrollWidth, headingClient:h1?.clientWidth,
      xOverflow:document.documentElement.scrollWidth-innerWidth,
      nav:nav.map(x=>x.textContent.trim()),
      navLinks:nav.map(x=>x.getAttribute('href')),
      assetOk:!!document.querySelector('link[rel="stylesheet"][href^="../assets/site.css"]'),
      skipOk:!!document.querySelector('.skip-link[href="#conteudo"]'),
      ptText:pt?.textContent.trim(), ptTarget:target.pathname,
      enText:en?.textContent.trim(),
      text:document.body.innerText.slice(0,600)
     };
    });
    if(check.lang!=='en')issues.push('lang not en');
    if(check.enText!=='EN'||check.ptText!=='PT')issues.push('language control missing');
    if(!check.ptTarget.endsWith('/lapelc/'+pt))issues.push('Portuguese counterpart wrong: '+check.ptTarget);
    if(check.nav.join('|')!==nav.join('|'))issues.push('navigation not translated: '+check.nav);
    if(check.navLinks.some(x=>!Object.values(enRoutes).includes(x)))issues.push('English nav leaves locale');
    if(!check.assetOk||!check.skipOk)issues.push('assets or skip incorrect');
    if(check.xOverflow>2)issues.push('horizontal overflow '+check.xOverflow);
    if(check.headingWidth>check.headingClient+3)issues.push('heading text overflow');
    if(check.text.includes('Pular para o conteúdo principal')||check.text.includes('Nossas pesquisas investigam'))issues.push('Portuguese editorial text remains');
    if(errors.length)issues.push('JavaScript errors '+errors.join(' | '));
    const language=page.locator('.language a[hreflang="pt-BR"]');
    if(width<1050){
      const toggle=page.locator('.mobile-toggle');
      if(!await toggle.isVisible())issues.push('menu button hidden');
      else{
       await toggle.click();
       if(!await page.locator('nav.nav').isVisible())issues.push('menu did not open');
       if(!await language.isVisible())issues.push('PT switch hidden in open menu');
       await page.keyboard.press('Escape');
      }
    } else if(!await language.isVisible())issues.push('PT switch not visible desktop');
    if(en==='publications.html'){
     const tabs=page.locator('[role="tab"][data-tab]');
     const texts=await tabs.allTextContents();
     if(texts.join('|')!=='Articles|Books|Theses and dissertations|Data and materials|Presentations')issues.push('publication tabs untranslated: '+texts.join('|'));
     await tabs.nth(3).click();
     if(!await page.locator('[role="tabpanel"][data-panel="dados"]').isVisible())issues.push('dataset tab did not open');
     await page.locator('#pub-search').fill('never-any-match-xyz');
     if(!(await page.locator('#pub-status').textContent()||'').includes('No results found'))issues.push('search feedback untranslated');
    }
    if(en==='contact.html'){
     const labels=await page.locator('.contact-form label').allTextContents();
     if(!labels.some(x=>x.includes('Name'))||!labels.some(x=>x.includes('Message')))issues.push('form labels untranslated');
     if(!await page.locator('.contact-map-frame').count())issues.push('map missing');
    }
    if((width===390||width===1440)&&['index.html','research.html','people.html','publications.html','contact.html'].includes(en))
      await page.screenshot({path:'artifacts/qa/'+name+'-en-'+width+'-'+en.replace('.html','.png'),fullPage:true,animations:'disabled'});
    results.push({browser:name,width,page:en,issues,heading:check.heading});
    issues.forEach(issue=>failures.push({browser:name,width,page:en,issue}));
    console.log((issues.length?'FAIL':'PASS')+' EN '+name+' '+width+'px '+en+(issues.length?' '+issues.join('; '):''));
   }
   await context.close();
  }
 } finally {await browser.close();}
}
const report=JSON.parse(await readFile('en/translation-report.json','utf8'));
console.log('Untranslated fragments (bibliographic titles and personal names are intentionally preserved):');
for(const [page,items] of Object.entries(report)) console.log(page+': '+JSON.stringify(items));
await writeFile('artifacts/qa/english-results.json',JSON.stringify({failures,results,translationReport:report},null,2));
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
else console.log('English QA PASS: 10 pages × 3 widths × 2 browser engines, including navigation, tabs, search, form and map.');
