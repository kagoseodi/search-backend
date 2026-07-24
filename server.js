// server.js
// Run: npm install express cheerio cors
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

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
 * Enhanced Web Crawler & Indexer
 */
async function crawlAndIndex(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract high-value cleaned data
    const { title, snippet, bodyText } = extractCleanData(url, html);

    const docId = docIdCounter++;
    documentStore.set(docId, { id: docId, url, title, snippet });

    // Tokenize text for Inverted Index
    const words = bodyText.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
    words.forEach(word => {
      if (!invertedIndex.has(word)) {
        invertedIndex.set(word, new Set());
      }
      invertedIndex.get(word).add(docId);
    });

    console.log(`[Indexed] ID: ${docId} | ${url}`);
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

  const queryTerms = query.match(/\b[a-z0-9]+\b/g) || [];
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
  console.log(`Search engine backend listening at http://localhost:${PORT}`);
});