import { useState } from 'react';
import { FileText } from 'lucide-react';
import { downloadReport } from '../../lib/cgm';
import { card, label } from './tokens';

export const ReportsArea = ({ classId }: { classId: number }) => {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');
  const reports: Array<[string, string]> = [
    ['roster', 'Class roster'], ['activities', 'Activities overview'], ['assignments', 'Group assignments'], ['movements', 'Group movements'],
    ['leadership', 'Leadership appointments'], ['elections', 'Elections'], ['turnout', 'Election turnout'],
    ['attendance', 'Attendance'], ['pending', 'Pending requests'], ['organizer-actions', 'Organizer actions'],
  ];
  return (
    <div className={card}>
      <p className={label}>Reports &amp; exports</p>
      <p className="mt-1 text-xs font-medium text-slate-500">Downloads respect your permissions — sensitive columns only appear with the sensitive-data permission.</p>
      <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Export format">
        {(['csv', 'xlsx', 'pdf'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={format === key}
            onClick={() => setFormat(key)}
            className={`rounded-full px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${format === key ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}
          >
            {key === 'xlsx' ? 'Excel' : key.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {reports.map(([kind, text]) => (
          <button key={kind} type="button" className="mini-button justify-start" onClick={() => void downloadReport(classId, kind, format).catch(() => {})}>
            <FileText className="mr-1.5 inline h-3.5 w-3.5" /> {text}
          </button>
        ))}
      </div>
    </div>
  );
};

