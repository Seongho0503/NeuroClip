document.getElementById("save").addEventListener("click", () => {
  const token = document.getElementById("token").value;
  const database = document.getElementById("database").value;

  chrome.storage.sync.set({ notionToken: token, databaseId: database }, () => {
    document.getElementById("status").innerText = "✅ Saved!";
    setTimeout(() => { document.getElementById("status").innerText = ""; }, 2000);
  });
});