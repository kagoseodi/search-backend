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
    return JSON.parse(localStorage.getItem('se_settings') || JSON.stringify(defaultSettings));
}

function updateSettings(key, value) {
    const current = getStoredSettings();
    current[key] = value;
    localStorage.setItem('se_settings', JSON.stringify(current));
}

function initSettingsUI() {
    const settings = getStoredSettings();
    if (document.getElementById('setting-default-tab')) document.getElementById('setting-default-tab').value = settings.defaultTab;
    if (document.getElementById('setting-results-limit')) document.getElementById('setting-results-limit').value = settings.resultsLimit;
    if (document.getElementById('setting-open-iframe')) document.getElementById('setting-open-iframe').checked = settings.useIframe;
    if (document.getElementById('setting-save-history')) document.getElementById('setting-save-history').checked = settings.saveHistory;
    if (document.getElementById('setting-theme')) document.getElementById('setting-theme').value = localStorage.getItem('se_theme') || 'light';
    if (document.getElementById('setting-accent')) document.getElementById('setting-accent').value = settings.accentColor || '#1a73e8';
    if (document.getElementById('setting-use-proxy')) document.getElementById('setting-use-proxy').checked = settings.useProxy || false;
    if (document.getElementById('setting-proxy-url')) document.getElementById('setting-proxy-url').value = settings.proxyUrl || 'https://corsproxy.io/?';
    if (document.getElementById('setting-smart-fallback')) document.getElementById('setting-smart-fallback').checked = settings.smartFallback !== undefined ? settings.smartFallback : true;
    updateAccentColor(settings.accentColor || '#1a73e8', false);
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

function scrollToSettingsSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.settings-nav-item').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
}

function updateThemeSetting(val) {
    if(val === 'dark') {
        document.body.classList.add('dark-theme');
        localStorage.setItem('se_theme', 'dark');
        document.getElementById('theme-toggle-btn').innerText = '☀️ Theme';
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('se_theme', 'light');
        document.getElementById('theme-toggle-btn').innerText = '🌙 Theme';
    }
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
    const uid = currentUserProfile ? currentUserProfile.userId : 'anonymous_client';
    const backupData = {
        version: "2.7",
        exportedAt: new Date().toISOString(),
        user: currentUserProfile,
        settings: getStoredSettings(),
        shortcuts: ServerBackendPipeline.db.getShortcuts().filter(s => s.userId === uid),
        history: ServerBackendPipeline.db.getHistory().filter(h => h.userId === uid),
        bookmarks: ServerBackendPipeline.db.getBookmarks().filter(b => b.userId === uid)
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `searchengine_backup_${Date.now()}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.settings) localStorage.setItem('se_settings', JSON.stringify(imported.settings));
            
            const uid = currentUserProfile ? currentUserProfile.userId : 'anonymous_client';
            
            if (Array.isArray(imported.shortcuts)) {
                let currentShortcuts = ServerBackendPipeline.db.getShortcuts().filter(s => s.userId !== uid);
                imported.shortcuts.forEach(s => currentShortcuts.push({ ...s, userId: uid }));
                ServerBackendPipeline.db.saveShortcuts(currentShortcuts);
            }

            if (Array.isArray(imported.history)) {
                let currentHistory = ServerBackendPipeline.db.getHistory().filter(h => h.userId !== uid);
                imported.history.forEach(h => currentHistory.push({ ...h, userId: uid }));
                ServerBackendPipeline.db.saveHistory(currentHistory);
            }

            if (Array.isArray(imported.bookmarks)) {
                let currentBookmarks = ServerBackendPipeline.db.getBookmarks().filter(b => b.userId !== uid);
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
    if(!container) return;

    const uid = currentUserProfile ? currentUserProfile.userId : "anonymous_client";
    let shortcuts = ServerBackendPipeline.db.getShortcuts().filter(s => s.userId === uid);

    let html = '';
    shortcuts.forEach((s) => {
        const initial = s.name.charAt(0).toUpperCase();
        html += `
            <div class="shortcut-item" onclick="launchShortcutTarget('${s.url}', '${s.name}')">
                <button class="shortcut-remove-btn" onclick="event.stopPropagation(); removeShortcutItem('${s.id}')">×</button>
                <div class="shortcut-icon-wrapper">${initial}</div>
                <div class="shortcut-title">${s.name}</div>
            </div>`;
    });

    html += `
        <div class="shortcut-item" onclick="openShortcutModal()">
            <div class="shortcut-icon-wrapper add-shortcut-btn">＋</div>
            <div class="shortcut-title">Add shortcut</div>
        </div>`;

    container.innerHTML = html;
}

function openShortcutModal() { document.getElementById('shortcut-modal').style.display = 'flex'; }
function closeShortcutModal() { document.getElementById('shortcut-modal').style.display = 'none'; }

function handleShortcutSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('shortcut-name-input').value;
    const url = document.getElementById('shortcut-url-input').value;
    const uid = currentUserProfile ? currentUserProfile.userId : "anonymous_client";

    let shortcuts = ServerBackendPipeline.db.getShortcuts();
    shortcuts.push({
        id: 'sc_' + Date.now(),
        userId: uid,
        name: name,
        url: url
    });

    ServerBackendPipeline.db.saveShortcuts(shortcuts);
    closeShortcutModal();
    document.getElementById('shortcut-form').reset();
    renderHomepageShortcuts();
}

function removeShortcutItem(id) {
    let shortcuts = ServerBackendPipeline.db.getShortcuts();
    shortcuts = shortcuts.filter(s => s.id !== id);
    ServerBackendPipeline.db.saveShortcuts(shortcuts);
    renderHomepageShortcuts();
}

function launchShortcutTarget(url, name) {
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
            let logs = this.db.getHistory();
            logs.unshift({
                historyId: 'hist_' + Date.now(),
                userId: userId || "anonymous_client",
                query: query,
                timestamp: new Date().toISOString()
            });
            this.db.saveHistory(logs);
        }

        let hits = [];
        const term = query.charAt(0).toUpperCase() + query.slice(1);

        // INTERNET ARCHIVE PUBLIC DOMAIN MOVIES
        const archiveMovies = [
            {
                title: "🎬 Night of the Living Dead (1968)",
                id: "night_of_the_living_dead",
                url: "https://archive.org/details/night_of_the_living_dead",
                embedUrl: "https://archive.org/embed/night_of_the_living_dead",
                snippet: "George A. Romero's seminal horror masterpiece. Full public-domain feature film streamed directly from the Internet Archive iframe player."
            },
            {
                title: "🎬 The Phantom of the Opera (1925)",
                id: "phantom_of_the_opera_1925",
                url: "https://archive.org/details/phantom_of_the_opera_1925",
                embedUrl: "https://archive.org/embed/phantom_of_the_opera_1925",
                snippet: "Lon Chaney stars as the phantom in this iconic 1925 classic silent horror film. Fully iframe compliant media node."
            },
            {
                title: "🎬 Charade (1963)",
                id: "Charade_1963",
                url: "https://archive.org/details/Charade_1963",
                embedUrl: "https://archive.org/embed/Charade_1963",
                snippet: "Audrey Hepburn and Cary Grant star in this legendary romantic mystery thriller. Streamed via official Archive.org embed driver."
            },
            {
                title: "🎬 House on Haunted Hill (1959)",
                id: "house_on_haunted_hill",
                url: "https://archive.org/details/house_on_haunted_hill",
                embedUrl: "https://archive.org/embed/house_on_haunted_hill",
                snippet: "Vincent Price invites guests to stay in a spooky mansion for $10,000. Classic 1950s horror feature node."
            },
            {
                title: "🎬 His Girl Friday (1940)",
                id: "HisGirlFriday",
                url: "https://archive.org/details/HisGirlFriday",
                embedUrl: "https://archive.org/embed/HisGirlFriday",
                snippet: "Howard Hawks' fast-talking screwball comedy starring Cary Grant and Rosalind Russell. Embed-ready media asset."
            }
        ];

        archiveMovies.forEach((m, idx) => {
            hits.push({
                id: `arch-movie-${idx}-${Date.now()}`,
                title: m.title,
                url: m.url,
                snippet: m.snippet,
                source: "archive",
                embedUrl: m.embedUrl
            });
        });

        // VIMEO MOVIES
        const vimeoMovies = [
            {
                title: "🎥 Sintel (Open Cinema Film)",
                vimeoId: "15247292",
                snippet: "Award-winning open-source fantasy short film produced by the Blender Foundation. Native Vimeo player embedding."
            },
            {
                title: "🎥 Tears of Steel (Sci-Fi Movie Short)",
                vimeoId: "35401002",
                snippet: "VFX open-source sci-fi short movie set in a dystopian future Amsterdam. Full HD Vimeo stream target."
            },
            {
                title: "🎥 In the Shadow of the Mountain",
                vimeoId: "76979871",
                snippet: "Cinematic documentary short film exploring high-altitude mountain landscapes. Direct Vimeo player embed link."
            },
            {
                title: "🎥 The Last Bloom (Cinematic Drama)",
                vimeoId: "1084537",
                snippet: "Critically acclaimed independent narrative film short with rich color grading and audio soundscapes."
            },
            {
                title: "🎥 Ocean Life 4K Cinema Showcase",
                vimeoId: "22439234",
                snippet: "Stunning 4K marine life documentary feature showcasing deep-sea biodiversity. Fully frame-compatible stream."
            }
        ];

        vimeoMovies.forEach((v, idx) => {
            hits.push({
                id: `vimeo-movie-${idx}-${Date.now()}`,
                title: v.title,
                url: `https://vimeo.com/${v.vimeoId}`,
                snippet: v.snippet,
                source: "vimeo",
                embedUrl: `https://player.vimeo.com/video/${v.vimeoId}?autoplay=1`
            });
        });

        try {
            const archRes = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+AND+mediatype:(movies)&fl[]=identifier&fl[]=title&fl[]=description&rows=5&page=1&output=json`);
            const archData = await archRes.json();
            if (archData.response && archData.response.docs) {
                archData.response.docs.forEach(doc => {
                    let desc = doc.description;
                    if (Array.isArray(desc)) desc = desc.join(' ');
                    desc = (desc || 'Public-domain film streamed directly from the Internet Archive.').replace(/<[^>]+>/g, '');
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
        } catch(e) { console.log("Server Pipeline: Archive.org live search dropped."); }

        const legalStreamingServices = [
            {
                title: `📺 Tubi — Search results for "${term}"`,
                url: `https://tubitv.com/search/${encodeURIComponent(query)}`,
                snippet: `Free, ad-supported, fully licensed movies and TV. Opens Tubi's own search results for "${term}" on their official site.`
            },
            {
                title: `📺 Pluto TV — Browse free movies & channels`,
                url: `https://pluto.tv/en/on-demand`,
                snippet: `Free, ad-supported live channels and on-demand movies from Pluto TV. Opens the official on-demand catalog to browse for "${term}".`
            }
        ];

        legalStreamingServices.forEach((s, idx) => {
            hits.push({
                id: `stream-svc-${idx}-${Date.now()}`,
                title: s.title,
                url: s.url,
                snippet: s.snippet,
                source: "streaming",
                embedUrl: s.url
            });
        });

        if (query.trim().toLowerCase() === "website project") {
            hits.push({
                id: `lovable-project-${Date.now()}`,
                title: `✨ Featured Launch: Lovable Preview Web Platform`,
                url: `https://id-preview--ec2b2780-2a68-4599-95a6-cfed6aa1e7da.lovable.app/#top`,
                snippet: `Instant system portal access configuration. Launching this application node frames your custom project node inside the secure engine canvas dashboard.`,
                source: "project",
                embedUrl: `https://id-preview--ec2b2780-2a68-4599-95a6-cfed6aa1e7da.lovable.app/#top`
            });
        }

        const clusters = ["Core Interface", "Global Trends", "Developer Matrix", "Scholar Network", "Deep Archives", "Open Indexes", "System Framework"];
        clusters.forEach((cluster, idx) => {
            hits.push({
                id: `g-node-${idx}-${Date.now()}`,
                title: `${term} - Google ${cluster} Framework`,
                url: `https://www.google.com/search?igu=1&q=${encodeURIComponent(query)}`,
                snippet: `Embedded live search data pipeline for "${query}". Clicking this node renders Google's operational search canvas inside your system viewport deck seamlessly.`,
                source: "google",
                embedUrl: `https://www.google.com/search?igu=1&q=${encodeURIComponent(query)}`
            });
        });

        try {
            const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=5`);
            const wikiData = await wikiRes.json();
            if (wikiData.query && wikiData.query.search) {
                wikiData.query.search.forEach(w => {
                    hits.push({
                        id: 'wiki-' + w.pageid,
                        title: w.title,
                        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(w.title)}`,
                        snippet: w.snippet.replace(/<span class="searchmatch">/g, '').replace(/<\/span>/g, '') + '...',
                        source: "wikipedia",
                        embedUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(w.title)}`
                    });
                });
            }
        } catch(e) { console.log("Server Pipeline: Wikipedia array dropped."); }

        const youtubeVideoDatabase = [
            { title: "Stranger Things - Trailer Core", videoId: "b9EkMc79ZSU", snippet: "Official series trailer. Embedded video viewport node." },
            { title: "Wednesday Addams - Official Teaser", videoId: "Di310WS8zLk", snippet: "Netflix release teaser. Structural stream index data." },
            { title: "System Architecture Deep Dive", videoId: "dQw4w9WgXcQ", snippet: "Technical overview. Direct framing layer support." },
            { title: "Web Development Fundamentals", videoId: "9bZkp7q19f0", snippet: "Complete tutorial series. Secure iframe media target." },
            { title: "JavaScript Advanced Concepts", videoId: "3JZ_D3ELwOQ", snippet: "Advanced JS patterns. Sandbox media deck asset." },
            { title: "Network Security Protocols", videoId: "VBlFHuCzPgY", snippet: "Security deep dive. Comprehensive sandbox framing." },
            { title: "Data Processing Optimization", videoId: "kJQP7kiw5Fk", snippet: "Performance tuning guide. Alternate runtime module." }
        ];

        youtubeVideoDatabase.forEach((video, idx) => {
            if (video.title.toLowerCase().includes(query.toLowerCase()) || 
                video.snippet.toLowerCase().includes(query.toLowerCase()) || 
                query.length > 2) {
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

        hits.push({
            id: `yt-home-${Date.now()}`,
            title: "🔴 YouTube - Video Streaming Platform",
            url: "https://www.youtube.com/",
            snippet: "Main YouTube portal. Access millions of videos, channels, and playlists. Browse trending content, subscriptions, and personalized recommendations.",
            source: "youtube",
            embedUrl: "https://www.youtube.com/"
        });

        hits.push({
            id: `social-ig-${Date.now()}`,
            title: `${term} - Instagram Operational Hub`,
            url: `https://www.instagram.com/`,
            snippet: `Secure social routing profile anchor. Deep links are protected against framing, so this node loads the verified home domain platform inside your system wrapper safely.`,
            source: "instagram",
            embedUrl: `https://www.instagram.com/`
        });

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
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('theme-toggle-btn').innerText = '☀️ Theme';
    } else {
        document.body.classList.remove('dark-theme');
        document.getElementById('theme-toggle-btn').innerText = '🌙 Theme';
    }
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('se_theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-toggle-btn').innerText = isDark ? '☀️ Theme' : '🌙 Theme';
    updateSettings('theme', isDark ? 'dark' : 'light');
}

function handleRefreshPage() {
    window.location.reload();
}

if(!localStorage.getItem('se_users')) {
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
        let users = ServerBackendPipeline.db.getUsers();
        if (users.find(u => u.email === email)) return { success: false, error: "Email already exists" };
        const salt = Math.random().toString(36).substring(2, 10);
        const passwordHash = ServerBackendPipeline.generatePseudoHash(password, salt);
        users.push({ userId: 'usr_' + Math.random().toString(36).substring(2, 12), username, email, passwordHash, salt });
        ServerBackendPipeline.db.saveUsers(users);
        return { success: true };
    },
    login: async (email, password) => {
        let users = ServerBackendPipeline.db.getUsers();
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
        document.getElementById('auth-anchor-btn').outerHTML = badgeHTML;
        const resultsNav = document.getElementById('results-profile-nav');
        if (resultsNav) resultsNav.innerHTML = badgeHTML;
    }
}

function openAuthenticationModal() { document.getElementById('auth-modal').style.display = 'flex'; }
function closeAuthModal() { document.getElementById('auth-modal').style.display = 'none'; document.getElementById('auth-error-msg').style.display = 'none'; }

function toggleAuthMode() {
    const title = document.getElementById('auth-modal-title');
    const userGroup = document.getElementById('username-field-group');
    const toggleText = document.getElementById('auth-toggle-mode');
    const submitBtn = document.getElementById('auth-submit-btn');
    if (authMode === 'login') {
        authMode = 'register'; title.innerText = "Create Your Account"; userGroup.style.display = 'block';
        document.getElementById('auth-username').setAttribute('required', 'true');
        toggleText.innerText = "Already registered? Sign in instead"; submitBtn.innerText = "Register Account";
    } else {
        authMode = 'login'; title.innerText = "Sign In to SearchEngine"; userGroup.style.display = 'none';
        document.getElementById('auth-username').removeAttribute('required');
        toggleText.innerText = "Don't have an account? Register instead"; submitBtn.innerText = "Proceed";
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
            authMode = 'login'; toggleAuthMode(); errorElement.style.color = "var(--google-green)";
            errorElement.innerText = "Registration complete! Please log in."; errorElement.style.display = "block";
        } else { errorElement.innerText = regRes.error; errorElement.style.display = "block"; }
    } else {
        const loginRes = await AuthAPI.login(email, password);
        if (loginRes.success) {
            sessionStorage.setItem('se_session_token', loginRes.token);
            sessionStorage.setItem('se_user_profile', JSON.stringify(loginRes.user));
            closeAuthModal(); window.location.reload();
        } else { errorElement.innerText = loginRes.error; errorElement.style.display = "block"; }
    }
}

function openDashboardModal() {
    if(!currentUserProfile) return;
    document.getElementById('dashboard-user-title').innerText = `Hello, ${currentUserProfile.username}`;
    document.getElementById('dashboard-user-email').innerText = currentUserProfile.email;
    renderUserHistoryDashboard(); renderUserBookmarksDashboard();
    document.getElementById('dashboard-modal').style.display = 'flex';
}
function closeDashboardModal() { document.getElementById('dashboard-modal').style.display = 'none'; }
function executeUserLogout() { sessionStorage.removeItem('se_session_token'); sessionStorage.removeItem('se_user_profile'); window.location.reload(); }
function runSecurityGuardAction() { if (!activeSessionToken) { openAuthenticationModal(); return false; } return true; }

function toggleBookmarkStatus(assetId, element) {
    if (!runSecurityGuardAction()) return;
    let bookmarks = ServerBackendPipeline.db.getBookmarks();
    const index = bookmarks.findIndex(b => b.userId === currentUserProfile.userId && b.id === assetId);
    if (index > -1) {
        bookmarks.splice(index, 1);
        if(element) { element.classList.remove('saved'); element.innerHTML = `⭐ Save Target`; }
    } else {
        const asset = currentResults.find(r => r.id === assetId);
        if (asset) {
            bookmarks.push({ ...asset, userId: currentUserProfile.userId, savedAt: new Date().toISOString() });
            if(element) { element.classList.add('saved'); element.innerHTML = `★ Saved`; }
        }
    }
    ServerBackendPipeline.db.saveBookmarks(bookmarks);
}

function verifyBookmarkState(assetId) {
    if (!currentUserProfile) return false;
    let bookmarks = ServerBackendPipeline.db.getBookmarks();
    return bookmarks.some(b => b.userId === currentUserProfile.userId && b.id === assetId);
}

function deleteHistoryItem(id) {
    let logs = ServerBackendPipeline.db.getHistory();
    logs = logs.filter(l => l.historyId !== id);
    ServerBackendPipeline.db.saveHistory(logs);
    renderUserHistoryDashboard();
}

function deleteBookmarkItem(id) {
    let bmk = ServerBackendPipeline.db.getBookmarks();
    bmk = bmk.filter(b => b.id !== id);
    ServerBackendPipeline.db.saveBookmarks(bmk);
    renderUserBookmarksDashboard(); filterTabAndRender();
}

function renderUserHistoryDashboard() {
    const list = document.getElementById('dash-history-list');
    const uid = currentUserProfile ? currentUserProfile.userId : "anonymous_client";
    let logs = ServerBackendPipeline.db.getHistory().filter(l => l.userId === uid);
    list.innerHTML = logs.length === 0 ? `<li style="color:var(--secondary-text)">No recent searches logged.</li>` : '';
    logs.forEach(l => {
        list.innerHTML += `<li><span>${l.query}</span><button class="delete-btn" onclick="deleteHistoryItem('${l.historyId}')">Delete</button></li>`;
    });
}

function renderUserBookmarksDashboard() {
    const list = document.getElementById('dash-bookmarks-list');
    let bmk = ServerBackendPipeline.db.getBookmarks().filter(b => b.userId === currentUserProfile.userId);
    list.innerHTML = bmk.length === 0 ? `<li style="color:var(--secondary-text)">No saved bookmarks.</li>` : '';
    bmk.forEach(b => {
        list.innerHTML += `<li><a href="#" onclick="closeDashboardModal(); launchEnginePlayer('${b.id}')">${b.title}</a><button class="delete-btn" onclick="deleteBookmarkItem('${b.id}')">Remove</button></li>`;
    });
}

// HISTORY-DRIVEN AUTOCOMPLETE & PROACTIVE SUGGESTIONS
function processLiveSuggestions(inputElementId, dropdownId) {
    const inputField = document.getElementById(inputElementId);
    const dropdown = document.getElementById(dropdownId);
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

        // MATCH USER HISTORY FIRST FOR AUTOCOMPLETE
        const uid = currentUserProfile ? currentUserProfile.userId : "anonymous_client";
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
                    <div class="suggestion-item suggestion-nav-target" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdownId}', '${queryStr}')">
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
                const calculated = eval(normalized);
                if(calculated !== undefined && !isNaN(calculated)) {
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
            } catch(err) {}
        }

        const currencyRegex = /^(\d+)\s*([A-Za-z]{3})\s+to\s+([A-Za-z]{3})$/i;
        if (currencyRegex.test(normalized)) {
            const matches = normalized.match(currencyRegex);
            const amount = parseFloat(matches[1]);
            const sourceCur = matches[2].toUpperCase();
            const targetCur = matches[3].toUpperCase();
            let calculatedConversion = amount * 0.92; 
            if(sourceCur === targetCur) calculatedConversion = amount;

            segmentHTML += `
                <div class="suggestion-section">
                    <div class="suggestion-section-title">💱 Exchange Interface Broker</div>
                    <div class="quick-action-card suggestion-nav-target" onclick="selectSuggestionToken('${inputElementId}', '${dropdownId}', '${calculatedConversion.toFixed(2)} ${targetCur}')">
                        <div class="quick-action-main">
                            <div class="quick-action-value">${calculatedConversion.toFixed(2)} ${targetCur}</div>
                            <div class="quick-action-label">Simulated Rate: 1 ${sourceCur} ≈ ${(calculatedConversion/amount).toFixed(4)} ${targetCur}</div>
                        </div>
                        <div style="font-size:20px;">💵</div>
                    </div>
                </div>`;
        }

        if (normalized.startsWith("weather in ")) {
            const place = rawVal.substring(11).trim();
            if(place.length > 0) {
                const formattedPlace = place.charAt(0).toUpperCase() + place.slice(1);
                segmentHTML += `
                    <div class="suggestion-section">
                        <div class="suggestion-section-title">🌦️ Atmospheric Live Vector</div>
                        <div class="quick-action-card suggestion-nav-target" onclick="selectSuggestionToken('${inputElementId}', '${dropdownId}', 'weather in ${place}')">
                            <div class="quick-action-main">
                                <div class="quick-action-value">72°F ☀️ Sunny</div>
                                <div class="quick-action-label">Current metadata index reading for ${formattedPlace}</div>
                            </div>
                            <div style="font-size:20px;">☀️</div>
                        </div>
                    </div>`;
            }
        }

        let identifiedCategory = null;
        Object.keys(categoryChipsMap).forEach(categoryKey => {
            if (normalized.includes(categoryKey)) identifiedCategory = categoryKey;
        });

        if (identifiedCategory) {
            segmentHTML += `
                <div class="suggestion-section">
                    <div class="suggestion-section-title">🏷️ Visual Filtering Sub-Chips</div>
                    <div class="chips-scroll-row">`;
            categoryChipsMap[identifiedCategory].forEach(chip => {
                segmentHTML += `<div class="suggestion-chip suggestion-nav-target" onmousedown="executeChipQuery('${inputElementId}', '${dropdownId}', '${rawVal.trim()} ${chip.toLowerCase()}')">${chip}</div>`;
            });
            segmentHTML += `</div></div>`;
        }

        segmentHTML += `
            <div class="suggestion-section">
                <div class="suggestion-section-title">🔍 Search Assertion</div>
                <div class="suggestion-item suggestion-nav-target" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdownId}', '${rawVal}')">
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
    if (dropdown.style.display !== 'block') return;

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
    const uid = currentUserProfile ? currentUserProfile.userId : "anonymous_client";
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
            <div class="suggestion-item suggestion-nav-target" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdown.id}', '${q}')">
                <div class="suggestion-item-main">
                    <span class="suggestion-item-icon">🕒</span>
                    <span>${q}</span>
                </div>
                <button class="suggestion-delete-btn" onclick="event.stopPropagation(); deleteHistoryItem('${logObj ? logObj.historyId : ''}'); renderZeroInputPredictiveState(document.getElementById('${dropdown.id}'), '${inputElementId}');">✕</button>
            </div>`;
    });
    segmentHTML += `</div>`;

    let predictedTarget = null;
    for (let i = 0; i < uniquePastQueries.length; i++) {
        const queryLower = uniquePastQueries[i].toLowerCase();
        if (predictiveNextSteps[queryLower]) {
            predictedTarget = { base: uniquePastQueries[i], recommendation: predictiveNextSteps[queryLower] };
            break;
        }
    }

    if (predictedTarget) {
        segmentHTML += `
            <div class="suggestion-section">
                <div class="suggestion-section-title">🔮 Predictive Next-Step Tracking</div>
                <div class="suggestion-item suggestion-nav-target" style="background:var(--hover-bg);" onmousedown="selectSuggestionToken('${inputElementId}', '${dropdown.id}', '${predictedTarget.recommendation}')">
                    <div class="suggestion-item-main">
                        <span class="suggestion-item-icon">✨</span>
                        <span>Continue path from <i>"${predictedTarget.base}"</i>: <strong>${predictedTarget.recommendation}</strong></span>
                    </div>
                </div>
            </div>`;
    }

    dropdown.innerHTML = segmentHTML;
    dropdown.style.display = "block";
}

function selectSuggestionToken(inputId, dropdownId, tokenValue) {
    document.getElementById(inputId).value = tokenValue;
    document.getElementById(dropdownId).style.display = "none";
    runPipelineSearch(tokenValue, false);
}

function executeChipQuery(inputId, dropdownId, evaluationQuery) {
    document.getElementById(inputId).value = evaluationQuery;
    document.getElementById(dropdownId).style.display = "none";
    runPipelineSearch(evaluationQuery, false);
}

function updateDynamicTabCounts() {
    const googleCount = currentResults.filter(r => r.source === 'google').length;
    const wikiCount = currentResults.filter(r => r.source === 'wikipedia').length;
    const ytCount = currentResults.filter(r => r.source === 'youtube').length;
    const igCount = currentResults.filter(r => r.source === 'instagram').length;
    const movieCount = currentResults.filter(r => r.source === 'archive' || r.source === 'vimeo' || r.source === 'streaming').length;

    document.getElementById('tab-all').innerText = `All Results (${currentResults.length})`;
    document.getElementById('tab-movies').innerText = `Movies (${movieCount})`;
    document.getElementById('tab-google').innerText = `Google (${googleCount})`;
    document.getElementById('tab-wikipedia').innerText = `Wikipedia (${wikiCount})`;
    document.getElementById('tab-youtube').innerText = `YouTube (${ytCount})`;
    document.getElementById('tab-instagram').innerText = `Social Matrix (${igCount})`;
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

    if (!isLucky) {
        resultsMain.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><span>Crawling indexes and framing assets securely via Node pipeline...</span></div>`;
        logPanel.innerHTML = '';
        pipelineStatus.innerText = "Status: Server querying indexes...";
    }

    const uid = currentUserProfile ? currentUserProfile.userId : 'anonymous_client';
    const hits = await ServerBackendPipeline.queryPipelineSearch(query, uid);

    currentResults = hits;
    updateDynamicTabCounts();

    const settings = getStoredSettings();
    if (settings.defaultTab && settings.defaultTab !== 'all') {
        switchTab(settings.defaultTab);
    }

    if (!isLucky) {
        logPanel.innerHTML = "<div>[Express/Node] Intercepted request headers.</div><div>[Backend] Applied search term filters.</div><div>[Backend] Applied igu=1 bypass configurations.</div><div>[Server] Data payloads assembled successfully.</div>";
        pipelineStatus.innerText = "Status: Framed index arrays ready.";
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
        filtered = filtered.slice(0, parseInt(settings.resultsLimit));
    }

    renderGrid(filtered);
}

function renderGrid(results) {
    const container = document.getElementById('results-main');
    let html = `<div class="results-info">About ${results.length} active nodes welded into internal viewports</div>`;
    
    if(results.length === 0) {
        html += `<div style="margin-top:20px; color:var(--secondary-text)">No active records tracked.</div>`;
        container.innerHTML = html; return;
    }

    results.forEach(res => {
        const isSaved = verifyBookmarkState(res.id);
        let displayURL = res.url;
        if(displayURL.length > 70) displayURL = displayURL.substring(0, 70) + "...";

        html += `
            <div class="result-item" ${res.source === 'project' ? 'style="background: var(--hover-bg); border: 1px dashed #c084fc; padding: 16px; border-radius: 8px; margin-bottom: 12px;"' : ''}>
                <div class="result-source">
                    <span class="source-icon ${res.source}">${res.source[0].toUpperCase()}</span>
                    <span>${res.source.toUpperCase()} CONTAINER &nbsp;•&nbsp; <span style="color:var(--secondary-text);">${displayURL}</span></span>
                </div>
                <div class="result-title" onclick="launchEnginePlayer('${res.id}')">${res.title}</div>
                <div class="result-snippet">${res.snippet}</div>
                <div>
                    <button class="bookmark-action-btn ${isSaved ? 'saved' : ''}" onclick="toggleBookmarkStatus('${res.id}', this)">
                        ${isSaved ? '★ Saved' : '⭐ Save Target'}
                    </button>
                </div>
            </div>`;
    });
    container.innerHTML = html;
}

// =========================================================================
// SMART FRAMING & PROXY FALLBACK ENGINE
// =========================================================================
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
    
    if(verifyBookmarkState(asset.id)) { bmkBtn.classList.add('saved'); bmkBtn.innerHTML = "★ Saved Link"; }
    else { bmkBtn.classList.remove('saved'); bmkBtn.innerHTML = "⭐ Save Link"; }
    
    bmkBtn.onclick = () => { toggleBookmarkStatus(asset.id, bmkBtn); };

    if (asset.source === 'google') {
        playerTitle.style.color = 'var(--google-blue)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--google-blue);">GOOGLE LIVE SEARCH VIEW</span>`;
    } else if (asset.source === 'archive') {
        playerTitle.style.color = 'var(--archive-orange)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--archive-orange);">INTERNET ARCHIVE MOVIE EMBED</span>`;
    } else if (asset.source === 'vimeo') {
        playerTitle.style.color = 'var(--vimeo-blue)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--vimeo-blue);">VIMEO CINEMA EMBED</span>`;
    } else if (asset.source === 'wikipedia') {
        playerTitle.style.color = '#ffffff';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:#000000;">WIKIPEDIA DATA VIEW</span>`;
    } else if (asset.source === 'instagram') {
        playerTitle.style.color = 'var(--instagram-pink)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--instagram-pink);">SOCIAL NETWORK PORTAL</span>`;
    } else if (asset.source === 'project') {
        playerTitle.style.color = '#4f46e5';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:#4f46e5;">CUSTOM PROJECT DASHBOARD</span>`;
    } else if (asset.source === 'youtube') {
        playerTitle.style.color = 'var(--youtube-red)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--youtube-red);">YOUTUBE MULTIMEDIA EMBED</span>`;
    } else if (asset.source === 'streaming') {
        playerTitle.style.color = 'var(--streaming-teal)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--streaming-teal);">FREE LICENSED STREAMING — OFFICIAL SITE</span>`;
    } else {
        playerTitle.style.color = 'var(--youtube-red)';
        tagContainer.innerHTML = `<span class="tag-pill" style="background:var(--youtube-red);">MULTIMEDIA EMBED</span>`;
    }

    document.getElementById('player-sidebar-title').innerText = asset.title;
    document.getElementById('internal-player-snippet').innerText = asset.snippet;
    document.getElementById('player-meta-url').innerText = `Target Platform Token Location: ${asset.url}`;

    clearTimeout(iframeLoadTimer);

    if (asset.source === 'streaming') {
        fallbackTitle.innerText = "▶ Watch on the Official Site";
        fallbackDesc.innerText = "This is a free, ad-supported, fully licensed streaming service. It doesn't allow in-page embedding, so playback happens on their own site:";
        fallbackCard.style.display = "flex";
        frameViewport.src = "";
        return;
    }

    let targetUrl = asset.embedUrl;
    if (settings.useProxy && settings.proxyUrl) {
        targetUrl = settings.proxyUrl + encodeURIComponent(asset.embedUrl);
    }

    fallbackTitle.innerText = "⚠️ Embedding Restricted";
    fallbackDesc.innerText = "The external web host explicitly prohibits internal frame rendering (X-Frame-Options or CSP policy). Open target directly in a new tab:";
    
    frameViewport.onerror = () => {
        if (settings.smartFallback !== false) fallbackCard.style.display = "flex";
    };

    if (settings.smartFallback !== false) {
        iframeLoadTimer = setTimeout(() => {
            try {
                if (frameViewport.contentWindow && frameViewport.contentWindow.location.href === "about:blank") {
                    fallbackCard.style.display = "flex";
                }
            } catch(e) {
                if (asset.source === 'instagram' || (asset.source === 'google' && !settings.useProxy)) {
                    fallbackCard.style.display = "flex";
                }
            }
        }, 2500);
    }

    frameViewport.src = targetUrl;
}

function exitInternalPlayer() {
    clearTimeout(iframeLoadTimer);
    document.getElementById('internal-engine-iframe').src = "";
    document.getElementById('iframe-fallback-card').style.display = "none";
    document.getElementById('player-page').classList.remove('active');

    if(document.getElementById('homepage').style.display === 'none' && currentResults.length === 0) {
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
    if (document.getElementById(`tab-${tab}`)) {
        document.getElementById(`tab-${tab}`).classList.add('active');
    }
    filterTabAndRender();
}

// EVENT LISTENERS
document.getElementById('search-btn').addEventListener('click', () => runPipelineSearch(document.getElementById('homepage-search').value, false));
document.getElementById('lucky-btn').addEventListener('click', () => runPipelineSearch(document.getElementById('homepage-search').value, true));

document.getElementById('homepage-search').addEventListener('keydown', (e) => { 
    if(e.key === 'Enter' && selectedSuggestionIndex === -1) runPipelineSearch(e.target.value, false); 
    else handleSuggestionKeyNav(e, 'homepage-search', 'homepage-suggestions');
});

document.getElementById('results-search').addEventListener('keydown', (e) => { 
    if(e.key === 'Enter' && selectedSuggestionIndex === -1) runPipelineSearch(e.target.value, false); 
    else handleSuggestionKeyNav(e, 'results-search', 'results-suggestions');
});

document.getElementById('back-to-home').addEventListener('click', () => {
    document.getElementById('results-page').classList.remove('active');
    document.getElementById('player-page').classList.remove('active');
    document.getElementById('settings-page').classList.remove('active');
    document.getElementById('homepage').style.display = 'flex';
    currentResults = [];
});

document.getElementById('homepage-search').addEventListener('input', () => processLiveSuggestions('homepage-search', 'homepage-suggestions'));
document.getElementById('homepage-search').addEventListener('focus', () => processLiveSuggestions('homepage-search', 'homepage-suggestions'));

document.getElementById('results-search').addEventListener('input', () => processLiveSuggestions('results-search', 'results-suggestions'));
document.getElementById('results-search').addEventListener('focus', () => processLiveSuggestions('results-search', 'results-suggestions'));

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box') && !e.target.closest('.header-search-box')) {
        document.getElementById('homepage-suggestions').style.display = "none";
        document.getElementById('results-suggestions').style.display = "none";
    }
});

// INITIALIZATION
initTheme();
initSettingsUI();
synchronizeSessionState();
renderHomepageShortcuts();