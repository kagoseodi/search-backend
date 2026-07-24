// server.js
// Run: npm install express cheerio cors
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
// Use Render's environment port, defaulting to 3001 for local testing
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-Memory Database / Index Structure
const documentStore = new Map(); // docId -> { id, url, title, snippet }
const invertedIndex = new Map();  // word -> Set of docIds
let docIdCounter = 1;

/**
 * Basic Web Crawler & Indexer
 */
async function crawlAndIndex(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $('title').text() || url;
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const snippet = bodyText.substring(0, 160) + '...';

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
 * Root Route (Friendly health check message)
 */
app.get('/', (req, res) => {
  res.json({ message: 'Search Backend API is online! Use /search?q=query to perform a search.' });
});

/**
 * Search API Endpoint
 */
app.get('/search', (req, res) => {
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
  console.log(`Search engine backend listening on port ${PORT}`);
});
