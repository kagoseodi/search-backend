const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, 'search_index.json');

/**
 * Loads the existing index or returns an empty object.
 */
function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const rawData = fs.readFileSync(INDEX_FILE, 'utf-8');
      return JSON.parse(rawData);
    }
  } catch (err) {
    console.error('[Indexer Error] Could not load index file:', err.message);
  }
  return {};
}

/**
 * Takes parsed page data and adds its words into the inverted index.
 * @param {object} parsedPage - The output from parser.js
 */
function addDocumentToIndex(parsedPage) {
  if (!parsedPage || !parsedPage.words) return;

  const index = loadIndex();
  const { url, title, snippet, words } = parsedPage;

  // Count word frequencies on this specific page
  const wordCounts = {};
  words.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });

  // Map each word to this document URL in the inverted index
  Object.keys(wordCounts).forEach(word => {
    if (!index[word]) {
      index[word] = [];
    }

    // Check if URL is already indexed for this word
    const existingEntryIndex = index[word].findIndex(entry => entry.url === url);

    const docEntry = {
      url,
      title,
      snippet,
      frequency: wordCounts[word],
      updatedAt: new Date().toISOString()
    };

    if (existingEntryIndex >= 0) {
      index[word][existingEntryIndex] = docEntry;
    } else {
      index[word].push(docEntry);
    }
  });

  // Save the updated inverted index back to search_index.json
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[Indexer] Indexed ${Object.keys(wordCounts).length} unique terms for ${url}`);
}

module.exports = { addDocumentToIndex, loadIndex };