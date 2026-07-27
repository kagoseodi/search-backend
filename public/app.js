// =========================================================================
// ENGINE CONFIGURATION & SETTINGS CONTROLLER
// =========================================================================
const defaultSettings = {
    defaultTab: 'all',
    resultsLimit: '10',
    useIframe: true,
    saveHistory: true,
    theme: 'light',
    accentColor: '#1a73e8',
    useProxy: false,
    proxyUrl: 'https://corsproxy.io/?',
    smartFallback: true
};

function getStoredSettings() {
    try {
        return { ...defaultSettings, ...JSON.parse(localStorage.getItem('se_settings') || '{}') };
    } catch {
        return { ...defaultSettings };
    }
}

function updateSettings(key, value) {
    const current = getStoredSettings();
    current[key] = value;
    localStorage.setItem('se_settings', JSON.stringify(current));
}

function initSettingsUI() {
    const settings = getStoredSettings();
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

    setVal('setting-default-tab', settings.defaultTab);
    setVal('setting-results-limit', settings.resultsLimit);
    setCheck('setting-open-iframe', settings.useIframe);
    setCheck('setting-save-history', settings.saveHistory);
    setVal('setting-theme', localStorage.getItem('se_theme') || settings.theme);
    setVal('setting-accent', settings.accentColor);
    setCheck('setting-use-proxy', settings.useProxy);
    setVal('setting-proxy-url', settings.proxyUrl);
    setCheck('setting-smart-fallback', settings.smartFallback);

    updateAccentColor(settings.accentColor, false);
}

function openSettingsPage() {
    document.getElementById('homepage').style.display = 'none';
    document.getElementById('results-page').classList.remove('active');
    document.getElementById('player-page').classList.remove('active');
    document.getElementById('settings-page').classList.add('active');
    initSettingsUI();
}

function closeSettingsPage() {
    document.getElementById('settings-page').classList.remove('active');
    if (currentResults.length > 0) {
        document.getElementById('results-page').classList.add('active');
    } else {
        document.getElementById('homepage').style.display = 'flex';
    }
}

function scrollToSettingsSection(id, event) {
    const section = document.getElementById(id);
    if (section) section.scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
    if (event?.target) event.target.classList.add('active');
}

function updateThemeSetting(val) {
    const isDark = val === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    localStorage.setItem('se_theme', val);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.innerText = isDark ? '☀️ Theme' : '🌙 Theme';
    updateSettings('theme', val);
}

function updateAccentColor(color, save = true) {
    document.documentElement.style.setProperty('--primary-color', color);
    if (save) updateSettings('accentColor', color);
}

function clearAllSearchHistory() {
    if (confirm("Are you sure you want to delete all stored search history?")) {
        localStorage.setItem('se_history', JSON.stringify([]));
        alert("Search history successfully cleared.");
    }
}

function clearAllBookmarks() {
    if (confirm("Are you sure you want to clear all saved bookmarks?")) {
        localStorage.setItem('se_bookmarks', JSON.stringify([]));
        alert("Saved bookmarks successfully cleared.");
    }
}

// =========================================================================
// BACKUP & EXPORT/IMPORT JSON ENGINE
// =========================================================================
function exportEngineBackup() {
    const uid = currentUserProfile?.userId ?? 'anonymous_client';
    const backupData = {
        version: "2.7",
        exportedAt: new Date().toISOString(),
        user: currentUserProfile,
        settings: getStoredSettings(),
        shortcuts: ServerBackendPipeline.db.getShortcuts().filter(s => s.userId === uid),
        history: ServerBackendPipeline.db.getHistory().filter(h => h.userId === uid),
        bookmarks: ServerBackendPipeline.db.getBookmarks().filter(b => b.userId === uid)
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", url);
    dlAnchorElem.setAttribute("download", `searchengine_backup_${Date.now()}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
    URL.revokeObjectURL(url);
}

function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.settings) localStorage.setItem('se_settings', JSON.stringify(imported.settings));
            
            const uid = currentUserProfile?.userId ?? 'anonymous_client';
            
            if (Array.isArray(imported.shortcuts)) {
                const currentShortcuts = ServerBackendPipeline.db.getShortcuts().filter(s => s.userId !== uid);
                imported.shortcuts.forEach(s => currentShortcuts.push({ ...s, userId: uid }));
                ServerBackendPipeline.db.saveShortcuts(currentShortcuts);
            }

            if (Array.isArray(imported.history)) {
                const currentHistory = ServerBackendPipeline.db.getHistory().filter(h => h.userId !== uid);
                imported.history.forEach(h => currentHistory.push({ ...h, userId: uid }));
                ServerBackendPipeline.db.saveHistory(currentHistory);
            }

            if (Array.isArray(imported.bookmarks)) {
                const currentBookmarks = ServerBackendPipeline.db.getBookmarks().filter(b => b.userId !== uid);
                imported.bookmarks.forEach(b => currentBookmarks.push({ ...b, userId: uid }));
                ServerBackendPipeline.db.saveBookmarks(currentBookmarks);
            }

            alert("Backup imported successfully! Reloading engine state...");
            window.location.reload();
        } catch(err) {
            alert("Invalid JSON backup file format.");
        }
    };
    reader.readAsText(file);
}

// =========================================================================
// PINNED HOMEPAGE SHORTCUTS MANAGEMENT
// =========================================================================
function renderHomepageShortcuts() {
    const container = document.getElementById('homepage-shortcuts');
    if (!container) return;

    const uid = currentUserProfile?.userId ?? "anonymous_client";
    const shortcuts = ServerBackendPipeline.db.getShortcuts().filter(s => s.userId === uid);

    let html = shortcuts.map(s => {
        const initial = s.name.charAt(0).toUpperCase();
        return `
            <div class="shortcut-item" onclick="launchShortcutTarget('${encodeURIComponent(s.url)}', '${encodeURIComponent(s.name)}')">
                <button class="shortcut-remove-btn" onclick="event.stopPropagation(); removeShortcutItem('${s.id}')">×</button>
                <div class="shortcut-icon-wrapper">${initial}</div>
                <div class="shortcut-title">${s.name}</div>
            </div>`;
    }).join('');

    html += `
        <div class="shortcut-item" onclick="openShortcutModal()">
            <div class="shortcut-icon-wrapper add-shortcut-btn">＋</div>
            <div class="shortcut-title">Add shortcut</div>
        </div>`;

    container.innerHTML = html;
}

function openShortcutModal() { 
    const modal = document.getElementById('shortcut-modal');
    if (modal) modal.style.display = 'flex'; 
}

function closeShortcutModal() { 
    const modal = document.getElementById('shortcut-modal');
    if (modal) modal.style.display = 'none'; 
}

function handleShortcutSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('shortcut-name-input').value;
    const url = document.getElementById('shortcut-url-input').value;
    const uid = currentUserProfile?.userId ?? "anonymous_client";

    const shortcuts = ServerBackendPipeline.db.getShortcuts();
    shortcuts.push({ id: 'sc_' + Date.now(), userId: uid, name, url });

    ServerBackendPipeline.db.saveShortcuts(shortcuts);
    closeShortcutModal();
    document.getElementById('shortcut-form').reset();
    renderHomepageShortcuts();
}

function removeShortcutItem(id) {
    const shortcuts = ServerBackendPipeline.db.getShortcuts().filter(s => s.id !== id);
    ServerBackendPipeline.db.saveShortcuts(shortcuts);
    renderHomepageShortcuts();
}

function launchShortcutTarget(encodedUrl, encodedName) {
    const url = decodeURIComponent(encodedUrl);
    const name = decodeURIComponent(encodedName);
    const mockAsset = {
        id: 'sc-launch-' + Date.now(),
        title: name,
        url: url,
        snippet: `Custom pinned shortcut portal launcher. Opening direct media link target.`,
        source: "project",
        embedUrl: url
    };

    currentResults = [mockAsset];
    launchEnginePlayer(mockAsset.id);
}

// =========================================================================
// EMBEDDED EXPRESS/NODE.JS BACKEND EMULATION ENGINE
// =========================================================================
const ServerBackendPipeline = {
    db: {
        getUsers: () => JSON.parse(localStorage.getItem('se_users') || '[]'),
        saveUsers: (u) => localStorage.setItem('se_users', JSON.stringify(u)),
        getHistory: () => JSON.parse(localStorage.getItem('se_history') || '[]'),
        saveHistory: (h) => localStorage.setItem('se_history', JSON.stringify(h)),
        getBookmarks: () => JSON.parse(localStorage.getItem('se_bookmarks') || '[]'),
        saveBookmarks: (b) => localStorage.setItem('se_bookmarks', JSON.stringify(b)),
        getShortcuts: () => {
            const stored = localStorage.getItem('se_shortcuts');
            if (!stored) {
                const defaults = [
                    { id: 'sc_1', userId: 'anonymous_client', name: 'Lovable', url: 'https://id-preview--ec2b2780-2a68-4599-95a6-cfed6aa1e7da.lovable.app/#top' },
                    { id: 'sc_2', userId: 'anonymous_client', name: 'YouTube', url: 'https://www.youtube.com/' },
                    { id: 'sc_3', userId: 'anonymous_client', name: 'Wikipedia', url: 'https://en.wikipedia.org/' }
                ];
                localStorage.setItem('se_shortcuts', JSON.stringify(defaults));
                return defaults;
            }
            return JSON.parse(stored);
        },
        saveShortcuts: (s) => localStorage.setItem('se_shortcuts', JSON.stringify(s))
    },

    generatePseudoHash: (password, salt = 'se_secure_salt_') => {
        let hash = 0;
        const str = password + salt;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return 'hash_node_' + Math.abs(hash).toString(16);
    },

    queryPipelineSearch: async function(query, userId) {
        const settings = getStoredSettings();
        if (settings.saveHistory) {
            const logs = this.db.getHistory();
            logs.unshift({
                historyId: 'hist_' + Date.now(),
                userId: userId || "anonymous_client",
                query: query,
                timestamp: new Date().toISOString()
            });
            this.db.saveHistory(logs);
        }

        const hits = [];
        const cleanQuery = query.trim().toLowerCase();
        const term = query.charAt(0).toUpperCase() + query.slice(1);

        // 1. SPECIFIC HUB / DIRECT PLATFORM MATCHES
        if (cleanQuery.includes('youtube') || cleanQuery.includes('yt')) {
            hits.push({
                id: `yt-home-${Date.now()}`,
                title: "🔴 YouTube - Video Streaming Platform",
                url: "https://www.youtube.com/",
                snippet: "Main YouTube portal. Access millions of videos, channels, playlists, and live streams.",
                source: "youtube",
                embedUrl: "https://www.youtube.com/embed"
            });
        }

        // 2. REAL WEB ANSWERS & DUCKDUCKGO LIVE SEARCH PIPELINE
        try {
            const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&origin=*`);
            const ddgData = await ddgRes.json();
            
            if (ddgData.AbstractText) {
                hits.push({
                    id: `ddg-abstract-${Date.now()}`,
                    title: `🌐 ${ddgData.Heading || term} - Overview`,
                    url: ddgData.AbstractURL || `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                    snippet: ddgData.AbstractText,
                    source: "google",
                    embedUrl: ddgData.AbstractURL || `https://www.google.com/search?igu=1&q=${encodeURIComponent(query)}`
                });
            }

            if (ddgData.RelatedTopics && Array.isArray(ddgData.RelatedTopics)) {
                ddgData.RelatedTopics.forEach((topic, idx) => {
                    if (topic.Text && topic.FirstURL) {
                        hits.push({
                            id: `ddg-topic-${idx}-${Date.now()}`,
                            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
                            url: topic.FirstURL,
                            snippet: topic.Text,
                            source: "google",
                            embedUrl: topic.FirstURL
                        });
                    }
                });
            }
        } catch { console.log("Server Pipeline: DuckDuckGo web search API dropped."); }

        // 3. WIKIPEDIA API (REAL ENCYCLOPEDIA INFORMATION)
        try {
            const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=5`);
            const wikiData = await wikiRes.json();
            if (wikiData.query?.search) {
                wikiData.query.search.forEach(w => {
                    hits.push({
                        id: 'wiki-' + w.pageid,
                        title: `📖 ${w.title}`,
                        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(w.title)}`,
                        snippet: w.snippet.replace(/<span class="searchmatch">/g, '').replace(/<\/span>/g, '') + '...',
                        source: "wikipedia",
                        embedUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(w.title)}`
                    });
                });
            }
        } catch { console.log("Server Pipeline: Wikipedia array dropped."); }

        // 4. ARCHIVE.ORG
        const isMediaSearch = ['movie', 'film', 'cinema', 'documentary', 'classic', 'archive', 'haunted', 'night of the living dead'].some(k => cleanQuery.includes(k));
        if (isMediaSearch) {
            try {
                const archRes = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:(movies)&fl[]=identifier&fl[]=title&fl[]=description&rows=3&page=1&output=json`);
                const archData = await archRes.json();
                if (archData.response?.docs) {
                    archData.response.docs.forEach(doc => {
                        let desc = doc.description;
                        if (Array.isArray(desc)) desc = desc.join(' ');
                        desc = (desc || 'Public-domain film streamed directly from Internet Archive.').replace(/<[^>]+>/g, '');
                        hits.push({
                            id: `arch-search-${doc.identifier}`,
                            title: `🎬 ${doc.title || doc.identifier}`,
                            url: `https://archive.org/details/${doc.identifier}`,
                            snippet: desc.substring(0, 180) + (desc.length > 180 ? '...' : ''),
                            source: "archive",
                            embedUrl: `https://archive.org/embed/${doc.identifier}`
                        });
                    });
                }
            } catch { console.log("Server Pipeline: Archive.org search dropped."); }
        }

        // 5. YOUTUBE RELEVANT VIDEO RESULTS
        const youtubeVideoDatabase = [
            { title: "YouTube Official Channel & Platform Highlights", videoId: "dQw4w9WgXcQ", snippet: "Explore live streams, trending clips, and original content across YouTube." },
            { title: "JavaScript Web Development Full Course", videoId: "9bZkp7q19f0", snippet: "Full course tutorial series for modern frontend and backend development." },
            { title: "Stranger Things - Official Trailer", videoId: "b9EkMc79ZSU", snippet: "Official series trailer and preview video stream." }
        ];

        youtubeVideoDatabase.forEach((video, idx) => {
            if (video.title.toLowerCase().includes(cleanQuery) || video.snippet.toLowerCase().includes(cleanQuery) || cleanQuery.includes('youtube')) {
                hits.push({
                    id: `yt-node-${idx}-${Date.now()}`,
                    title: `🎬 ${video.title}`,
                    url: `https://www.youtube.com/watch?v=${video.videoId}`,
                    snippet: video.snippet,
                    source: "youtube",
                    embedUrl: `https://www.youtube.com/embed/${video.videoId}?autoplay=1`
                });
            }
        });

        // 6. SOCIAL & PROJECT MATCHES
        if (cleanQuery.includes('instagram') || cleanQuery.includes('social') || cleanQuery.includes('ig')) {
            hits.push({
                id: `social-ig-${Date.now()}`,
                title: `${term} - Instagram Profile Hub`,
                url: `https://www.instagram.com/`,
                snippet: `Secure social routing profile anchor. Renders verified home platform safely inside wrapper.`,
                source: "instagram",
                embedUrl: `https://www.instagram.com/`
            });
        }

        if (cleanQuery.includes('project') || cleanQuery.includes('lovable')) {
            hits.push({
                id: `lovable-project-${Date.now()}`,
                title: `✨ Featured Launch: Lovable Preview Web Platform`,
                url: `https://id-preview--ec2b2780-2a68-4599-95a6-cfed6aa1e7da.lovable.app/#top`,
                snippet: `Instant system portal access configuration. Launching this application node frames your project.`,
                source: "project",
                embedUrl: `https://id-preview--ec2b2780-2a68-4599-95a6-cfed6aa1e7da.lovable.app/#top`
            });
        }

        // FALLBACK IF NO API HITS RETURNED
        if (hits.length === 0) {
            hits.push({
                id: `fallback-${Date.now()}`,
                title: `${term} - Web Search Results`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                snippet: `Search real-time results for "${query}" on web index nodes.`,
                source: "google",
                embedUrl: `https://www.google.com/search?igu=1&q=${encodeURIComponent(query)}`
            });
        }

        return hits;
    }
};

// ENGINE STATE MANAGEMENT
let currentResults = [];
let currentTab = 'all';
let activeSessionToken = null;
let currentUserProfile = null;
let authMode = 'login';
let pendingPlaybackAsset = null;
let debounceTimer = null;
let selectedSuggestionIndex = -1;
let iframeLoadTimer = null;

function initTheme() {
    const savedTheme = localStorage.getItem('se_theme');
    const isDark = savedTheme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.innerText = isDark ? '☀️ Theme' : '🌙 Theme';
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('se_theme', isDark ? 'dark' : 'light');
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.innerText = isDark ? '☀️ Theme' : '🌙 Theme';
    updateSettings('theme', isDark ? 'dark' : 'light');
}

function handleRefreshPage() {
    window.location.reload();
}

if (!localStorage.getItem('se_users')) {
    localStorage.setItem('se_users', JSON.stringify([]));
    localStorage.setItem('se_history', JSON.stringify([]));
    localStorage.setItem('se_bookmarks', JSON.stringify([]));
}

const categoryChipsMap = {
    "music": ["Trending Hits", "Live Concerts", "Music Videos", "Lofi Beats"],
    "movies": ["Trailers", "Sci-Fi Shorts", "Top Reviews"],
    "coding": ["JavaScript Docs", "CSS Tricks", "HTML Core", "API Reference"],
    "fashion": ["Today Fashion", "Modern Trends", "Summer Looks", "Streetwear"]
};

const predictiveNextSteps = {
    "music": "lofi hip hop radio study chill sleep stream",
    "movies": "stranger things official trailer row",
    "coding": "javascript document.getelementbyid sandbox",
    "fashion": "modern style trends 2026"
};

const AuthAPI = {
    register: async (username, email, password) => {
        const users = ServerBackendPipeline.db.getUsers();
        if (users.some(u => u.email === email)) return { success: false, error: "Email already exists" };
        const salt = Math.random().toString(36).substring(2, 10);
        const passwordHash = ServerBackendPipeline.generatePseudoHash(password, salt);
        users.push({ userId: 'usr_' + Math.random().toString(36).substring(2, 12), username, email, passwordHash, salt });
        ServerBackendPipeline.db.saveUsers(users);
        return { success: true };
    },
    login: async (email, password) => {
        const users = ServerBackendPipeline.db.getUsers();
        const user = users.find(u => u.email === email);
        if (!user) return { success: false, error: "User profile not found" };
        if (ServerBackendPipeline.generatePseudoHash(password, user.salt) === user.passwordHash) {
            const token = 'jwt_mock_' + btoa(JSON.stringify({ userId: user.userId, exp: Date.now() + 3600000 }));
            return { success: true, token, user: { username: user.username, email: user.email, userId: user.userId } };
        }
        return { success: false, error: "Invalid password key match" };
    }
};

function synchronizeSessionState() {
    const savedToken = sessionStorage.getItem('se_session_token');
    const savedProfile = sessionStorage.getItem('se_user_profile');
    if (savedToken && savedProfile) {
        activeSessionToken = savedToken;
        currentUserProfile = JSON.parse(savedProfile);
        const badgeHTML = `<button class="user-badge" onclick="openDashboardModal()">👤 ${currentUserProfile.username}</button>`;
        const anchorBtn = document.getElementById('auth-anchor-btn');
        if (anchorBtn) anchorBtn.outerHTML = badgeHTML;
        const resultsNav = document.getElementById('results-profile-nav');
        if (resultsNav) resultsNav.innerHTML = badgeHTML;
    }
}

function openAuthenticationModal() { 
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'flex'; 
}

function closeAuthModal() { 
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none'; 
    const err = document.getElementById('auth-error-msg');
    if (err) err.style.display = 'none'; 
}

function toggleAuthMode() {
    const title = document.getElementById('auth-modal-title');
    const userGroup = document.getElementById('username-field-group');
    const toggleText = document.getElementById('auth-toggle-mode');
    const submitBtn = document.getElementById('auth-submit-btn');
    if (authMode === 'login') {
        authMode = 'register'; 
        if (title) title.innerText = "Create Your Account"; 
        if (userGroup) userGroup.style.display = 'block';
        document.getElementById('auth-username')?.setAttribute('required', 'true');
        if (toggleText) toggleText.innerText = "Already registered? Sign in instead"; 
        if (submitBtn) submitBtn.innerText = "Register Account";
    } else {
        authMode = 'login'; 
        if (title) title.innerText = "Sign In to SearchEngine"; 
        if (userGroup) userGroup.style.display = 'none';
        document.getElementById('auth-username')?.removeAttribute('required');
        if (toggleText) toggleText.innerText = "Don't have an account? Register instead"; 
        if (submitBtn) submitBtn.innerText = "Proceed";
    }
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const username = document.getElementById('auth-username').value;
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorElement = document.getElementById('auth-error-msg');

    if (authMode === 'register') {
        const regRes = await AuthAPI.register(username, email, password);
        if (regRes.success) {
            authMode = 'login'; 
            toggleAuthMode(); 
            errorElement.style.color = "var(--google-green)";
            errorElement.innerText = "Registration complete! Please log in."; 
            errorElement.style.display = "block";
        } else { 
            errorElement.innerText = regRes.error; 
            errorElement.style.display = "block"; 
        }
    } else {
        const loginRes = await AuthAPI.login(email, password);
        if (loginRes.success) {
            sessionStorage.setItem('se_session_token', loginRes.token);
            sessionStorage.setItem('se_user_profile', JSON.stringify(loginRes.user));
            closeAuthModal(); 
            window.location.reload();
        } else { 
            errorElement.innerText = loginRes.error; 
            errorElement.style.display = "block"; 
        }
    }
}

function openDashboardModal() {
    if (!currentUserProfile) return;
    document.getElementById('dashboard-user-title').innerText = `Hello, ${currentUserProfile.username}`;
    document.getElementById('dashboard-user-email').innerText = currentUserProfile.email;
    renderUserHistoryDashboard(); 
    renderUserBookmarksDashboard();
    document.getElementById('dashboard-modal').style.display = 'flex';
}

function closeDashboardModal() { 
    document.getElementById('dashboard-modal').style.display = 'none'; 
}

function executeUserLogout() { 
    sessionStorage.removeItem('se_session_token'); 
    sessionStorage.removeItem('se_user_profile'); 
    window.location.reload(); 
}

function runSecurityGuardAction() { 
    if (!activeSessionToken) { 
        openAuthenticationModal(); 
        return false; 
    } 
    return true; 
}

function toggleBookmarkStatus(assetId, element) {
    if (!runSecurityGuardAction()) return;
    const bookmarks = ServerBackendPipeline.db.getBookmarks();
    const index = bookmarks.findIndex(b => b.userId === currentUserProfile.userId && b.id === assetId);
    if (index > -1) {
        bookmarks.splice(index, 1);
        if (element) { element.classList.remove('saved'); element.innerHTML = `⭐ Save Target`; }
    } else {
        const asset = currentResults.find(r => r.id === assetId);
        if (asset) {
            bookmarks.push({ ...asset, userId: currentUserProfile.userId, savedAt: new Date().toISOString() });
            if (element) { element.classList.add('saved'); element.innerHTML = `★ Saved`; }
        }
    }
    ServerBackendPipeline.db.saveBookmarks(bookmarks);
}

function verifyBookmarkState(assetId) {
    if (!currentUserProfile) return false;
    const bookmarks = ServerBackendPipeline.db.getBookmarks();
    return bookmarks.some(b => b.userId === currentUserProfile.userId && b.id === assetId);
}

function deleteHistoryItem(id) {
    const logs = ServerBackendPipeline.db.getHistory().filter(l => l.historyId !== id);
    ServerBackendPipeline.db.saveHistory(logs);
    renderUserHistoryDashboard();
}

function deleteBookmarkItem(id) {
    const bmk = ServerBackendPipeline.db.getBookmarks().filter(b => b.id !== id);
    ServerBackendPipeline.db.saveBookmarks(bmk);
    renderUserBookmarksDashboard(); 
    filterTabAndRender();
}

function renderUserHistoryDashboard() {
    const list = document.getElementById('dash-history-list');
    const uid = currentUserProfile?.userId ?? "anonymous_client";
    const logs = ServerBackendPipeline.db.getHistory().filter(l => l.userId === uid);
    list.innerHTML = logs.length === 0 ? `<li style="color:var(--secondary-text)">No recent searches logged.</li>` : '';
    logs.forEach(l => {
        list.innerHTML += `<li><span>${l.query}</span><button class="delete-btn" onclick="deleteHistoryItem('${l.historyId}')">Delete</button></li>`;
    });
}

function renderUserBookmarksDashboard() {
    const list = document.getElementById('dash-bookmarks-list');
    const bmk = ServerBackendPipeline.db.getBookmarks().filter(b => b.userId === currentUserProfile?.userId);
    list.innerHTML = bmk.length === 0 ? `<li style="color:var(--secondary-text)">No saved bookmarks.</li>` : '';
    bmk.forEach(b => {
        list.innerHTML += `<li><a href="#" onclick="closeDashboardModal(); launchEnginePlayer('${b.id}')">${b.title}</a><button class="delete-btn" onclick="deleteBookmarkItem('${b.id}')">Remove</button></li>`;
    });
}

// AUTOCOMPLETE & PROACTIVE SUGGESTIONS
function processLiveSuggestions(inputElementId, dropdownId) {
    const inputField = document.getElementById(inputElementId);
    const dropdown = document.getElementById(dropdownId);
    if (!inputField || !dropdown) return;

    const rawVal = inputField.value;
    const normalized = rawVal.trim().toLowerCase();

    clearTimeout(debounceTimer);
    selectedSuggestionIndex = -1;

    if (!rawVal) {
        renderZeroInputPredictiveState(dropdown, inputElementId);
        return;
    }

    debounceTimer = setTimeout(() => {
        let segmentHTML = "";

        const uid = currentUserProfile?.userId ?? "anonymous_client";
        const userHistory = ServerBackendPipeline.db.getHistory().filter(l => l.userId === uid);
        const historyMatches = userHistory
            .filter(l => l.query.toLowerCase().includes(normalized))
            .map(l => l.query);
        const uniqueHistoryMatches = [...new Set(historyMatches)].slice(0, 3);

        if (uniqueHistoryMatches.length > 0) {
            segmentHTML += `<div class="suggestion-section"><div class="suggestion-section-title">🕒 History Matches</div>`;
            uniqueHistoryMatches.forEach(queryStr => {
                const histObj = userHistory.find(l => l.query === queryStr);
                segmentHTML += `
                    <div class="suggestion-item suggestion-nav-target" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdownId}', '${encodeURIComponent(queryStr)}')">
                        <div class="suggestion-item-main">
                            <span class="suggestion-item-icon">🕒</span>
                            <span>${queryStr}</span>
                        </div>
                        <button class="suggestion-delete-btn" onclick="event.stopPropagation(); deleteHistoryItem('${histObj ? histObj.historyId : ''}'); processLiveSuggestions('${inputElementId}', '${dropdownId}');">✕</button>
                    </div>`;
            });
            segmentHTML += `</div>`;
        }

        if (/^[\d+\-*/\s().]+$/.test(normalized) && /[\d]/.test(normalized)) {
            try {
                const calculated = Function(`'use strict'; return (${normalized})`)();
                if (calculated !== undefined && !isNaN(calculated) && isFinite(calculated)) {
                    segmentHTML += `
                        <div class="suggestion-section">
                            <div class="suggestion-section-title">📊 Core Calculator Match</div>
                            <div class="quick-action-card suggestion-nav-target" onclick="selectSuggestionToken('${inputElementId}', '${dropdownId}', '${calculated}')">
                                <div class="quick-action-main">
                                    <div class="quick-action-value">= ${calculated}</div>
                                    <div class="quick-action-label">Instant mathematical value resolution</div>
                                </div>
                                <div style="font-size:20px;">🧮</div>
                            </div>
                        </div>`;
                }
            } catch {}
        }

        segmentHTML += `
            <div class="suggestion-section">
                <div class="suggestion-section-title">🔍 Search Assertion</div>
                <div class="suggestion-item suggestion-nav-target" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdownId}', '${encodeURIComponent(rawVal)}')">
                    <div class="suggestion-item-main">
                        <span class="suggestion-item-icon">⚡</span>
                        <span>Standard execution for: <strong>${rawVal}</strong></span>
                    </div>
                </div>
            </div>`;

        dropdown.innerHTML = segmentHTML;
        dropdown.style.display = "block";
    }, 150);
}

function handleSuggestionKeyNav(e, inputId, dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown || dropdown.style.display !== 'block') return;

    const targets = dropdown.querySelectorAll('.suggestion-nav-target');
    if (targets.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % targets.length;
        updateSuggestionHighlight(targets);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + targets.length) % targets.length;
        updateSuggestionHighlight(targets);
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        selectedSuggestionIndex = -1;
    } else if ((e.key === 'Enter' || e.key === 'Tab') && selectedSuggestionIndex > -1) {
        e.preventDefault();
        targets[selectedSuggestionIndex].click();
        selectedSuggestionIndex = -1;
    }
}

function updateSuggestionHighlight(targets) {
    targets.forEach((el, idx) => {
        if (idx === selectedSuggestionIndex) {
            el.classList.add('selected');
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            el.classList.remove('selected');
        }
    });
}

function renderZeroInputPredictiveState(dropdown, inputElementId) {
    const uid = currentUserProfile?.userId ?? "anonymous_client";
    const logs = ServerBackendPipeline.db.getHistory().filter(l => l.userId === uid);
    
    if (logs.length === 0) {
        dropdown.style.display = "none";
        return;
    }

    const uniquePastQueries = [...new Set(logs.map(l => l.query))].slice(0, 3);
    let segmentHTML = `<div class="suggestion-section"><div class="suggestion-section-title">🕒 Recent Search Assertions</div>`;
    
    uniquePastQueries.forEach(q => {
        const logObj = logs.find(l => l.query === q);
        segmentHTML += `
            <div class="suggestion-item suggestion-nav-target" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdown.id}', '${encodeURIComponent(q)}')">
                <div class="suggestion-item-main">
                    <span class="suggestion-item-icon">🕒</span>
                    <span>${q}</span>
                </div>
                <button class="suggestion-delete-btn" onclick="event.stopPropagation(); deleteHistoryItem('${logObj ? logObj.historyId : ''}'); renderZeroInputPredictiveState(document.getElementById('${dropdown.id}'), '${inputElementId}');">✕</button>
            </div>`;
    });
    segmentHTML += `</div>`;
    dropdown.innerHTML = segmentHTML;
    dropdown.style.display = "block";
}

function selectSuggestionToken(inputId, dropdownId, encodedTokenValue) {
    const tokenValue = decodeURIComponent(encodedTokenValue);
    document.getElementById(inputId).value = tokenValue;
    document.getElementById(dropdownId).style.display = "none";
    runPipelineSearch(tokenValue, false);
}

function updateDynamicTabCounts() {
    const googleCount = currentResults.filter(r => r.source === 'google').length;
    const wikiCount = currentResults.filter(r => r.source === 'wikipedia').length;
    const ytCount = currentResults.filter(r => r.source === 'youtube').length;
    const igCount = currentResults.filter(r => r.source === 'instagram').length;
    const movieCount = currentResults.filter(r => r.source === 'archive' || r.source === 'vimeo' || r.source === 'streaming').length;

    const setTabLabel = (id, label) => { const el = document.getElementById(id); if (el) el.innerText = label; };
    setTabLabel('tab-all', `All Results (${currentResults.length})`);
    setTabLabel('tab-movies', `Movies (${movieCount})`);
    setTabLabel('tab-google', `Google (${googleCount})`);
    setTabLabel('tab-wikipedia', `Wikipedia (${wikiCount})`);
    setTabLabel('tab-youtube', `YouTube (${ytCount})`);
    setTabLabel('tab-instagram', `Social Matrix (${igCount})`);
}

async function runPipelineSearch(query, isLucky = false) {
    if (!query.trim()) return;

    document.getElementById('homepage-search').value = query;
    document.getElementById('results-search').value = query;

    document.getElementById('homepage-suggestions').style.display = "none";
    document.getElementById('results-suggestions').style.display = "none";

    if (!isLucky) {
        document.getElementById('homepage').style.display = 'none';
        document.getElementById('player-page').classList.remove('active');
        document.getElementById('settings-page').classList.remove('active');
        document.getElementById('results-page').classList.add('active');
    }

    const resultsMain = document.getElementById('results-main');
    const logPanel = document.getElementById('crawler-log-panel');
    const pipelineStatus = document.getElementById('crawler-pipeline-status');

    if (!isLucky && resultsMain) {
        resultsMain.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><span>Crawling indexes and framing assets securely via Node pipeline...</span></div>`;
        if (logPanel) logPanel.innerHTML = '';
        if (pipelineStatus) pipelineStatus.innerText = "Status: Server querying indexes...";
    }

    const uid = currentUserProfile?.userId ?? 'anonymous_client';
    const hits = await ServerBackendPipeline.queryPipelineSearch(query, uid);

    currentResults = hits;
    updateDynamicTabCounts();

    const settings = getStoredSettings();
    if (settings.defaultTab && settings.defaultTab !== 'all') {
        switchTab(settings.defaultTab);
    }

    if (!isLucky) {
        if (logPanel) logPanel.innerHTML = "<div>[Express/Node] Intercepted request headers.</div><div>[Backend] Applied search term filters.</div><div>[Backend] Applied igu=1 bypass configurations.</div><div>[Server] Data payloads assembled successfully.</div>";
        if (pipelineStatus) pipelineStatus.innerText = "Status: Framed index arrays ready.";
    }

    if (isLucky && currentResults.length > 0) {
        launchEnginePlayer(currentResults[0].id);
    } else {
        filterTabAndRender();
    }
}

function filterTabAndRender() {
    let filtered = currentResults;
    if (currentTab === 'movies') filtered = currentResults.filter(r => r.source === 'archive' || r.source === 'vimeo' || r.source === 'streaming');
    if (currentTab === 'google') filtered = currentResults.filter(r => r.source === 'google');
    if (currentTab === 'wikipedia') filtered = currentResults.filter(r => r.source === 'wikipedia');
    if (currentTab === 'youtube') filtered = currentResults.filter(r => r.source === 'youtube');
    if (currentTab === 'instagram') filtered = currentResults.filter(r => r.source === 'instagram');
    
    const settings = getStoredSettings();
    if (settings.resultsLimit) {
        filtered = filtered.slice(0, parseInt(settings.resultsLimit, 10));
    }

    renderGrid(filtered);
}

// UPDATED RENDER GRID WITH DICTIONARY CARD SUPPORT
function renderGrid(results) {
    const container = document.getElementById('results-main');
    if (!container) return;

    let html = `<div class="results-info">About ${results.length} active nodes welded into internal viewports</div>`;
    
    if (results.length === 0) {
        html += `<div style="margin-top:20px; color:var(--secondary-text)">No active records tracked.</div>`;
        container.innerHTML = html; 
        return;
    }

    results.forEach(res => {
        const isSaved = verifyBookmarkState(res.id);
        let displayURL = res.url;
        if (displayURL.length > 70) displayURL = displayURL.substring(0, 70) + "...";

        // Detects if the result is a live dictionary card
        const isDictionary = res.title && res.title.includes('Definition & Meaning');
        const cardSource = isDictionary ? 'DICTIONARY' : (res.source ? res.source.toUpperCase() : 'WEB');

        html += `
            <div class="result-item" ${isDictionary ? 'style="background: var(--hover-bg); border: 2px solid var(--primary-color, #1a73e8); padding: 18px; border-radius: 12px; margin-bottom: 16px;"' : (res.source === 'project' ? 'style="background: var(--hover-bg); border: 1px dashed #c084fc; padding: 16px; border-radius: 8px; margin-bottom: 12px;"' : '')}>
                <div class="result-source">
                    <span class="source-icon ${isDictionary ? 'dictionary-icon' : (res.source || 'google')}">${isDictionary ? '📖' : cardSource[0]}</span>
                    <span>${isDictionary ? 'DICTIONARY DEFINITION CARD' : `${cardSource} CONTAINER`} &nbsp;•&nbsp; <span style="color:var(--secondary-text);">${displayURL}</span></span>
                </div>
                <div class="result-title" onclick="launchEnginePlayer('${res.id}')">${res.title}</div>
                <div class="result-snippet" ${isDictionary ? 'style="font-size: 15px; font-weight: 500; margin-top: 6px;"' : ''}>${res.snippet}</div>
                <div>
                    <button class="bookmark-action-btn ${isSaved ? 'saved' : ''}" onclick="toggleBookmarkStatus('${res.id}', this)">
                        ${isSaved ? '★ Saved' : '⭐ Save Target'}
                    </button>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

// SMART FRAMING & PROXY FALLBACK ENGINE
function launchEnginePlayer(id) {
    const asset = currentResults.find(x => x.id === id);
    if (!asset) return;

    const settings = getStoredSettings();
    if (settings.useIframe === false) {
        window.open(asset.url, '_blank');
        return;
    }

    pendingPlaybackAsset = asset;
    document.getElementById('homepage').style.display = 'none';
    document.getElementById('results-page').classList.remove('active');
    document.getElementById('settings-page').classList.remove('active');
    document.getElementById('player-page').classList.add('active');

    const playerTitle = document.getElementById('internal-player-title');
    const tagContainer = document.getElementById('player-tag-container');
    const bmkBtn = document.getElementById('player-bookmark-toggle');
    const frameViewport = document.getElementById('internal-engine-iframe');
    const fallbackCard = document.getElementById('iframe-fallback-card');
    const fallbackBtn = document.getElementById('iframe-fallback-btn');
    const fallbackTitle = document.getElementById('fallback-card-title');
    const fallbackDesc = document.getElementById('fallback-card-desc');

    fallbackCard.style.display = "none";
    playerTitle.innerText = asset.title;
    fallbackBtn.href = asset.url;
    
    if (verifyBookmarkState(asset.id)) { bmkBtn.classList.add('saved'); bmkBtn.innerHTML = "★ Saved Link"; }
    else { bmkBtn.classList.remove('saved'); bmkBtn.innerHTML = "⭐ Save Link"; }
    
    bmkBtn.onclick = () => { toggleBookmarkStatus(asset.id, bmkBtn); };

    const isDictionary = asset.title && asset.title.includes('Definition & Meaning');
    if (isDictionary) {
        playerTitle.style.color = 'var(--primary-color, #1a73e8)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--primary-color, #1a73e8);">DICTIONARY REFERENCE VIEW</span>`;
    } else {
        playerTitle.style.color = 'var(--google-blue)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--google-blue);">LIVE SEARCH VIEW</span>`;
    }

    document.getElementById('player-sidebar-title').innerText = asset.title;
    document.getElementById('internal-player-snippet').innerText = asset.snippet;
    document.getElementById('player-meta-url').innerText = `Target Platform Token Location: ${asset.url}`;

    clearTimeout(iframeLoadTimer);

    let targetUrl = asset.url;
    if (settings.useProxy && settings.proxyUrl) {
        targetUrl = settings.proxyUrl + encodeURIComponent(asset.url);
    }

    fallbackTitle.innerText = "▶ Open Source Link";
    fallbackDesc.innerText = "Explore the full definition and reference source directly on their page:";
    
    frameViewport.src = targetUrl;
}

function exitInternalPlayer() {
    clearTimeout(iframeLoadTimer);
    document.getElementById('internal-engine-iframe').src = "";
    document.getElementById('iframe-fallback-card').style.display = "none";
    document.getElementById('player-page').classList.remove('active');

    if (document.getElementById('homepage').style.display === 'none' && currentResults.length === 0) {
        document.getElementById('homepage').style.display = 'flex';
    } else {
        document.getElementById('results-page').classList.add('active');
        filterTabAndRender();
    }
    pendingPlaybackAsset = null;
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tab}`);
    if (targetTab) targetTab.classList.add('active');
    filterTabAndRender();
}

// EVENT LISTENERS
document.getElementById('search-btn')?.addEventListener('click', () => runPipelineSearch(document.getElementById('homepage-search').value, false));
document.getElementById('lucky-btn')?.addEventListener('click', () => runPipelineSearch(document.getElementById('homepage-search').value, true));

document.getElementById('homepage-search')?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' && selectedSuggestionIndex === -1) runPipelineSearch(e.target.value, false); 
    else handleSuggestionKeyNav(e, 'homepage-search', 'homepage-suggestions');
});

document.getElementById('results-search')?.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter' && selectedSuggestionIndex === -1) runPipelineSearch(e.target.value, false); 
    else handleSuggestionKeyNav(e, 'results-search', 'results-suggestions');
});

document.getElementById('back-to-home')?.addEventListener('click', () => {
    document.getElementById('results-page').classList.remove('active');
    document.getElementById('player-page').classList.remove('active');
    document.getElementById('settings-page').classList.remove('active');
    document.getElementById('homepage').style.display = 'flex';
    currentResults = [];
});

document.getElementById('homepage-search')?.addEventListener('input', () => processLiveSuggestions('homepage-search', 'homepage-suggestions'));
document.getElementById('homepage-search')?.addEventListener('focus', () => processLiveSuggestions('homepage-search', 'homepage-suggestions'));

document.getElementById('results-search')?.addEventListener('input', () => processLiveSuggestions('results-search', 'results-suggestions'));
document.getElementById('results-search')?.addEventListener('focus', () => processLiveSuggestions('results-search', 'results-suggestions'));

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box') && !e.target.closest('.header-search-box')) {
        const hpSug = document.getElementById('homepage-suggestions');
        const resSug = document.getElementById('results-suggestions');
        if (hpSug) hpSug.style.display = "none";
        if (resSug) resSug.style.display = "none";
    }
});

// INITIALIZATION
initTheme();
initSettingsUI();
synchronizeSessionState();
renderHomepageShortcuts();