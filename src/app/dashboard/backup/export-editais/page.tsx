'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { db } from '../../../../lib/db';

export default function ExportEditaisPage() {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const all = await db.getLicitacoes();
      const editais = (all || []).map(l => ({
        id: l.id,
        numero_pregao: l.numero_pregao,
        edital: l.edital || null
      })).filter(x => x.edital !== null);

      const payload = JSON.stringify({ exported_at: new Date().toISOString(), count: editais.length, editais }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `editais-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar editais.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Exportar Editais</h1>
          <p className="text-sm text-slate-400 mt-1">Baixe um arquivo JSON com todos os editais anexados ao sistema.</p>
        </div>
        <Link
          href="/dashboard/backup/data"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
        >
          Voltar para Backup de Dados
        </Link>
      </div>

      <div className="glass-card p-6">
        <h4 className="text-lg font-semibold text-slate-200">Exportar Editais</h4>
        <p className="text-xs text-slate-400 mt-1">Baixe um arquivo JSON com todos os editais anexados ao sistema (inclui conteúdo base64 quando presente).</p>

        <div className="mt-6">
          <button onClick={handleExport} disabled={exporting} className="brand-button px-4 py-2 text-sm font-semibold">
            {exporting ? 'Exportando...' : 'Exportar Editais'}
          </button>
        </div>
      </div>
    </div>
  );
}
