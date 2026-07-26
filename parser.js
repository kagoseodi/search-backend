const cheerio = require('cheerio');

/**
 * Parses raw HTML string and extracts clean, structured data.
 * @param {string} url - The URL of the page being parsed
 * @param {string} htmlContent - Raw HTML from the crawler
 * @returns {object} Cleaned page data
 */
function parsePage(url, htmlContent) {
  if (!htmlContent) return null;

  const $ = cheerio.load(htmlContent);

  // 1. Strip useless tags that don't contain searchable content
  $('script, style, nav, footer, header, iframe, noscript, svg, button').remove();

  // 2. Extract clean Title
  const title = $('title').text().trim() || 
                $('h1').first().text().trim() || 
                url;

  // 3. Extract Meta Description or create a fallback summary
  let snippet = $('meta[name="description"]').attr('content') || 
                $('meta[property="og:description"]').attr('content') || '';

  // 4. Extract visible body text and clean up whitespace
  const bodyText = $('body')
    .text()
    .replace(/\s+/g, ' ') // Replace multiple spaces/newlines with a single space
    .trim();

  // If no meta snippet exists, generate one from the body text
  if (!snippet && bodyText.length > 0) {
    snippet = bodyText.substring(0, 160) + (bodyText.length > 160 ? '...' : '');
  }

  // 5. Tokenize body text into lowercase words for the indexer
  const words = bodyText
    .toLowerCase()
    .match(/\b[a-z0-9]+\b/g) || [];

  return {
    url,
    title,
    snippet,
    bodyText,
    words,
    parsedAt: new Date().toISOString()
  };
}

module.exports = { parsePage };