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
 * Live Web Search Fetcher
 * Dynamically queries the open web when local search results are sparse.[cite: 3]
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

/**
 * Search API Endpoint using Inverted Index Lookup
 */
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || req.query.query || '').toLowerCase().trim();
  if (!query) return res.json({ results: [], totalHits: 0 });

  const rawTerms = query.match(/\b[a-z0-9]+\b/g) || [];
  let queryTerms = filterStopWords(rawTerms);
  if (queryTerms.length === 0) queryTerms = rawTerms;

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