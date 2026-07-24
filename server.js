// server.js
// Run: npm start
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// STOP WORDS LIST & FILTER
// Filters out high-frequency noise words ("the", "and", "is", etc.)
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
 * Filter out stop words from a token list
 */
function filterStopWords(words) {
  return words.filter(word => !STOP_WORDS.has(word));
}

// In-Memory Database / Index Structure
const documentStore = new Map(); // docId -> { id, url, title, snippet }
const invertedIndex = new Map();  // word -> Set of docIds
let docIdCounter = 1;

/**
 * Extraction Helper Function
 * Strips junk HTML (nav, footer, scripts) and returns high-value text content
 */
function extractCleanData(url, htmlContent) {
  const $ = cheerio.load(htmlContent);

  // 1. Remove non-valuable boilerplate elements
  $('script, style, nav, footer, header, iframe, noscript, svg').remove();

  // 2. Extract clean title
  const title = $('title').text().trim() || $('h1').first().text().trim() || url;

  // 3. Extract description/snippet (meta tag or fallback to body text)
  let snippet = $('meta[name="description"]').attr('content') || '';
  if (!snippet) {
    const rawBody = $('body').text().replace(/\s+/g, ' ').trim();
    snippet = rawBody.substring(0, 160) + (rawBody.length > 160 ? '...' : '');
  }

  // 4. Extract clean, stripped body text
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  return { title, snippet, bodyText };
}

/**
 * Web Crawler & Indexer with Stop-Word Filtering
 */
async function crawlAndIndex(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract high-value cleaned data
    const { title, snippet, bodyText } = extractCleanData(url, html);

    const docId = docIdCounter++;
    documentStore.set(docId, { id: docId, url, title, snippet });

    // 1. Tokenize text into words
    const rawWords = bodyText.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];

    // 2. Filter out stop words before adding to inverted index
    const valuableWords = filterStopWords(rawWords);

    valuableWords.forEach(word => {
      if (!invertedIndex.has(word)) {
        invertedIndex.set(word, new Set());
      }
      invertedIndex.get(word).add(docId);
    });

    console.log(`[Indexed] ID: ${docId} | ${url} | Clean Tokens: ${valuableWords.length}`);
  } catch (error) {
    console.error(`Failed to crawl ${url}:`, error.message);
  }
}

// Seed index with sample URLs on startup
(async () => {
  console.log('Building search index...');
  await crawlAndIndex('https://example.com');
  await crawlAndIndex('https://developer.mozilla.org/en-US/docs/Web/JavaScript');
})();

/**
 * Search API Endpoint
 */
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query) return res.json({ results: [], totalHits: 0 });

  const rawTerms = query.match(/\b[a-z0-9]+\b/g) || [];
  
  // Filter stop words out of user query unless the whole query is just a stop word
  let queryTerms = filterStopWords(rawTerms);
  if (queryTerms.length === 0) queryTerms = rawTerms;

  const matchingDocIds = new Set();

  // Find documents containing any of the query terms
  queryTerms.forEach(term => {
    if (invertedIndex.has(term)) {
      invertedIndex.get(term).forEach(id => matchingDocIds.add(id));
    }
  });

  const results = Array.from(matchingDocIds).map(id => documentStore.get(id));

  res.json({
    results,
    totalHits: results.length,
    query
  });
});

app.listen(PORT, () => {
  console.log(`Search engine backend listening on port ${PORT}`);
});