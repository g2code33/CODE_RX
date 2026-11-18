/**
 * The first thing in the tab order, and normally invisible.
 *
 * Every module surface puts a long navigation column before the content, so a
 * keyboard or switch user was forced through eighteen tab stops (or a whole
 * class list) before reaching the page they asked for. This is the standard
 * escape hatch: one Tab, one Enter, focus lands in <main>.
 */
export const SkipLink = ({ target = 'cgm-main-content', label = 'Skip to the content' }: { target?: string; label?: string }) => (
  <a
    href={`#${target}`}
    data-testid="cgm-skip-link"
    className="cgm-skip-link"
    onClick={(event) => {
      // Move focus without leaving a stray #cgm-main-content in the address,
      // which would otherwise be parsed as a page hash on reload.
      const node = document.getElementById(target);
      if (!node) return;
      event.preventDefault();
      node.setAttribute('tabindex', '-1');
      node.focus();
      node.scrollIntoView({ block: 'start' });
    }}
  >
    {label}
  </a>
);
