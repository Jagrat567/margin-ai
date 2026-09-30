import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, BookOpen, Check, ChevronRight, CircleHelp, Code2, Cpu, FileText, Layers3, LoaderCircle, Menu, MessageSquare, Moon, PanelLeftClose, Paperclip, Plus, Settings2, Sparkles, Square, Sun, Trash2, Upload, X } from 'lucide-react';
import type { AppStatus, ChatMessage, Source } from '../shared/types';
import { api, streamChat } from './api';
import { applyTheme, initialTheme } from './theme';
const Markdown = lazy(() => import('./Markdown'));

const prompts = [
  { icon: Layers3, title: 'Explain a concept', text: 'Explain recursion with a simple example.' },
  { icon: Code2, title: 'Understand code', text: 'Show me how a stack works with a Python example.' },
  { icon: Cpu, title: 'Compare ideas', text: 'How are processes and threads different?' },
];
const labels = { pdf: 'From your PDF', general: 'General knowledge', mixed: 'PDF + additional explanation', insufficient: 'Not enough evidence' };

export default function App() {
  const [theme, setTheme] = useState(initialTheme);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true); setTheme(next);
  }
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [strict, setStrict] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<HTMLDialogElement>(null);
  const sourceRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const followScroll = useRef(true);
  const document = status?.document;
  const processing = document?.status === 'processing';

  async function refresh() {
    try { setStatus(await api<AppStatus>('/status')); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!processing) return; const timer = setInterval(() => void refresh(), 2000); return () => clearInterval(timer); }, [processing]);
  useEffect(() => { if (followScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [messages, busy]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { if (setup) setupRef.current?.showModal(); else setupRef.current?.close(); }, [setup]);
  useEffect(() => { if (source) sourceRef.current?.showModal(); else sourceRef.current?.close(); }, [source]);

  async function upload(file?: File) {
    if (!file || busy || uploading || processing) return;
    setError('');
    if (!status?.pdfReady) { setSetup(true); return; }
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Please choose a PDF file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Please choose a PDF smaller than 10 MB.'); return; }
    setUploading(true);
    try {
      const body = new FormData(); body.append('pdf', file);
      await api('/documents', { method: 'POST', body });
      setMessages([]); setSource(null); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); if (uploadRef.current) uploadRef.current.value = ''; }
  }

  async function removeDocument() {
    if (!document || busy || uploading) return;
    setUploading(true); setError('');
    try { await api(`/documents/${document.id}`, { method: 'DELETE' }); setMessages([]); setStrict(false); setSource(null); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setUploading(false); }
  }

  async function send(event?: FormEvent, question = input) {
    event?.preventDefault();
    if (!question.trim() || requestRef.current || busy || uploading || (strict && processing)) return;
    if (!status?.chatReady) { setSetup(true); return; }
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question.trim() };
    const next = [...messages, user];
    const assistantId = crypto.randomUUID();
    const controller = new AbortController(); requestRef.current = controller;
    let partial = '';
    followScroll.current = true;
    setMessages([...next, { id: assistantId, role: 'assistant', content: '', state: 'streaming' }]); setInput(''); setError(''); setBusy(true);
    try {
      const result = await streamChat({ message: user.content, history: messages.filter(m => !m.state).slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 6000) })), documentId: document?.status === 'ready' ? document.id : null, strict }, controller.signal, text => {
        partial += text;
        setMessages(current => current.map(m => m.id === assistantId ? { ...m, content: partial } : m));
      });
      setMessages(current => current.map(m => m.id === assistantId ? { id: assistantId, role: 'assistant', ...result } : m));
    } catch (e) {
      if (controller.signal.aborted) {
        setMessages(current => current.map(m => m.id === assistantId ? { ...m, content: partial || 'Response stopped.', state: 'stopped' } : m));
      } else if (partial) {
        setMessages(current => current.map(m => m.id === assistantId ? { ...m, state: 'failed' } : m));
        setError((e as Error).message);
      } else { setMessages(messages); setInput(question); setError((e as Error).message); }
    } finally { requestRef.current = null; setBusy(false); textRef.current?.focus(); }
  }

  function newChat() { if (busy) return; setMessages([]); setError(''); setInput(''); setSidebar(false); textRef.current?.focus(); }
  const locked = busy || uploading;

  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    {sidebar && <button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
      <div className="sidebar-top"><button className="brand" onClick={newChat} disabled={busy} aria-label="Margin home"><span className="brand-mark">m<span>.</span></span><span className="brand-name">margin</span></button><button className="collapse-button icon-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={18} /></button><button className="mobile-close icon-button" aria-label="Close sidebar" onClick={() => setSidebar(false)}><X size={19} /></button></div>
      <button className="new-chat" onClick={newChat} disabled={busy} title="New chat"><Plus size={19} /><span>New chat</span></button>
      <button className="workspace-link" title="Study chat" onClick={() => { setSidebar(false); textRef.current?.focus(); }}><MessageSquare size={18} /><span>Study chat</span></button>
      <button className="workspace-link" title="Upload PDF" disabled={locked || processing} onClick={() => status?.pdfReady ? uploadRef.current?.click() : setSetup(true)}><BookOpen size={18} /><span>Your notes</span></button>
      <div className="document-section">
        <div className="sidebar-section-label document-heading">Study material <span>{document ? '1 file' : ''}</span></div>
        {document ? <div className="document-card">
          <div className="file-icon"><FileText size={21} /></div>
          <strong title={document.name}>{document.name}</strong>
          <span className={`document-state ${document.status}`}>
            {processing ? <LoaderCircle size={13} className="spin" /> : document.status === 'ready' ? <Check size={13} /> : <CircleHelp size={13} />}
            {processing ? document.stage : document.status === 'ready' ? `${document.pages} pages · Ready to explore` : 'Processing failed'}
          </span>
          {document.error && <p className="file-error">{document.error}</p>}
          {processing && <div className="processing-bar"><span /></div>}
          <div className="document-actions"><button disabled={locked || processing} onClick={() => uploadRef.current?.click()}>Replace PDF</button><button aria-label="Remove PDF" disabled={locked || processing} onClick={() => void removeDocument()}><Trash2 size={15} /></button></div>
        </div> : <button className={`upload-zone ${dragging ? 'dragging' : ''}`} disabled={locked} onClick={() => status?.pdfReady ? uploadRef.current?.click() : setSetup(true)} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]); }}>
          <span className="upload-icon">{uploading ? <LoaderCircle size={21} className="spin" /> : <Upload size={21} />}</span>
          <strong>{uploading ? 'Uploading…' : 'Add a PDF'}</strong>
          <span>Drop your notes here</span><small>PDF · up to 10 MB</small>
        </button>}
        <input ref={uploadRef} type="file" accept="application/pdf,.pdf" hidden aria-label="Upload PDF" onChange={e => void upload(e.target.files?.[0])} />
        {!!messages.length && <div className="session-item"><div className="sidebar-section-label">This conversation</div><button onClick={() => { setSidebar(false); textRef.current?.focus(); }} title={messages[0].content}><MessageSquare size={15} /><span>{messages[0].content}</span></button></div>}
      </div>
    </aside>

    <main className={`main-panel ${!messages.length ? 'empty-chat' : ''}`}>
      <header className="topbar"><div className="topbar-title"><button className="mobile-menu icon-button" aria-label="Open sidebar" onClick={() => setSidebar(true)}><Menu size={21} /></button><span>Study companion</span></div><div className="topbar-actions"><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div></header>
      <div className="chat-area" onScroll={e => { const el = e.currentTarget; followScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
        {!messages.length ? <section className="welcome">
          <h1>margin<span>.</span></h1>
          <p className="welcome-copy">Big questions. Clear answers. Built by <strong className="creator-name">Jagrat</strong></p>
        </section> : <section className="conversation" aria-label="Conversation" aria-live="polite">
          {messages.map(message => <article key={message.id} className={`message ${message.role}`}>
            <div className="message-avatar">{message.role === 'assistant' ? 'm' : 'Y'}</div>
            <div className="message-body"><div className="message-label">{message.role === 'assistant' ? 'Margin' : 'You'}{message.basis && <span className={`answer-badge ${message.basis}`}>{labels[message.basis]}</span>}{message.state === 'streaming' && <span className="stream-label">{message.content ? 'Writing…' : document?.status === 'ready' ? 'Reading your notes…' : 'Thinking…'}</span>}</div>
              {message.content ? <div className={`markdown ${message.state === 'streaming' ? 'streaming-text' : ''}`}><Suspense fallback={<p>{message.content}</p>}><Markdown>{message.content}</Markdown></Suspense></div> : message.state === 'streaming' && <div className="thinking-dots" role="status" aria-label="Preparing answer"><span /><span /><span /></div>}
              {(message.state === 'stopped' || message.state === 'failed') && <div className="incomplete-note">{message.state === 'stopped' ? 'Stopped' : 'Interrupted'} · Partial answer, sources not verified</div>}
              {!!message.sources?.length && <div className="sources"><span>Sources</span>{message.sources.map(s => <button key={s.id} onClick={() => setSource(s)}><FileText size={13} />[{s.id}] Page {s.page}</button>)}</div>}
            </div>
          </article>)}
          <div ref={bottomRef} />
        </section>}
      </div>
      <div className="composer-area">
        {error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {status && !status.chatReady && <div className="setup-banner"><span><span className="setup-dot" /> Your workspace is ready. Connect the AI to start chatting.</span><button onClick={() => setSetup(true)}>Set up <ChevronRight size={14} /></button></div>}
        <form className="composer" onSubmit={send}>
          <textarea ref={textRef} value={input} onChange={e => setInput(e.target.value)} maxLength={4000} rows={2} placeholder={document?.status === 'ready' ? 'Ask about your notes, or anything computer science…' : 'Ask a question. Explore an idea. Make it click.'} aria-label="Your question" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} disabled={busy} />
          <div className="composer-toolbar"><div className="composer-context"><button type="button" className="attach-button" aria-label="Attach PDF" title="Attach a PDF" disabled={locked || processing} onClick={() => status?.pdfReady ? uploadRef.current?.click() : setSetup(true)}><Paperclip size={20} /></button><span className="context-label">{processing ? <><LoaderCircle size={14} className="spin" /> Processing PDF</> : document?.status === 'ready' ? <><FileText size={14} /> PDF connected</> : <><Sparkles size={14} /> Ask anything CS</>}</span>{document?.status === 'ready' && <label className="strict-toggle"><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} disabled={busy} /> PDF only</label>}</div>{busy ? <button className="send-button stop-button" type="button" aria-label="Stop generating" title="Stop generating" onClick={() => requestRef.current?.abort()}><Square size={15} fill="currentColor" /></button> : <button className="send-button" type="submit" aria-label="Send question" disabled={!input.trim() || locked || (strict && processing)}><ArrowUp size={21} /></button>}</div>
        </form><p className="composer-disclaimer">AI can make mistakes. Check important details.</p>
      </div>
      {!messages.length && <div className="starter-area"><div className="prompt-grid">{prompts.map(({ icon: Icon, title, text }) => <button className="prompt-card" key={title} onClick={() => { setInput(text); textRef.current?.focus(); }}><Icon size={16} /><span>{title}</span></button>)}<button className="prompt-card" disabled={locked || processing} onClick={() => status?.pdfReady ? uploadRef.current?.click() : setSetup(true)}><FileText size={16} /><span>Chat with a PDF</span></button></div><div className="welcome-footnote"><BookOpen size={14} /> From the first question to the lightbulb moment.</div></div>}
    </main>

    <dialog ref={setupRef} className="modal setup-modal" onCancel={() => setSetup(false)} onClick={e => { if (e.target === e.currentTarget) setSetup(false); }}>
      <div className="modal-header"><span className="modal-icon"><Settings2 size={22} /></span><button className="icon-button" aria-label="Close setup" onClick={() => setSetup(false)}><X size={21} /></button></div>
      <h2>Connect your study companion</h2><p>The app is installed. Add your service credentials in the server’s <code>.env</code> file to activate live answers. Never paste keys into chat.</p>
      <div className="connection-list">{[
        { name: 'Groq', detail: 'Free-tier AI answers', keys: ['GROQ_API_KEY'], url: 'https://console.groq.com/keys' },
        { name: 'Pinecone', detail: '384-dimensional cosine vector index', keys: ['PINECONE_API_KEY', 'PINECONE_INDEX_HOST'], url: 'https://app.pinecone.io' },
        { name: 'Supabase', detail: 'Private PDFs and document metadata', keys: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], url: 'https://supabase.com/dashboard' },
      ].map(item => <div className="connection" key={item.name}><span className={`connection-check ${status && !item.keys.some(key => status.missing.includes(key)) ? 'connected' : ''}`}>{status && !item.keys.some(key => status.missing.includes(key)) ? <Check size={17} /> : <span />}</span><div><strong>{item.name}</strong><small>{item.detail}</small></div><a href={item.url} target="_blank" rel="noreferrer">Open <ChevronRight size={14} /></a></div>)}</div>
      <p className="setup-instruction">Follow <strong>README.md</strong> in the project folder, run the Supabase schema, then restart the server. Embeddings run locally using a free model.</p><button className="primary-button" onClick={() => void refresh()}>Check configuration</button><small className="config-note">These indicators check configuration only. Use <code>npm run check:services</code> to verify connections.</small>
    </dialog>
    <dialog ref={sourceRef} className="modal source-modal" onCancel={() => setSource(null)} onClick={e => { if (e.target === e.currentTarget) setSource(null); }}>
      {source && <><div className="modal-header"><span className="modal-icon"><FileText size={23} /></span><button className="icon-button" aria-label="Close source" onClick={() => setSource(null)}><X size={21} /></button></div><div className="eyebrow">SOURCE [{source.id}] · PDF PAGE {source.page}</div><h2>{source.filename}</h2><blockquote>{source.text}</blockquote><a className="primary-button" href={`/api/documents/${source.documentId}/file#page=${source.page}`} target="_blank" rel="noreferrer">Open PDF at page {source.page}</a><small className="config-note">Page numbers refer to the PDF’s physical pages.</small></>}
    </dialog>
  </div>;
}
