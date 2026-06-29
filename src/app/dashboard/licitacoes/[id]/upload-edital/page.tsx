'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '../../../../../lib/db';

const MAX_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;

export default function UploadEditalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const licitacaoId = params.id;
  const [fileName, setFileName] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      alert('O arquivo excede o limite de 2,5 MB.');
      e.target.value = '';
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      // Data URL or plain text — store as base64 for portability
      let base64: string | null = null;
      try {
        if (content.startsWith('data:')) {
          // keep data URL but strip prefix
          base64 = content.split(',')[1];
        } else {
          base64 = btoa(unescape(encodeURIComponent(content)));
        }
      } catch (err) {
        console.warn('Failed to base64-encode file content, storing metadata only.', err);
        base64 = null;
      }
      try {
        await db.attachEdital(licitacaoId, {
          name: file.name,
          uploaded_at: new Date().toISOString(),
          contentBase64: base64,
          mime: file.type || 'application/octet-stream'
        });
        alert('Edital anexado com sucesso.');
        router.push(`/dashboard/licitacoes/${licitacaoId}`);
      } catch (err) {
        console.error(err);
        alert('Erro ao anexar edital.');
      }
    };

    if (file.type.startsWith('text/') || file.type === '' ) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Anexar Edital</h1>
          <p className="text-sm text-slate-400 mt-1">Carregue um arquivo de edital para esta licitação e torne-o disponível para consulta interna.</p>
        </div>
        <Link
          href={licitacaoId ? `/dashboard/licitacoes/${licitacaoId}` : '/dashboard/licitacoes'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
        >
          <ArrowLeft size={14} /> Voltar à Licitação
        </Link>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-lg font-bold text-slate-200">Anexar Edital</h3>
        <p className="text-xs text-slate-400 mt-1">Anexe o arquivo do edital para referência futura. O arquivo ficará disponível para consulta interna.</p>

        <div className="mt-4">
          <input
            id="editais-file-input"
            type="file"
            accept=".pdf,application/pdf,.doc,.docx,.txt,image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => document.getElementById('editais-file-input')?.click()}
            className="brand-button px-4 py-2 text-sm font-semibold"
          >
            Selecionar arquivo
          </button>
        </div>

        {fileName && (
          <div className="mt-4 text-sm text-slate-300">Arquivo selecionado: {fileName}</div>
        )}
      </div>
    </div>
  );
}
