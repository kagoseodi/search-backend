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
const visitedUrls = new Set(); // Prevents crawling the same page multiple times

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

    // Track existing documents as visited so we don't re-crawl on startup
    documentStore.forEach(doc => visitedUrls.add(doc.url));

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
 * Recursive Crawler & Indexer
 * Automatically discovers, extracts, and follows links across the web.
 */
async function crawlAndIndex(url, depth = 0, maxDepth = 1) {
  if (depth > maxDepth || visitedUrls.has(url)) return;
  visitedUrls.add(url);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    
    // 1. Index the current page
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

    console.log(`[Indexed - Depth ${depth}] ID: ${docId} | ${url}`);
    saveIndexToDisk();

    // 2. Extract links on the page to automatically crawl further
    const $ = cheerio.load(html);
    const foundLinks = [];

    $('a[href^="http"]').each((_, el) => {
      const link = $(el).attr('href');
      if (link && !visitedUrls.has(link)) {
        foundLinks.push(link);
      }
    });

    // 3. Crawl up to 3 discovered child links to grow the database
    const linksToCrawl = foundLinks.slice(0, 3);
    for (const nextUrl of linksToCrawl) {
      await crawlAndIndex(nextUrl, depth + 1, maxDepth);
    }

  } catch (error) {
    console.error(`Failed to crawl ${url}:`, error.message);
  }
}

/**
 * Live Web Search Fetcher
 * Dynamically queries the open web when local search results are sparse.
 */
async function fetchLiveSearchResults(query) {
  try {
    console.log(`[Live Fetch] Searching live web for: "${query}"`);
    const targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const liveResults = [];

    $('.result').each((i, el) => {
      if (i >= 5) return; // Limit live hits per query

      const title = $(el).find('.result__title').text().trim();
      let rawUrl = $(el).find('.result__url').attr('href') || $(el).find('.result__title a').attr('href');
      const snippet = $(el).find('.result__snippet').text().trim();

      if (rawUrl && rawUrl.includes('uddg=')) {
        try {
          const parsed = new URL('https:' + rawUrl);
          rawUrl = decodeURIComponent(parsed.searchParams.get('uddg'));
        } catch (e) {
          // Fallback if URL parsing fails
        }
      }

      if (title && rawUrl && !visitedUrls.has(rawUrl)) {
        const docId = docIdCounter++;
        const newDoc = { id: docId, url: rawUrl, title, snippet };
        
        documentStore.set(docId, newDoc);
        visitedUrls.add(rawUrl);

        // Index terms into inverted index
        const words = (title + ' ' + snippet).toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
        filterStopWords(words).forEach(word => {
          if (!invertedIndex.has(word)) invertedIndex.set(word, new Set());
          invertedIndex.get(word).add(docId);
        });

        liveResults.push(newDoc);
      }
    });

    if (liveResults.length > 0) {
      saveIndexToDisk();
    }

    return liveResults;
  } catch (err) {
    console.error('[Live Fetch Failed]:', err.message);
    return [];
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
app.get('/api/search', async (req, res) => {
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

  let results = Array.from(matchingDocIds).map(id => documentStore.get(id)).filter(Boolean);

  // If local index returned few/no results, trigger live web search
  if (results.length < 3) {
    await fetchLiveSearchResults(query);
    
    // Re-query index to pull newly indexed live results
    matchingDocIds.clear();
    queryTerms.forEach(term => {
      if (invertedIndex.has(term)) {
        invertedIndex.get(term).forEach(id => matchingDocIds.add(id));
      }
    });
    results = Array.from(matchingDocIds).map(id => documentStore.get(id)).filter(Boolean);
  }

  res.json({
    results,
    totalHits: results.length,
    query
  });
});

/**
 * API Endpoint: Crawl and index a single URL on demand
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
    
    // Trigger automated recursive crawl starting from the target URL
    await crawlAndIndex(parsedUrl.href);

    res.json({
      success: true,
      message: `Successfully triggered web crawl starting from ${parsedUrl.href}`,
      totalDocuments: documentStore.size
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: `Could not crawl URL: ${err.message}` 
    });
  }
});

/**
 * API Endpoint: Crawl all websites from seed_list.json
 * Usage: GET or POST to /api/crawl-seeds
 */
app.all('/api/crawl-seeds', async (req, res) => {
  const seedsFile = path.join(__dirname, 'seed_list.json');

  if (!fs.existsSync(seedsFile)) {
    return res.status(404).json({
      success: false,
      error: 'seed_list.json not found in root directory.'
    });
  }

  try {
    const rawData = fs.readFileSync(seedsFile, 'utf-8');
    const seedUrls = JSON.parse(rawData);

    console.log(`[Seed Crawler] Starting crawl for ${seedUrls.length} seed URLs...`);

    // Loop through each seed URL in the list
    for (const seedUrl of seedUrls) {
      console.log(`[Seed Crawler] Crawling seed: ${seedUrl}`);
      await crawlAndIndex(seedUrl, 0, 1);
    }

    res.json({
      success: true,
      message: `Finished crawling ${seedUrls.length} seed sites!`,
      totalDocuments: documentStore.size
    });
  } catch (err) {
    console.error('[Seed Crawler] Error crawling seeds:', err.message);
    res.status(500).json({
      success: false,
      error: `Failed to process seeds: ${err.message}`
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