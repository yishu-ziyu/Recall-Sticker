document.addEventListener('DOMContentLoaded', () => {
  const stickerList = document.getElementById('sticker-list');
  const countSpan = document.getElementById('sticker-count');
  const refreshBtn = document.getElementById('refresh-btn');
  const toggleRevealBtn = document.getElementById('toggle-reveal-btn');

  refreshBtn.addEventListener('click', loadStickers);
  if (toggleRevealBtn) {
    toggleRevealBtn.addEventListener('click', toggleAllStickers);
  }

  loadStickers();

  function loadStickers() {
    chrome.storage.local.get(null, (items) => {
      stickerList.innerHTML = '';
      let totalCount = 0;
      const allStickers = [];

      // Add URL to each sticker object for easier processing
      for (const [url, stickers] of Object.entries(items)) {
        if (Array.isArray(stickers)) {
          stickers.forEach(s => {
            allStickers.push({ ...s, url });
          });
        }
      }

      // Sort by timestamp descending (newest first)
      allStickers.sort((a, b) => b.timestamp - a.timestamp);
      totalCount = allStickers.length;

      countSpan.textContent = totalCount;

      if (totalCount === 0) {
        stickerList.innerHTML = `
          <div class="empty-state">
            <p>No stickers found.</p>
            <p>Go collect some knowledge! 🖍️</p>
          </div>
        `;
        return;
      }

      allStickers.forEach(sticker => renderCard(sticker));
    });
  }

  function renderCard(sticker) {
    const card = document.createElement('div');
    card.className = 'sticker-card';

    // Try to parse hostname for display
    let hostname = 'Unknown Source';
    try {
      hostname = new URL(sticker.url).hostname.replace('www.', '');
    } catch (e) {}

    const shortContext = (sticker.prefix || '').slice(-15) + '...';

    card.innerHTML = `
      <div class="card-source">
        <span class="card-source-text">${hostname}</span>
        <span>•</span>
        <span>${new Date(sticker.timestamp).toLocaleDateString()}</span>
      </div>
      <div class="card-context">
        ${renderStickerContent(sticker)}
      </div>
    `;

    // Internal Reveal Logic
    const clozeSpans = card.querySelectorAll('.card-cloze');
    clozeSpans.forEach(clozeSpan => {
      clozeSpan.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger navigation
        clozeSpan.classList.toggle('revealed');
      });
    });

    // Navigation Logic
    card.addEventListener('click', () => {
      navigateToSticker(sticker);
    });

    stickerList.appendChild(card);
  }

  function renderStickerContent(sticker) {
    // If we have the smart "Anki Context" (full sentence), use it
    if (sticker.context) {
      // Replace {{c1::Answer}} with <span class="card-cloze">Answer</span>
      // And escape HTML in the rest of the text to prevent XSS
      return escapeHtml(sticker.context).replace(
        /{{c1::(.*?)}}/g, 
        '<span class="card-cloze">$1</span>'
      );
    }
    
    // Fallback for old stickers
    return `${sticker.prefix ? '...' + escapeHtml(sticker.prefix) : ''}
            <span class="card-cloze">${escapeHtml(sticker.text)}</span>
            ${sticker.suffix ? escapeHtml(sticker.suffix) + '...' : ''}`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function navigateToSticker(sticker) {
    // Construct Text Fragment URL
    // Format: #:~:text=[prefix-,]textStart[,textEnd][,-suffix]
    // We strive for uniqueness using prefix and suffix if available
    
    const prefix = sticker.prefix ? encodeURIComponent(sticker.prefix) + '-,' : '';
    const suffix = sticker.suffix ? ',-' + encodeURIComponent(sticker.suffix) : '';
    const text = encodeURIComponent(sticker.text);
    
    // Use the exact source URL if available (for query params), otherwise fallback to the storage key
    const baseUrl = sticker.sourceUrl || sticker.url;
    
    const fragment = `#:~:text=${prefix}${text}${suffix}`;
    const targetUrl = baseUrl + fragment;

    // Check if the tab is already open with this URL (ignoring hash)
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      // We check for exact match on the base URL (ignoring hash) to prevent duplicates
      const existingTab = tabs.find(t => t.url && t.url.split('#')[0] === baseUrl);
      
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  }

  function toggleAllStickers() {
    const allClozes = document.querySelectorAll('.card-cloze');
    const btn = document.getElementById('toggle-reveal-btn');
    const isRevealing = btn.getAttribute('data-revealed') !== 'true';
    
    allClozes.forEach(cloze => {
      if (isRevealing) {
        cloze.classList.add('revealed');
      } else {
        cloze.classList.remove('revealed');
      }
    });
    
    btn.setAttribute('data-revealed', isRevealing);
    btn.textContent = isRevealing ? '🕶️' : '👁️';
    btn.title = isRevealing ? 'Hide All Answers' : 'Reveal All Answers';
  }
});
