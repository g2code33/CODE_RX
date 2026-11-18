import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Share, Smartphone, CheckCircle2 } from 'lucide-react';
import {
  hasBeenAsked, isInstalledApp, isProbablyIos, isPushEnabled, notificationPermission,
  notifySupport, requestNotificationPermission, setPushEnabled, showSystemNotification, subscribeToPush,
} from '../../lib/cgmNotify';
import { cgmStudent } from '../../lib/cgm';

/**
 * "Install this on your phone" — the honest card.
 *
 * Browsers decide when the install prompt may be shown; on Android/Chrome we
 * capture `beforeinstallprompt` and can raise it on a real press. On iPhone
 * there is no such API at all, so the card TELLS the student the exact two
 * taps (Share → Add to Home Screen) instead of pretending a button exists.
 * It hides itself the moment the app is already installed.
 */
export const InstallAppCard = ({ card, label }: { card: string; label: string }) => {
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(() => isInstalledApp());
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (event: any) => {
      // Keep the event so OUR button can raise it later (a browser ignores an
      // automatic prompt, and one shown on load is usually dismissed).
      event.preventDefault();
      setPromptEvent(event);
    };
    const onInstalled = () => { setInstalled(true); setOutcome('Installed — open it from your home screen.'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Already installed, or the browser gives us nothing to say: stay quiet
  // rather than show an install pitch to an installed app.
  if (installed) {
    return (
      <div className={`${card} flex items-center gap-2`} data-testid="cgm-install-installed">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-xs font-bold text-emerald-800">You are using the installed app.</p>
      </div>
    );
  }
  const ios = isProbablyIos();
  if (!promptEvent && !ios) return null;

  return (
    <div className={card} data-testid="cgm-install-card">
      <p className={`${label} flex items-center gap-1.5`}><Smartphone className="h-3.5 w-3.5" /> Install Classes &amp; Groups</p>
      {ios ? (
        <>
          <p className="mt-1 text-xs font-medium text-slate-600">
            On iPhone or iPad, add it from Safari so it opens like an app and can send you notifications:
            tap <Share className="inline h-3.5 w-3.5" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </p>
          <p className="mt-1.5 text-[11px] font-semibold text-amber-700">iPhone only sends notifications to the installed app — Safari tabs cannot receive them.</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs font-medium text-slate-600">Put the portal on your home screen — it opens full screen and can send you notices.</p>
          <button
            type="button"
            data-testid="cgm-install-button"
            className="mini-button mt-2"
            onClick={async () => {
              try {
                promptEvent.prompt();
                const choice = await promptEvent.userChoice;
                setOutcome(choice?.outcome === 'accepted' ? 'Installing…' : 'No problem — you can install any time.');
              } catch { setOutcome('Your browser did not offer the install prompt.'); }
              setPromptEvent(null);
            }}
          >
            <Download className="mr-1 inline h-3.5 w-3.5" /> Install the app
          </button>
        </>
      )}
      {outcome && <p role="status" className="mt-1.5 text-[11px] font-bold text-emerald-700">{outcome}</p>}
    </div>
  );
};

/**
 * Notifications on this device.
 *
 * The permission prompt only ever appears behind a press, because browsers
 * (and people) punish anything else. The wording is deliberately blunt about
 * the two cases that decide whether it can work at all: iPhone needs the app
 * installed, and a denied permission cannot be re-asked from the page.
 */
export const NotifyCard = ({ card, label }: { card: string; label: string }) => {
  const [permission, setPermission] = useState(() => notificationPermission());
  const [pushOn, setPushOn] = useState(() => isPushEnabled());
  const [busy, setBusy] = useState(false);
  const support = notifySupport();
  const installed = isInstalledApp();
  const ios = isProbablyIos();

  const ask = async () => {
    setBusy(true);
    try {
      const next = await requestNotificationPermission();
      setPermission(next);
      if (next === 'granted') {
        setPushEnabled(true);
        setPushOn(true);
        // Register the device with the server so notices arrive while the app
        // is closed. Where the deployment has no push keys this quietly does
        // nothing and the portal keeps raising notices itself.
        await subscribeToPush(
          () => cgmStudent.pushPublicKey(),
          (subscription) => cgmStudent.pushSubscribe(subscription),
        );
        await showSystemNotification(
          'Notifications are on',
          'You will hear from CODE Rx here — new announcements, meetings and approvals.',
          '#class-groups/student/notifications',
        );
      }
    } finally { setBusy(false); }
  };

  return (
    <div className={card} data-testid="cgm-notify-card">
      <p className={`${label} flex items-center gap-1.5`}><Bell className="h-3.5 w-3.5" /> Notifications on this phone</p>
      {support === 'unsupported' && (
        <p className="mt-1 text-xs font-medium text-slate-600">This browser cannot show system notifications. Notices always appear in the portal.</p>
      )}
      {support !== 'unsupported' && permission === 'granted' && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-emerald-700" data-testid="cgm-notify-granted">
            <CheckCircle2 className="h-3.5 w-3.5" /> On — CODE Rx notices appear in your phone's notifications.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="cgm-notify-test"
              className="mini-button"
              onClick={() => void showSystemNotification(
                'CODE Rx test notice',
                'This is how a real notice will look on your phone.',
                '#class-groups/student/notifications',
              )}
            >
              Send a test
            </button>
            <button
              type="button"
              className="mini-button"
              data-testid="cgm-notify-toggle"
              onClick={() => {
                const next = !pushOn;
                setPushOn(next); setPushEnabled(next);
                if (!next) {
                  navigator.serviceWorker?.getRegistration?.('/').then((registration) => registration?.pushManager?.getSubscription())
                    .then((subscription) => cgmStudent.pushUnsubscribe(subscription?.endpoint))
                    .catch(() => undefined);
                }
              }}
            >
              {pushOn ? 'Pause notices' : 'Resume notices'}
            </button>
          </div>
          {!installed && ios && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-700">Tip: on iPhone, installing the app (Share → Add to Home Screen) is what lets notices arrive when it is closed.</p>
          )}
        </>
      )}
      {support !== 'unsupported' && permission === 'default' && (
        <>
          <p className="mt-1 text-xs font-medium text-slate-600">
            Turn this on and CODE Rx notices — announcements, meetings, approvals — show up in your phone's notification shade, not just inside the portal.
          </p>
          {ios && !installed && (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-700">On iPhone: install the app first (Share → Add to Home Screen), then switch this on from the installed app.</p>
          )}
          <button type="button" disabled={busy} data-testid="cgm-notify-enable" className="mini-button mt-2" onClick={() => void ask()}>
            <Bell className="mr-1 inline h-3.5 w-3.5" /> {busy ? 'Asking…' : 'Turn on notifications'}
          </button>
          {hasBeenAsked() && <p className="mt-1 text-[11px] font-medium text-slate-400">Your browser may have kept an earlier choice — check the site settings if no prompt appears.</p>}
        </>
      )}
      {support !== 'unsupported' && permission === 'denied' && (
        <>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-amber-800" data-testid="cgm-notify-denied">
            <BellOff className="h-3.5 w-3.5" /> Blocked in this browser.
          </p>
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            The page cannot ask again. Open your browser's site settings (the padlock by the address), allow notifications for this site, then reload. Notices still appear inside the portal meanwhile.
          </p>
        </>
      )}
    </div>
  );
};
