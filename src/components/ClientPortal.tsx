import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { ClientAccessScreen } from './ClientAccessScreen';
import { ClientLinkState } from './ClientLinkState';
import { ClientProjectRoom, type ClientPortalContext } from './ClientProjectRoom';
import { clientPortal, clientPortalSession, ClientPortalError } from '../lib/cloudflare';
import { messageForFailure } from '../lib/accessKey';
import { clientContact, linkStateScreen, type LinkStateScreen } from '../lib/linkAccess';

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
 * the access screen, a link end state, or the project room, and never trusts a
 * stored copy of the client's identity — the context always comes back from the
 * server.
 */
export const ClientPortal = ({ links }: { links?: Record<string, string> } = {}) => {
  // The society's contact details come from the published site content, so the
  // client screens and the public footer always agree.
  const contact = clientContact(links);
  const [context, setContext] = useState<ClientPortalContext | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // A link that requires the passkey: the token is held in memory only, never
  // in storage, and it is offered back to the server when the client signs in.
  const [pendingLink, setPendingLink] = useState<{ token: string } | null>(null);
  // A link that cannot be used at all — expired, revoked, exhausted, unknown.
  const [linkState, setLinkState] = useState<LinkStateScreen | null>(null);
  const redeemedLink = useRef(false);

  const applySession = useCallback((session: { token: string; expiresAt: string }, data: any) => {
    clientPortalSession.write({ token: session.token, expiresAt: session.expiresAt });
    setContext({
      client: data.client,
      project: data.project,
      permissions: data.permissions || { view: true, download: false },
      destination: data.destination || null,
      target: data.target || null,
    });
    setPendingLink(null);
    setLinkState(null);
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
          if (cancelled) return;
          const data = response.data || {};
          // REQUIRE_PASSKEY: the link names the destination, the passkey is
          // still the credential. Nothing is opened until it has been given.
          if (data.requiresPasskey) {
            setPendingLink({ token: linkToken });
            return;
          }
          if (!data.session) throw new ClientPortalError('This link could not be opened.', 0, 'link_invalid');
          applySession(data.session, data);
        } catch (failure) {
          if (cancelled) return;
          const status = failure instanceof ClientPortalError ? failure.status : -1;
          const code = failure instanceof ClientPortalError ? failure.code : null;
          const screen = linkStateScreen(code);
          if (screen) setLinkState(screen);
          else setNotice(messageForFailure(status, code));
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
    const response = await clientPortal.exchangeAccessKey(accessKey, pendingLink?.token);
    if (!response.data.session) {
      throw new ClientPortalError('Your session could not be started.', 0, 'unavailable');
    }
    applySession(response.data.session, response.data);
  }, [applySession, pendingLink]);

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

  if (linkState) {
    return (
      <ClientLinkState
        state={linkState}
        contact={contact}
        onContinue={() => {
          setLinkState(null);
          setPendingLink(null);
          setNotice(null);
        }}
      />
    );
  }

  if (!context) {
    return (
      <ClientAccessScreen
        onSubmit={signIn}
        notice={notice}
        contact={contact}
        // A passkey-required link explains itself before the key is typed.
        eyebrow={pendingLink ? 'Temporary project link' : undefined}
        heading={pendingLink ? 'SIGN IN TO CONTINUE' : undefined}
        helper={pendingLink
          ? 'This temporary link opens for you once your project access key is accepted.'
          : undefined}
        noticeIcon={pendingLink ? <KeyRound className="mt-0.5 h-4 w-4 shrink-0" /> : undefined}
        onAbandon={pendingLink ? () => { setPendingLink(null); setNotice(null); } : undefined}
      />
    );
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
