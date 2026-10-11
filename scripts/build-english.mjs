import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const translations = JSON.parse(await readFile(join(root,'i18n/en.json'),'utf8'));
const routes = {
 'index.html':'index.html','laboratorio.html':'laboratory.html','pesquisa.html':'research.html',
 'infraestrutura.html':'facilities.html','eeg.html':'eeg.html',
 'rastreamento-ocular.html':'eye-tracking.html','medidas-comportamentais.html':'behavioral-measures.html',
 'pessoas.html':'people.html','producao.html':'publications.html','contato.html':'contact.html'
};
const meta = {
 'index.html':'Experimental research on language processing, prosody, the brain, and human behavior at LAPELC², Federal University of Alagoas.',
 'laboratorio.html':'About LAPELC²: an interdisciplinary laboratory for experimental research on language, brain, and human behavior at UFAL.',
 'pesquisa.html':'Research questions and methods at LAPELC²: prosody, speech perception, language processing, and neural responses.',
 'infraestrutura.html':'LAPELC² experimental facilities: high-density EEG, eye tracking, behavioral research, and a sound-treated booth.',
 'eeg.html':'Electroencephalography, event-related potentials, and their applications to experimental language research at LAPELC².',
 'rastreamento-ocular.html':'Eye tracking at LAPELC²: studying gaze, attention, reading, and real-time language processing.',
 'medidas-comportamentais.html':'Behavioral experiments at LAPELC²: judgments, decisions, accuracy, and response times in language research.',
 'pessoas.html':'Meet the LAPELC² team: laboratory leadership, researchers, and students.',
 'producao.html':'Research outputs from LAPELC²: journal articles, books, theses, datasets, materials, and conference presentations.',
 'contato.html':'Contact LAPELC² at the School of Letters, Federal University of Alagoas, for research inquiries, visits, and collaboration.'
};
const attrs = {
 'Lapelc² — Início':'LAPELC² — Home',
 'Lapelc² — Laboratório de Pesquisa da Linguagem, do Cérebro e do Comportamento Humano':'LAPELC² — Research Laboratory for Language, Brain, and Human Behavior',
 'Abrir menu':'Open menu','Navegação principal':'Main navigation',
 'Tipos de produção':'Types of research output','Buscar produção':'Search research outputs','Ordenar resultados':'Sort results',
 'Conhecer nossa pesquisa':'Explore our research',
 'Consultar referência no fonUFAL':'View reference at fonUFAL',
 'Mapa interativo da Faculdade de Letras da UFAL, campus A. C. Simões, Maceió':'Interactive map of the School of Letters, UFAL, A. C. Simões campus, Maceió',
 'Versão em português':'Switch to Portuguese',
 'Seu nome':'Your name','seu@email.com':'you@example.com',
 'Escreva sua mensagem aqui...':'Write your message here...',
 'Buscar por título, autor, palavra-chave...':'Search by title, author, or keyword...'
};
const ignored = new Set(['PT','EN','fonUFAL','FALE/UFAL','EGI','LAPELC²','pMulti / UFAL','PNIPE / MCTI',
 'EyeLink','EyeLink 1000','Geodesic EEG System 400','EyeLink II Head Mounted','SR Research','Mercado de Letras',
 'De Gruyter','Contexto','Cadernos de Linguística','Lecture Notes in Computer Science','EEG / ERPs','EYE TRACKING',
 'UFAL','01','02','03','04','05','06','256','2012','2015','310']);
function textNodes(html,page,unknown){
 return html.replace(/>([^<>]*)</g,(full,text)=>{
   const key=text.trim();
   if(!key)return full;
   let value=Object.hasOwn(translations,key)?translations[key]:null;
   if(key==='Como')value=page==='laboratorio.html'?'How to':'How it';
   if(value!==null) return '>'+text.slice(0,text.indexOf(key))+value+text.slice(text.indexOf(key)+key.length)+'<';
   if(!ignored.has(key)&&!String(key).match(/^[\p{N}\p{P}\p{S}\s]+$/u))unknown.add(key);
   return full;
 });
}
function attributes(html){
 return html.replace(/\b(aria-label|title|placeholder|alt)="([^"]*)"/g,(whole,field,key)=>{
   let tr=attrs[key]||translations[key];
   if(!tr && key.startsWith('Fotografia de '))tr='Portrait of '+key.slice('Fotografia de '.length);
   if(!tr && key.startsWith('Abrir currículo Lattes de '))tr='Open Lattes CV of '+key.slice('Abrir currículo Lattes de '.length);
   if(!tr && key.startsWith('Abrir site pessoal de '))tr='Visit personal website of '+key.slice('Abrir site pessoal de '.length);
   if(!tr && key.startsWith('Conhecer o método de '))tr='Explore the related research method';
   if(!tr && key.startsWith('Consultar trabalho de '))tr='View thesis or dissertation at the UFAL repository';
   if(!tr && key.startsWith('Consultar '))tr='View academic record';
   return field+'="'+(tr||key)+'"';
 });
}
function localize(page,source,unknown){
 let s=source.replace('<html lang="pt-BR">','<html lang="en">');
 s=s.replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+meta[page]+'">');
 s=s.replace('</head>','<link rel="alternate" hreflang="pt-BR" href="https://fonufal.github.io/lapelc/'+page+'"><link rel="alternate" hreflang="en" href="https://fonufal.github.io/lapelc/en/'+routes[page]+'"></head>');
 s=s.replace(/<span class="language"><strong aria-current="true">PT<\/strong><span aria-hidden="true"> \/ <\/span><a [^>]+>EN<\/a><\/span>/,
   '<span class="language"><a href="../'+page+'" lang="pt-BR" hreflang="pt-BR" aria-label="Versão em português">PT</a><span aria-hidden="true"> / </span><strong aria-current="true">EN</strong></span>');
 if(page==='laboratorio.html')s=s.replace('Comportamento<br>Humano.','Human<br>Behavior.');
 s=textNodes(s,page,unknown);
 s=attributes(s);
 s=s.replace(/\b(href|src)="assets\//g,'$1="../assets/');
 s=s.replace(/\bsrc=assets\//g,'src=../assets/');
 s=s.replace(/\bhref="([^"]+?\.html)(#[^"]*)?"/g,(whole,local,hash='')=>'href="'+(routes[local]||local)+hash+'"');
 if(!s.includes('<html lang="en">')||!s.includes('../assets/site.css')||!s.includes('aria-current="true">EN'))throw Error('Invalid translation: '+page);
 return s;
}
await mkdir(join(root,'en'),{recursive:true});
const report={};
for(const [source,destination] of Object.entries(routes)){
 const original=await readFile(join(root,source),'utf8');
 const unknown=new Set();
 const html=localize(source,original,unknown);
 await writeFile(join(root,'en',destination),html,'utf8');
 report[destination]=[...unknown].filter(x=>x.length>2);
 console.log('Generated en/'+destination+', unknown nodes: '+report[destination].length);
}
await writeFile(join(root,'en','translation-report.json'),JSON.stringify(report,null,2)+'\n');
