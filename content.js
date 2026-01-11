(function () {
  "use strict";

  const Config = {
    PREFIX_SUFFIX_LENGTH: 20,
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

    saveSticker(text, prefix, suffix) {
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
            timestamp: Date.now(),
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
      const btn = document.createElement("button");
      btn.id = "recall-toggle-btn";
      btn.innerText = "🖍️";
      document.body.appendChild(btn);
    },

    initDashboard() {
      const dashboard = document.createElement("div");
      dashboard.id = "recall-dashboard";
      dashboard.innerHTML = `
        <div class="recall-status">
          <span id="recall-count">0</span> Stickers
        </div>
        <div class="recall-actions">
          <button id="recall-toggle-mode" title="Eye Shield: On/Off">👁️</button>
          <button id="recall-reset-btn" title="Refresh Session (Re-hide All)">🔄</button>
          <button id="recall-export-btn" title="Export to Anki">📥</button>
        </div>
      `;
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
      document
        .querySelector(Config.SELECTORS.TOGGLE_MODE)
        .addEventListener("click", () => {
          App.toggleExtension();
        });

      document
        .querySelector(Config.SELECTORS.EXPORT_BTN)
        .addEventListener("click", () => {
          App.exportToAnki();
        });

      document
        .querySelector(Config.SELECTORS.RESET_BTN)
        .addEventListener("click", () => {
          App.resetSession();
        });

      document
        .querySelector(Config.SELECTORS.TOGGLE_BTN)
        .addEventListener("mousedown", (e) => {
          e.preventDefault();
          App.handleCreateSticker();
        });

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
      range.surroundContents(wrapper);
      return wrapper;
    },

    findRangeByContext(text, prefix, suffix) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      let node;
      while ((node = walker.nextNode())) {
        const nodeText = node.textContent;
        const textIndex = nodeText.indexOf(text);
        if (textIndex !== -1) {
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

      const startOffset = range.startOffset;
      const endOffset = range.endOffset;
      const fullText = range.startContainer.textContent || "";
      const prefix = fullText.substring(
        Math.max(0, startOffset - Config.PREFIX_SUFFIX_LENGTH),
        startOffset
      );
      const suffix = fullText.substring(
        endOffset,
        Math.min(fullText.length, endOffset + Config.PREFIX_SUFFIX_LENGTH)
      );

      try {
        const wrapper = DOMService.wrapRange(range);
        this.bindStickerInteractions(wrapper, text, prefix, suffix);
        window.getSelection().removeAllRanges();
        document.querySelector(Config.SELECTORS.TOGGLE_BTN).style.display =
          "none";
        StorageService.saveSticker(text, prefix, suffix);
        DOMService.updateDashboardCount();
      } catch (err) {
        console.warn("Recall Sticker: Complex implementation error", err);
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

        stickers.forEach((data) => {
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

  window.addEventListener("load", () => App.init());
})();
