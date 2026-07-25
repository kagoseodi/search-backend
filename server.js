// server.js
const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
// Binds to 0.0.0.0 so external networks, containers, and cloud hosts can access it
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// FRONTEND STATIC SERVING
// ----------------------------------------------------
// Serves static files (index.html, app.js, styles.css) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'search_index.json');

// Stop words filter
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'he',
  'her', 'here', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me',
  'more', 'most', 'my', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only',
  'or', 'other', 'our', 'out', 'over', 'own', 'same', 'she', 'should', 'so',
  'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'with', 'would', 'you', 'your'
]);

function filterStopWords(words) {
  return words.filter(word => !STOP_WORDS.has(word));
}

// In-Memory Index Structures
let documentStore = new Map(); // docId -> { id, url, title, snippet }
let invertedIndex = new Map();  // word -> Set of docIds
let docIdCounter = 1;

/**
 * DATABASE COMPONENT: Save Index to Disk
 */
function saveIndexToDisk() {
  try {
    const dataToSave = {
      docIdCounter,
      documents: Array.from(documentStore.entries()),
      index: Array.from(invertedIndex.entries()).map(([word, docSet]) => [word, Array.from(docSet)])
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));
    console.log('[Database] Search index successfully saved to disk.');
  } catch (err) {
    console.error('[Database] Failed to save index to disk:', err.message);
  }
}

/**
 * DATABASE COMPONENT: Load Index from Disk on Startup
 */
function loadIndexFromDisk() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('[Database] No existing database found. Starting with a fresh index.');
    return false;
  }

  try {
    const rawData = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(rawData);

    docIdCounter = parsed.docIdCounter || 1;
    documentStore = new Map(parsed.documents || []);
    
    invertedIndex = new Map(
      (parsed.index || []).map(([word, docIds]) => [word, new Set(docIds)])
    );

    console.log(`[Database] Loaded ${documentStore.size} documents from disk.`);
    return true;
  } catch (err) {
    console.error('[Database] Failed to load index from disk:', err.message);
    return false;
  }
}

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
 * Crawler & Indexer
 */
async function crawlAndIndex(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    const { title, snippet, bodyText } = extractCleanData(url, html);

    const docId = docIdCounter++;
    documentStore.set(docId, { id: docId, url, title, snippet });

    const rawWords = bodyText.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
    const valuableWords = filterStopWords(rawWords);

    valuableWords.forEach(word => {
      if (!invertedIndex.has(word)) {
        invertedIndex.set(word, new Set());
      }
      invertedIndex.get(word).add(docId);
    });

    console.log(`[Indexed] ID: ${docId} | ${url}`);
    
    // Save to database file whenever new content is crawled
    saveIndexToDisk();
  } catch (error) {
    console.error(`Failed to crawl ${url}:`, error.message);
    throw error;
  }
}

// Startup Initialization
(async () => {
  const loaded = loadIndexFromDisk();
  
  // If no database file exists, crawl initial seed URLs
  if (!loaded) {
    console.log('Building initial search index...');
    await crawlAndIndex('https://example.com');
    await crawlAndIndex('https://developer.mozilla.org/en-US/docs/Web/JavaScript');
  }
})();

/**
 * Search API Endpoint
 */
app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query) return res.json({ results: [], totalHits: 0 });

  const rawTerms = query.match(/\b[a-z0-9]+\b/g) || [];
  let queryTerms = filterStopWords(rawTerms);
  if (queryTerms.length === 0) queryTerms = rawTerms;

  const matchingDocIds = new Set();

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

/**
 * API Endpoint: Crawl and index a URL on demand (Settings / Request Handler)
 * Works via GET (?url=https://...) or POST body ({ "url": "https://..." })
 */
app.all('/api/index-url', async (req, res) => {
  const targetUrl = req.query.url || req.body?.url;

  if (!targetUrl) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing URL parameter. Pass ?url=https://example.com or a JSON body.' 
    });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    await crawlAndIndex(parsedUrl.href);

    res.json({
      success: true,
      message: `Successfully crawled and indexed ${parsedUrl.href}`,
      totalDocuments: documentStore.size
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: `Could not crawl URL: ${err.message}` 
    });
  }
});

// ----------------------------------------------------
// MAIN FRONTEND CATCH-ALL REROUTE
// ----------------------------------------------------
// Sends all non-API GET requests back to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fixed app.listen to include HOST parameter
app.listen(PORT, HOST, () => {
  console.log(`Search engine backend listening on http://${HOST}:${PORT}`);
});