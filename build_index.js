const { runCrawler } = require('./crawler');
const { parsePage } = require('./parser');
const { addDocumentToIndex } = require('./indexer');

// Starter seed URLs for your search engine to explore and index
const SEED_URLS = [
  'https://en.wikipedia.org/wiki/JavaScript',
  'https://en.wikipedia.org/wiki/Web_crawler',
  'https://en.wikipedia.org/wiki/Search_engine',
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript'
];

async function buildInitialIndex() {
  console.log('=== STARTING INDEX BUILD PIPELINE ===');
  
  // 1. Crawl pages (depth of 1, 1-second delay between requests)
  console.log('[Pipeline] Step 1: Crawling web pages...');
  const crawledPages = await runCrawler(SEED_URLS, 1, 1000);
  
  console.log(`[Pipeline] Crawling completed. Processing ${crawledPages.length} pages...`);

  // 2 & 3. Parse each crawled page and add to Inverted Index
  let indexedCount = 0;
  for (const page of crawledPages) {
    if (page && page.html) {
      console.log(`[Pipeline] Step 2 & 3: Parsing and indexing -> ${page.url}`);
      
      const parsedData = parsePage(page.url, page.html);
      if (parsedData) {
        addDocumentToIndex(parsedData);
        indexedCount++;
      }
    }
  }

  console.log(`=== INDEX BUILD COMPLETE: ${indexedCount} pages successfully added to search_index.json ===`);
}

buildInitialIndex();