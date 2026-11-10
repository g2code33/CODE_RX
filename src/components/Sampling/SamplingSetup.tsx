import { useMemo, useState } from 'react';
import { ArrowLeft, Dices, Minus, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { sampling, type OrganizerGameBundle } from '../../lib/sampling';

/**
 * CODE Rx — Sampling: game setup.
 *
 * One screen, three decisions: how far the numbers go, how many teams play and
 * what they are called. Everything is validated here AND again on the server —
 * the server is the authority, this only saves a round trip.
 */

const MAX_TEAMS = 40;
const MAX_TOTAL = 2000;

const defaultNames = (count: number): string[] => {
  const out: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    let remaining = index;
    let suffix = '';
    while (remaining > 0) {
      const remainder = (remaining - 1) % 26;
      suffix = String.fromCharCode(65 + remainder) + suffix;
      remaining = Math.floor((remaining - 1) / 26);
    }
    out.push(`Team ${suffix}`);
  }
  return out;
};

export const SamplingSetup = ({ onCancel, onCreated }: {
  onCancel: () => void;
  onCreated: (bundle: OrganizerGameBundle) => void;
}) => {
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('100');
  const [instructions, setInstructions] = useState('');
  const [names, setNames] = useState<string[]>(defaultNames(4));
  const [namesEdited, setNamesEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalValue = Number(total);
  const totalValid = Number.isFinite(totalValue) && Math.floor(totalValue) === totalValue
    && totalValue >= 1 && totalValue <= MAX_TOTAL;
  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    for (const name of names) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) return name.trim();
      seen.add(key);
    }
    return null;
  }, [names]);
  const canSubmit = !busy && totalValid && names.length > 0
    && names.every((name) => name.trim().length > 0 && name.trim().length <= 40) && !duplicate;

  const setCount = (next: number) => {
    const count = Math.max(1, Math.min(MAX_TEAMS, Math.floor(next)));
    setNames((current) => {
      if (count === current.length) return current;
      if (count > current.length) {
        const fallback = defaultNames(count);
        return Array.from({ length: count }, (_, index) => current[index] ?? fallback[index]);
      }
      return current.slice(0, count);
    });
  };

  const renameTeam = (index: number, value: string) => {
    setNamesEdited(true);
    setNames((current) => current.map((name, position) => (position === index ? value : name)));
  };

  const removeTeam = (index: number) => {
    setNamesEdited(true);
    setNames((current) => (current.length <= 1 ? current : current.filter((_, position) => position !== index)));
  };

  const addTeam = () => {
    setNames((current) => {
      if (current.length >= MAX_TEAMS) return current;
      const fallback = defaultNames(current.length + 1);
      return [...current, fallback[fallback.length - 1]];
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const bundle = await sampling.create({
        title: title.trim() || undefined,
        totalNumbers: Math.floor(totalValue),
        teamNames: names.map((name) => name.trim()),
        instructions: instructions.trim() || undefined,
      });
      onCreated(bundle);
    } catch (failure: any) {
      setError(failure?.message || 'The game could not be created.');
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="sampling-setup">
      <button type="button" className="sampling-button sampling-button--ghost" onClick={onCancel} data-testid="sampling-setup-cancel">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Sampling
      </button>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="sampling-card">
          <span className="sampling-kicker bg-emerald-50 text-emerald-800"><Dices className="h-3 w-3" /> New game</span>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">Set the board</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            The numbers run from 1 to your total. Teams draw in the order below, one number each, until the pool is empty.
          </p>

          <div className="mt-4 grid gap-3">
            <div>
              <label className="sampling-label" htmlFor="sampling-title">Game title <span className="font-semibold normal-case tracking-normal text-slate-400">(optional)</span></label>
              <input
                id="sampling-title"
                className="sampling-input"
                value={title}
                maxLength={120}
                placeholder="Pharmacy Week draw"
                onChange={(event) => setTitle(event.target.value)}
                data-testid="sampling-title"
              />
            </div>

            <div>
              <label className="sampling-label" htmlFor="sampling-total">Total number</label>
              <div className="flex items-center gap-2">
                <input
                  id="sampling-total"
                  className="sampling-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TOTAL}
                  value={total}
                  onChange={(event) => setTotal(event.target.value)}
                  data-testid="sampling-total"
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {[50, 100, 250, 500].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`sampling-button ${Number(total) === preset ? 'sampling-button--primary' : ''}`}
                    onClick={() => setTotal(String(preset))}
                  >
                    {preset}
                  </button>
                ))}
                <span className="text-[11px] font-bold text-slate-500">
                  {totalValid ? `Numbers 1 to ${Math.floor(totalValue)}` : `Enter 1–${MAX_TOTAL}`}
                </span>
              </div>
            </div>

            <div>
              <span className="sampling-label">Number of teams</span>
              <div className="flex items-center gap-2" data-testid="sampling-team-count">
                <button type="button" className="sampling-button" onClick={() => setCount(names.length - 1)} aria-label="One team fewer" disabled={names.length <= 1}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[3rem] text-center text-lg font-black text-slate-900" data-testid="sampling-team-count-value">{names.length}</span>
                <button type="button" className="sampling-button" onClick={() => setCount(names.length + 1)} aria-label="One team more" disabled={names.length >= MAX_TEAMS}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <span className="text-[11px] font-bold text-slate-500">Up to {MAX_TEAMS} teams</span>
              </div>
            </div>

            <div>
              <span className="sampling-label">Team names</span>
              <div className="grid gap-1.5" data-testid="sampling-team-names">
                {names.map((name, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <span className="w-6 shrink-0 text-center text-[11px] font-black text-slate-400">{index + 1}</span>
                    <input
                      className="sampling-input"
                      value={name}
                      maxLength={40}
                      aria-label={`Team ${index + 1} name`}
                      onChange={(event) => renameTeam(index, event.target.value)}
                      data-testid={`sampling-team-name-${index}`}
                    />
                    <button
                      type="button"
                      className="sampling-button sampling-button--ghost"
                      onClick={() => removeTeam(index)}
                      disabled={names.length <= 1}
                      aria-label={`Remove team ${index + 1}`}
                      data-testid={`sampling-team-remove-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className="sampling-button" onClick={addTeam} disabled={names.length >= MAX_TEAMS} data-testid="sampling-team-add">
                  <Plus className="h-3.5 w-3.5" /> Add team
                </button>
                {namesEdited && (
                  <button type="button" className="sampling-button sampling-button--ghost" onClick={() => { setNames(defaultNames(names.length)); setNamesEdited(false); }}>
                    Use default names
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="sampling-label" htmlFor="sampling-instructions">Instructions <span className="font-semibold normal-case tracking-normal text-slate-400">(optional)</span></label>
              <textarea
                id="sampling-instructions"
                className="sampling-textarea"
                rows={3}
                maxLength={600}
                value={instructions}
                placeholder="One draw each, in turn. No changing numbers."
                onChange={(event) => setInstructions(event.target.value)}
                data-testid="sampling-instructions"
              />
            </div>
          </div>

          {duplicate && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800" data-testid="sampling-setup-warning">
              Two teams are called “{duplicate}”. Give each team its own name.
            </p>
          )}
          {!totalValid && total !== '' && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              The total number must be a whole number between 1 and {MAX_TOTAL}.
            </p>
          )}
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-testid="sampling-setup-error">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="sampling-button sampling-button--gold"
              onClick={() => void submit()}
              disabled={!canSubmit}
              data-testid="sampling-create-submit"
            >
              <Sparkles className="h-4 w-4" /> {busy ? 'Creating…' : 'Create game & generate links'}
            </button>
            <button type="button" className="sampling-button sampling-button--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        </section>

        <aside className="sampling-card h-fit">
          <div className="sampling-row">
            <p className="text-sm font-black text-slate-900">Preview</p>
            <span className="sampling-pill sampling-pill--active">{names.length} team{names.length === 1 ? '' : 's'}</span>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            {title.trim() || 'Untitled game'} · numbers 1–{totalValid ? Math.floor(totalValue) : '?'}
          </p>
          <ol className="mt-3 grid gap-1.5">
            {names.map((name, index) => (
              <li key={index} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span className="sampling-avatar h-6 w-6 rounded-md text-[10px]">{index + 1}</span>
                <span className="truncate text-xs font-bold text-slate-700">{name.trim() || `Team ${index + 1}`}</span>
                <span className="ml-auto text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {index === 0 ? 'plays first' : `after ${index}`}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Each team gets its own private link the moment you create the game. Links can be copied, shared, revoked or replaced at any time.
          </p>
        </aside>
      </div>
    </div>
  );
};

export default SamplingSetup;
