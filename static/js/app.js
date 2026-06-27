// State Management
let releaseNotes = [];
let filteredNotes = [];
let selectedNote = null;
let currentFilterType = 'all';
let searchQuery = '';
let currentTemplateStyle = 'hype';

// DOM Elements
const feedContainer = document.getElementById('feed-container');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const filterTabs = document.querySelectorAll('.filter-tab');
const cacheTimeLabel = document.getElementById('cache-time-label');
const cacheStatusDetail = document.getElementById('cache-status-detail');
const exportCsvBtn = document.getElementById('export-csv-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// Sidebar counts
const countTotalEl = document.getElementById('count-total');
const countFeatureEl = document.getElementById('count-feature');
const countChangeEl = document.getElementById('count-change');
const countAnnouncementEl = document.getElementById('count-announcement');
const countDeprecationEl = document.getElementById('count-deprecation');

// Modal Elements
const tweetModalBackdrop = document.getElementById('tweet-modal-backdrop');
const modalNoteBadge = document.getElementById('modal-note-badge');
const modalNoteDate = document.getElementById('modal-note-date');
const modalNoteBody = document.getElementById('modal-note-body');
const modalNoteLink = document.getElementById('modal-note-link');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const charRingFill = document.querySelector('.char-ring-fill');
const tweetPreviewText = document.getElementById('tweet-preview-text');
const modalTweetBtn = document.getElementById('modal-tweet-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');
const templateBtns = document.querySelectorAll('.template-btn');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchReleaseNotes();
    setupEventListeners();
});

// Event Listeners Setup
function setupEventListeners() {
    // Refresh action
    refreshBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Export CSV action
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportToCSV);
    }

    // Theme Toggle action
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Search action
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        applyFiltersAndSearch();
    });

    // Filter tab actions
    filterTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilterType = tab.getAttribute('data-type');
            applyFiltersAndSearch();
        });
    });

    // Sidebar quick filter actions
    const statCards = document.querySelectorAll('.sidebar .stat-card');
    statCards.forEach(card => {
        const filter = card.getAttribute('data-filter');
        if (filter) {
            card.addEventListener('click', () => {
                // Find corresponding main tab and click it
                const tab = document.querySelector(`.filter-tab[data-type="${filter}"]`);
                if (tab) tab.click();
            });
            card.style.cursor = 'pointer';
        }
    });

    // Modal close actions
    modalCancelBtn.addEventListener('click', closeTweetModal);
    modalCloseBtn.addEventListener('click', closeTweetModal);
    tweetModalBackdrop.addEventListener('click', (e) => {
        if (e.target === tweetModalBackdrop) closeTweetModal();
    });

    // Template style selection
    templateBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            templateBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTemplateStyle = btn.getAttribute('data-style');
            generateTweetText();
        });
    });

    // Textarea changes
    tweetTextarea.addEventListener('input', (e) => {
        updateTweetPreview(e.target.value);
    });

    // Submit Tweet to X
    modalTweetBtn.addEventListener('click', submitTweetToX);
}

// Fetch notes from Flask API
async function fetchReleaseNotes(forceRefresh = false) {
    showLoadingState();
    
    let url = '/api/release-notes';
    if (forceRefresh) {
        url += '?refresh=true';
        showToast('Refreshing feed...', 'info');
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        
        if (result.success) {
            releaseNotes = result.data;
            
            // Format Cache metadata display
            if (result.last_updated) {
                const updatedTime = new Date(result.last_updated);
                cacheTimeLabel.textContent = `Synced: ${updatedTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                cacheStatusDetail.textContent = forceRefresh ? 'Freshly downloaded' : 'Cached (Refreshes hourly)';
            }
            
            updateSidebarCounts();
            applyFiltersAndSearch();
            
            if (forceRefresh) {
                showToast('Release notes updated successfully!', 'success');
            }
        } else {
            showErrorState(result.error || 'Failed to fetch release notes.');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showErrorState('Failed to fetch release notes. Check backend server logs or network status.');
        showToast('Sync failed. Please try again.', 'error');
    } finally {
        hideLoadingState();
    }
}

// Stats & Sidebar Counting
function updateSidebarCounts() {
    const total = releaseNotes.length;
    const features = releaseNotes.filter(n => n.type.toLowerCase() === 'feature').length;
    const changes = releaseNotes.filter(n => n.type.toLowerCase() === 'change').length;
    const announcements = releaseNotes.filter(n => n.type.toLowerCase() === 'announcement').length;
    const deprecations = releaseNotes.filter(n => n.type.toLowerCase() === 'deprecation').length;

    countTotalEl.textContent = total;
    countFeatureEl.textContent = features;
    countChangeEl.textContent = changes;
    countAnnouncementEl.textContent = announcements;
    countDeprecationEl.textContent = deprecations;
}

// local filtering and searching logic
function applyFiltersAndSearch() {
    filteredNotes = releaseNotes.filter(note => {
        // Type filter check
        const matchesType = currentFilterType === 'all' || note.type.toLowerCase() === currentFilterType;
        
        // Search query check
        const matchesSearch = searchQuery === '' || 
            note.date.toLowerCase().includes(searchQuery) ||
            note.type.toLowerCase().includes(searchQuery) ||
            note.text.toLowerCase().includes(searchQuery);
            
        return matchesType && matchesSearch;
    });
    
    renderFeed();
}

// Render release notes to feed
function renderFeed() {
    feedContainer.innerHTML = '';
    
    if (filteredNotes.length === 0) {
        renderEmptyState();
        return;
    }
    
    // Group notes by date
    let currentDateGroup = '';
    let currentGroupContainer = null;
    
    filteredNotes.forEach((note, index) => {
        // Date heading when date changes
        if (note.date !== currentDateGroup) {
            currentDateGroup = note.date;
            
            const dateHeader = document.createElement('div');
            dateHeader.className = 'card-date-header';
            dateHeader.innerHTML = `
                <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--text-secondary);">
                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z"/>
                </svg>
                <span>${note.date}</span>
            `;
            feedContainer.appendChild(dateHeader);
        }
        
        // Render card
        const card = document.createElement('article');
        card.className = 'release-card';
        card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
        
        const badgeClass = `badge-${note.type.toLowerCase()}`;
        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-badge ${badgeClass}">
                    ${getBadgeIcon(note.type)}
                    ${note.type}
                </span>
                <span class="card-meta">Updated: ${formatRelativeTime(note.updated_iso)}</span>
            </div>
            
            <div class="card-body">
                ${note.html}
            </div>
            
            <div class="card-footer">
                <button class="btn btn-card-action btn-copy-text" data-id="${note.id}" title="Copy release note text to clipboard">
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                    Copy Text
                </button>
                <button class="btn btn-card-action btn-copy-link" data-id="${note.id}" title="Copy official Google Cloud release link to clipboard">
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                    </svg>
                    Copy Link
                </button>
                <button class="btn btn-primary btn-card-action btn-tweet-trigger" data-id="${note.id}" title="Compose a Tweet about this release note">
                    <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Tweet Note
                </button>
            </div>
        `;
        
        feedContainer.appendChild(card);
    });

    // Wire up events on the newly rendered cards
    setupCardActions();
}

// Wire card specific buttons
function setupCardActions() {
    // Copy text handler
    document.querySelectorAll('.btn-copy-text').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const noteId = btn.getAttribute('data-id');
            const note = releaseNotes.find(n => n.id === noteId);
            if (note && note.text) {
                navigator.clipboard.writeText(note.text)
                    .then(() => showToast('Release note text copied to clipboard!', 'success'))
                    .catch(() => showToast('Failed to copy text.', 'error'));
            } else {
                showToast('Text unavailable.', 'error');
            }
        });
    });

    // Copy link handler
    document.querySelectorAll('.btn-copy-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const noteId = btn.getAttribute('data-id');
            const note = releaseNotes.find(n => n.id === noteId);
            if (note && note.link) {
                navigator.clipboard.writeText(note.link)
                    .then(() => showToast('Source link copied to clipboard!', 'success'))
                    .catch(() => showToast('Failed to copy link.', 'error'));
            } else {
                showToast('Link unavailable.', 'error');
            }
        });
    });

    // Open Tweet Composer modal handler
    document.querySelectorAll('.btn-tweet-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const noteId = btn.getAttribute('data-id');
            const note = releaseNotes.find(n => n.id === noteId);
            if (note) {
                openTweetModal(note);
            }
        });
    });
}

// Modal management
function openTweetModal(note) {
    selectedNote = note;
    
    // Fill Note preview details
    modalNoteBadge.className = `card-badge badge-${note.type.toLowerCase()}`;
    modalNoteBadge.innerHTML = `${getBadgeIcon(note.type)} ${note.type}`;
    modalNoteDate.textContent = note.date;
    modalNoteBody.innerHTML = note.html;
    modalNoteLink.setAttribute('href', note.link || '#');
    
    // Reset Composer settings
    currentTemplateStyle = 'hype';
    templateBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-style') === 'hype') btn.classList.add('active');
    });

    generateTweetText();
    
    // Open Backdrop
    tweetModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden'; // Lock background scroll
}

function closeTweetModal() {
    tweetModalBackdrop.classList.remove('open');
    document.body.style.overflow = ''; // Unlock scroll
    selectedNote = null;
}

// Tweet generator based on templates
function generateTweetText() {
    if (!selectedNote) return;
    
    const maxTextSnippetLength = 120;
    let snippet = selectedNote.text;
    
    // Clean up snippet (remove excess newlines, replace tabs)
    snippet = snippet.replace(/\s+/g, ' ').trim();
    if (snippet.length > maxTextSnippetLength) {
        snippet = snippet.substring(0, maxTextSnippetLength) + '...';
    }
    
    let tweetText = '';
    const dateStr = selectedNote.date;
    const typeLabel = selectedNote.type;
    const linkStr = selectedNote.link || 'https://cloud.google.com/bigquery';

    switch (currentTemplateStyle) {
        case 'hype':
            tweetText = `⚡ New BigQuery Update (${dateStr})!\n\n${typeLabel}: ${snippet}\n\nRead more details here 👇\n${linkStr}\n\n#BigQuery #GoogleCloud #DataEngineering`;
            break;
            
        case 'professional':
            tweetText = `Google Cloud has released a new BigQuery update for ${dateStr} categorized under "${typeLabel}":\n\n"${snippet}"\n\nCheck official documentation: ${linkStr}\n\n#GoogleCloudPlatform #DataAnalytics`;
            break;
            
        case 'concise':
            tweetText = `BigQuery ${typeLabel} (${dateStr}): ${snippet} ${linkStr} #Cloud`;
            break;
            
        default:
            tweetText = `${typeLabel} Update: ${snippet} ${linkStr}`;
    }

    tweetTextarea.value = tweetText;
    updateTweetPreview(tweetText);
}

// Update Tweet Preview & Progress ring
function updateTweetPreview(text) {
    // Update live tweet mock view
    // Format hashtags/links to be blue for aesthetic realism
    let formattedText = escapeHtml(text)
        .replace(/(#[a-zA-Z0-9_]+)/g, '<a href="#">$1</a>')
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="#" target="_blank">$1</a>');
        
    tweetPreviewText.innerHTML = formattedText;

    // Calculate length & character limits
    const len = text.length;
    const limit = 280;
    
    charCounter.textContent = `${len} / ${limit}`;
    
    // Update indicator ring
    const percent = Math.min((len / limit) * 100, 100);
    const circumference = 62.8; // 2 * pi * r (10)
    const offset = circumference - (percent / 100) * circumference;
    charRingFill.style.strokeDashoffset = offset;

    // Reset warnings
    charCounter.className = 'char-count-text';
    charRingFill.style.stroke = 'var(--accent-blue)';
    modalTweetBtn.disabled = false;

    if (len > limit) {
        charCounter.classList.add('error');
        charRingFill.style.stroke = 'var(--accent-red)';
        modalTweetBtn.disabled = true;
    } else if (len > limit - 30) {
        charCounter.classList.add('warn');
        charRingFill.style.stroke = 'var(--accent-orange)';
    }

    if (len === 0) {
        modalTweetBtn.disabled = true;
    }
}

// Submit tweet - open X Web Intent
function submitTweetToX() {
    const text = tweetTextarea.value.trim();
    if (!text || text.length > 280) return;
    
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank');
    closeTweetModal();
    showToast('Redirected to X/Twitter composer!', 'success');
}

// Helper: Badge SVG Icons
function getBadgeIcon(type) {
    const iconStyle = 'style="width: 12px; height: 12px; fill: currentColor;"';
    switch (type.toLowerCase()) {
        case 'feature':
            return `<svg viewBox="0 0 24 24" ${iconStyle}><path d="M12 2L2 22h20L12 2zm0 3.99L19.53 19H4.47L12 5.99zM13 16h-2v2h2v-2zm0-6h-2v4h2v-4z"/></svg>`;
        case 'change':
            return `<svg viewBox="0 0 24 24" ${iconStyle}><path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/></svg>`;
        case 'announcement':
            return `<svg viewBox="0 0 24 24" ${iconStyle}><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h12v2H6v-2zm0-8h12v2H6V5z"/></svg>`;
        case 'deprecation':
            return `<svg viewBox="0 0 24 24" ${iconStyle}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
        default:
            return `<svg viewBox="0 0 24 24" ${iconStyle}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
    }
}

// Helper: Escape HTML string
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Helper: Relative time string formatter
function formatRelativeTime(isoString) {
    if (!isoString) return 'unknown';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHrs === 0) {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
        }
        return `${diffHrs}h ago`;
    }
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    // Fallback to absolute short date
    return date.toLocaleDateString([], {month: 'short', day: 'numeric'});
}

// Toast components
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
        icon = `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--accent-green);"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
    } else if (type === 'error') {
        icon = `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--accent-red);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
    } else {
        icon = `<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--accent-blue);"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
    }

    toast.innerHTML = `
        ${icon}
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Triggers animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// UI State modifiers
function showLoadingState() {
    refreshBtn.classList.add('loading');
}

function hideLoadingState() {
    refreshBtn.classList.remove('loading');
}

function renderEmptyState() {
    feedContainer.innerHTML = `
        <div class="empty-state">
            <div class="state-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
            </div>
            <h3 class="state-title">No updates found</h3>
            <p class="state-desc">We couldn't find any release notes matching "${searchQuery}" in this category.</p>
            <button class="btn" onclick="clearFilters()">Reset Filters</button>
        </div>
    `;
}

function showErrorState(message) {
    feedContainer.innerHTML = `
        <div class="error-state">
            <div class="state-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
            </div>
            <h3 class="state-title">Unable to load updates</h3>
            <p class="state-desc">${message}</p>
            <button class="btn btn-primary" onclick="fetchReleaseNotes(true)">Try Again</button>
        </div>
    `;
}

// Global actions helper called from HTML inline events
window.clearFilters = function() {
    searchInput.value = '';
    searchQuery = '';
    const allTab = document.querySelector('.filter-tab[data-type="all"]');
    if (allTab) allTab.click();
};

// Export currently filtered release notes to a CSV file
function exportToCSV() {
    if (filteredNotes.length === 0) {
        showToast('No notes available to export.', 'error');
        return;
    }
    
    // CSV Header row
    let csvContent = "Date,Type,Content,Link\n";
    
    // Populate data rows (with double quote escaping)
    filteredNotes.forEach(note => {
        const date = `"${note.date.replace(/"/g, '""')}"`;
        const type = `"${note.type.replace(/"/g, '""')}"`;
        const text = `"${note.text.replace(/"/g, '""')}"`;
        const link = `"${note.link.replace(/"/g, '""')}"`;
        csvContent += `${date},${type},${text},${link}\n`;
    });
    
    // Create download link and trigger download
    try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `bigquery_release_notes_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Exported CSV successfully!', 'success');
    } catch (e) {
        console.error("CSV Export error: ", e);
        showToast('Failed to export CSV.', 'error');
    }
}

// Light / Dark Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateThemeIcon(true);
    } else {
        document.body.classList.remove('light-theme');
        updateThemeIcon(false);
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcon(isLight);
    showToast(`Switched to ${isLight ? 'Light' : 'Dark'} mode!`, 'info');
}

function updateThemeIcon(isLight) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (isLight) {
        // Sun Icon representation
        icon.innerHTML = `<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41zm-12.37 12.37c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.38.39-1.02 0-1.41z"/>`;
    } else {
        // Moon Icon representation
        icon.innerHTML = `<path d="M12.3 22h-.1c-5.4 0-9.8-4.4-9.8-9.8 0-4.8 3.5-9 8.3-9.7.7-.1 1.3.4 1.4 1.1.1.7-.4 1.3-1.1 1.4-3.4.5-5.8 3.4-5.8 6.8 0 3.9 3.1 7 7 7 3.4 0 6.3-2.4 6.8-5.8.1-.7.7-1.2 1.4-1.1.7.1 1.2.7 1.1 1.4-.7 4.8-4.9 8.3-9.7 8.3z"/>`;
    }
}
