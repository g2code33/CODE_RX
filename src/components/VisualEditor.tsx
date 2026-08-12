import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FilePlus2,
  LayoutPanelTop,
  Monitor,
  Palette,
  PanelRightOpen,
  PenLine,
  Plus,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import { Navbar } from './Navbar';
import { SiteFlow } from './SiteFlow';
import {
  EditorBreakpoint,
  ElementStyle,
  friendlyEditorLabel,
  MediaAsset,
} from '../data/editorSchema';
import { SiteContent, normalizeSiteContent } from '../data/siteState';
import {
  EditorInteractionMode,
  EditorSelection,
  selectedDesign,
  selectedMedia,
  VisualEditorProvider,
  useVisualEditor,
} from './VisualEditorContext';
import { cloneContent, readEditableText, updateMediaAsset, writeEditableText } from '../lib/contentPath';
import { uploadFile } from '../lib/cloudflare';

type DevicePreview = 'desktop' | 'tablet' | 'mobile';
type InspectorTab = 'content' | 'style' | 'layout' | 'responsive' | 'theme';

type SaveResult = boolean | void;

export interface VisualEditorProps {
  siteContent: SiteContent;
  activeTab: string;
  onNavigate: (id: string) => void;
  onJoin?: () => void;
  onExit: () => void;
  onImmediatePublish: (content: SiteContent) => Promise<SaveResult>;
  onPublishAll: () => Promise<SaveResult>;
  isPublishing?: boolean;
  hasPendingChanges?: boolean;
}

const DEFAULT_STYLE: ElementStyle = {};

const selectionMediaValue = (content: SiteContent, key?: string): MediaAsset => {
  const stored = selectedMedia(content.media, key);
  if (!key) return stored;
  let fallback: MediaAsset = { src: '', alt: '' };
  const team = key.match(/^about\.team\.(\d+)\.image$/);
  if (team) {
    const member = content.about.team[Number(team[1])];
    fallback = member ? { src: member.image, alt: member.name } : fallback;
  }
  const project = key.match(/^projects\.(.+)\.image$/);
  if (project) {
    const item = content.projects.find((candidate) => candidate.id === project[1]);
    fallback = item ? { src: item.image || '', alt: item.title } : fallback;
  }
  const block = key.match(/^customBlocks\.(.+)\.image$/);
  if (block) {
    const item = content.customBlocks.find((candidate) => candidate.id === block[1]);
    fallback = item ? { src: item.image || '', alt: item.title } : fallback;
  }
  return { src: stored.src || fallback.src, alt: stored.alt || fallback.alt };
};

const currentElementStyle = (content: SiteContent, selection: EditorSelection | null, breakpoint: EditorBreakpoint): ElementStyle =>
  selection ? selectedDesign(content.design, selection.elementKey, breakpoint) : DEFAULT_STYLE;

const setElementStyle = (content: SiteContent, selection: EditorSelection, breakpoint: EditorBreakpoint, style: ElementStyle): SiteContent => {
  const next = cloneContent(content);
  const existing = next.design.elements[selection.elementKey] || {};
  next.design.elements[selection.elementKey] = { ...existing, [breakpoint]: style };
  return normalizeSiteContent(next);
};

const resetElementStyle = (content: SiteContent, selection: EditorSelection, breakpoint: EditorBreakpoint): SiteContent => {
  const next = cloneContent(content);
  const existing = next.design.elements[selection.elementKey] || {};
  const { [breakpoint]: _removed, ...remaining } = existing;
  if (Object.keys(remaining).length) next.design.elements[selection.elementKey] = remaining;
  else delete next.design.elements[selection.elementKey];
  return normalizeSiteContent(next);
};

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const addToCollection = (content: SiteContent, collection: string, page = 'home'): SiteContent => {
  const next = cloneContent(content);
  switch (collection) {
    case 'news':
      next.home.latestNews.push({ id: Date.now(), category: 'UPDATE', title: 'New announcement', text: 'Add the latest update for your community.' });
      break;
    case 'coreValues':
      next.home.coreValues.push({ id: createId('value'), title: 'New value', description: 'Describe this core value.', icon: 'lightbulb' });
      break;
    case 'team':
      next.about.team.push({ name: 'New team member', role: 'Role', image: 'https://via.placeholder.com/400x400?text=Team+Member' });
      break;
    case 'tracks':
      next.about.tracks.push({ id: createId('track'), title: 'New track', items: ['First topic'], icon: 'terminal' });
      break;
    case 'academySteps':
      next.learn.steps.push('New learning module');
      break;
    case 'academyBenefits':
      next.learn.benefits.push('New learner benefit');
      break;
    case 'projects':
      next.projects.push({
        id: createId('project'), category: 'Pharmacy Tech', title: 'New project', description: 'Describe this project.',
        problem: 'What problem does it solve?', solution: 'How does it solve it?', technology: ['Technology'],
        team: ['Code Rx Team'], status: '🧪 Research', progress: 0,
      });
      break;
    case 'resources':
      next.resources.categories.push({ name: 'New category', items: ['New resource'] });
      break;
    case 'terms':
      next.terms.sections.push({ id: String(next.terms.sections.length + 1).padStart(2, '0'), title: 'NEW SECTION', content: 'Add the terms content for this section.' });
      break;
    case 'partnerships':
      next.extras.partnerships.push('New partner');
      break;
    case 'opportunities':
      next.extras.opportunities.push({ id: createId('opportunity'), title: 'New opportunity', organization: 'Organisation', icon: 'briefcase' });
      break;
    case 'customBlocks':
      next.customBlocks.push({ id: createId('section'), page, eyebrow: 'New section', title: 'Build something useful.', description: 'Edit this new visual section directly on the live website.', buttonLabel: 'Learn more', buttonLink: '#join' });
      break;
    default:
      return content;
  }
  return normalizeSiteContent(next);
};

const nestedListTarget = (selection: EditorSelection | null) => {
  const path = selection?.copyKey || '';
  const patterns: Array<[RegExp, string]> = [
    [/^about\.tracks\.(\d+)\.items/, 'trackItem'],
    [/^resources\.categories\.(\d+)\.items/, 'resourceItem'],
    [/^projects\.(\d+)\.technology/, 'projectTechnology'],
    [/^projects\.(\d+)\.team/, 'projectTeam'],
  ];
  for (const [pattern, kind] of patterns) {
    const match = path.match(pattern);
    if (match) return { kind, index: Number(match[1]) };
  }
  return null;
};

const addNestedListItem = (content: SiteContent, selection: EditorSelection | null): SiteContent | null => {
  const target = nestedListTarget(selection);
  if (!target) return null;
  const next = cloneContent(content);
  switch (target.kind) {
    case 'trackItem': next.about.tracks[target.index]?.items.push('New track topic'); break;
    case 'resourceItem': next.resources.categories[target.index]?.items.push('New resource'); break;
    case 'projectTechnology': next.projects[target.index]?.technology.push('New technology'); break;
    case 'projectTeam': next.projects[target.index]?.team.push('New team member'); break;
    default: return null;
  }
  return normalizeSiteContent(next);
};

const itemRemovalTarget = (selection: EditorSelection | null) => {
  const path = selection?.copyKey || selection?.mediaKey || '';
  // A project's URL is an attribute of the project, not a removable project.
  if (/^projects\.\d+\.(github|demo)$/.test(path)) return null;
  const patterns: Array<[RegExp, string]> = [
    [/^home\.latestNews\.(\d+)/, 'news'],
    [/^home\.coreValues\.(\d+)/, 'coreValues'],
    [/^about\.team\.(\d+)/, 'team'],
    [/^about\.tracks\.(\d+)\.items\.(\d+)/, 'trackItem'],
    [/^about\.tracks\.(\d+)/, 'tracks'],
    [/^learn\.steps\.(\d+)/, 'academySteps'],
    [/^learn\.benefits\.(\d+)/, 'academyBenefits'],
    [/^projects\.(\d+)\.technology\.(\d+)/, 'projectTechnology'],
    [/^projects\.(\d+)\.team\.(\d+)/, 'projectTeam'],
    [/^projects\.(\d+)/, 'projects'],
    [/^resources\.categories\.(\d+)\.items\.(\d+)/, 'resourceItem'],
    [/^resources\.categories\.(\d+)/, 'resources'],
    [/^terms\.sections\.(\d+)/, 'terms'],
    [/^extras\.partnerships\.(\d+)/, 'partnerships'],
    [/^extras\.opportunities\.(\d+)/, 'opportunities'],
    [/^customBlocks\.(\d+)/, 'customBlocks'],
  ];
  for (const [pattern, collection] of patterns) {
    const match = path.match(pattern);
    if (match) return { collection, indices: match.slice(1).map(Number) };
  }
  return null;
};

const removeSelectedCollectionItem = (content: SiteContent, selection: EditorSelection | null): SiteContent | null => {
  const target = itemRemovalTarget(selection);
  if (!target) return null;
  const next = cloneContent(content);
  const [index, subIndex] = target.indices;
  switch (target.collection) {
    case 'news': next.home.latestNews.splice(index, 1); break;
    case 'coreValues': next.home.coreValues.splice(index, 1); break;
    case 'team': next.about.team.splice(index, 1); break;
    case 'trackItem': next.about.tracks[index]?.items.splice(subIndex, 1); break;
    case 'tracks': next.about.tracks.splice(index, 1); break;
    case 'academySteps': next.learn.steps.splice(index, 1); break;
    case 'academyBenefits': next.learn.benefits.splice(index, 1); break;
    case 'projectTechnology': next.projects[index]?.technology.splice(subIndex, 1); break;
    case 'projectTeam': next.projects[index]?.team.splice(subIndex, 1); break;
    case 'projects': next.projects.splice(index, 1); break;
    case 'resources': next.resources.categories.splice(index, 1); break;
    case 'resourceItem': next.resources.categories[index]?.items.splice(subIndex, 1); break;
    case 'terms': next.terms.sections.splice(index, 1); break;
    case 'partnerships': next.extras.partnerships.splice(index, 1); break;
    case 'opportunities': next.extras.opportunities.splice(index, 1); break;
    case 'customBlocks': next.customBlocks.splice(index, 1); break;
    default: return null;
  }
  return normalizeSiteContent(next);
};

const COLLECTION_OPTIONS = [
  ['news', 'News card'],
  ['coreValues', 'Core value'],
  ['team', 'Leadership member'],
  ['tracks', 'Learning track'],
  ['academySteps', 'Academy module'],
  ['academyBenefits', 'Academy benefit'],
  ['projects', 'Project'],
  ['resources', 'Resource category'],
  ['terms', 'Terms section'],
  ['partnerships', 'Partner'],
  ['opportunities', 'Opportunity'],
  ['customBlocks', 'Visual section'],
] as const;

export const VisualEditor = ({
  siteContent,
  activeTab,
  onNavigate,
  onJoin,
  onExit,
  onImmediatePublish,
  onPublishAll,
  isPublishing = false,
  hasPendingChanges = false,
}: VisualEditorProps) => {
  const [interactionMode, setInteractionMode] = useState<EditorInteractionMode>('edit');
  const [device, setDevice] = useState<DevicePreview>('desktop');
  const [selected, setSelected] = useState<EditorSelection | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const applyQuickAdd = async (collection: string) => {
    setShowAddMenu(false);
    const next = addToCollection(siteContent, collection, activeTab);
    if (next === siteContent) return;
    const published = await onImmediatePublish(next);
    setNotice(published === false ? 'Added locally. It is waiting to publish.' : 'New item published.');
    window.setTimeout(() => setNotice(null), 3000);
  };

  return (
    <VisualEditorProvider enabled interactionMode={interactionMode} selected={selected} select={setSelected} design={siteContent.design}>
      <div className="visual-editor-shell min-h-screen bg-[#edf4ef]">
        <Navbar
          onDashboardToggle={() => undefined}
          isDashboard={false}
          activeTab={activeTab}
          setActiveTab={onNavigate}
          copy={siteContent.copy}
          media={siteContent.media}
        />
        <BuilderToolbar
          interactionMode={interactionMode}
          setInteractionMode={setInteractionMode}
          device={device}
          setDevice={setDevice}
          isInspectorOpen={isInspectorOpen}
          setIsInspectorOpen={setIsInspectorOpen}
          showAddMenu={showAddMenu}
          setShowAddMenu={setShowAddMenu}
          onQuickAdd={applyQuickAdd}
          onPublishAll={async () => {
            const published = await onPublishAll();
            setNotice(published === false ? 'Publish all could not reach the server. Your pending changes are still protected.' : 'All changes are published.');
            window.setTimeout(() => setNotice(null), 3500);
          }}
          onExit={onExit}
          publishing={isPublishing}
          pending={hasPendingChanges}
          onOpenLibrary={() => setShowLibrary(true)}
        />

        {notice && <div className="visual-editor-notice"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
        <div className={`visual-editor-preview visual-editor-preview--${device}`}>
          <SiteFlow siteContent={siteContent} activeTab={activeTab} onJoin={onJoin} includeFooter includeJoinCta />
        </div>

        {isInspectorOpen && <Inspector content={siteContent} publishing={isPublishing} onImmediatePublish={onImmediatePublish} onClose={() => setIsInspectorOpen(false)} onQuickAdd={applyQuickAdd} onRemoveSelection={async (selection) => {
          const next = removeSelectedCollectionItem(siteContent, selection);
          if (!next) return;
          const published = await onImmediatePublish(next);
          setSelected(null);
          setNotice(published === false ? 'Removed locally. It is waiting to publish.' : 'Item removed and published.');
          window.setTimeout(() => setNotice(null), 3000);
        }} onAddNestedItem={async (selection) => {
          const next = addNestedListItem(siteContent, selection);
          if (!next) return;
          const published = await onImmediatePublish(next);
          setNotice(published === false ? 'Added locally. It is waiting to publish.' : 'List item added and published.');
          window.setTimeout(() => setNotice(null), 3000);
        }} />}
        {showLibrary && <ContentLibrary content={siteContent} onClose={() => setShowLibrary(false)} />}
      </div>
    </VisualEditorProvider>
  );
};

const BuilderToolbar = ({
  interactionMode,
  setInteractionMode,
  device,
  setDevice,
  isInspectorOpen,
  setIsInspectorOpen,
  showAddMenu,
  setShowAddMenu,
  onQuickAdd,
  onPublishAll,
  onExit,
  publishing,
  pending,
  onOpenLibrary,
}: {
  interactionMode: EditorInteractionMode;
  setInteractionMode: (mode: EditorInteractionMode) => void;
  device: DevicePreview;
  setDevice: (device: DevicePreview) => void;
  isInspectorOpen: boolean;
  setIsInspectorOpen: (open: boolean) => void;
  showAddMenu: boolean;
  setShowAddMenu: (open: boolean) => void;
  onQuickAdd: (collection: string) => void;
  onPublishAll: () => void;
  onExit: () => void;
  publishing: boolean;
  pending: boolean;
  onOpenLibrary: () => void;
}) => (
  <div className="visual-editor-toolbar fixed inset-x-0 top-[4.5rem] z-[70] border-b border-emerald-900/10 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-5">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onExit} className="visual-editor-toolbar-button visual-editor-toolbar-button--quiet"><LayoutPanelTop className="h-4 w-4" /><span className="hidden sm:inline">Controller</span></button>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <div className="visual-editor-segment"><button type="button" onClick={() => setInteractionMode('edit')} className={interactionMode === 'edit' ? 'is-active' : ''}><PenLine className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => setInteractionMode('preview')} className={interactionMode === 'preview' ? 'is-active' : ''}><Eye className="h-3.5 w-3.5" />Preview</button></div>
        <div className="hidden visual-editor-segment md:flex"><button type="button" aria-label="Desktop preview" onClick={() => setDevice('desktop')} className={device === 'desktop' ? 'is-active' : ''}><Monitor className="h-3.5 w-3.5" /></button><button type="button" aria-label="Tablet preview" onClick={() => setDevice('tablet')} className={device === 'tablet' ? 'is-active' : ''}><Tablet className="h-3.5 w-3.5" /></button><button type="button" aria-label="Mobile preview" onClick={() => setDevice('mobile')} className={device === 'mobile' ? 'is-active' : ''}><Smartphone className="h-3.5 w-3.5" /></button></div>
      </div>
      <div className="flex items-center gap-2"><button type="button" onClick={onOpenLibrary} className="visual-editor-toolbar-button visual-editor-toolbar-button--quiet"><FilePlus2 className="h-4 w-4" /><span className="hidden sm:inline">Content</span></button><div className="relative"><button type="button" onClick={() => setShowAddMenu(!showAddMenu)} className="visual-editor-toolbar-button"><Plus className="h-4 w-4" />Add <ChevronDown className="h-3.5 w-3.5" /></button>{showAddMenu && <div className="visual-editor-add-menu">{COLLECTION_OPTIONS.map(([value, label]) => <button key={value} type="button" onClick={() => onQuickAdd(value)}><Plus className="h-3.5 w-3.5" />{label}</button>)}</div>}</div><button type="button" onClick={() => setIsInspectorOpen(!isInspectorOpen)} className={`visual-editor-toolbar-button visual-editor-toolbar-button--quiet ${isInspectorOpen ? 'is-active' : ''}`}><PanelRightOpen className="h-4 w-4" /><span className="hidden sm:inline">Inspector</span></button><button type="button" disabled={publishing} onClick={onPublishAll} className="visual-editor-publish-button"><Save className="h-4 w-4" />{publishing ? 'Saving…' : pending ? 'Retry publish' : 'Publish all'}</button></div>
    </div>
  </div>
);

const Inspector = ({
  content,
  publishing,
  onImmediatePublish,
  onClose,
  onQuickAdd,
  onRemoveSelection,
  onAddNestedItem,
}: {
  content: SiteContent;
  publishing: boolean;
  onImmediatePublish: (content: SiteContent) => Promise<SaveResult>;
  onClose: () => void;
  onQuickAdd: (collection: string) => void;
  onRemoveSelection: (selection: EditorSelection) => void;
  onAddNestedItem: (selection: EditorSelection) => void;
}) => {
  const { selected } = useVisualEditor();
  const [tab, setTab] = useState<InspectorTab>('content');
  const [breakpoint, setBreakpoint] = useState<EditorBreakpoint>('desktop');
  const [textValue, setTextValue] = useState('');
  const [mediaValue, setMediaValue] = useState<MediaAsset>({ src: '', alt: '' });
  const [styleValue, setStyleValue] = useState<ElementStyle>({});
  const [themeValue, setThemeValue] = useState(content.design.theme);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setThemeValue(content.design.theme);
  }, [content.design.theme]);

  useEffect(() => {
    if (!selected) return;
    if (selected.copyKey) setTextValue(readEditableText(content, selected.copyKey).value);
    if (selected.mediaKey) setMediaValue(selectionMediaValue(content, selected.mediaKey));
    setStyleValue(currentElementStyle(content, selected, breakpoint));
    setMessage(null);
  }, [selected, content, breakpoint]);

  const publish = async (next: SiteContent, successMessage: string) => {
    const result = await onImmediatePublish(next);
    setMessage(result === false ? 'Saved locally. Publishing will retry from Publish all.' : successMessage);
  };

  const saveSelection = async () => {
    if (!selected) return;
    let next = content;
    if (selected.copyKey) next = writeEditableText(next, selected.copyKey, textValue);
    if (selected.mediaKey) next = updateMediaAsset(next, selected.mediaKey, mediaValue);
    next = setElementStyle(next, selected, breakpoint, styleValue);
    await publish(next, 'This item is published.');
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, 'site-media');
      setMediaValue((previous) => ({ ...previous, src: result.url }));
      setMessage('Upload is ready. Select Save to publish this image.');
    } catch (error: any) {
      setMessage(error?.message || 'Image upload failed. You can still paste an image URL.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const saveTheme = async () => {
    const next = cloneContent(content);
    next.design.theme = themeValue;
    await publish(normalizeSiteContent(next), 'Global design settings are published.');
  };

  const showContent = tab === 'content';
  const showStyle = tab === 'style' || tab === 'responsive';
  const showLayout = tab === 'layout';
  const isProjectCardContent = showContent && selected?.collection === 'projects' && selected.itemIndex !== undefined;

  return (
    <aside className="visual-editor-inspector fixed bottom-3 right-3 top-[8.7rem] z-[80] flex w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-100 p-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Live website builder</p><h2 className="mt-1 text-base font-black text-slate-900">{selected?.label || 'Site design'}</h2><p className="mt-1 text-xs text-slate-500">{selected ? `Editing ${friendlyEditorLabel(selected.copyKey || selected.mediaKey || selected.elementKey)}` : 'Select any outlined item on the website.'}</p></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">{(['content', 'style', 'layout', 'responsive', 'theme'] as InspectorTab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`visual-editor-inspector-tab ${tab === item ? 'is-active' : ''}`}>{item === 'content' ? 'Content' : item === 'style' ? 'Style' : item === 'layout' ? 'Layout' : item === 'responsive' ? 'Responsive' : 'Theme'}</button>)}</div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'theme' ? <ThemeControls value={themeValue} onChange={setThemeValue} onSave={saveTheme} saving={publishing} /> : !selected ? <EmptySelection /> : <>
          {showContent && (selected.collection === 'projects' && selected.itemIndex !== undefined
            ? <ProjectCardEditor content={content} projectIndex={selected.itemIndex} publishing={publishing} onImmediatePublish={onImmediatePublish} />
            : <ContentControls selected={selected} textValue={textValue} setTextValue={setTextValue} mediaValue={mediaValue} setMediaValue={setMediaValue} uploading={uploading} onUpload={uploadImage} onQuickAdd={onQuickAdd} onAddNestedItem={onAddNestedItem} />)}
          {showStyle && <><div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 p-1"><span className="pl-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Applies at</span><div className="visual-editor-breakpoint">{(['desktop', 'tablet', 'mobile'] as EditorBreakpoint[]).map((item) => <button key={item} type="button" onClick={() => setBreakpoint(item)} className={breakpoint === item ? 'is-active' : ''}>{item}</button>)}</div></div><StyleControls value={styleValue} onChange={setStyleValue} layoutOnly={false} theme={content.design.theme} /></>}
          {showLayout && <StyleControls value={styleValue} onChange={setStyleValue} layoutOnly theme={content.design.theme} />}
          {!isProjectCardContent && <><div className="mt-5 flex gap-2"><button type="button" onClick={() => setStyleValue(currentElementStyle(content, selected, breakpoint))} className="visual-editor-secondary-button flex-1"><RotateCcw className="h-3.5 w-3.5" />Cancel</button><button type="button" disabled={publishing} onClick={saveSelection} className="visual-editor-save-button flex-[1.4]"><Save className="h-4 w-4" />{publishing ? 'Saving…' : 'Save & publish'}</button></div>
          <button type="button" onClick={async () => { const next = resetElementStyle(content, selected, breakpoint); await publish(next, 'Style reset and published.'); }} className="mt-3 w-full text-xs font-bold text-slate-500 hover:text-red-600">Reset {breakpoint} styling</button>
          {itemRemovalTarget(selected) && <button type="button" onClick={() => { if (window.confirm('Remove this item from the website?')) onRemoveSelection(selected); }} className="mt-3 w-full text-xs font-black text-red-600 hover:text-red-700">Remove selected item</button>}
          {message && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{message}</p>}</>}
        </>}
      </div>
    </aside>
  );
};

const EmptySelection = () => <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-5 text-center"><WandSparkles className="mx-auto h-7 w-7 text-emerald-500" /><h3 className="mt-3 text-sm font-black text-slate-800">Select an element</h3><p className="mt-2 text-xs leading-5 text-slate-500">In Edit mode, click a text item, image, card, or section on the live canvas. Its content, visual style, layout, and responsive rules appear here.</p></div>;

const ProjectCardEditor = ({
  content,
  projectIndex,
  publishing,
  onImmediatePublish,
}: {
  content: SiteContent;
  projectIndex: number;
  publishing: boolean;
  onImmediatePublish: (content: SiteContent) => Promise<SaveResult>;
}) => {
  const source = content.projects[projectIndex] || null;
  const [draft, setDraft] = useState<SiteContent['projects'][number] | null>(source);
  const [technologyText, setTechnologyText] = useState(source?.technology.join(', ') || '');
  const [teamText, setTeamText] = useState(source?.team.join(', ') || '');
  const [imageUrl, setImageUrl] = useState(source ? selectionMediaValue(content, `projects.${source.id}.image`).src : '');
  const [imageAlt, setImageAlt] = useState(source ? selectionMediaValue(content, `projects.${source.id}.image`).alt : '');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const latest = content.projects[projectIndex] || null;
    setDraft(latest);
    setTechnologyText(latest?.technology.join(', ') || '');
    setTeamText(latest?.team.join(', ') || '');
    if (latest) {
      const asset = selectionMediaValue(content, `projects.${latest.id}.image`);
      setImageUrl(asset.src);
      setImageAlt(asset.alt);
    }
    setMessage(null);
  }, [content, projectIndex]);

  if (!draft) return <p className="text-sm text-slate-500">This project is no longer available.</p>;

  const update = (key: keyof SiteContent['projects'][number], value: string | number) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };
  const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, 'site-media/projects');
      setImageUrl(result.url);
      setMessage('Image uploaded. Select Save project content to publish it.');
    } catch (error: any) {
      setMessage(error?.message || 'Image upload failed. You can paste an image URL instead.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const save = async () => {
    const next = cloneContent(content);
    next.projects[projectIndex] = {
      ...draft,
      technology: splitList(technologyText),
      team: splitList(teamText),
      progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)),
      image: imageUrl,
    };
    const withImage = updateMediaAsset(next, `projects.${draft.id}.image`, { src: imageUrl, alt: imageAlt || draft.title });
    const published = await onImmediatePublish(withImage);
    setMessage(published === false ? 'Saved locally. Publish all will retry this project.' : 'Project card published.');
  };

  return <div className="space-y-4"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-black text-emerald-800">Project card content</p><p className="mt-1 text-xs leading-5 text-emerald-700">Edit the entire card here, then save it in one publish action.</p></div><div className="grid grid-cols-2 gap-3"><Field label="Title" value={draft.title} onChange={(value) => update('title', value)} /><Field label="Category" value={draft.category} onChange={(value) => update('category', value)} /><Field label="Status" value={draft.status} onChange={(value) => update('status', value)} /><Field label="Progress (%)" value={String(draft.progress)} onChange={(value) => update('progress', Number(value))} /></div><label className="visual-editor-field"><span>Short description</span><textarea rows={3} value={draft.description} onChange={(event) => update('description', event.target.value)} /></label><label className="visual-editor-field"><span>Problem</span><textarea rows={3} value={draft.problem} onChange={(event) => update('problem', event.target.value)} /></label><label className="visual-editor-field"><span>Solution</span><textarea rows={3} value={draft.solution} onChange={(event) => update('solution', event.target.value)} /></label><label className="visual-editor-field"><span>Technology tags — comma separated</span><input value={technologyText} onChange={(event) => setTechnologyText(event.target.value)} placeholder="React, Cloudflare D1, API" /></label><label className="visual-editor-field"><span>Team members — comma separated</span><input value={teamText} onChange={(event) => setTeamText(event.target.value)} placeholder="Team Alpha, Jane Doe" /></label><div className="grid grid-cols-2 gap-3"><Field label="Repository URL" value={draft.github || ''} onChange={(value) => update('github', value)} placeholder="https://github.com/..." /><Field label="Demo URL" value={draft.demo || ''} onChange={(value) => update('demo', value)} placeholder="https://..." /></div><label className="visual-editor-field"><span>Card image URL</span><input type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://… or /api/files/…" /></label><label className="visual-editor-field"><span>Image alt text</span><input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Describe the project image" /></label><label className="visual-editor-upload"><input className="sr-only" type="file" accept="image/*" onChange={uploadImage} disabled={uploading} /><Upload className="h-4 w-4" />{uploading ? 'Uploading image…' : 'Upload project image'}</label><button type="button" disabled={publishing || uploading} onClick={save} className="visual-editor-save-button w-full"><Save className="h-4 w-4" />{publishing ? 'Saving…' : 'Save project content'}</button>{message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{message}</p>}</div>;
};

const ContentControls = ({
  selected,
  textValue,
  setTextValue,
  mediaValue,
  setMediaValue,
  uploading,
  onUpload,
  onQuickAdd,
  onAddNestedItem,
}: {
  selected: EditorSelection;
  textValue: string;
  setTextValue: (value: string) => void;
  mediaValue: MediaAsset;
  setMediaValue: (value: MediaAsset) => void;
  uploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onQuickAdd: (collection: string) => void;
  onAddNestedItem: (selection: EditorSelection) => void;
}) => <div className="space-y-4">{selected.copyKey && <label className="visual-editor-field"><span>Content</span><textarea rows={Math.min(10, Math.max(3, Math.ceil(textValue.length / 46)))} value={textValue} onChange={(event) => setTextValue(event.target.value)} placeholder="Write the visible content" /></label>}{selected.mediaKey && <><label className="visual-editor-field"><span>Image URL</span><input type="url" value={mediaValue.src} onChange={(event) => setMediaValue({ ...mediaValue, src: event.target.value })} placeholder="https://… or /api/files/…" /></label><label className="visual-editor-field"><span>Alt text</span><input value={mediaValue.alt} onChange={(event) => setMediaValue({ ...mediaValue, alt: event.target.value })} placeholder="Describe the image" /></label><label className="visual-editor-upload"><input className="sr-only" type="file" accept="image/*" onChange={onUpload} disabled={uploading} /><Upload className="h-4 w-4" />{uploading ? 'Uploading image…' : 'Upload to media library'}</label>{mediaValue.src && <img src={mediaValue.src} alt={mediaValue.alt || 'Selected asset preview'} className="max-h-40 w-full rounded-xl border border-slate-200 object-cover" />}</>}{selected.collection && <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">This is a repeating content group.</p><button type="button" onClick={() => onQuickAdd(selected.collection!)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-emerald-700"><Plus className="h-3.5 w-3.5" />Add another item</button></div>}{nestedListTarget(selected) && <button type="button" onClick={() => onAddNestedItem(selected)} className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-700"><Plus className="h-3.5 w-3.5" />Add another item to this list</button>}{!selected.copyKey && !selected.mediaKey && !selected.collection && <p className="text-sm leading-6 text-slate-500">This is a visual container. Use Style and Layout to change it, or select its text/image inside the container.</p>}</div>;

type ColorTarget = 'color' | 'backgroundColor' | 'borderColor';

const normalizeHex = (value?: string) => {
  const hex = (value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) return `#${hex.slice(1).split('').map((part) => `${part}${part}`).join('')}`.toUpperCase();
  return '';
};

const hexRgb = (value?: string) => {
  const hex = normalizeHex(value);
  if (!hex) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
};

const luminance = (value?: string) => {
  const rgb = hexRgb(value);
  if (!rgb) return null;
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground?: string, background?: string) => {
  const fg = luminance(foreground);
  const bg = luminance(background);
  if (fg === null || bg === null) return null;
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
};

const readableText = (background?: string) => {
  const againstWhite = contrastRatio('#FFFFFF', background) || 0;
  const againstBlack = contrastRatio('#0F172A', background) || 0;
  return againstWhite >= againstBlack ? '#FFFFFF' : '#0F172A';
};

const colorValue = (value?: string, fallback = '#0F172A') => normalizeHex(value) || fallback;

const themeSwatches = (theme: SiteContent['design']['theme']) => [
  { name: 'Canvas', value: theme.ink }, { name: 'Surface', value: theme.panel },
  { name: 'Accent', value: theme.lime }, { name: 'Accent dark', value: theme.green },
  { name: 'Mint', value: theme.mint }, { name: 'Text', value: theme.text },
  { name: 'Muted', value: theme.textSecondary }, { name: 'Line', value: theme.line },
];

const SMART_NEUTRALS = ['#FFFFFF', '#F8FAFC', '#E2E8F0', '#94A3B8', '#475569', '#0F172A', '#020617'];
const RECENT_COLOR_KEY = 'codeRx_builderRecentColors';

const rememberColor = (value: string) => {
  const hex = normalizeHex(value);
  if (!hex) return [];
  try {
    const existing = JSON.parse(localStorage.getItem(RECENT_COLOR_KEY) || '[]') as string[];
    const next = [hex, ...existing.filter((item) => normalizeHex(item) !== hex)].slice(0, 12);
    localStorage.setItem(RECENT_COLOR_KEY, JSON.stringify(next));
    return next;
  } catch { return [hex]; }
};

const SmartColorPanel = ({
  value,
  onChange,
  theme,
}: {
  value: ElementStyle;
  onChange: (key: ColorTarget, value?: string) => void;
  theme: SiteContent['design']['theme'];
}) => {
  const [target, setTarget] = useState<ColorTarget>('color');
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_COLOR_KEY) || '[]'); } catch { return []; }
  });
  const selected = value[target];
  const surface = value.backgroundColor || theme.panel || '#FFFFFF';
  const text = value.color || theme.text || '#0F172A';
  const contrast = contrastRatio(text, surface);
  const apply = (next: string) => {
    const hex = normalizeHex(next) || next;
    onChange(target, hex);
    const latest = rememberColor(hex);
    if (latest.length) setRecent(latest);
  };
  const targets: Array<{ key: ColorTarget; label: string; fallback: string }> = [
    { key: 'color', label: 'Text', fallback: theme.text },
    { key: 'backgroundColor', label: 'Surface', fallback: theme.panel },
    { key: 'borderColor', label: 'Border', fallback: theme.line },
  ];
  return <section className="visual-color-panel"><div className="visual-color-panel__head"><div><p>Smart Colour Studio</p><small>Choose a role, pick a colour, then preview it live.</small></div><div className="visual-color-preview" style={{ color: text, backgroundColor: surface, borderColor: value.borderColor || theme.line }}>Aa</div></div><div className="visual-color-targets">{targets.map((item) => <button key={item.key} type="button" onClick={() => setTarget(item.key)} className={target === item.key ? 'is-active' : ''}><span className="visual-color-target-dot" style={{ backgroundColor: colorValue(value[item.key], item.fallback) }} />{item.label}</button>)}</div><div className="visual-color-picker-row"><input aria-label="Choose colour" type="color" value={colorValue(selected, targets.find((item) => item.key === target)?.fallback)} onChange={(event) => apply(event.target.value)} /><input value={selected || ''} onChange={(event) => onChange(target, event.target.value)} onBlur={(event) => { if (normalizeHex(event.target.value)) apply(event.target.value); }} placeholder="Inherited" /><button type="button" onClick={() => onChange(target, undefined)} className="visual-color-inherit">Inherit</button></div><div className="visual-color-palette"><span>Code Rx palette</span><div>{themeSwatches(theme).map((swatch) => <button key={swatch.name} title={swatch.name} type="button" onClick={() => apply(swatch.value)} style={{ backgroundColor: swatch.value }} />)}</div></div><div className="visual-color-palette"><span>Neutrals</span><div>{SMART_NEUTRALS.map((swatch) => <button key={swatch} title={swatch} type="button" onClick={() => apply(swatch)} style={{ backgroundColor: swatch }} />)}</div></div>{recent.length > 0 && <div className="visual-color-palette"><span>Recent</span><div>{recent.map((swatch) => <button key={swatch} title={swatch} type="button" onClick={() => apply(swatch)} style={{ backgroundColor: swatch }} />)}</div></div>}<div className="visual-color-smart-actions"><button type="button" onClick={() => { onChange('color', readableText(surface)); setRecent(rememberColor(readableText(surface))); }}>Auto readable text</button>{contrast !== null && <span className={contrast >= 4.5 ? 'is-good' : 'is-low'}>{contrast >= 4.5 ? 'AA contrast' : `Low contrast ${contrast.toFixed(1)}:1`}</span>}</div></section>;
};

const ThemeColorField = ({ label, value, onChange, theme }: { label: string; value: string; onChange: (value: string) => void; theme: SiteContent['design']['theme'] }) => <label className="visual-theme-color"><span>{label}</span><div><input type="color" value={colorValue(value)} onChange={(event) => onChange(event.target.value)} /><input value={value || ''} onChange={(event) => onChange(event.target.value)} onBlur={(event) => { const hex = normalizeHex(event.target.value); if (hex) onChange(hex); }} /></div><div className="visual-theme-color__swatches">{themeSwatches(theme).slice(0, 5).map((swatch) => <button key={swatch.name} type="button" title={swatch.name} onClick={() => onChange(swatch.value)} style={{ backgroundColor: swatch.value }} />)}</div></label>;

const Field = ({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string }) => <label className="visual-editor-field"><span>{label}</span><input value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;

const StyleControls = ({ value, onChange, layoutOnly, theme }: { value: ElementStyle; onChange: (value: ElementStyle) => void; layoutOnly: boolean; theme: SiteContent['design']['theme'] }) => {
  const set = (key: keyof ElementStyle, nextValue: string | boolean | undefined) => onChange({ ...value, [key]: nextValue || undefined });
  const setColor = (key: ColorTarget, nextValue?: string) => onChange({ ...value, [key]: nextValue });
  return <div className="space-y-3">{!layoutOnly && <><SmartColorPanel value={value} onChange={setColor} theme={theme} /><div className="grid grid-cols-2 gap-3"><Field label="Font size" value={value.fontSize} onChange={(next) => set('fontSize', next)} placeholder="1rem" /><Field label="Font weight" value={value.fontWeight} onChange={(next) => set('fontWeight', next)} placeholder="700" /><Field label="Line height" value={value.lineHeight} onChange={(next) => set('lineHeight', next)} placeholder="1.5" /><Field label="Letter spacing" value={value.letterSpacing} onChange={(next) => set('letterSpacing', next)} placeholder="0em" /><Field label="Border radius" value={value.borderRadius} onChange={(next) => set('borderRadius', next)} placeholder="1rem" /></div><label className="visual-editor-field"><span>Text alignment</span><select value={value.textAlign || ''} onChange={(event) => set('textAlign', event.target.value)}><option value="">Inherited</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label><Field label="Shadow" value={value.boxShadow} onChange={(next) => set('boxShadow', next)} placeholder="0 8px 20px rgba(0,0,0,.15)" /><label className="visual-editor-field"><span>Advanced CSS declarations</span><textarea rows={3} value={value.customCss || ''} onChange={(event) => set('customCss', event.target.value)} placeholder="e.g. text-transform: uppercase;" /></label></>}{layoutOnly && <><div className="grid grid-cols-2 gap-3"><Field label="Width" value={value.width} onChange={(next) => set('width', next)} placeholder="100%" /><Field label="Maximum width" value={value.maxWidth} onChange={(next) => set('maxWidth', next)} placeholder="70rem" /><Field label="Minimum height" value={value.minHeight} onChange={(next) => set('minHeight', next)} placeholder="20rem" /><Field label="Padding" value={value.padding} onChange={(next) => set('padding', next)} placeholder="2rem" /><Field label="Margin" value={value.margin} onChange={(next) => set('margin', next)} placeholder="0 auto" /><Field label="Gap" value={value.gap} onChange={(next) => set('gap', next)} placeholder="1rem" /><Field label="Grid columns" value={value.gridTemplateColumns} onChange={(next) => set('gridTemplateColumns', next)} placeholder="repeat(3, 1fr)" /><Field label="Order" value={value.order} onChange={(next) => set('order', next)} placeholder="0" /></div><label className="visual-editor-field"><span>Display</span><select value={value.display || ''} onChange={(event) => set('display', event.target.value)}><option value="">Inherited</option><option value="block">Block</option><option value="flex">Flex</option><option value="grid">Grid</option><option value="none">None</option></select></label><label className="visual-editor-field"><span>Object fit (images)</span><select value={value.objectFit || ''} onChange={(event) => set('objectFit', event.target.value)}><option value="">Inherited</option><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select></label><label className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">Hide at this breakpoint <input type="checkbox" checked={Boolean(value.hidden)} onChange={(event) => set('hidden', event.target.checked)} /></label></>}</div>;
};

const ThemeControls = ({ value, onChange, onSave, saving }: { value: SiteContent['design']['theme']; onChange: (value: SiteContent['design']['theme']) => void; onSave: () => void; saving: boolean }) => {
  const update = (key: keyof SiteContent['design']['theme'], nextValue: string) => onChange({ ...value, [key]: nextValue });
  return <div className="space-y-4"><div className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><Palette className="mr-1 inline h-4 w-4" />Global colour tokens update the shared Code Rx visual identity. Use element Style for a local override.</div><div className="visual-theme-colour-grid"><ThemeColorField label="Page background" value={value.ink} onChange={(next) => update('ink', next)} theme={value} /><ThemeColorField label="Alt background" value={value.deep} onChange={(next) => update('deep', next)} theme={value} /><ThemeColorField label="Panel" value={value.panel} onChange={(next) => update('panel', next)} theme={value} /><ThemeColorField label="Accent" value={value.lime} onChange={(next) => update('lime', next)} theme={value} /><ThemeColorField label="Accent dark" value={value.green} onChange={(next) => update('green', next)} theme={value} /><ThemeColorField label="Main text" value={value.text} onChange={(next) => update('text', next)} theme={value} /><ThemeColorField label="Muted text" value={value.textSecondary} onChange={(next) => update('textSecondary', next)} theme={value} /></div><div className="grid grid-cols-2 gap-3"><Field label="Card radius" value={value.cardRadius} onChange={(next) => update('cardRadius', next)} /><Field label="Button radius" value={value.buttonRadius} onChange={(next) => update('buttonRadius', next)} /></div><Field label="Font family" value={value.fontFamily} onChange={(next) => update('fontFamily', next)} placeholder="Inter, sans-serif" /><button type="button" disabled={saving} onClick={onSave} className="visual-editor-save-button w-full"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save & publish global design'}</button></div>;
};

const ContentLibrary = ({ content, onClose }: { content: SiteContent; onClose: () => void }) => {
  const { select } = useVisualEditor();
  const [query, setQuery] = useState('');
  const items = useMemo(() => [
    ...Object.entries(content.copy).map(([key, value]) => ({ key, path: key, value, type: 'Copy' })),
    ...Object.entries(content.links).map(([key, value]) => ({ key, path: `links.${key}`, value, type: 'Link' })),
  ].filter((item) => `${item.key} ${item.value}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.key.localeCompare(b.key)), [content.copy, content.links, query]);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">All website copy and links</p><h2 className="mt-1 text-xl font-black text-slate-900">Content library</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="p-4"><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500" placeholder="Find any label, heading, URL, or footer text…" /></div><div className="max-h-[55vh] overflow-y-auto px-4 pb-4">{items.map((item) => <button key={item.path} type="button" onClick={() => { select({ kind: 'text', elementKey: `library.${item.path}`, copyKey: item.path, label: friendlyEditorLabel(item.path) }); onClose(); }} className="mb-2 block w-full rounded-xl border border-slate-100 p-3 text-left hover:border-emerald-200 hover:bg-emerald-50"><span className="flex items-center justify-between gap-3 text-xs font-black text-slate-800">{friendlyEditorLabel(item.key)}<span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">{item.type}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{item.value || 'Empty — add content'}</span></button>)}</div></div></div>;
};
