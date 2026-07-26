const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

// Track visited URLs to prevent loops
const visitedUrls = new Set();
const crawlQueue = [];

// Helper function to pause execution (politeness delay)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Crawls a single page, returns raw HTML & page data, and queues discovered links.
 */
async function crawlPage(currentUrl, currentDepth = 0, maxDepth = 2) {
  if (visitedUrls.has(currentUrl) || currentDepth > maxDepth) {
    return null;
  }

  visitedUrls.add(currentUrl);
  console.log(`[Crawler] Crawling (${currentDepth}): ${currentUrl}`);

  try {
    // Axios request with timeout to avoid hanging indefinitely
    const response = await axios.get(currentUrl, {
      headers: { 'User-Agent': 'MySearchEngineCrawler/1.0' },
      timeout: 5000 // 5 second timeout
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract basic page data
    const pageData = {
      url: currentUrl,
      title: $('title').text().trim() || currentUrl,
      html: html,
      crawledAt: new Date().toISOString()
    };

    // Extract links for queueing
    $('a[href]').each((_, element) => {
      let href = $(element).attr('href');
      try {
        const absoluteUrl = new URL(href, currentUrl).href;
        
        // Strip hash fragments (#section) and keep only HTTP/HTTPS
        const cleanUrl = absoluteUrl.split('#')[0];
        if (cleanUrl.startsWith('http') && !visitedUrls.has(cleanUrl)) {
          crawlQueue.push({ url: cleanUrl, depth: currentDepth + 1 });
        }
      } catch (err) {
        // Ignore invalid URLs
      }
    });

    return pageData;
  } catch (error) {
    console.error(`[Crawler Error] Could not fetch ${currentUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Main loop to process queue with rate-limiting delays.
 */
async function runCrawler(seedUrls = [], maxDepth = 2, delayMs = 1500) {
  // Add seed URLs to the queue
  seedUrls.forEach(url => crawlQueue.push({ url, depth: 0 }));

  const crawledResults = [];

  while (crawlQueue.length > 0) {
    const { url, depth } = crawlQueue.shift();
    
    const pageData = await crawlPage(url, depth, maxDepth);
    if (pageData) {
      crawledResults.push(pageData);
      console.log(`[Crawler] Successfully crawled: ${pageData.title}`);
    }

    // Politeness delay: Pause before fetching the next page
    await delay(delayMs);
  }

  console.log(`[Crawler Finished] Total pages collected: ${crawledResults.length}`);
  return crawledResults;
}

module.exports = { runCrawler };