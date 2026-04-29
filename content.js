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
      PANEL_BTN: "#recall-panel-btn",
      FLOAT_CONTAINER: "#recall-float-container",
      DASHBOARD: "#recall-dashboard",
      COUNT: "#recall-count",
      TOGGLE_MODE: "#recall-toggle-mode",
      RESET_BTN: "#recall-reset-btn",
      EXPORT_BTN: "#recall-export-btn",
    },
    LOAD_DELAY_MS: 1000,
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
  };

  const DOMService = {
    initUI() {
      this.initToggleButton();
      this.initDashboard();
      this.bindGlobalEvents();
    },

    initToggleButton() {
      const container = document.createElement("div");
      container.id = "recall-float-container";
      container.className = "recall-float-hidden";

      const stickerBtn = document.createElement("button");
      stickerBtn.id = "recall-toggle-btn";
      stickerBtn.innerText = "🖍️";
      stickerBtn.title = "创建贴纸";

      const panelBtn = document.createElement("button");
      panelBtn.id = "recall-panel-btn";
      panelBtn.innerText = "📋";
      panelBtn.title = "打开复习面板";

      container.appendChild(stickerBtn);
      container.appendChild(panelBtn);
      document.body.appendChild(container);
    },

    openSidePanel() {
      chrome.runtime.sendMessage({ type: "OPEN_RECALL_SIDE_PANEL" }, () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to request side panel:", chrome.runtime.lastError);
          DOMService.showToast("⚠️ 复习面板打开失败，请点击扩展图标重试", "error");
        }
      });
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

      const panelBtn = document.querySelector(Config.SELECTORS.PANEL_BTN);
      if (panelBtn) {
        panelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          DOMService.openSidePanel();
        });
      }

      document.addEventListener("mousedown", (e) => {
        if (this._btnTimeout) clearTimeout(this._btnTimeout);
        if (
          e.target.id !== "recall-toggle-btn" &&
          e.target.id !== "recall-panel-btn" &&
          !e.target.closest("#recall-dashboard") &&
          !e.target.closest(Config.SELECTORS.FLOAT_CONTAINER)
        ) {
          const container = document.querySelector(Config.SELECTORS.FLOAT_CONTAINER);
          if (container) container.style.display = "none";
        }
      });
    },

    bindSelectionEvents() {
      document.addEventListener("mouseup", (e) => {
        if (!App.isExtensionEnabled()) return;

        if (this._btnTimeout) clearTimeout(this._btnTimeout);

        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        const isClickingFloatBtn = e.target.closest(Config.SELECTORS.FLOAT_CONTAINER);
        
        if (selectedText.length === 0 || isClickingFloatBtn) {
          if (!isClickingFloatBtn) {
            const container = document.querySelector(Config.SELECTORS.FLOAT_CONTAINER);
            if (container) container.style.display = "none";
          }
          return;
        }

        this._btnTimeout = setTimeout(() => {
          const validSelection = window.getSelection();
          if (validSelection.toString().trim().length === 0) return;

          const selectedRange = validSelection.getRangeAt(0);
          const rect = selectedRange.getBoundingClientRect();
          const top = rect.top + window.scrollY - 55;
          const left = rect.left + window.scrollWidth / 2 - 30;
          const container = document.querySelector(Config.SELECTORS.FLOAT_CONTAINER);
          container.style.top = `${top}px`;
          container.style.left = `${left}px`;
          container.style.display = "flex";
        }, 200);
      });
    },

    wrapRange(range) {
      const wrapper = document.createElement("span");
      wrapper.classList.add(Config.STICKER_CLASSES.HIDDEN);
      wrapper.setAttribute("tabindex", "0"); // Enable keyboard focus
      wrapper.dataset.stickerText = range.toString();
      range.surroundContents(wrapper);
      return wrapper;
    },

    findRangeByContext(text, prefix, suffix) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      let node;
      const prefixLength = prefix ? prefix.length : 0;
      const suffixLength = suffix ? suffix.length : 0;

      while ((node = walker.nextNode())) {
        const nodeText = node.textContent;
        const textIndex = nodeText.indexOf(text);

        if (textIndex !== -1) {
          const actualPrefix = nodeText.substring(Math.max(0, textIndex - prefixLength), textIndex);
          const actualSuffix = nodeText.substring(textIndex + text.length, Math.min(nodeText.length, textIndex + text.length + suffixLength));

          const isPrefixMatch = !prefix || actualPrefix.endsWith(prefix.trim()) || prefix.length < 5;
          const isSuffixMatch = !suffix || actualSuffix.startsWith(suffix.trim()) || suffix.length < 5;

          if (isPrefixMatch && isSuffixMatch) {
            const range = document.createRange();
            range.setStart(node, textIndex);
            range.setEnd(node, textIndex + text.length);
            return range;
          }
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

    init() {
      DOMService.initUI();
      setTimeout(() => this.restoreStickers(), Config.LOAD_DELAY_MS);
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
        
        const container = document.querySelector(Config.SELECTORS.FLOAT_CONTAINER);
        if (container) container.style.display = "none";

        // Generate Anki-style Smart Context (Full Sentence with {{c1::...}})
        const fullContext = DOMService.getExportContext(wrapper);

        StorageService.saveSticker(text, prefix, suffix, fullContext);
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
      StorageService.getStickers((stickers) => {
        if (!stickers || stickers.length === 0) return;

        const existingStickers = document.querySelectorAll(
          `.${Config.STICKER_CLASSES.HIDDEN}, .${Config.STICKER_CLASSES.REVEALED}`
        );
        const existingTexts = new Set();
        existingStickers.forEach(el => {
          existingTexts.add(el.dataset.stickerText);
        });

        stickers.forEach((data) => {
          if (existingTexts.has(data.text)) return;

          const range = DOMService.findRangeByContext(
            data.text,
            data.prefix,
            data.suffix
          );
          if (!range) return;

          try {
            const wrapper = DOMService.wrapRange(range);
            this.bindStickerInteractions(
              wrapper,
              data.text,
              data.prefix,
              data.suffix
            );
            existingTexts.add(data.text);
            DOMService.updateDashboardCount();
          } catch (err) {
            console.warn("Recall Sticker: Restore error", err);
          }
        });
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
