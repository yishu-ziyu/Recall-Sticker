(function () {
  "use strict";

  const Config = {
    PREFIX_SUFFIX_LENGTH: 100,
    STICKER_CLASSES: {
      HIDDEN: "recall-sticker-hidden",
      REVEALED: "recall-sticker-revealed",
    },
    SELECTORS: {
      TOGGLE_BTN: "#recall-toggle-btn",
      DASHBOARD: "#recall-dashboard",
      COUNT: "#recall-count",
      TOGGLE_MODE: "#recall-toggle-mode",
      RESET_BTN: "#recall-reset-btn",
      EXPORT_BTN: "#recall-export-btn",
    },
    INITIAL_LOAD_DELAY_MS: 600,
    MUTATION_RESTORE_DEBOUNCE_MS: 500,
    EXPORT_FILENAME_PREFIX: "recall-export-full-",
  };

  const StorageService = {
    getUrlKey() {
      const url = new URL(window.location.href);
      return url.origin + url.pathname;
    },

    getStickers(callback) {
      const url = this.getUrlKey();
      chrome.storage.local.get([url], (result) => {
        const stickers = result[url] || [];
        callback(stickers);
      });
    },

    saveSticker(text, prefix, suffix, context = "") {
      const url = this.getUrlKey();
      this.getStickers((stickers) => {
        const isDuplicate = stickers.some(
          (s) => s.text === text && s.prefix === prefix && s.suffix === suffix
        );
        if (!isDuplicate) {
          stickers.push({
            text,
            prefix,
            suffix,
            context,
            timestamp: Date.now(),
            sourceUrl: window.location.href,
          });
          chrome.storage.local.set({ [url]: stickers });
        }
      });
    },

    removeSticker(text, prefix, suffix) {
      const url = this.getUrlKey();
      this.getStickers((stickers) => {
        const newStickers = stickers.filter(
          (s) =>
            !(s.text === text && s.prefix === prefix && s.suffix === suffix)
        );
        chrome.storage.local.set({ [url]: newStickers });
      });
    },

    getStickerKey(text, prefix, suffix) {
      return `${text}::${prefix}::${suffix}`;
    },
  };

  const DOMService = {
    initUI() {
      this.initToggleButton();
      this.initDashboard();
      this.bindGlobalEvents();
    },

    initToggleButton() {
      const btn = document.createElement("button");
      btn.id = "recall-toggle-btn";
      btn.innerText = "🖍️";
      document.body.appendChild(btn);
    },

    initDashboard() {
      const dashboard = document.createElement("div");
      dashboard.id = "recall-dashboard";

      // Status
      const statusDiv = document.createElement("div");
      statusDiv.className = "recall-status";
      const countSpan = document.createElement("span");
      countSpan.id = "recall-count";
      countSpan.innerText = "0";
      statusDiv.appendChild(countSpan);
      statusDiv.append(" Stickers");

      // Actions
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "recall-actions";

      const toggleBtn = document.createElement("button");
      toggleBtn.id = "recall-toggle-mode";
      toggleBtn.title = "Eye Shield: On/Off";
      toggleBtn.innerText = "👁️";

      const resetBtn = document.createElement("button");
      resetBtn.id = "recall-reset-btn";
      resetBtn.title = "Refresh Session (Re-hide All)";
      resetBtn.innerText = "🔄";

      const exportBtn = document.createElement("button");
      exportBtn.id = "recall-export-btn";
      exportBtn.title = "Export to Anki";
      exportBtn.innerText = "📥";

      actionsDiv.appendChild(toggleBtn);
      actionsDiv.appendChild(resetBtn);
      actionsDiv.appendChild(exportBtn);

      dashboard.appendChild(statusDiv);
      dashboard.appendChild(actionsDiv);
      document.body.appendChild(dashboard);
    },

    bindGlobalEvents() {
      this.bindKeyboardEvents();
      this.bindDashboardEvents();
      this.bindSelectionEvents();
    },

    bindKeyboardEvents() {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Alt" || e.key === "Option") {
          document.body.classList.add("recall-peek-active");
          App.setPeekMode(true);
        }
        const isSaveShortcut =
          ((e.metaKey || e.ctrlKey) &&
            e.shiftKey &&
            (e.key === "e" || e.key === "E")) ||
          (e.ctrlKey && (e.key === "s" || e.key === "S")) ||
          (e.altKey && (e.key === "s" || e.key === "S" || e.key === "ß"));
        if (isSaveShortcut) {
          e.preventDefault();
          App.handleCreateSticker();
        }
      });

      document.addEventListener("keyup", (e) => {
        if (e.key === "Alt" || e.key === "Option") {
          document.body.classList.remove("recall-peek-active");
          App.setPeekMode(false);
        }
      });
    },

    bindDashboardEvents() {
      const toggleModeBtn = document.querySelector(Config.SELECTORS.TOGGLE_MODE);
      if (toggleModeBtn) {
        toggleModeBtn.addEventListener("click", () => {
          App.toggleExtension();
        });
      }

      const exportBtn = document.querySelector(Config.SELECTORS.EXPORT_BTN);
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          App.exportToAnki();
        });
      }

      const resetBtn = document.querySelector(Config.SELECTORS.RESET_BTN);
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          App.resetSession();
        });
      }

      const toggleBtn = document.querySelector(Config.SELECTORS.TOGGLE_BTN);
      if (toggleBtn) {
        toggleBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          App.handleCreateSticker();
        });
      }

      document.addEventListener("mousedown", (e) => {
        if (this._btnTimeout) clearTimeout(this._btnTimeout);
        if (
          e.target.id !== "recall-toggle-btn" &&
          !e.target.closest("#recall-dashboard")
        ) {
          const btn = document.querySelector(Config.SELECTORS.TOGGLE_BTN);
          if (btn) btn.style.display = "none";
        }
      });
    },

    bindSelectionEvents() {
      document.addEventListener("mouseup", (e) => {
        if (!App.isExtensionEnabled()) return;

        if (this._btnTimeout) clearTimeout(this._btnTimeout);

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText.length === 0 || e.target.id === "recall-toggle-btn") {
          if (e.target.id !== "recall-toggle-btn") {
            const btn = document.querySelector(Config.SELECTORS.TOGGLE_BTN);
            if (btn) btn.style.display = "none";
          }
          return;
        }

        this._btnTimeout = setTimeout(() => {
          const validSelection = window.getSelection();
          if (validSelection.toString().trim().length === 0) return;

          const selectedRange = validSelection.getRangeAt(0);
          const rect = selectedRange.getBoundingClientRect();
          const top = rect.top + window.scrollY - 45;
          const left = rect.left + window.scrollX + rect.width / 2 - 20;
          const btn = document.querySelector(Config.SELECTORS.TOGGLE_BTN);
          btn.style.top = `${top}px`;
          btn.style.left = `${left}px`;
          btn.style.display = "block";
        }, 200);
      });
    },

    wrapRange(range) {
      const wrapper = document.createElement("span");
      wrapper.classList.add(Config.STICKER_CLASSES.HIDDEN);
      wrapper.setAttribute("tabindex", "0"); // Enable keyboard focus
      wrapper.dataset.stickerText = range.toString();
      wrapper.dataset.recallStickerWrapped = "1";
      range.surroundContents(wrapper);
      return wrapper;
    },

    findRangeByContext(text, prefix, suffix) {
      if (!text) return null;
      
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      let node;
      
      while ((node = walker.nextNode())) {
        const nodeText = node.textContent;
        let searchIndex = 0;
        let textIndex;

        // Find all occurrences in this node
        while ((textIndex = nodeText.indexOf(text, searchIndex)) !== -1) {
          searchIndex = textIndex + 1;

          // 1. Verify Prefix
          const rangeBefore = document.createRange();
          rangeBefore.selectNodeContents(document.body);
          rangeBefore.setEnd(node, textIndex);
          const textBefore = rangeBefore.toString();

          if (!textBefore.endsWith(prefix)) {
            continue;
          }

          // 2. Verify Suffix
          const rangeAfter = document.createRange();
          rangeAfter.selectNodeContents(document.body);
          rangeAfter.setStart(node, textIndex + text.length);
          const textAfter = rangeAfter.toString();

          if (!textAfter.startsWith(suffix)) {
            continue;
          }

          // 3. Match Found
          const range = document.createRange();
          range.setStart(node, textIndex);
          range.setEnd(node, textIndex + text.length);
          return range;
        }
      }
      return null;
    },

    buildClozeText(block, targetSticker, stickerText) {
      let text = "";

      function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (node === targetSticker) {
            text += `{{c1::${stickerText}}}`;
          } else if (
            node.classList &&
            (node.classList.contains(Config.STICKER_CLASSES.HIDDEN) ||
              node.classList.contains(Config.STICKER_CLASSES.REVEALED))
          ) {
            text += node.dataset.stickerText || node.textContent;
          } else {
            node.childNodes.forEach((child) => walk(child));
          }
        }
      }

      walk(block);
      return text.replace(/\s+/g, " ").trim();
    },

    getExportContext(element) {
      const block =
        element.closest("p, li, h1, h2, h3, h4, h5, h6, div, td, blockquote") ||
        element.parentNode;

      // 1. Get full text with cloze syntax
      let fullText = this.buildClozeText(
        block,
        element,
        element.dataset.stickerText || element.innerText
      );

      // 2. Find cloze position
      const clozeTag = `{{c1::${
        element.dataset.stickerText || element.innerText
      }}}`;
      const clozeIndex = fullText.indexOf(clozeTag);

      if (clozeIndex === -1) return fullText.trim();

      // 3. Search backwards for sentence start
      const preText = fullText.substring(0, clozeIndex);
      const postText = fullText.substring(clozeIndex + clozeTag.length);

      // Look for last punctuation in preText
      const sentenceStartMatch = preText.match(
        /([.!?。！？\n]+)(?!.*[.!?。！？\n])/
      );
      const start = sentenceStartMatch
        ? sentenceStartMatch.index + sentenceStartMatch[1].length
        : 0;

      // 4. Search forwards for sentence end
      const sentenceEndMatch = postText.match(/[.!?。！？\n]+/);
      const end = sentenceEndMatch
        ? sentenceEndMatch.index + sentenceEndMatch[0].length
        : postText.length;

      // 5. Assemble sentence
      const sentence =
        preText.substring(start) + clozeTag + postText.substring(0, end);

      return sentence.trim();
    },

    getStickerCount() {
      return document.querySelectorAll(
        `.${Config.STICKER_CLASSES.HIDDEN}, .${Config.STICKER_CLASSES.REVEALED}`
      ).length;
    },

    updateDashboardCount() {
      document.querySelector(Config.SELECTORS.COUNT).innerText =
        this.getStickerCount();
    },

    createExportLink(csvContent, filename) {
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    showToast(message, type = "info") {
      const existingToast = document.querySelector(".recall-toast");
      if (existingToast) existingToast.remove();

      const toast = document.createElement("div");
      toast.className = `recall-toast ${type}`;
      toast.innerText = message;
      document.body.appendChild(toast);

      // Force reflow
      toast.offsetHeight;

      toast.classList.add("visible");

      setTimeout(() => {
        toast.classList.remove("visible");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    },
  };

  const App = {
    _isExtensionEnabled: true,
    _isPeekMode: false,
    _restoredKeys: new Set(),
    _mutationRestoreTimer: null,
    _lastKnownUrlKey: null,

    init() {
      DOMService.initUI();
      this._lastKnownUrlKey = StorageService.getUrlKey();
      setTimeout(
        () => this.restoreStickers(),
        Config.INITIAL_LOAD_DELAY_MS
      );
      this.bindMutationAutoRestore();
      this.bindSpaNavigationListeners();
    },

    isExtensionEnabled() {
      return this._isExtensionEnabled;
    },

    setPeekMode(value) {
      this._isPeekMode = value;
    },

    toggleExtension() {
      this._isExtensionEnabled = !this._isExtensionEnabled;
      const btnIcon = document.querySelector(Config.SELECTORS.TOGGLE_MODE);
      if (this._isExtensionEnabled) {
        btnIcon.innerText = "👁️";
        document.body.classList.remove("recall-disabled");
        btnIcon.title = "Eye Shield: On";
      } else {
        btnIcon.innerText = "🕶️";
        document.body.classList.add("recall-disabled");
        btnIcon.title = "Eye Shield: Off";
      }
    },

    handleCreateSticker() {
      if (!this._isExtensionEnabled) return;

      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const text = range.toString().trim();
      if (text.length === 0) return;

      try {
        const wrapper = DOMService.wrapRange(range);
        
        // --- Enhanced Context Capture ---
        // Capture context relative to the block to span across tags (e.g. <b>, <i>)
        const block = wrapper.parentElement; 
        // Create range for prefix (text before wrapper in the block)
        const prefixRange = document.createRange();
        prefixRange.setStart(block, 0);
        prefixRange.setEndBefore(wrapper);
        const prefix = prefixRange.toString().slice(-Config.PREFIX_SUFFIX_LENGTH);

        // Create range for suffix (text after wrapper in the block)
        const suffixRange = document.createRange();
        suffixRange.setStartAfter(wrapper);
        suffixRange.setEnd(block, block.childNodes.length);
        const suffix = suffixRange.toString().slice(0, Config.PREFIX_SUFFIX_LENGTH);
        // --------------------------------

        this.bindStickerInteractions(wrapper, text, prefix, suffix);
        window.getSelection().removeAllRanges();
        
        const toggleBtn = document.querySelector(Config.SELECTORS.TOGGLE_BTN);
        if (toggleBtn) toggleBtn.style.display = "none";

        // Generate Anki-style Smart Context (Full Sentence with {{c1::...}})
        const fullContext = DOMService.getExportContext(wrapper);

        StorageService.saveSticker(text, prefix, suffix, fullContext);
        this._restoredKeys.add(StorageService.getStickerKey(text, prefix, suffix));
        DOMService.updateDashboardCount();
      } catch (err) {
        console.warn("Recall Sticker: Complex implementation error", err);
        DOMService.showToast("⚠️ 仅支持在同一段落内创建贴纸 (跨节点选择暂不支持)", "error");
      }
    },

    bindStickerInteractions(wrapper, text, prefix, suffix) {
      wrapper.addEventListener("click", (e) => {
        if (!this._isExtensionEnabled) return;
        e.stopPropagation();
        this.toggleStickerState(wrapper);
      });
      
      wrapper.addEventListener("keydown", (e) => {
        if (!this._isExtensionEnabled) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.toggleStickerState(wrapper);
        }
      });

      wrapper.addEventListener("contextmenu", (e) => {
        if (!this._isExtensionEnabled) return;
        e.preventDefault();
        if (confirm("Remove this sticker?")) {
          const parent = wrapper.parentNode;
          while (wrapper.firstChild) {
            parent.insertBefore(wrapper.firstChild, wrapper);
          }
          parent.removeChild(wrapper);
          StorageService.removeSticker(text, prefix, suffix);
          DOMService.updateDashboardCount();
        }
      });
    },

    restoreStickers() {
      this._lastKnownUrlKey = StorageService.getUrlKey();
      StorageService.getStickers((stickers) => {
        if (!stickers || stickers.length === 0) return;

        stickers.forEach((data) => {
          const stickerKey = StorageService.getStickerKey(
            data.text,
            data.prefix,
            data.suffix
          );
          if (this._restoredKeys.has(stickerKey)) return;

          const range = DOMService.findRangeByContext(
            data.text,
            data.prefix,
            data.suffix
          );
          if (!range) return;
          if (
            range.startContainer.parentElement &&
            range.startContainer.parentElement.dataset &&
            range.startContainer.parentElement.dataset.recallStickerWrapped === "1"
          ) {
            return;
          }

          try {
            const wrapper = DOMService.wrapRange(range);
            this.bindStickerInteractions(
              wrapper,
              data.text,
              data.prefix,
              data.suffix
            );
            this._restoredKeys.add(stickerKey);
            DOMService.updateDashboardCount();
          } catch (err) {
            console.warn("Recall Sticker: Restore error", err);
          }
        });
      });
    },

    bindMutationAutoRestore() {
      const observer = new MutationObserver(() => {
        if (!this._isExtensionEnabled) return;
        if (this._mutationRestoreTimer) clearTimeout(this._mutationRestoreTimer);
        this._mutationRestoreTimer = setTimeout(() => {
          if (StorageService.getUrlKey() !== this._lastKnownUrlKey) return;
          this.restoreStickers();
        }, Config.MUTATION_RESTORE_DEBOUNCE_MS);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },

    bindSpaNavigationListeners() {
      const signalUrlChanged = () => {
        window.dispatchEvent(new Event("recall:urlchange"));
      };

      const originalPushState = history.pushState;
      history.pushState = function () {
        const result = originalPushState.apply(this, arguments);
        signalUrlChanged();
        return result;
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = function () {
        const result = originalReplaceState.apply(this, arguments);
        signalUrlChanged();
        return result;
      };

      window.addEventListener("popstate", signalUrlChanged);
      window.addEventListener("recall:urlchange", () => {
        const newUrlKey = StorageService.getUrlKey();
        if (newUrlKey === this._lastKnownUrlKey) return;
        this._restoredKeys.clear();
        this._lastKnownUrlKey = newUrlKey;
        setTimeout(
          () => this.restoreStickers(),
          Config.INITIAL_LOAD_DELAY_MS
        );
      });
    },

    toggleStickerState(wrapper) {
      if (wrapper.classList.contains(Config.STICKER_CLASSES.HIDDEN)) {
        wrapper.classList.remove(Config.STICKER_CLASSES.HIDDEN);
        wrapper.classList.add(Config.STICKER_CLASSES.REVEALED);
      } else {
        wrapper.classList.remove(Config.STICKER_CLASSES.REVEALED);
        wrapper.classList.add(Config.STICKER_CLASSES.HIDDEN);
      }
    },

    resetSession() {
      const stickers = document.querySelectorAll(
        `.${Config.STICKER_CLASSES.REVEALED}`
      );
      stickers.forEach((sticker) => {
        sticker.classList.remove(Config.STICKER_CLASSES.REVEALED);
        sticker.classList.add(Config.STICKER_CLASSES.HIDDEN);
      });
      // Optional: Shake effect or toast to confirm reset? MVP: just reset.
    },

    exportToAnki() {
      const stickers = document.querySelectorAll(
        `.${Config.STICKER_CLASSES.HIDDEN}, .${Config.STICKER_CLASSES.REVEALED}`
      );

      if (stickers.length === 0) {
        alert("本页还没有贴纸哦！先在这个页面贴一些重点吧。");
        return;
      }

      let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
      csvContent += '"Front (Context)","Back (Answer)","Source URL","Created At","Tags"\n';
      const processedNotes = [];

      stickers.forEach((el) => {
        const note = DOMService.getExportContext(el);
        if (processedNotes.includes(note)) return;

        const safeNote = note.replace(/"/g, '""');
        const safeAnswer = (el.dataset.stickerText || "").replace(/"/g, '""');
        const source = `"${window.location.href}"`;
        const createdAt = `"${new Date().toISOString()}"`;
        // Generate tags from title + fixed tag
        const pageTitleTag = document.title
          .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")
          .substring(0, 20);
        const tags = `"RecallSticker ${pageTitleTag}"`;

        csvContent += `"${safeNote}","${safeAnswer}",${source},${createdAt},${tags}\n`;
        processedNotes.push(note);
      });

      const filename = `${Config.EXPORT_FILENAME_PREFIX}${Date.now()}.csv`;
      DOMService.createExportLink(csvContent, filename);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init());
  } else {
    App.init();
  }
})();
