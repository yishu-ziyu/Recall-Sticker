document.addEventListener('DOMContentLoaded', () => {
  const stickerList = document.getElementById('sticker-list');
  const countSpan = document.getElementById('sticker-count');
  const refreshBtn = document.getElementById('refresh-btn');

  refreshBtn.addEventListener('click', loadStickers);

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
        ${sticker.prefix ? '...' + sticker.prefix.slice(-20) : ''}
        <span class="card-cloze">${sticker.text}</span>
        ${sticker.suffix ? sticker.suffix.slice(0, 20) + '...' : ''}
      </div>
    `;

    // Internal Reveal Logic
    const clozeSpan = card.querySelector('.card-cloze');
    clozeSpan.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger navigation
      clozeSpan.classList.toggle('revealed');
    });

    // Navigation Logic
    card.addEventListener('click', () => {
      navigateToSticker(sticker);
    });

    stickerList.appendChild(card);
  }

  function navigateToSticker(sticker) {
    // Construct Text Fragment URL
    // Format: #:~:text=[prefix-,]textStart[,textEnd][,-suffix]
    // We strive for uniqueness using prefix and suffix if available
    
    const prefix = sticker.prefix ? encodeURIComponent(sticker.prefix) + '-,' : '';
    const suffix = sticker.suffix ? ',-' + encodeURIComponent(sticker.suffix) : '';
    const text = encodeURIComponent(sticker.text);
    
    const fragment = `#:~:text=${prefix}${text}${suffix}`;
    const targetUrl = sticker.url + fragment;

    // Check if the tab is already open with this URL (ignoring hash)
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const existingTab = tabs.find(t => t.url && t.url.split('#')[0] === sticker.url);
      
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  }
});
