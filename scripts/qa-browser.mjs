import { chromium } from 'playwright';
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
        return {
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
      const arrowCheck=await page.evaluate(()=>{
        const svgs=[...document.querySelectorAll('svg.link-arrow')];
        return {
          glyphText:document.body.textContent.includes('↗'),
          svgCount:svgs.length,
          visible:svgs.every(svg=>{const r=svg.getBoundingClientRect();return r.width>=8&&r.height>=8;})
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
if(failures.length){
  console.error(JSON.stringify({failures},null,2));
  process.exitCode=1;
} else console.log('QA OK: 10 pages x 5 viewports = 50 rendering checks; menu, tabs, search and form verified.');
