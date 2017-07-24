chrome.runtime.sendMessage({
    action: 'getSource',
    source: document.documentElement.innerHTML
});
