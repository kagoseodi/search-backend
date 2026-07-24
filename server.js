// server.js
// Run: npm install express cheerio cors flexsearch
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const { Index } = require('flexsearch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// 1. STOP WORDS LIST (UPGRADE 1)
// Filters out high-frequency noise words that clutter the index
// -------------------------------------------------------------
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do',
  'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your'
]);

/**
 * Filter text to strip out stop words
 */
function removeStopWords(text) {
  const words = text.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
  return words.filter(word => !STOP_WORDS.has(word)).join(' ');
}

// -------------------------------------------------------------
// 2. FLEXSEARCH INDEXER (UPGRADE 3)
// High-performance search indexer
// -------------------------------------------------------------
const searchIndex = new Index({
  tokenize: 'forward', // Allows prefix matching (e.g., "java" matches "javascript")
  resolution: 9
});

const documentStore = new Map(); // docId -> { id, url, title, snippet }
let docIdCounter = 1;

/**
 * Extraction Helper
 */
function extractCleanData(url, htmlContent) {
  const $ = cheerio.load(htmlContent);

  $('script, style, nav, footer, header, iframe, noscript, svg').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim() || url;

  let snippet = $('meta[name="description"]').attr('content') || '';
  if (!snippet) {
    const rawBody = $('body').text().replace(/\s+/g, ' ').trim();
    snippet = rawBody.substring(0, 160) + (rawBody.length > 160 ? '...' : '');
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return { title, snippet, bodyText };
}

/**
 * Crawl & Index with Stop Words + FlexSearch
 */
async function crawlAndIndex(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    const { title, snippet, bodyText } = extractCleanData(url, html);

    const docId = docIdCounter++;
    documentStore.set(docId, { id: docId, url, title, snippet });

    // Filter out stop words from the body text and title before indexing
    const cleanedContent = `${removeStopWords(title)} ${removeStopWords(bodyText)}`;

    // Add cleaned document content to FlexSearch
    searchIndex.add(docId, cleanedContent);

    console.log(`[Indexed via FlexSearch] ID: ${docId} | ${url}`);
  } catch (error) {
    console.error(`Failed to crawl ${url}:`, error.message);
  }
}

// Seed index on startup
(async () => {
  console.log('Building search index with FlexSearch...');
  await crawlAndIndex('https://example.com');
  await crawlAndIndex('https://developer.mozilla.org/en-US/docs/Web/JavaScript');
})();

/**
 * Search API Endpoint
 */
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query) return res.json({ results: [], totalHits: 0 });

  // Filter stop words from search query
  const cleanQuery = removeStopWords(query) || query;

  // Query FlexSearch index (returns matching doc IDs)
  const matchingDocIds = searchIndex.search(cleanQuery);

  // Retrieve document metadata
  const results = matchingDocIds.map(id => documentStore.get(id)).filter(Boolean);

  res.json({
    results,
    totalHits: results.length,
    query
  });
});

app.listen(PORT, () => {
  console.log(`Search engine backend listening on port ${PORT}`);
});