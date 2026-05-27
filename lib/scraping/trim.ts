// Markdown cleanup before sending pages to the LLM. School athletic sites
// (especially Sidearm) bury ~5-15K characters of useful coach content under
// 50K+ characters of nav menus, scoreboard widgets, ad bars, footer-link
// lists, and "Departments" / "Honors & Awards" sidebars.
//
// Stripping the obvious junk before extraction:
//   1. Cuts LLM input tokens by 50-70% (typical Sidearm page goes 60K→15K)
//   2. Lowers rate-limit pressure
//   3. Lets Claude/Gemini focus on the actual roster content
//   4. Has zero quality risk — these blocks never contain coach data.

// Lines/blocks we always drop. Patterns are conservative — only obvious
// non-content. Anything ambiguous stays in.
const STRIP_LINE_PATTERNS: RegExp[] = [
  // Sidearm scoreboard rotators (every page on Sidearm has these at the top)
  /^Pause All Rotators/i,
  /^All Rotators Playing/i,
  /^Skip Ad/i,
  /^Skip to main content/i,
  // Common ad / promo bars
  /^### (?:Upcoming|Completed|Cancelled) Event:/i,
  /Tickets? Available|Buy Tickets|Get Tickets/i,
  // Image markdown lines (`![alt](url)`) that are decorative — keep links,
  // strip standalone image lines that have no meaningful alt text.
  /^!\[(?:|Skip Ad|.*?logo.*?|panther.*?|football|basketball)\]\(/i,
];

// Whole section headings whose body we drop until the next heading.
const STRIP_SECTION_HEADINGS: RegExp[] = [
  /^##?\s*Scoreboard\b/i,
  /^##?\s*(?:Upcoming|Recent)\s+Events?\b/i,
  /^##?\s*Schedule\b/i,
  /^##?\s*Latest News\b/i,
  /^##?\s*Sponsors?\b/i,
  /^##?\s*Departments?\b/i,
  /^##?\s*Honors?\s*&?\s*Awards?\b/i,
  /^##?\s*Quick Links\b/i,
  /^##?\s*Stay Connected\b/i,
  /^##?\s*Social Media\b/i,
  /^##?\s*Tickets\b/i,
  /^##?\s*Shop\b/i,
  /^##?\s*Donate\b/i,
];

const SECTION_HEADING_RE = /^#{1,6}\s+\S/;

/**
 * Strip nav / footer / widget content from scraped markdown.
 * Conservative: keeps anything that might plausibly be a person/title/email.
 * Returns the trimmed markdown.
 */
export function trimMarkdown(markdown: string): string {
  if (!markdown) return markdown;
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];

  let skipUntilNextHeading = false;
  for (const raw of lines) {
    const line = raw;

    // End of a "skip section" — next heading resumes capture.
    if (skipUntilNextHeading) {
      if (SECTION_HEADING_RE.test(line)) {
        skipUntilNextHeading = false;
        // Re-evaluate this heading below.
      } else {
        continue;
      }
    }

    // Start a skip block if this heading matches a strip pattern.
    if (STRIP_SECTION_HEADINGS.some((re) => re.test(line))) {
      skipUntilNextHeading = true;
      continue;
    }

    // Drop individual lines.
    if (STRIP_LINE_PATTERNS.some((re) => re.test(line))) continue;

    out.push(line);
  }

  // Collapse runs of 3+ blank lines to two.
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
