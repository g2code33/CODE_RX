import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ClientAccessScreen } from './ClientAccessScreen';
import { ClientProjectRoom, type ClientPortalContext } from './ClientProjectRoom';
import { clientPortal, clientPortalSession, ClientPortalError } from '../lib/cloudflare';
import { messageForFailure } from '../lib/accessKey';

/**
 * Reads a temporary link token out of `#client-portal/link/<token>`.
 */
const linkTokenFromHash = (): string => {
  const match = /^#client-portal\/link\/([^/?#]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : '';
};

/**
 * The token is a credential: once it has been exchanged it is removed from the
 * address bar so it cannot linger in history, a bookmark or a shared link.
 */
const stripLinkTokenFromUrl = () => {
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#client-portal`);
  } catch {
    /* history is unavailable in some embedded browsers */
  }
};

/**
 * The client portal shell: it owns the client session, decides whether to show
 * the access screen or the project room, and never trusts a stored copy of the
 * client's identity — the context always comes back from the server.
 */
export const ClientPortal = () => {
  const [context, setContext] = useState<ClientPortalContext | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const redeemedLink = useRef(false);

  const applySession = useCallback((session: { token: string; expiresAt: string }, data: any) => {
    clientPortalSession.write({ token: session.token, expiresAt: session.expiresAt });
    setContext({
      client: data.client,
      project: data.project,
      permissions: data.permissions || { view: true, download: false },
    });
    setNotice(null);
  }, []);

  // On load: redeem a link if the URL carries one, otherwise resume an existing
  // session by asking the server who it belongs to.
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const linkToken = linkTokenFromHash();
      if (linkToken) {
        if (redeemedLink.current) return;
        redeemedLink.current = true;
        stripLinkTokenFromUrl();
        try {
          const response = await clientPortal.redeemLink(linkToken);
          if (!cancelled) applySession(response.data.session, response.data);
        } catch (failure) {
          if (cancelled) return;
          const status = failure instanceof ClientPortalError ? failure.status : -1;
          const code = failure instanceof ClientPortalError ? failure.code : null;
          setNotice(messageForFailure(status, code));
        } finally {
          if (!cancelled) setChecking(false);
        }
        return;
      }

      const stored = clientPortalSession.read();
      if (!stored) {
        if (!cancelled) setChecking(false);
        return;
      }
      try {
        const response = await clientPortal.me();
        if (cancelled) return;
        applySession({ token: stored.token, expiresAt: response.data.session.expiresAt }, response.data);
      } catch (failure) {
        if (cancelled) return;
        const status = failure instanceof ClientPortalError ? failure.status : -1;
        clientPortalSession.clear();
        setNotice(messageForFailure(status, 'session_expired'));
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void bootstrap();
    return () => { cancelled = true; };
  }, [applySession]);

  const signIn = useCallback(async (accessKey: string) => {
    // Failures propagate so the access screen can show the exact state. The raw
    // key is only ever held in that component's state until this resolves.
    const response = await clientPortal.exchangeAccessKey(accessKey);
    applySession(response.data.session, response.data);
  }, [applySession]);

  const signOut = useCallback(() => {
    clientPortalSession.clear();
    setContext(null);
    setNotice('You have been signed out of the client portal.');
  }, []);

  const endSession = useCallback((message: string) => {
    clientPortalSession.clear();
    setContext(null);
    setNotice(message);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening your secure project room…
        </p>
      </div>
    );
  }

  if (!context) {
    return <ClientAccessScreen onSubmit={signIn} notice={notice} />;
  }

  return (
    <ClientProjectRoom
      context={context}
      notice={notice}
      onNotice={setNotice}
      onSignedOut={signOut}
      onSessionEnded={endSession}
    />
  );
};
