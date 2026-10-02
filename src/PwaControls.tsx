import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaControls({ busy }: { busy: boolean }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  const [installing, setInstalling] = useState(false);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); setHelp(false); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  async function install() {
    if (!installEvent) { setHelp(!help); return; }
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') setHelp(false);
    } catch { setHelp(true); }
    finally { setInstallEvent(null); setInstalling(false); }
  }
  return <>
    {!installed && <button type="button" className="install-button" onClick={() => void install()} disabled={installing} aria-expanded={help}><Download size={15} /> Install</button>}
    {help && <div className="pwa-notice" role="status"><button className="icon-button" onClick={() => setHelp(false)} aria-label="Close install instructions"><X size={16} /></button><strong>Install Margin</strong><p>On iPhone or iPad: open in Safari, tap Share, then Add to Home Screen. On Android or desktop: open your browser menu and choose Install app or Add to Home screen, if available.</p><p>The app opens offline after an online visit. AI answers and web search need internet. Chats are kept only while this app stays open.</p></div>}
    {needRefresh && <div className="pwa-notice" role="status"><strong>A new version is ready</strong><p>Updating reloads Margin and clears this conversation. Update when you’re finished.</p><button onClick={() => void updateServiceWorker(true)} disabled={busy}>Update now</button><button onClick={() => setNeedRefresh(false)}>Later</button></div>}
  </>;
}
