document.addEventListener('DOMContentLoaded',()=>{
 const toggle=document.querySelector('.mobile-toggle'),nav=document.querySelector('.nav');
 function setMenu(open){
  if(!toggle||!nav)return;
  nav.classList.toggle('open',open);
  toggle.setAttribute('aria-expanded',String(open));
  toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
  toggle.textContent=open?'×':'☰';
 }
 if(toggle&&nav){
  toggle.addEventListener('click',()=>setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){setMenu(false);toggle.focus();}});
 }
 const tabs=[...document.querySelectorAll('[role="tab"][data-tab]')];
 const panels=[...document.querySelectorAll('[role="tabpanel"][data-panel]')];
 const heading=document.getElementById('pub-heading');
 const headers={artigos:'Artigos científicos',livros:'Livros',teses:'Teses e dissertações',dados:'Dados e materiais',apresentacoes:'Apresentações'};
 const search=document.getElementById('pub-search'),sort=document.getElementById('pub-sort'),status=document.getElementById('pub-status');
 function filterPanel(){
  if(!search)return;
  const q=search.value.trim().toLocaleLowerCase('pt-BR');
  const current=panels.find(p=>!p.hidden);
  panels.forEach(p=>p.querySelectorAll('.pub-item').forEach(li=>{li.hidden=!li.textContent.toLocaleLowerCase('pt-BR').includes(q);}));
  if(current&&status){const shown=current.querySelectorAll('.pub-item:not([hidden])').length;status.textContent=shown===0?'Nenhum resultado encontrado.':shown===1?'1 registro encontrado.':shown+' registros encontrados.';}
 }
 function selectTab(tab,focus=false){
  if(!tab)return;
  tabs.forEach(b=>{const selected=b===tab;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
  panels.forEach(p=>p.hidden=p.dataset.panel!==tab.dataset.tab);
  if(heading)heading.textContent=headers[tab.dataset.tab]||'Produção';
  if(search)search.value='';
  filterPanel();
  if(focus)tab.focus();
 }
 tabs.forEach((tab,i)=>{
  tab.addEventListener('click',()=>selectTab(tab));
  tab.addEventListener('keydown',e=>{
   let next;
   if(e.key==='ArrowRight')next=(i+1)%tabs.length;
   else if(e.key==='ArrowLeft')next=(i-1+tabs.length)%tabs.length;
   else if(e.key==='Home')next=0;
   else if(e.key==='End')next=tabs.length-1;
   if(next!==undefined){e.preventDefault();selectTab(tabs[next],true);}
  });
 });
 if(tabs.length)selectTab(tabs.find(x=>x.getAttribute('aria-selected')==='true')||tabs[0]);
 if(search)search.addEventListener('input',filterPanel);
 if(sort)sort.addEventListener('change',()=>{
  panels.forEach(list=>{
   const li=[...list.querySelectorAll('.pub-item')].sort((a,b)=>sort.value==='desc'?Number(b.dataset.year)-Number(a.dataset.year):Number(a.dataset.year)-Number(b.dataset.year));
   li.forEach(x=>list.appendChild(x));
  });
  filterPanel();
 });
 const form=document.getElementById('contact-form');
 if(form)form.addEventListener('submit',e=>{
  e.preventDefault();
  if(!form.reportValidity())return;
  const data=new FormData(form);
  const subject=encodeURIComponent('LAPELC² — '+data.get('assunto'));
  const body=encodeURIComponent('Nome: '+data.get('nome')+'\nE-mail: '+data.get('email')+'\n\n'+data.get('mensagem'));
  location.href='mailto:miguel@fale.ufal.br?subject='+subject+'&body='+body;
 });
});