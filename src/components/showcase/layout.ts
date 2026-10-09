/**
 * Viewports where the showcase stacks its devices under the copy: narrow and
 * not landscape. Wide-but-short screens (a phone on its side) keep the
 * side-by-side desktop layout, which scales with the height instead.
 *
 * The CSS in DeviceShowcase.astro repeats this query, since scoped styles
 * cannot import it. It is one query on purpose: a complementary pair such as
 * min/max-width leaves a gap at fractional widths, where neither matches.
 */
export const STACKED_QUERY = '(max-width: 820px) and (max-aspect-ratio: 1/1)';
