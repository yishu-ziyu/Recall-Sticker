const STORAGE_KEYS = {
  TAGS: 'tags',
};

const TAG_COLORS = [
  '#4A90D9', '#D94A4A', '#4AD97A', '#D9A84A', '#9B4AD9',
  '#4AD9D9', '#D94A8C', '#8C4AD9', '#4A8CD9', '#D97A4A'
];

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeTagColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : TAG_COLORS[0];
}

function getStickerKey(sticker) {
  return [
    sticker.url,
    sticker.text || '',
    sticker.prefix || '',
    sticker.suffix || '',
    sticker.timestamp || '',
    sticker.sourceUrl || ''
  ].join('||');
}

function isSameSticker(storedSticker, targetSticker) {
  return storedSticker.text === targetSticker.text &&
    (storedSticker.prefix || '') === (targetSticker.prefix || '') &&
    (storedSticker.suffix || '') === (targetSticker.suffix || '') &&
    (!targetSticker.timestamp || storedSticker.timestamp === targetSticker.timestamp);
}

function isStickerCollection(storageKey, value) {
  return storageKey !== STORAGE_KEYS.TAGS && Array.isArray(value);
}

document.addEventListener('DOMContentLoaded', () => {
  const stickerList = document.getElementById('sticker-list');
  const countSpan = document.getElementById('sticker-count');
  const refreshBtn = document.getElementById('refresh-btn');
  const toggleRevealBtn = document.getElementById('toggle-reveal-btn');
  const tagManageBtn = document.getElementById('tag-manage-btn');
  const tagModal = document.getElementById('tag-modal');
  const searchInput = document.getElementById('search-input');
  const tagFilter = document.getElementById('tag-filter');
  const multiSelectBtn = document.getElementById('multi-select-btn');
  const bulkActions = document.getElementById('bulk-actions');
  const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
  const bulkAddTagBtn = document.getElementById('bulk-add-tag-btn');
  const cancelMultiSelectBtn = document.getElementById('cancel-multi-select-btn');
  const createTagBtn = document.getElementById('create-tag-btn');
  const newTagName = document.getElementById('new-tag-name');
  const newTagColor = document.getElementById('new-tag-color');
  const assignTagModal = document.getElementById('assign-tag-modal');
  const assignTagTitle = document.getElementById('assign-tag-title');
  const assignTagList = document.getElementById('assign-tag-list');
  const assignTagSaveBtn = document.getElementById('assign-tag-save-btn');
  const assignTagCancelBtn = document.getElementById('assign-tag-cancel-btn');

  let allTags = [];
  let allStickers = [];
  let filteredStickers = [];
  let isMultiSelectMode = false;
  let selectedStickerKeys = new Set();
  let pendingTagAssignment = null;

  refreshBtn?.addEventListener('click', reloadAll);
  toggleRevealBtn?.addEventListener('click', toggleAllStickers);

  tagManageBtn?.addEventListener('click', () => {
    tagModal?.classList.add('active');
    renderTagList();
  });

  tagModal?.querySelector('.modal-close')?.addEventListener('click', closeTagModal);
  tagModal?.addEventListener('click', (event) => {
    if (event.target === tagModal) closeTagModal();
  });

  searchInput?.addEventListener('input', debounce(applyFilters, 200));
  tagFilter?.addEventListener('change', applyFilters);

  multiSelectBtn?.addEventListener('click', () => {
    if (isMultiSelectMode) {
      exitMultiSelectMode();
      return;
    }
    enterMultiSelectMode();
  });

  cancelMultiSelectBtn?.addEventListener('click', exitMultiSelectMode);
  bulkDeleteBtn?.addEventListener('click', bulkDelete);
  bulkAddTagBtn?.addEventListener('click', openBulkTagAssignment);

  createTagBtn?.addEventListener('click', () => {
    const name = newTagName?.value.trim();
    if (!name) return;

    const color = normalizeTagColor(newTagColor?.value || TAG_COLORS[0]);
    createTag(name, color);
    newTagName.value = '';
    newTagColor.value = TAG_COLORS[0];
  });

  newTagName?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      createTagBtn?.click();
    }
  });

  assignTagModal?.querySelector('.modal-close')?.addEventListener('click', closeAssignTagModal);
  assignTagCancelBtn?.addEventListener('click', closeAssignTagModal);
  assignTagModal?.addEventListener('click', (event) => {
    if (event.target === assignTagModal) closeAssignTagModal();
  });
  assignTagSaveBtn?.addEventListener('click', saveTagAssignment);

  reloadAll();

  function reloadAll() {
    loadTags(() => {
      loadStickers();
    });
  }

  function loadTags(callback) {
    chrome.storage.local.get([STORAGE_KEYS.TAGS], (result) => {
      allTags = Array.isArray(result[STORAGE_KEYS.TAGS]) ? result[STORAGE_KEYS.TAGS] : [];
      renderTagFilter();
      renderTagList();
      callback?.();
    });
  }

  function saveTags(tags, callback) {
    allTags = tags.map(tag => ({
      ...tag,
      color: normalizeTagColor(tag.color),
    }));
    chrome.storage.local.set({ [STORAGE_KEYS.TAGS]: allTags }, () => {
      renderTagFilter();
      renderTagList();
      applyFilters();
      callback?.();
    });
  }

  function loadStickers() {
    chrome.storage.local.get(null, (items) => {
      allStickers = collectStickers(items);
      applyFilters();
    });
  }

  function collectStickers(items) {
    const stickers = [];
    for (const [url, storedValue] of Object.entries(items)) {
      if (!isStickerCollection(url, storedValue)) continue;
      storedValue.forEach(sticker => {
        if (!sticker || typeof sticker !== 'object' || !sticker.text) return;
        stickers.push({ ...sticker, url });
      });
    }
    return stickers.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  function createTag(name, color) {
    const normalizedName = name.trim();
    const isDuplicate = allTags.some(tag => tag.name.toLowerCase() === normalizedName.toLowerCase());
    if (isDuplicate) {
      alert('标签已存在');
      return;
    }

    saveTags([
      ...allTags,
      {
        id: generateId('tag'),
        name: normalizedName,
        color,
      }
    ]);
  }

  function deleteTag(tagId) {
    const tag = allTags.find(item => item.id === tagId);
    if (!tag || !confirm(`确定删除标签「${tag.name}」？`)) return;

    const tags = allTags.filter(item => item.id !== tagId);
    saveTags(tags, () => {
      removeTagFromAllStickers(tagId);
    });
  }

  function removeTagFromAllStickers(tagId) {
    chrome.storage.local.get(null, (items) => {
      const updates = {};
      for (const [url, stickers] of Object.entries(items)) {
        if (!isStickerCollection(url, stickers)) continue;
        let modified = false;
        const nextStickers = stickers.map(sticker => {
          if (!Array.isArray(sticker.tags) || !sticker.tags.includes(tagId)) return sticker;
          modified = true;
          return {
            ...sticker,
            tags: sticker.tags.filter(id => id !== tagId),
          };
        });
        if (modified) updates[url] = nextStickers;
      }

      if (Object.keys(updates).length === 0) {
        loadStickers();
        return;
      }
      chrome.storage.local.set(updates, loadStickers);
    });
  }

  function renderTagFilter() {
    if (!tagFilter) return;
    const currentValue = tagFilter.value;
    tagFilter.innerHTML = '<option value="">全部标签</option>';
    allTags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag.id;
      option.textContent = tag.name;
      option.style.color = normalizeTagColor(tag.color);
      tagFilter.appendChild(option);
    });

    if (allTags.some(tag => tag.id === currentValue)) {
      tagFilter.value = currentValue;
    }
  }

  function renderTagList() {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return;
    tagList.innerHTML = '';

    if (allTags.length === 0) {
      tagList.innerHTML = '<div class="empty-tags">暂无标签，点击下方按钮创建</div>';
      return;
    }

    allTags.forEach(tag => {
      const tagEl = document.createElement('div');
      tagEl.className = 'tag-item';
      tagEl.innerHTML = `
        <span class="tag-color" style="background-color: ${normalizeTagColor(tag.color)}"></span>
        <span class="tag-name">${escapeHtml(tag.name)}</span>
        <button class="tag-delete-btn" data-id="${escapeHtml(tag.id)}" title="删除标签">🗑️</button>
      `;
      tagEl.querySelector('.tag-delete-btn')?.addEventListener('click', () => deleteTag(tag.id));
      tagList.appendChild(tagEl);
    });
  }

  function closeTagModal() {
    tagModal?.classList.remove('active');
  }

  function editSticker(sticker) {
    const newText = prompt('编辑贴纸内容：', sticker.text);
    if (!newText || !newText.trim() || newText === sticker.text) return;
    updateStoredSticker(sticker, (storedSticker) => {
      const nextSticker = {
        ...storedSticker,
        text: newText.trim(),
      };
      if (nextSticker.context) {
        const oldCloze = `{{c1::${sticker.text}}}`;
        const newCloze = `{{c1::${nextSticker.text}}}`;
        nextSticker.context = nextSticker.context.replace(oldCloze, newCloze);
      }
      return nextSticker;
    }, loadStickers);
  }

  function applyFilters() {
    const searchText = (searchInput?.value || '').trim().toLowerCase();
    const selectedTag = tagFilter?.value || '';

    filteredStickers = allStickers.filter(sticker => {
      if (searchText) {
        const haystack = [
          sticker.text,
          sticker.context,
          sticker.url,
          getHostname(sticker.url),
          ...(sticker.tags || []).map(tagId => getTag(tagId)?.name || '')
        ].join(' ').toLowerCase();
        if (!haystack.includes(searchText)) return false;
      }

      if (selectedTag && !sticker.tags?.includes(selectedTag)) {
        return false;
      }

      return true;
    });

    renderStickers();
  }

  function renderStickers() {
    stickerList.innerHTML = '';
    countSpan.textContent = filteredStickers.length;
    updateBulkCount();

    if (filteredStickers.length === 0) {
      stickerList.innerHTML = `
        <div class="empty-state">
          <p>No stickers found.</p>
          <p>${searchInput?.value ? 'Try a different search.' : 'Go collect some knowledge! 🖍️'}</p>
        </div>
      `;
      return;
    }

    filteredStickers.forEach(sticker => renderCard(sticker));
  }

  function enterMultiSelectMode() {
    isMultiSelectMode = true;
    selectedStickerKeys.clear();
    multiSelectBtn?.classList.add('active');
    bulkActions?.classList.add('active');
    renderStickers();
  }

  function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedStickerKeys.clear();
    multiSelectBtn?.classList.remove('active');
    bulkActions?.classList.remove('active');
    updateBulkCount();
    renderStickers();
  }

  function toggleStickerSelection(sticker) {
    const key = getStickerKey(sticker);
    if (selectedStickerKeys.has(key)) {
      selectedStickerKeys.delete(key);
    } else {
      selectedStickerKeys.add(key);
    }
    updateBulkCount();
    renderSelectionState(key);
  }

  function renderSelectionState(key) {
    const card = stickerList.querySelector(`[data-sticker-key="${cssEscape(key)}"]`);
    if (!card) return;
    const isSelected = selectedStickerKeys.has(key);
    card.classList.toggle('selected', isSelected);
    const checkbox = card.querySelector('.card-checkbox input');
    if (checkbox) checkbox.checked = isSelected;
  }

  function updateBulkCount() {
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.textContent = selectedStickerKeys.size;
  }

  function bulkDelete() {
    if (selectedStickerKeys.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedStickerKeys.size} 个贴纸？`)) return;

    chrome.storage.local.get(null, (items) => {
      const updates = {};
      for (const [url, stickers] of Object.entries(items)) {
        if (!isStickerCollection(url, stickers)) continue;
        const nextStickers = stickers.filter(sticker => {
          return !selectedStickerKeys.has(getStickerKey({ ...sticker, url }));
        });
        if (nextStickers.length !== stickers.length) updates[url] = nextStickers;
      }

      chrome.storage.local.set(updates, () => {
        exitMultiSelectMode();
        loadStickers();
      });
    });
  }

  function openBulkTagAssignment() {
    if (selectedStickerKeys.size === 0) return;
    if (allTags.length === 0) {
      alert('请先创建标签');
      return;
    }

    pendingTagAssignment = {
      type: 'bulk-add',
      stickerKeys: new Set(selectedStickerKeys),
      selectedTags: new Set(),
    };
    openAssignTagModal(`给 ${selectedStickerKeys.size} 个贴纸添加标签`, '勾选后会追加到已选贴纸，未勾选的标签不会被移除。');
  }

  function openSingleTagAssignment(sticker) {
    if (allTags.length === 0) {
      alert('暂无标签，请先在标签管理中创建标签');
      return;
    }

    pendingTagAssignment = {
      type: 'single-set',
      sticker,
      selectedTags: new Set(sticker.tags || []),
    };
    openAssignTagModal('分配标签', '勾选状态会替换这个贴纸当前的标签。');
  }

  function openAssignTagModal(title, helpText) {
    if (!assignTagModal || !assignTagList) return;
    assignTagTitle.textContent = title;
    renderAssignTagList(helpText);
    assignTagModal.classList.add('active');
  }

  function renderAssignTagList(helpText) {
    assignTagList.innerHTML = '';
    allTags.forEach(tag => {
      const item = document.createElement('label');
      item.className = 'assign-tag-item';
      item.innerHTML = `
        <input type="checkbox" value="${escapeHtml(tag.id)}">
        <span class="tag-color" style="background-color: ${normalizeTagColor(tag.color)}"></span>
        <span class="tag-name">${escapeHtml(tag.name)}</span>
      `;
      const input = item.querySelector('input');
      input.checked = pendingTagAssignment?.selectedTags.has(tag.id) || false;
      input.addEventListener('change', () => {
        if (input.checked) {
          pendingTagAssignment.selectedTags.add(tag.id);
        } else {
          pendingTagAssignment.selectedTags.delete(tag.id);
        }
      });
      assignTagList.appendChild(item);
    });

    const help = document.createElement('div');
    help.className = 'assign-tag-help';
    help.textContent = helpText;
    assignTagList.appendChild(help);
  }

  function closeAssignTagModal() {
    pendingTagAssignment = null;
    assignTagModal?.classList.remove('active');
  }

  function saveTagAssignment() {
    if (!pendingTagAssignment) return;

    if (pendingTagAssignment.type === 'single-set') {
      const nextTags = Array.from(pendingTagAssignment.selectedTags);
      updateStoredSticker(pendingTagAssignment.sticker, (storedSticker) => ({
        ...storedSticker,
        tags: nextTags,
      }), () => {
        closeAssignTagModal();
        loadStickers();
      });
      return;
    }

    if (pendingTagAssignment.type === 'bulk-add') {
      const selectedTags = Array.from(pendingTagAssignment.selectedTags);
      if (selectedTags.length === 0) {
        closeAssignTagModal();
        return;
      }

      chrome.storage.local.get(null, (items) => {
        const updates = {};
        for (const [url, stickers] of Object.entries(items)) {
          if (!isStickerCollection(url, stickers)) continue;
          let modified = false;
          const nextStickers = stickers.map(sticker => {
            const key = getStickerKey({ ...sticker, url });
            if (!pendingTagAssignment.stickerKeys.has(key)) return sticker;

            const nextTags = new Set(sticker.tags || []);
            selectedTags.forEach(tagId => nextTags.add(tagId));
            modified = true;
            return {
              ...sticker,
              tags: Array.from(nextTags),
            };
          });
          if (modified) updates[url] = nextStickers;
        }

        chrome.storage.local.set(updates, () => {
          closeAssignTagModal();
          exitMultiSelectMode();
          loadStickers();
        });
      });
    }
  }

  function renderCard(sticker) {
    const key = getStickerKey(sticker);
    const isSelected = selectedStickerKeys.has(key);
    const card = document.createElement('div');
    card.className = `sticker-card${isMultiSelectMode ? ' selectable' : ''}${isSelected ? ' selected' : ''}`;
    card.dataset.stickerKey = key;

    const hostname = getHostname(sticker.url);
    const dateText = sticker.timestamp ? new Date(sticker.timestamp).toLocaleDateString() : 'Unknown date';
    const tagHtml = (sticker.tags || [])
      .map(tagId => getTag(tagId))
      .filter(Boolean)
      .map(tag => {
        const color = normalizeTagColor(tag.color);
        return `<span class="card-tag" style="background-color: ${color}20; border-color: ${color}">${escapeHtml(tag.name)}</span>`;
      })
      .join('');

    card.innerHTML = `
      <div class="card-header">
        <div class="card-source">
          ${isMultiSelectMode ? `<span class="card-checkbox"><input type="checkbox" ${isSelected ? 'checked' : ''} aria-label="选择贴纸"></span>` : ''}
          <span class="card-source-text">${escapeHtml(hostname)}</span>
          <span>•</span>
          <span>${escapeHtml(dateText)}</span>
        </div>
        <div class="card-actions">
          <button class="card-edit-btn" title="编辑贴纸">✏️</button>
          <button class="card-tag-btn" title="添加标签">🏷️</button>
          <button class="card-delete-btn" title="删除此贴纸">🗑️</button>
        </div>
      </div>
      ${tagHtml ? `<div class="card-tags">${tagHtml}</div>` : ''}
      <div class="card-context">
        ${renderStickerContent(sticker)}
      </div>
    `;

    card.querySelector('.card-delete-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      if (isMultiSelectMode) {
        toggleStickerSelection(sticker);
      } else {
        deleteSticker(sticker);
      }
    });

    card.querySelector('.card-edit-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      editSticker(sticker);
    });

    card.querySelector('.card-tag-btn')?.addEventListener('click', (event) => {
      event.stopPropagation();
      openSingleTagAssignment(sticker);
    });

    const checkbox = card.querySelector('.card-checkbox input');
    checkbox?.addEventListener('click', event => event.stopPropagation());
    checkbox?.addEventListener('change', () => toggleStickerSelection(sticker));

    card.querySelectorAll('.card-cloze').forEach(clozeSpan => {
      clozeSpan.addEventListener('click', (event) => {
        event.stopPropagation();
        clozeSpan.classList.toggle('revealed');
      });
    });

    card.addEventListener('click', () => {
      if (isMultiSelectMode) {
        toggleStickerSelection(sticker);
      } else {
        navigateToSticker(sticker);
      }
    });

    stickerList.appendChild(card);
  }

  function deleteSticker(sticker) {
    if (!confirm('确定要删除这个贴纸吗？')) return;

    chrome.storage.local.get([sticker.url], (result) => {
      const stickers = result[sticker.url] || [];
      const nextStickers = stickers.filter(storedSticker => !isSameSticker(storedSticker, sticker));
      chrome.storage.local.set({ [sticker.url]: nextStickers }, loadStickers);
    });
  }

  function updateStoredSticker(sticker, updater, callback) {
    chrome.storage.local.get([sticker.url], (result) => {
      const stickers = result[sticker.url] || [];
      const nextStickers = stickers.map(storedSticker => {
        if (!isSameSticker(storedSticker, sticker)) return storedSticker;
        return updater(storedSticker);
      });
      chrome.storage.local.set({ [sticker.url]: nextStickers }, callback);
    });
  }

  function renderStickerContent(sticker) {
    if (sticker.context) {
      return escapeHtml(sticker.context).replace(
        /{{c1::(.*?)}}/g,
        '<span class="card-cloze">$1</span>'
      );
    }

    return `${sticker.prefix ? '...' + escapeHtml(sticker.prefix) : ''}
            <span class="card-cloze">${escapeHtml(sticker.text)}</span>
            ${sticker.suffix ? escapeHtml(sticker.suffix) + '...' : ''}`;
  }

  function navigateToSticker(sticker) {
    const prefix = sticker.prefix ? encodeURIComponent(sticker.prefix) + '-,' : '';
    const suffix = sticker.suffix ? ',-' + encodeURIComponent(sticker.suffix) : '';
    const text = encodeURIComponent(sticker.text);
    const baseUrl = sticker.sourceUrl || sticker.url;
    const targetUrl = `${baseUrl}#:~:text=${prefix}${text}${suffix}`;

    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const existingTab = tabs.find(tab => tab.url && tab.url.split('#')[0] === baseUrl);
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
  }

  function toggleAllStickers() {
    const allClozes = document.querySelectorAll('.card-cloze');
    const isRevealing = toggleRevealBtn?.getAttribute('data-revealed') !== 'true';

    allClozes.forEach(cloze => {
      cloze.classList.toggle('revealed', isRevealing);
    });

    toggleRevealBtn?.setAttribute('data-revealed', String(isRevealing));
    if (toggleRevealBtn) {
      toggleRevealBtn.textContent = isRevealing ? '🕶️' : '👁️';
      toggleRevealBtn.title = isRevealing ? 'Hide All Answers' : 'Reveal All Answers';
    }
  }

  function getTag(tagId) {
    return allTags.find(tag => tag.id === tagId);
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (error) {
      return 'Unknown Source';
    }
  }

  function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return value.replace(/"/g, '\\"');
  }
});
