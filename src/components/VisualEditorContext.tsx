import {
  createContext,
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useContext,
} from 'react';
import { ElementStyle, MediaAsset, SiteDesign } from '../data/editorSchema';

export type EditorInteractionMode = 'edit' | 'preview';
export type EditorSelectionKind = 'text' | 'image' | 'region' | 'collection';

export interface EditorSelection {
  kind: EditorSelectionKind;
  elementKey: string;
  label: string;
  copyKey?: string;
  mediaKey?: string;
  collection?: string;
  /** Index of the backing list item when a whole repeat card is selected. */
  itemIndex?: number;
}

interface VisualEditorContextValue {
  enabled: boolean;
  interactionMode: EditorInteractionMode;
  selected: EditorSelection | null;
  select: (selection: EditorSelection) => void;
  design: SiteDesign;
}

const DEFAULT_DESIGN: SiteDesign = {
  theme: {
    ink: '#ffffff', deep: '#f8fafc', panel: '#ffffff', panelStrong: '#f1f5f9',
    line: '#e2e8f0', lime: '#16a34a', green: '#15803d', mint: '#4ade80',
    text: '#0f172a', textSecondary: '#475569', fontFamily: 'inherit',
    cardRadius: '1.35rem', buttonRadius: '999px',
  },
  elements: {},
};

const VisualEditorContext = createContext<VisualEditorContextValue>({
  enabled: false,
  interactionMode: 'preview',
  selected: null,
  select: () => undefined,
  design: DEFAULT_DESIGN,
});

const safeElementKey = (key: string) => key.replace(/[^a-zA-Z0-9_.:-]/g, '');

const cssProperty = (property: string) => property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const safeCssValue = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 300) return null;
  // Styles are public output. Do not allow URL loads, selectors, or executable
  // CSS expression syntax through the advanced declaration field.
  if (/[{}<>]|@|url\s*\(|expression\s*\(|javascript:/i.test(normalized)) return null;
  return normalized;
};

const safeCustomDeclarations = (value?: string) => {
  if (!value || value.length > 1200 || /[{}<>]|@|url\s*\(|expression\s*\(|javascript:/i.test(value)) return '';
  return value
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => /^[a-z-]+\s*:\s*[^;]+$/i.test(declaration))
    .map((declaration) => `${declaration};`)
    .join('');
};

const declarationCss = (style?: ElementStyle) => {
  if (!style) return '';
  const declarations: string[] = [];
  const entries = Object.entries(style).filter(([key]) => !['hidden', 'animation', 'customCss'].includes(key));
  for (const [key, value] of entries) {
    const safeValue = safeCssValue(value);
    if (safeValue) declarations.push(`${cssProperty(key)}:${safeValue};`);
  }
  if (style.hidden) declarations.push('display:none!important;');
  if (style.animation === 'float') declarations.push('animation:brand-float 5s ease-in-out infinite;');
  if (style.animation === 'pulse') declarations.push('animation:brand-pulse 4s ease-in-out infinite;');
  declarations.push(safeCustomDeclarations(style.customCss));
  return declarations.join('');
};

const buildDesignCss = (design: SiteDesign) => {
  const css: string[] = [];
  const tablet: string[] = [];
  const mobile: string[] = [];

  Object.entries(design.elements || {}).forEach(([rawKey, element]) => {
    const key = safeElementKey(rawKey);
    if (!key) return;
    const selector = `[data-site-element="${key}"]`;
    // Most page-level targets wrap the existing section so the public markup
    // stays intact. Mirror their visual declarations onto that real section.
    const targetSelector = key.endsWith('.section') ? `${selector},${selector}>section,${selector}>footer` : selector;
    const desktopCss = declarationCss(element.desktop);
    const tabletCss = declarationCss(element.tablet);
    const mobileCss = declarationCss(element.mobile);
    if (desktopCss) css.push(`${targetSelector}{${desktopCss}}`);
    if (tabletCss) tablet.push(`${targetSelector}{${tabletCss}}`);
    if (mobileCss) mobile.push(`${targetSelector}{${mobileCss}}`);
  });

  if (tablet.length) css.push(`@media (max-width: 1024px){${tablet.join('')}}`);
  if (mobile.length) css.push(`@media (max-width: 640px){${mobile.join('')}}`);
  return css.join('\n');
};

const themeStyle = (design: SiteDesign): CSSProperties => ({
  '--brand-ink': design.theme.ink,
  '--brand-deep': design.theme.deep,
  '--brand-panel': design.theme.panel,
  '--brand-panel-strong': design.theme.panelStrong,
  '--brand-line': design.theme.line,
  '--brand-lime': design.theme.lime,
  '--brand-green': design.theme.green,
  '--brand-mint': design.theme.mint,
  '--brand-text': design.theme.text,
  '--brand-white': design.theme.text,
  '--brand-text-secondary': design.theme.textSecondary,
  '--editor-card-radius': design.theme.cardRadius,
  '--editor-button-radius': design.theme.buttonRadius,
  fontFamily: design.theme.fontFamily,
} as CSSProperties);

export const VisualEditorProvider = ({
  enabled,
  interactionMode,
  selected,
  select,
  design,
  children,
}: VisualEditorContextValue & { children: ReactNode }) => {
  const normalizedDesign = design || DEFAULT_DESIGN;
  return (
    <VisualEditorContext.Provider value={{ enabled, interactionMode, selected, select, design: normalizedDesign }}>
      <div className={enabled ? 'visual-editor-canvas' : 'site-design-canvas'} style={themeStyle(normalizedDesign)}>
        <style data-site-design="true">{buildDesignCss(normalizedDesign)}</style>
        {children}
      </div>
    </VisualEditorContext.Provider>
  );
};

export const useVisualEditor = () => useContext(VisualEditorContext);

const editorHandlers = (
  selection: EditorSelection,
  context: VisualEditorContextValue,
) => {
  const isEditing = context.enabled && context.interactionMode === 'edit';
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (!isEditing) return;
    event.preventDefault();
    event.stopPropagation();
    context.select(selection);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isEditing || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    context.select(selection);
  };
  return {
    isEditing,
    onClick,
    onKeyDown,
  };
};

const editorClass = (isEditing: boolean, selected: boolean) =>
  isEditing ? `visual-editor-target${selected ? ' is-selected' : ''}` : undefined;

/**
 * An inline, admin-selectable text node. Outside the builder it behaves as an
 * ordinary span, so the public page does not receive any editor UI.
 */
export const EditableText = ({
  elementKey,
  copyKey,
  label,
  children,
}: {
  elementKey: string;
  copyKey: string;
  label: string;
  children: ReactNode;
}) => {
  const context = useVisualEditor();
  const selection: EditorSelection = { kind: 'text', elementKey, copyKey, label };
  const { isEditing, onClick, onKeyDown } = editorHandlers(selection, context);
  const isSelected = context.selected?.elementKey === elementKey;
  return (
    <span
      data-site-element={safeElementKey(elementKey)}
      data-editor-label={label}
      className={editorClass(isEditing, isSelected)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={isEditing ? 'button' : undefined}
      tabIndex={isEditing ? 0 : undefined}
    >
      {children}
    </span>
  );
};

/** A selectable layout region for padding, colour, grids, visibility, etc. */
export const EditableRegion = ({
  elementKey,
  label,
  children,
  className,
  collection,
  itemIndex,
  copyKey,
  as: Tag = 'div',
}: {
  elementKey: string;
  label: string;
  children: ReactNode;
  className?: string;
  collection?: string;
  itemIndex?: number;
  copyKey?: string;
  as?: 'div' | 'section' | 'nav' | 'footer' | 'article' | 'main';
}) => {
  const context = useVisualEditor();
  const selection: EditorSelection = { kind: copyKey ? 'text' : collection ? 'collection' : 'region', elementKey, label, collection, itemIndex, copyKey };
  const { isEditing, onClick, onKeyDown } = editorHandlers(selection, context);
  const isSelected = context.selected?.elementKey === elementKey;
  return (
    <Tag
      data-site-element={safeElementKey(elementKey)}
      data-editor-label={label}
      className={[className, editorClass(isEditing, isSelected)].filter(Boolean).join(' ')}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={isEditing ? 'button' : undefined}
      tabIndex={isEditing ? 0 : undefined}
    >
      {children}
    </Tag>
  );
};

/** An image that can be selected for URL/upload/alt-text editing. */
export const EditableImage = ({
  elementKey,
  mediaKey,
  label,
  src,
  alt,
  className,
}: {
  elementKey: string;
  mediaKey: string;
  label: string;
  src: string;
  alt: string;
  className?: string;
}) => {
  const context = useVisualEditor();
  const selection: EditorSelection = { kind: 'image', elementKey, mediaKey, label };
  const { isEditing, onClick, onKeyDown } = editorHandlers(selection, context);
  const isSelected = context.selected?.elementKey === elementKey;
  const props = {
    'data-site-element': safeElementKey(elementKey),
    'data-editor-label': label,
    className: [className, editorClass(isEditing, isSelected)].filter(Boolean).join(' '),
    onClick,
    onKeyDown,
    role: isEditing ? 'button' : undefined,
    tabIndex: isEditing ? 0 : undefined,
  };
  // Empty assets are intentional: project/card placeholders remain visible,
  // while the transparent selectable slot opens the upload inspector.
  if (!src) return <span {...props} aria-label={`${label} — upload an image`} />;
  return <img {...props} src={src} alt={alt} />;
};

export const selectedDesign = (design: SiteDesign, elementKey: string, breakpoint: 'desktop' | 'tablet' | 'mobile') =>
  design.elements?.[elementKey]?.[breakpoint] || {};

export const selectedMedia = (media: Record<string, MediaAsset>, key?: string): MediaAsset =>
  (key && media[key]) || { src: '', alt: '' };
