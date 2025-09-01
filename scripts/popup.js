document.getElementById("save-full").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        const answer = document.querySelector(".markdown")?.innerText;
        return { type: "full", content: answer };
      },
    }, (results) => {
      if (results[0].result) {
        chrome.runtime.sendMessage(results[0].result, () => {
          document.getElementById("status").innerText = "✅ Saved full answer!";
        });
      }
    });
  });
});

document.getElementById("save-highlight").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: () => {
        const selection = window.getSelection().toString();
        return { type: "highlight", content: selection };
      },
    }, (results) => {
      if (results[0].result) {
        chrome.runtime.sendMessage(results[0].result, () => {
          document.getElementById("status").innerText = "✅ Saved highlight!";
        });
      }
    });
  });
});