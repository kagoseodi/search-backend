const express = require('express');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { loadIndex } = require('./indexer');

const app = express();
const PORT = process.env.PORT || 3001;
// Binds to 0.0.0.0 so external networks, containers, and cloud hosts can access it[cite: 3]
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// FRONTEND STATIC SERVING
// ----------------------------------------------------
// Serves static files (index.html, app.js, styles.css) from the 'public' folder[cite: 3]
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'search_index.json');

// Stop words filter[cite: 3]
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

const visitedUrls = new Set(); // Prevents crawling the same page multiple times[cite: 3]

/**
 * Extraction Helper for Live Web Crawler
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
 * True Live Recursive Crawler & Dynamic Indexer
 */
async function crawlAndIndexLive(url, depth = 0, maxDepth = 1) {
  if (depth > maxDepth || visitedUrls.has(url)) return;
  visitedUrls.add(url);

  try {
    console.log(`[Live Crawler] Fetching: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) return;
    const html = await response.text();
    const { title, snippet, bodyText } = extractCleanData(url, html);

    // Save or update live index on disk
    let indexData = { docIdCounter: 1, documents: [], index: [] };
    if (fs.existsSync(DB_FILE)) {
      try {
        indexData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      } catch (e) {}
    }

    const documentStore = new Map(indexData.documents || []);
    const invertedIndex = new Map((indexData.index || []).map(([w, ids]) => [w, new Set(ids)]));
    let docIdCounter = indexData.docIdCounter || 1;

    const docId = docIdCounter++;
    documentStore.set(docId, { id: docId, url, title, snippet });

    const rawWords = bodyText.toLowerCase().match(/\b[a-z0-9]+\b/g) || [];
    filterStopWords(rawWords).forEach(word => {
      if (!invertedIndex.has(word)) invertedIndex.set(word, new Set());
      invertedIndex.get(word).add(docId);
    });

    // Write updated index back to disk
    const dataToSave = {
      docIdCounter,
      documents: Array.from(documentStore.entries()),
      index: Array.from(invertedIndex.entries()).map(([word, docSet]) => [word, Array.from(docSet)])
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));

    // Follow links recursively to fetch real pages dynamically
    const $ = cheerio.load(html);
    const linksToCrawl = [];
    $('a[href^="http"]').each((_, el) => {
      const link = $(el).attr('href');
      if (link && !visitedUrls.has(link)) {
        linksToCrawl.push(link);
      }
    });

    for (const nextUrl of linksToCrawl.slice(0, 2)) {
      await crawlAndIndexLive(nextUrl, depth + 1, maxDepth);
    }
  } catch (error) {
    console.error(`[Live Crawler Error] Failed to crawl ${url}:`, error.message);
  }
}

/**
 * Built-in Dictionary Lookup for Single-Word Queries (Includes unique ID for app.js rendering)
 */
async function fetchDictionaryDefinition(word) {
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || !data[0]) return null;

    const entry = data[0];
    const meanings = entry.meanings || [];
    let definitionText = '';
    let partOfSpeech = '';

    if (meanings.length > 0 && meanings[0].definitions && meanings[0].definitions.length > 0) {
      partOfSpeech = meanings[0].partOfSpeech || '';
      definitionText = meanings[0].definitions[0].definition || '';
    }

    if (!definitionText) return null;

    return {
      id: `dict-${word}-${Date.now()}`,
      url: `https://dictionary.cambridge.org/dictionary/english/${word}`,
      title: `${entry.word} (${partOfSpeech}) - Definition & Meaning`,
      snippet: `Definition: ${definitionText} Pronunciation: ${entry.phonetic || entry.phonetics?.[0]?.text || ''}`,
      score: 100
    };
  } catch (err) {
    console.error('[Dictionary API Failed]:', err.message);
    return null;
  }
}

/**
 * Live Web Search Fetcher Fallback[cite: 3]
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
      if (i >= 5) return; // Limit live hits per query[cite: 3]

      const title = $(el).find('.result__title').text().trim();
      let rawUrl = $(el).find('.result__url').attr('href') || $(el).find('.result__title a').attr('href');
      const snippet = $(el).find('.result__snippet').text().trim();

      if (rawUrl && rawUrl.includes('uddg=')) {
        try {
          const parsed = new URL('https:' + rawUrl);
          rawUrl = decodeURIComponent(parsed.searchParams.get('uddg'));
        } catch (e) {
          // Fallback if URL parsing fails[cite: 3]
        }
      }

      if (title && rawUrl) {
        liveResults.push({
          id: `live-${i}-${Date.now()}`,
          url: rawUrl,
          title,
          snippet,
          score: 1
        });
      }
    });

    return liveResults;
  } catch (err) {
    console.error('[Live Fetch Failed]:', err.message);
    return [];
  }
}

// Startup Initialization: Trigger live recursive crawl on boot
(async () => {
  console.log('[Server Startup] Triggering live web crawl initialization...');
  const initialSeeds = [
    'https://en.wikipedia.org/wiki/Main_Page',
    'https://news.ycombinator.com/'
  ];
  for (const seed of initialSeeds) {
    await crawlAndIndexLive(seed, 0, 1);
  }
  console.log('[Server Startup] Live crawl phase complete.');
})();

/**
 * Search API Endpoint using Inverted Index Lookup & Dictionary Feature
 */
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || req.query.query || '').toLowerCase().trim();
  if (!query) return res.json({ results: [], totalHits: 0 });

  const rawTerms = query.match(/\b[a-z0-9]+\b/g) || [];
  let queryTerms = filterStopWords(rawTerms);
  if (queryTerms.length === 0) queryTerms = rawTerms;

  let dictionaryResult = null;
  if (queryTerms.length === 1 && rawTerms.length === 1) {
    dictionaryResult = await fetchDictionaryDefinition(queryTerms[0]);
  }

  const index = loadIndex();
  const resultsMap = new Map();

  // Query the inverted index structure
  queryTerms.forEach(term => {
    if (index[term]) {
      index[term].forEach(item => {
        if (resultsMap.has(item.url)) {
          const existing = resultsMap.get(item.url);
          existing.score += item.frequency || 1;
        } else {
          resultsMap.set(item.url, {
            id: `idx-${item.id || Math.random()}`,
            url: item.url,
            title: item.title,
            snippet: item.snippet,
            score: item.frequency || 1
          });
        }
      });
    }
  });

  let results = Array.from(resultsMap.values())
    .sort((a, b) => b.score - a.score);

  // If fewer than 3 results exist, perform a live web fetch fallback
  if (results.length < 3) {
    const liveHits = await fetchLiveSearchResults(query);
    liveHits.forEach(hit => {
      if (!resultsMap.has(hit.url)) {
        resultsMap.set(hit.url, hit);
      }
    });

    results = Array.from(resultsMap.values())
      .sort((a, b) => b.score - a.score);
  }

  // Prepend dictionary card at the top if found
  if (dictionaryResult) {
    results.unshift(dictionaryResult);
  }

  res.json({
    query,
    totalHits: results.length,
    results
  });
});

// ----------------------------------------------------
// MAIN FRONTEND CATCH-ALL REROUTE
// ----------------------------------------------------
// Sends all non-API GET requests back to index.html[cite: 3]
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Express Server[cite: 3]
app.listen(PORT, HOST, () => {
  console.log(`Search engine backend listening on http://${HOST}:${PORT}`);
});