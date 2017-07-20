/**
 * Makes source code of the page into a string
 * @param {Document} documentRoot - DOM of page
 * @return {String} 
 */
function DOMtoString(documentRoot) {
    var html = documentRoot.documentElement.innerHTML;
    return html;
}

chrome.runtime.sendMessage({
    action: "getSource",
    source: DOMtoString(document)
});
