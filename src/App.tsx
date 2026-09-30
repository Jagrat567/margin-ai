import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, BookOpen, Check, ChevronRight, CircleHelp, Code2, Cpu, Layers3, Menu, MessageSquare, Moon, PanelLeftClose, Plus, Settings2, Sparkles, Square, Sun, X } from 'lucide-react';
import type { AppStatus, ChatMessage } from '../shared/types';
import { api, streamChat } from './api';
import { applyTheme, initialTheme } from './theme';
const Markdown = lazy(() => import('./Markdown'));

const prompts = [
  { icon: Layers3, title: 'Explain a concept', text: 'Explain recursion with a simple example.' },
  { icon: Code2, title: 'Understand code', text: 'Show me how a stack works with a Python example.' },
  { icon: Cpu, title: 'Compare ideas', text: 'How are processes and threads different?' },
];

export default function App() {
  const [theme, setTheme] = useState(initialTheme);
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next, true); setTheme(next);
  }
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const followScroll = useRef(true);

  async function refresh() {
    setConnecting(true);
    try { setStatus(await api<AppStatus>('/status')); }
    catch (e) { setError((e as Error).message); }
    finally { setConnecting(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (followScroll.current) bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [messages, busy]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => { if (setup) setupRef.current?.showModal(); else setupRef.current?.close(); }, [setup]);

  async function send(event?: FormEvent, question = input) {
    event?.preventDefault();
    if (!question.trim() || requestRef.current || busy) return;
    if (!status) { setError('The server is still connecting. Please try again in a moment.'); void refresh(); return; }
    if (!status.chatReady) { setSetup(true); return; }
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question.trim() };
    const next = [...messages, user];
    const assistantId = crypto.randomUUID();
    const controller = new AbortController(); requestRef.current = controller;
    let partial = '';
    followScroll.current = true;
    setMessages([...next, { id: assistantId, role: 'assistant', content: '', state: 'streaming' }]); setInput(''); setError(''); setBusy(true);
    try {
      const result = await streamChat({ message: user.content, history: messages.filter(m => !m.state).slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 6000) })) }, controller.signal, text => {
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
  const locked = busy;

  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    {sidebar && <button className="sidebar-scrim" aria-label="Close sidebar" onClick={() => setSidebar(false)} />}
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
      <div className="sidebar-top"><button className="brand" onClick={newChat} disabled={busy} aria-label="Margin home"><span className="brand-mark">m<span>.</span></span><span className="brand-name">margin</span></button><button className="collapse-button icon-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={18} /></button><button className="mobile-close icon-button" aria-label="Close sidebar" onClick={() => setSidebar(false)}><X size={19} /></button></div>
      <button className="new-chat" onClick={newChat} disabled={busy} title="New chat"><Plus size={19} /><span>New chat</span></button>
      <button className="workspace-link" title="Study chat" onClick={() => { setSidebar(false); textRef.current?.focus(); }}><MessageSquare size={18} /><span>Study chat</span></button>
      <div className="document-section">
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
            <div className="message-body"><div className="message-label">{message.role === 'assistant' ? 'Margin' : 'You'}{message.state === 'streaming' && <span className="stream-label">{message.content ? 'Writing…' : 'Thinking…'}</span>}</div>
              {message.content ? <div className={`markdown ${message.state === 'streaming' ? 'streaming-text' : ''}`}><Suspense fallback={<p>{message.content}</p>}><Markdown>{message.content}</Markdown></Suspense></div> : message.state === 'streaming' && <div className="thinking-dots" role="status" aria-label="Preparing answer"><span /><span /><span /></div>}
              {(message.state === 'stopped' || message.state === 'failed') && <div className="incomplete-note">{message.state === 'stopped' ? 'Stopped' : 'Interrupted'} · Partial answer</div>}
            </div>
          </article>)}
          <div ref={bottomRef} />
        </section>}
      </div>
      <div className="composer-area">
        {connecting && <div className="setup-banner" role="status">Connecting to Margin… The server may take a moment to wake up.</div>}
        {error && <div className="error-banner" role="alert"><CircleHelp size={17} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {status && !status.chatReady && <div className="setup-banner"><span><span className="setup-dot" /> Your workspace is ready. Connect the AI to start chatting.</span><button onClick={() => setSetup(true)}>Set up <ChevronRight size={14} /></button></div>}
        <form className="composer" onSubmit={send}>
          <textarea ref={textRef} value={input} onChange={e => setInput(e.target.value)} maxLength={4000} rows={2} placeholder="Ask a question. Explore an idea. Make it click." aria-label="Your question" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} disabled={busy} />
          <div className="composer-toolbar"><div className="composer-context"><span className="context-label"><Sparkles size={14} /> Ask anything CS</span></div>{busy ? <button className="send-button stop-button" type="button" aria-label="Stop generating" title="Stop generating" onClick={() => requestRef.current?.abort()}><Square size={15} fill="currentColor" /></button> : <button className="send-button" type="submit" aria-label="Send question" disabled={!input.trim() || locked}><ArrowUp size={21} /></button>}</div>
        </form><p className="composer-disclaimer">AI can make mistakes. Check important details.</p>
      </div>
      {!messages.length && <div className="starter-area"><div className="prompt-grid">{prompts.map(({ icon: Icon, title, text }) => <button className="prompt-card" key={title} onClick={() => { setInput(text); textRef.current?.focus(); }}><Icon size={16} /><span>{title}</span></button>)}</div><div className="welcome-footnote"><BookOpen size={14} /> From the first question to the lightbulb moment.</div></div>}
    </main>

    <dialog ref={setupRef} className="modal setup-modal" onCancel={() => setSetup(false)} onClick={e => { if (e.target === e.currentTarget) setSetup(false); }}>
      <div className="modal-header"><span className="modal-icon"><Settings2 size={22} /></span><button className="icon-button" aria-label="Close setup" onClick={() => setSetup(false)}><X size={21} /></button></div>
      <h2>Connect your study companion</h2><p>The app is installed. Add your service credentials in the server’s <code>.env</code> file to activate live answers. Never paste keys into chat.</p>
      <div className="connection-list">{[
        { name: 'Groq', detail: 'Free-tier AI answers', keys: ['GROQ_API_KEY'], url: 'https://console.groq.com/keys' },
      ].map(item => <div className="connection" key={item.name}><span className={`connection-check ${status && !item.keys.some(key => status.missing.includes(key)) ? 'connected' : ''}`}>{status && !item.keys.some(key => status.missing.includes(key)) ? <Check size={17} /> : <span />}</span><div><strong>{item.name}</strong><small>{item.detail}</small></div><a href={item.url} target="_blank" rel="noreferrer">Open <ChevronRight size={14} /></a></div>)}</div>
      <p className="setup-instruction">Follow <strong>README.md</strong> in the project folder to configure Groq, then restart the server.</p><button className="primary-button" onClick={() => void refresh()}>Check configuration</button><small className="config-note">These indicators check configuration only. Use <code>npm run check:services</code> to verify connections.</small>
    </dialog>
  </div>;
}
