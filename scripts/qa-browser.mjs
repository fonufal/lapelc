import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const pages = ['index.html', 'laboratorio.html', 'pesquisa.html', 'infraestrutura.html', 'eeg.html', 'rastreamento-ocular.html', 'medidas-comportamentais.html', 'pessoas.html', 'producao.html', 'contato.html'];
const widths = [320, 390, 768, 1024, 1440];
const root = 'http://127.0.0.1:8765';
const dir = 'artifacts/qa';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const report = [];
const failures = [];

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    for (const path of pages) {
      errors.length = 0;
      const response = await page.goto(root + '/' + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const check = await page.evaluate(() => {
        const doc = document.documentElement;
        const rect = n => { const r = n.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height }; };
        const h1 = document.querySelector('h1');
        const portraits = [...document.querySelectorAll('.people-items .portrait')];
        let overlaps = 0;
        for(let i=0;i<portraits.length;i++){
          const a=portraits[i].getBoundingClientRect();
          for(let j=i+1;j<portraits.length;j++){
            const b=portraits[j].getBoundingClientRect();
            if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)overlaps++;
          }
        }
        const art=document.querySelector('.hero-art img');
        const hero=document.querySelector('.hero');
        const lastMeaningful=hero?.querySelector('.hero-main .buttons a:last-child')||hero?.querySelector('.hero-main .lead');
        const bottomGap=hero&&lastMeaningful?hero.getBoundingClientRect().bottom-lastMeaningful.getBoundingClientRect().bottom:null;
        return {heroBottomGap:bottomGap,heroHeight:hero?.getBoundingClientRect().height,
          overflow:doc.scrollWidth>innerWidth+2,
          scrollWidth:doc.scrollWidth,
          viewport:innerWidth,
          h1:h1?rect(h1):null,
          imageCount:document.images.length,
          portraits:portraits.length,
          portraitOverlaps:overlaps,
          art:art?{src:art.getAttribute('src'),box:rect(art)}:null,
          skip:!!document.querySelector('a.skip-link[href="#conteudo"]')
        };
      });
      const problems = [];
      if(!response || !response.ok())problems.push('HTTP error: ' + response?.status());
      if(check.overflow)problems.push('horizontal overflow: ' + check.scrollWidth + ' > ' + check.viewport);
      if(width <= 600 && (check.heroBottomGap===null||check.heroBottomGap>90||check.heroBottomGap<18))
        problems.push('mobile hero has excessive bottom whitespace: '+check.heroBottomGap+'px');
      const arrowCheck=await page.evaluate(()=>{
        const svgs=[...document.querySelectorAll('svg.link-arrow')];
        return {
          glyphText:document.body.textContent.includes('↗'),
          svgCount:svgs.length,
          visible:svgs.filter(svg=>svg.getClientRects().length>0).every(svg=>{const r=svg.getBoundingClientRect();return r.width>=8&&r.height>=8;})
        };
      });
      if(arrowCheck.glyphText)problems.push('raw diagonal arrow still rendered as text');
      if(arrowCheck.svgCount===0)problems.push('SVG arrows absent');
      if(!arrowCheck.visible)problems.push('SVG arrow with zero-size render');

      if(check.portraitOverlaps)problems.push('portrait overlap: ' + check.portraitOverlaps);
      if(check.h1 && (check.h1.x < -2 || check.h1.right>width+2))problems.push('heading beyond viewport');
      if(!check.skip)problems.push('missing skip link');
      const skip = page.locator('a.skip-link');
      const rectBefore=await skip.boundingBox();
      if(rectBefore && rectBefore.y+rectBefore.height>0)problems.push('skip link visible without focus');
      await page.keyboard.press('Tab');
      if(!await skip.evaluate(el=>document.activeElement===el))problems.push('skip link not first keyboard focus');
      const rectFocused=await skip.boundingBox();
      if(!rectFocused||rectFocused.y<0)problems.push('skip link hidden under keyboard focus');
      await page.keyboard.press('Enter');
      if(!await page.locator('#conteudo').evaluate(el=>document.activeElement===el))problems.push('skip activation did not transfer focus');
      const rectAfter=await skip.boundingBox();
      if(rectAfter&&rectAfter.y+rectAfter.height>0)problems.push('skip link remained visible after activation');
      if(check.art && check.art.box.height < 100)problems.push('hero image too short');
      if(errors.length)problems.push('JavaScript error(s): ' + errors.join(' | '));
      if(width <= 1050){
        const toggle=page.locator('.mobile-toggle');
        if(!await toggle.isVisible())problems.push('menu toggle missing');
        else{
          await toggle.click();
          if(await toggle.getAttribute('aria-expanded')!=='true'||!await page.locator('.nav').isVisible())problems.push('menu did not open');
          await page.keyboard.press('Escape');
          if(await toggle.getAttribute('aria-expanded')!=='false')problems.push('menu did not close with Escape');
        }
      } else if(!await page.locator('.nav').isVisible()) problems.push('desktop navigation hidden');
      if(['index.html','pesquisa.html'].includes(path)){
        const methodLinks=await page.locator('.method-list a').evaluateAll(links=>links.map(a=>{
          const r=a.getBoundingClientRect();
          const arrow=a.querySelector('svg.link-arrow');
          const box=arrow?.getBoundingClientRect();
          const meta=a.querySelector('.method-meta');
          const metaBox=meta?.getBoundingClientRect();
          const st=arrow?getComputedStyle(arrow):null;
          return {href:a.getAttribute('href'),rowHeight:r.height,svgWidth:box?.width,svgHeight:box?.height,
             fill:st?.fill,stroke:st?.stroke,display:st?.display,metaHeight:metaBox?.height,
             arrowAttributes:arrow?.getAttribute('width')&&arrow?.getAttribute('height')&&arrow?.getAttribute('fill')==='none'&&arrow?.getAttribute('stroke')==='currentColor'};
        }));
        if(methodLinks.length!==3)problems.push('method navigation does not have exactly three links');
        for(const link of methodLinks){
          if(link.rowHeight>94)problems.push('oversized method row: '+link.rowHeight+'px');
          if(link.svgWidth>22||link.svgHeight>22||link.svgWidth<10||link.svgHeight<10)problems.push('oversized SVG arrow: '+JSON.stringify(link));
          if(!link.arrowAttributes)problems.push('missing inline SVG safeguards');
          if(link.fill!=='none')problems.push('arrow unexpectedly filled: '+link.fill);
          if(!link.href||!link.href.endsWith('.html'))problems.push('method link missing destination');
        }
      }
      if(path==='producao.html'){
        const labels=['artigos','livros','teses','dados','apresentacoes'];
        for(const label of labels){
          const tab=page.locator('[data-tab="'+label+'"]');
          await tab.click();
          const pnl=page.locator('[data-panel="'+label+'"]');
          if(!await pnl.isVisible())problems.push('tab not opening: '+label);
          if(await tab.getAttribute('aria-selected')!=='true')problems.push('aria-selected not set: '+label);
        }
        const active=page.locator('[data-tab="apresentacoes"]');
        await active.focus();
        await page.keyboard.press('Home');
        if(await page.locator('[data-tab="artigos"]').getAttribute('aria-selected')!=='true')problems.push('keyboard Home did not select Artigos');
        await page.locator('#pub-search').fill('___unlikely_search_989898___');
        if(!(await page.locator('#pub-status').textContent()||'').includes('Nenhum resultado'))problems.push('search status is not updated');
      }
      if(path==='contato.html'){
        if(!await page.locator('#contact-form').isVisible()) problems.push('contact form absent');
        if(!await page.locator('a[href="mailto:miguel@fale.ufal.br"]').isVisible())problems.push('contact email fallback absent');
        const map=page.locator('iframe.contact-map-frame');
        if(await map.count()!==1)problems.push('embedded map missing');
        else{
          await map.scrollIntoViewIfNeeded();
          const meta=await map.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,source:el.getAttribute('src'),title:el.getAttribute('title')};});
          if(meta.width<180||meta.height<200)problems.push('embedded map too small: '+JSON.stringify(meta));
          if(!meta.source.includes('google.com/maps?')||!meta.source.includes('output=embed'))problems.push('embedded map address invalid');
          if(!meta.title)problems.push('embedded map lacks accessibility title');
          if(!await page.locator('.contact-map-fallback').isVisible())problems.push('map external fallback missing');
        }
      }
      if(width===390||width===1440||(width===768&&['pesquisa.html','pessoas.html','producao.html'].includes(path))){
        await page.screenshot({path:dir+'/'+width+'-'+path.replace('.html','.png'),fullPage:true,animations:'disabled',timeout:30000});
      }
      report.push({page:path,width,...check,issues:problems});
      for(const issue of problems)failures.push({page:path,width,issue});
      console.log((problems.length?'FAIL':'PASS')+' '+width+'px '+path+' '+problems.join('; '));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(dir+'/results.json', JSON.stringify({tested:report.length,failures,report},null,2));
}

/* WebKit renders with Safari's SVG sizing/styling rules. */
const safari=await webkit.launch({headless:true});
try{
  for(const width of [390,1024,1440]){
    const ctx=await safari.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    const page=await ctx.newPage();
    for(const path of ['index.html','pesquisa.html']){
      const response=await page.goto(root+'/'+path,{waitUntil:'load',timeout:30000});
      if(!response?.ok())failures.push({browser:'webkit',width,page:path,issue:'page load failed'});
      const samples=await page.locator('.method-list a').evaluateAll(links=>links.map(link=>{
        const svg=link.querySelector('.link-arrow');
        if(!svg)return {error:'svg missing'};
        const row=link.getBoundingClientRect();
        const a=svg.getBoundingClientRect();
        const css=getComputedStyle(svg);
        return {href:link.getAttribute('href'),rowHeight:row.height,width:a.width,height:a.height,fill:css.fill,stroke:css.stroke};
      }));
      for(const sample of samples){
        if(sample.error||sample.rowHeight>94||sample.width>22||sample.height>22||sample.width<10||sample.height<10||sample.fill!=='none'){
          failures.push({browser:'webkit',width,page:path,issue:'malformed method arrow',details:sample});
        }
      }
      if(width===1440)await page.screenshot({path:dir+'/webkit-'+width+'-'+path.replace('.html','.png'),fullPage:true,animations:'disabled',timeout:30000});
      console.log('WEBKIT '+width+'px '+path+' '+JSON.stringify(samples));
    }
    if(width===390){
      for(const path of pages){
        await page.goto(root+'/'+path,{waitUntil:'domcontentloaded',timeout:30000});
        const gap=await page.evaluate(()=>{
          const hero=document.querySelector('.hero');
          const content=hero?.querySelector('.hero-main .buttons a:last-child')||hero?.querySelector('.hero-main .lead');
          if(!hero||!content)return null;
          return hero.getBoundingClientRect().bottom-content.getBoundingClientRect().bottom;
        });
        if(gap===null||gap>90||gap<18) failures.push({browser:'webkit',width,page:path,issue:'mobile hero bottom whitespace',gap});
        console.log('WEBKIT HERO '+width+'px '+path+' gap='+gap);
      }
    }
    await ctx.close();
  }
}finally{await safari.close();}

if(failures.length){
  console.error(JSON.stringify({failures},null,2));
  process.exitCode=1;
} else console.log('QA OK: 10 pages x 5 viewports = 50 rendering checks; menu, tabs, search and form verified.');
