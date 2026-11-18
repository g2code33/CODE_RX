import { useCallback, useEffect, useState } from 'react';
import { cgm } from '../../lib/cgm';
import { card, label } from './tokens';

export const TemplatesArea = ({ classId, onChanged }: { classId: number; onChanged: () => void }) => {
  const [templates, setTemplates] = useState<any[]>([]);
  const load = useCallback(async () => { setTemplates(await cgm.templates(classId).catch(() => [])); }, [classId]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className={card}>
      <p className={label}>Activity templates</p>
      <p className="mt-1 text-xs font-medium text-slate-500">Save an activity&apos;s configuration from its row in Grouping Activities. Templates copy settings only — never students, votes or attendance.</p>
      <ul className="mt-3 space-y-2">
        {templates.map((template) => (
          <li key={template.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
            <div>
              <p className="font-bold text-slate-700">{template.name}</p>
              <p className="text-[11px] text-slate-400">{template.config.method} · groups of {template.config.targetGroupSize || template.config.groupCount || '—'} · {template.config.genderRule}</p>
            </div>
            <button type="button" className="mini-button text-red-600" onClick={async () => { await cgm.deleteTemplate(Number(template.id)); await load(); onChanged(); }}>Delete</button>
          </li>
        ))}
        {!templates.length && <li className="py-4 text-center text-xs font-medium text-slate-400">No templates saved yet.</li>}
      </ul>
    </div>
  );
};

