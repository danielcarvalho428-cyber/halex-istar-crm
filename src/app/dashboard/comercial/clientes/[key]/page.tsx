'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, Mail, MessageCircle, Phone, ShoppingBag, Target } from 'lucide-react';
import { collectCommercialRecords } from '@/lib/commercial-contacts';
import { db } from '@/lib/db';
import { buildClientProductTrends, buildPurchaseTrends, commercialClientKey } from '@/lib/purchase-trends';
import type { Empenho, Licitacao, LicitacaoItem } from '@/types';
import { useSessionRole } from '@/lib/useSessionRole';

function money(value:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);}
function date(value?:string|null){return value?new Intl.DateTimeFormat('pt-BR').format(new Date(`${value.slice(0,10)}T12:00:00`)):'—';}

export default function ClientProfilePage(){
  const { isAdmin } = useSessionRole();
  const params=useParams<{key:string}>();
  const key=decodeURIComponent(params.key);
  const [licitacoes,setLicitacoes]=useState<Licitacao[]>([]);
  const [itens,setItens]=useState<LicitacaoItem[]>([]);
  const [empenhos,setEmpenhos]=useState<Empenho[]>([]);
  const [loading,setLoading]=useState(true);
  const [template,setTemplate]=useState('Olá! Estamos acompanhando o histórico de compras e gostaríamos de conversar sobre as próximas necessidades de fornecimento.');
  useEffect(()=>{const id=window.setTimeout(()=>void db.getAppData().then(data=>{setLicitacoes(data.licitacoes);setItens(data.itens);setEmpenhos(data.empenhos);}).finally(()=>setLoading(false)),0);return()=>clearTimeout(id);},[]);
  const clientLicitacoes=useMemo(()=>licitacoes.filter(item=>commercialClientKey(item)===key),[key,licitacoes]);
  const trend=useMemo(()=>buildPurchaseTrends(licitacoes,empenhos).find(item=>item.clientKey===key)||null,[key,licitacoes,empenhos]);
  const ids=useMemo(()=>new Set(clientLicitacoes.map(item=>item.id)),[clientLicitacoes]);
  const clientItems=useMemo(()=>itens.filter(item=>ids.has(item.licitacao_id)),[ids,itens]);
  const clientEmpenhos=useMemo(()=>empenhos.filter(item=>ids.has(item.licitacao_id)),[ids,empenhos]);
  const productTrends=useMemo(()=>buildClientProductTrends(clientLicitacoes,clientItems),[clientLicitacoes,clientItems]);
  const records=useMemo(()=>collectCommercialRecords(clientLicitacoes),[clientLicitacoes]);
  const sold=clientEmpenhos.filter(item=>item.status!=='cancelado').reduce((sum,item)=>sum+item.valor_empenho,0);
  const won=clientItems.filter(item=>item.status==='ganho').reduce((sum,item)=>sum+item.quantidade*item.valor_unitario,0);
  const logWhatsApp=async()=>{
    if(!trend?.phone)return;
    const phone=trend.phone.replace(/\D/g,'');
    const number=phone.startsWith('55')?phone:`55${phone}`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(template)}`,'_blank','noopener,noreferrer');
    await db.saveCommercialContact({licitacaoId:trend.licitacaoId,clientKey:trend.clientKey,contactedAt:new Date().toISOString().slice(0,10),outcome:'contato_realizado',notes:`WhatsApp iniciado. Mensagem: ${template}`});
    const data=await db.getAppData();setLicitacoes(data.licitacoes);
  };
  if(loading)return <div className="py-20 text-center text-sm text-stone-500">Carregando perfil...</div>;
  if(!trend)return <div className="glass-card p-8"><p>Cliente não encontrado.</p><Link href="/dashboard/comercial/tendencias" className="mt-4 inline-block text-amber-800">Voltar</Link></div>;
  const timeline=[
    ...clientEmpenhos.map(item=>({date:item.data_empenho,type:'Compra / empenho',title:`NE ${item.numero_empenho}`,detail:money(item.valor_empenho)})),
    ...records.contacts.map(item=>({date:item.contacted_at,type:'Contato comercial',title:item.outcome.replaceAll('_',' '),detail:item.notes||item.created_by})),
    ...records.tasks.map(item=>({date:item.due_at,type:'Tarefa',title:item.title,detail:item.status})),
  ].sort((a,b)=>b.date.localeCompare(a.date));
  return <div className="space-y-6">
    <header><Link href="/dashboard/comercial/tendencias" className="inline-flex items-center gap-2 text-xs font-bold text-stone-600"><ArrowLeft size={14}/>Tendências</Link><div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="lumina-kicker">Perfil do cliente</p><h1 className="mt-2 text-3xl font-semibold">{trend.client}</h1><p className="mt-2 text-sm text-stone-500">{[trend.clientCode&&`Código ${trend.clientCode}`,trend.region,trend.state].filter(Boolean).join(' · ')}</p></div><div className="flex flex-wrap gap-2">{trend.phone&&<a href={`tel:${trend.phone}`} className="brand-secondary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"><Phone size={14}/>{trend.phone}</a>}{trend.email&&<a href={`mailto:${trend.email}`} className="brand-secondary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"><Mail size={14}/>E-mail</a>}</div></div></header>
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[['Total ganho',money(won)],['Total vendido',money(sold)],['Próxima compra',date(trend.predictedDate)],['Confiança',`${trend.confidence} · ${trend.events} eventos`]].map(([label,value])=><div key={label} className="glass-card p-4"><p className="text-[10px] font-bold uppercase text-stone-500">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>)}</section>
    {isAdmin&&trend.phone&&<section className="glass-card p-5"><div className="flex items-center gap-2"><MessageCircle size={18} className="text-emerald-600"/><h2 className="font-semibold">WhatsApp comercial</h2></div><p className="mt-1 text-xs text-stone-500">A abertura da conversa será registrada automaticamente no histórico.</p><div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"><select value={template} onChange={e=>setTemplate(e.target.value)} className="form-input"><option>Olá! Estamos acompanhando o histórico de compras e gostaríamos de conversar sobre as próximas necessidades de fornecimento.</option><option>Olá! Identificamos que este pode ser um bom momento para revisar o saldo e planejar uma nova aquisição. Podemos conversar?</option><option>Olá! Gostaríamos de apresentar uma proposta para recuperar o atendimento dos produtos comprados anteriormente.</option></select><button onClick={()=>void logWhatsApp()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"><MessageCircle size={16}/>Abrir WhatsApp</button></div></section>}
    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"><div className="glass-card overflow-hidden"><div className="flex items-center gap-2 border-b border-stone-900/8 p-4"><ShoppingBag size={17} className="text-amber-700"/><h2 className="font-semibold">Tendência por produto</h2></div><div className="divide-y divide-stone-900/8">{productTrends.slice(0,20).map(item=><article key={item.key} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-sm font-semibold">{item.description}</p><p className="mt-1 text-[11px] text-stone-500">{item.code?`Código ${item.code} · `:''}{item.occurrences} ocorrência(s) · {item.totalQuantity.toLocaleString('pt-BR')} unidades</p></div><div><p className="text-[9px] font-bold uppercase text-stone-400">Próxima estimativa</p><p className="mt-1 text-xs font-bold text-amber-800">{date(item.predictedDate)}</p></div><div className="text-left sm:text-right"><p className="text-[9px] font-bold uppercase text-stone-400">Valor histórico</p><p className="mt-1 text-xs font-bold text-emerald-700">{money(item.totalValue)}</p></div></article>)}</div></div><div className="space-y-6"><div className="glass-card p-5"><div className="flex items-center gap-2"><Target size={17} className="text-amber-700"/><h2 className="font-semibold">Oportunidades</h2></div><p className="mt-3 text-2xl font-semibold">{records.opportunities.length}</p><p className="text-xs text-stone-500">{money(records.opportunities.reduce((sum,item)=>sum+item.estimated_value,0))} em valor cadastrado</p><Link href="/dashboard/comercial/pipeline" className="brand-secondary mt-4 inline-flex rounded-lg px-3 py-2 text-xs font-bold">Abrir pipeline</Link></div><div className="glass-card p-5"><div className="flex items-center gap-2"><CalendarClock size={17} className="text-amber-700"/><h2 className="font-semibold">Próximas tarefas</h2></div><div className="mt-3 space-y-2">{records.tasks.filter(item=>item.status==='pendente').slice(0,5).map(item=><div key={item.id} className="rounded-lg bg-stone-50 p-3 text-xs"><strong>{item.title}</strong><p className="mt-1 text-stone-500">{date(item.due_at)}</p></div>)}{!records.tasks.some(item=>item.status==='pendente')&&<p className="text-sm text-stone-500">Nenhuma tarefa pendente.</p>}</div><Link href="/dashboard/comercial/agenda" className="brand-secondary mt-4 inline-flex rounded-lg px-3 py-2 text-xs font-bold">Abrir agenda</Link></div></div></section>
    <section className="glass-card overflow-hidden"><div className="border-b border-stone-900/8 p-4"><h2 className="font-semibold">Linha do tempo comercial</h2></div><div className="divide-y divide-stone-900/8">{timeline.length?timeline.slice(0,30).map((item,index)=><article key={`${item.type}-${item.date}-${index}`} className="grid gap-2 p-4 sm:grid-cols-[120px_150px_1fr]"><p className="text-xs font-bold text-stone-600">{date(item.date)}</p><p className="text-xs text-amber-800">{item.type}</p><div><p className="text-sm font-semibold capitalize">{item.title}</p><p className="mt-1 text-xs text-stone-500">{item.detail}</p></div></article>):<p className="p-4 text-sm text-stone-500">Nenhum evento registrado.</p>}</div></section>
  </div>;
}
