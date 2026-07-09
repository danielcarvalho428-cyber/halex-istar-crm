"use client";
import { useEffect, useState } from "react";
import { FileImage, Mail, RefreshCw, Save, Upload } from "lucide-react";

type EmailForm = {
  email: string;
  appPassword: string;
  senderName: string;
  signatureName: string;
  signatureRole: string;
  phone: string;
};

export default function SettingsPage() {
  const [file, setFile] = useState("");
  const [logos, setLogos] = useState<string[]>([]);
  const [hasPassword, setHasPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateNotice, setUpdateNotice] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [emailForm, setEmailForm] = useState<EmailForm>({
    email: "",
    appPassword: "",
    senderName: "",
    signatureName: "",
    signatureRole: "",
    phone: "",
  });
  useEffect(() => {
    window.halexDesktop?.settings
      .getLetterhead()
      .then((current) => {
        if (current) setFile(current.fileName);
      })
      .catch(() => {});
    window.halexDesktop?.settings
      .getEmail()
      .then((current) => {
        if (!current) return;
        setEmailForm((value) => ({
          ...value,
          email: current.email || value.email,
          senderName: current.senderName || value.senderName,
          signatureName: current.signatureName || value.signatureName,
          signatureRole: current.signatureRole || value.signatureRole,
          phone: current.phone || value.phone,
        }));
        setLogos(current.logoFiles.map((logo) => logo.fileName));
        setHasPassword(current.hasAppPassword);
      })
      .catch(() => {});
  }, []);
  async function chooseLetterhead(event: React.MouseEvent<HTMLLabelElement>) {
    if (!window.halexDesktop) return;
    event.preventDefault();
    const selected = await window.halexDesktop.settings.chooseLetterhead();
    if (selected) setFile(selected.split(/[\\/]/).at(-1) || selected);
  }
  function updateEmail(field: keyof EmailForm, value: string) {
    setEmailForm((current) => ({ ...current, [field]: value }));
  }
  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    try {
      if (!window.halexDesktop) {
        throw new Error("A configuração segura de e-mail está disponível no aplicativo instalado.");
      }
      await window.halexDesktop.settings.saveEmail(emailForm);
      setHasPassword(hasPassword || Boolean(emailForm.appPassword));
      setEmailForm((current) => ({ ...current, appPassword: "" }));
      setNotice("Configuração de e-mail salva e protegida pelo Windows.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    }
  }
  async function chooseLogos() {
    const selected = await window.halexDesktop?.settings.chooseEmailLogos();
    if (selected) setLogos(selected);
  }
  async function testEmail() {
    setTestingEmail(true);
    setNotice("");
    setError("");
    try {
      if (!window.halexDesktop) throw new Error("Abra o aplicativo instalado para testar o Gmail.");
      await window.halexDesktop.settings.testEmail();
      setNotice("Conexão autenticada com o Gmail. Nenhum e-mail foi enviado.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao autenticar com o Gmail.");
    } finally {
      setTestingEmail(false);
    }
  }
  async function checkForUpdates() {
    setCheckingUpdate(true);
    setUpdateNotice("");
    setUpdateError("");
    try {
      if (!window.halexDesktop) throw new Error("Abra o aplicativo instalado para verificar atualizações.");
      const result = await window.halexDesktop.updates.check();
      setUpdateNotice(result.available
        ? `Versão ${result.latestVersion} encontrada. Use a janela de atualização para baixar.`
        : `O aplicativo já está atualizado na versão ${result.currentVersion}.`);
    } catch (caught) {
      setUpdateError(caught instanceof Error ? caught.message : "Não foi possível verificar atualizações.");
    } finally {
      setCheckingUpdate(false);
    }
  }
  return (
    <div className="space-y-6">
      <header className="page-hero">
        <p className="lumina-kicker">Aplicativo</p>
        <h1 className="mt-2">Configurações</h1>
        <p className="mt-2 text-sm text-stone-500">
          Configure documentos, identidade visual e a conta de faturamento.
        </p>
      </header>
      <section className="glass-card max-w-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Atualizações do aplicativo</h2>
            <p className="mt-1 text-xs text-stone-500">
              Verifique manualmente sem precisar fechar e abrir o sistema.
            </p>
          </div>
          <button type="button" disabled={checkingUpdate} onClick={() => void checkForUpdates()} className="brand-secondary inline-flex items-center gap-2 px-4 py-2 text-sm font-bold disabled:opacity-50">
            <RefreshCw size={15} className={checkingUpdate ? "animate-spin" : ""} />
            {checkingUpdate ? "Verificando..." : "Verificar atualizações"}
          </button>
        </div>
        {updateError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{updateError}</p>}
        {updateNotice && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{updateNotice}</p>}
      </section>
      <section className="glass-card max-w-3xl p-6">
        <div className="flex items-center gap-3">
          <div className="metric-icon">
            <FileImage size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Halex Istar</h2>
            <p className="mt-1 text-xs text-stone-500">
              PDF, PNG ou JPG em alta resolução.
            </p>
          </div>
        </div>
        <label
          onClick={(event) => void chooseLetterhead(event)}
          className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 p-6 text-center hover:border-amber-500"
        >
          <Upload size={24} className="text-amber-700" />
          <p className="mt-3 text-sm font-semibold">
            Selecionar papel timbrado
          </p>
          <p className="mt-1 text-xs text-stone-500">
            PNG ou JPG será aplicado diretamente à cotação. O arquivo fica
            armazenado somente neste computador.
          </p>
          <input
            type="file"
            accept=".pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0]?.name || "")}
          />
        </label>
        {file && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Selecionado: {file}
          </p>
        )}
      </section>

      <section className="glass-card max-w-3xl p-6">
        <div className="flex items-center gap-3">
          <div className="metric-icon"><Mail size={18} /></div>
          <div>
            <h2 className="font-semibold">Gmail de faturamento</h2>
            <p className="mt-1 text-xs text-stone-500">
              A senha de aplicativo é criptografada localmente pelo Windows e nunca aparece novamente.
            </p>
          </div>
        </div>
        <form onSubmit={(event) => void saveEmail(event)} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold sm:col-span-2">
            Conta Gmail
            <input type="email" required className="form-input mt-2 w-full" value={emailForm.email} onChange={(event) => updateEmail("email", event.target.value)} />
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            Senha de aplicativo {hasPassword && <span className="font-normal text-emerald-700">— configurada</span>}
            <input type="password" className="form-input mt-2 w-full" placeholder={hasPassword ? "Deixe vazio para manter a senha atual" : "16 caracteres gerados pelo Google"} value={emailForm.appPassword} onChange={(event) => updateEmail("appPassword", event.target.value)} />
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            Nome do remetente
            <input required className="form-input mt-2 w-full" value={emailForm.senderName} onChange={(event) => updateEmail("senderName", event.target.value)} />
          </label>
          <label className="text-xs font-bold">
            Nome na assinatura
            <input required className="form-input mt-2 w-full" value={emailForm.signatureName} onChange={(event) => updateEmail("signatureName", event.target.value)} />
          </label>
          <label className="text-xs font-bold">
            Telefone
            <input required className="form-input mt-2 w-full" value={emailForm.phone} onChange={(event) => updateEmail("phone", event.target.value)} />
          </label>
          <label className="text-xs font-bold sm:col-span-2">
            Função
            <input required className="form-input mt-2 w-full" value={emailForm.signatureRole} onChange={(event) => updateEmail("signatureRole", event.target.value)} />
          </label>
          <div className="sm:col-span-2 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold">Logotipos da assinatura</p>
                <p className="mt-1 text-xs text-stone-500">Selecione Halex Istar, Isofarma e Medicone em PNG.</p>
              </div>
              <button type="button" onClick={() => void chooseLogos()} className="brand-secondary px-3 py-2 text-xs font-bold">Selecionar logos</button>
            </div>
            {logos.length > 0 && <p className="mt-3 text-xs text-emerald-700">{logos.join(" · ")}</p>}
          </div>
          {error && <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="sm:col-span-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={testingEmail || !hasPassword} onClick={() => void testEmail()} className="brand-secondary px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">
              {testingEmail ? "Testando..." : "Testar conexão"}
            </button>
            <button type="submit" className="brand-button inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"><Save size={15} /> Salvar e proteger</button>
          </div>
        </form>
      </section>
    </div>
  );
}
