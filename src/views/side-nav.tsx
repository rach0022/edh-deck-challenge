/**
 * Shared side navigation used on the multi-section subpages (Build a Commander,
 * Deck Detail, cEDH Match). Renders a sticky list of in-page anchors so the
 * user can jump straight to a section. On narrow screens the CSS
 * (`.page-with-sidenav` / `.side-nav` in layout.tsx) collapses it into a
 * horizontal scroller above the content.
 *
 * Usage: wrap the page content in
 *   <div class="page-with-sidenav">
 *     <SideNav items={...} />
 *     <div class="page-with-sidenav-content">{content}</div>
 *   </div>
 * and give each target section an `id` matching an item's `id`.
 */

/** A single side-nav entry pointing at an in-page anchor. */
export interface SideNavItem {
  /** The target element id (without the leading '#'). */
  id: string;
  /** The visible link text. */
  label: string;
  /** Optional short metadata shown right-aligned (e.g. a count). */
  meta?: string;
}

export function SideNav({ items }: { items: SideNavItem[] }) {
  if (items.length === 0) return <></>;
  return (
    <aside class="side-nav" aria-label="Sections">
      <nav class="side-nav-inner">
        <p class="side-nav-title">On this page</p>
        <ul class="side-nav-list">
          {items.map((item) => (
            <li>
              <a class="side-nav-link" href={`#${item.id}`}>
                <span class="side-nav-label">{item.label}</span>
                {item.meta && <span class="side-nav-meta">{item.meta}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
