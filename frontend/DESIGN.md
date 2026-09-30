# Quant Alpha interface

The app uses a shared design system informed by Apple's Human Interface Guidelines.
Alpha retains its own brand and research tools. These rules apply to Charts,
Signals, Screener, Heatmap, Quant Lab, sign-in, sharing, and research dialogs.

## Foundations

- Native system typography, with tabular numbers for financial values. Do not load
  a separate web font or use a code font for ordinary dashboard values.
- A neutral workspace with opaque content surfaces. Translucent material belongs
  to navigation, floating controls, and overlays; data cards remain readable.
- Blue denotes interaction. Green, red, and amber have consistent semantic roles.
  Charts use the shared series palette. Labels and numbers accompany color.
- Use the CSS variables in `src/index.css`; canvas charts resolve them through
  `getCanvasChartTheme()`. Theme changes update series and labels together.
- Type roles: 28px display, 22px page heading, 17px section heading, 15px card
  heading, 14px body, and 12px captions. Compact SVG labels use responsive layouts.
- Geometry: 10px controls, 16px content cards, 20px dialogs. Navigation capsules
  and circular dismissal controls have separate, deliberate roles.
- Prefer 4px spacing increments, 16–20px card padding, and 20–24px section gaps.
- Write short, descriptive labels and factual research summaries. Use spacing
  between metadata, and sentences or ordinary punctuation in prose. Avoid
  decorative bullets, em dashes, emoji, and inflated claims. Keep the footer to
  attribution, scan time, the source link, and the research disclaimer.

## Shared behavior

- Use `GlassCard` and its header/content components for content surfaces. The
  component's historical name does not imply a translucent card.
- Use `SegmentedControl` for related choices. It exposes the selected state and
  supports arrow keys, Home, and End. Keep labels short enough for phones.
- Use `ModalShell` for dialogs. It locks background scrolling, makes the app
  inert, contains keyboard focus, closes on Escape/backdrop activation, and
  restores focus without moving the page. Long dialogs start with a visible header.
- Buttons share primary/secondary styles, visible focus, and disabled feedback.
  Phone buttons have at least 44px height; standalone icon targets also have
  44px width. Phone text inputs use 16px text to avoid automatic zoom.
- Help can be reached by keyboard; standalone help controls also open on tap.
  Stock search supports arrow navigation and Enter selection. Table sorting uses
  native buttons and `aria-sort`.
- Tables and long horizontal choice strips scroll within their containers. They
  must not widen the page. Bottom navigation and floating comparison controls
  account for the safe area.
- Respect reduced motion, reduced transparency, and increased contrast settings.
  The market strip includes every tracked stock and scrolls manually; it does not
  continually animate.
- Keep missing data visibly unavailable. Guest heatmap scores use N/A and a
  sign-in explanation. Debt/equity displays convert the source percentage into
  a multiple, matching the research filter units.

## Audit and validation — September 2026

| Finding | Resolution |
| --- | --- |
| Mixed fonts, tiny labels, and arbitrary emphasis | Native font stack, defined type roles, readable captions, and semibold headings |
| Blur, shadows, and gradients competing with research data | Opaque content surfaces and restrained navigation material |
| Different control shapes, chart palettes, and warning colors | Shared tokens and control rules, including both chart engines |
| Dark-mode light-blue button fills and light-mode pale warnings | Separate action fill/link colors and semantic colors in both themes |
| Unnamed icon actions and pointer-only table sorting/search | Named controls, native sorting buttons, keyboard search and selection |
| Separate modal implementations and scrolling/focus faults | One dialog shell for sign-in, sharing, filters, and research tools |
| Collapsed desktop filters remaining visible | Conditional desktop filter visibility and a separate compact dialog |
| Phone controls and radar labels clipping | Shorter controls, responsive radar geometry, contained scrolling |
| Guest heatmap scores appearing as zero | Explicit unavailable state |
| Market strip stopping after 40 stocks | Full screened universe with stable ticker keys |
| Decorative separators, inflated labels, and repeated footer navigation | Plain copy, spacing between metadata, and a compact attribution footer |
| Debt/equity shown as 161.98x instead of 1.62x | Consistent conversion in charts, signals, screener, factsheet, and thesis |

Checked in a running browser at desktop, tablet, and phone widths, in light and
dark themes, with a local test session. Reviewed all five tabs, the strategy
builder, and each dialog. Verified dialog dismissal/focus restoration, stock
search, contained overflow, sorting, and comparison. Production builds and
frontend regression checks cover data/session behavior and financial units.
Contrast checks cover all shared text and chart-label colors against the three
main surfaces in both themes at a minimum 4.5:1 ratio. Printable factsheets retain
their separate compact layout and a light print palette; physical A4 output still
needs a printer/PDF preview check after content changes.

## References

- [Apple: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

When adding a screen, extend these foundations and shared components. Avoid
introducing a new font, independent palette, modal wrapper, or decorative
material without a clear product reason.
