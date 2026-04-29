// Enable Side Panel opening on icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "OPEN_RECALL_SIDE_PANEL") return;

  const openOptions = sender.tab?.id
    ? { tabId: sender.tab.id }
    : { windowId: chrome.windows.WINDOW_ID_CURRENT };

  chrome.sidePanel
    .open(openOptions)
    .catch((error) => console.error("Failed to open side panel:", error));
});
