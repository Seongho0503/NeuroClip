const NOTION_VERSION = '2022-06-28';


chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'save_selection',
        title: 'Save selection to Notion',
        contexts: ['selection']
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save_selection') {
        const payload = {
            answerText: info.selectionText,
            questionText: '',
            pageUrl: info.pageUrl,
            mode: 'highlight'
        };
        await saveToNotion(payload);
    }
});


chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'save_latest_answer') {
        // Ask content script for latest block text
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;
        chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_LATEST' }, async (resp) => {
            // (Optional enhancement) Content script can reply with latest answer
        });
    }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'SAVE_TO_NOTION') {
        saveToNotion(msg.payload);
    }
});

async function saveToNotion({ answerText, questionText, pageUrl, mode }) {
    const cfg = await chrome.storage.sync.get({
        notion_token: '',
        database_id: '',
        default_tags: [],
        include_question: true,
        include_timestamp: true
    });

    if (!cfg.notion_token || !cfg.database_id) {
        notifyTab('NOTION_SAVE_RESULT', { ok: false, error: 'Set Notion token & DB in Options' });
        return;
    }

    const props = buildNotionProperties({ questionText, pageUrl, defaultTags: cfg.default_tags });
    const children = buildNotionChildren({ answerText, questionText, includeQuestion: cfg.include_question, mode });

    // 🔹 여기서 로컬에도 저장
    const localData = {
        id: Date.now(), // 고유 ID
        answerText,
        questionText,
        pageUrl,
        mode,
        savedAt: new Date().toISOString()
    };
    
    chrome.storage.local.get({ savedItems: [] }, (result) => {
        console.log(result);
        const savedItems = result.savedItems || [];
        savedItems.push(localData);
        chrome.storage.local.set({ savedItems }, () => {
            console.log('✅ Saved locally', localData);
        });
    });

    try {
        const res = await fetch(`https://api.notion.com/v1/pages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cfg.notion_token}`,
                'Content-Type': 'application/json',
                'Notion-Version': NOTION_VERSION
            },
            body: JSON.stringify({
                parent: { database_id: cfg.database_id },
                properties: props,
                children
            })
        });

        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
        notifyTab('NOTION_SAVE_RESULT', { ok: false, error: e.message });
    }
}

// async function saveToNotion({ answerText, questionText, pageUrl, mode }) {
//     const cfg = await chrome.storage.sync.get({
//         notion_token: '',
//         database_id: '',
//         default_tags: [],
//         include_question: true,
//         include_timestamp: true
//     });


//     if (!cfg.notion_token || !cfg.database_id) {
//         notifyTab('NOTION_SAVE_RESULT', { ok: false, error: 'Set Notion token & DB in Options' });
//         return;
//     }


//     const props = buildNotionProperties({ questionText, pageUrl, defaultTags: cfg.default_tags });
//     const children = buildNotionChildren({ answerText, questionText, includeQuestion: cfg.include_question, mode });


//     try {
//         const res = await fetch(`https://api.notion.com/v1/pages`, {
//             method: 'POST',
//             headers: {
//                 'Authorization': `Bearer ${cfg.notion_token}`,
//                 'Content-Type': 'application/json',
//                 'Notion-Version': NOTION_VERSION
//             },
//             body: JSON.stringify({
//                 parent: { database_id: cfg.database_id },
//                 properties: props,
//                 children
//             })
//         });

//         if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
//     } catch (e) {
//         notifyTab('NOTION_SAVE_RESULT', { ok: false, error: e.message });
//     }
// }


function notifyTab(type, payload) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type, ...payload });
    });
}


function buildNotionProperties({ questionText, pageUrl, defaultTags }) {
    const now = new Date().toISOString();
    return {
        Title: { title: [{ type: 'text', text: { content: questionText?.slice(0, 200) || 'ChatGPT Answer' } }] },
        Source: { url: pageUrl || null },
        Tags: { multi_select: (defaultTags || []).map(t => ({ name: t })) },
        SavedAt: { date: { start: now } }
    };
}


function buildNotionChildren({ answerText, questionText, includeQuestion, mode }) {
    const blocks = [];
    if (includeQuestion && questionText) {
        blocks.push({
            object: 'block',
            type: 'callout',
            callout: {
                icon: { emoji: '❓' },
                rich_text: [{ type: 'text', text: { content: questionText } }]
            }
        });
    }
    // Split code fences and paragraphs roughly; MVP-friendly
    const parts = splitTextToBlocks(answerText);
    blocks.push(...parts);
    // Footer
    blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: `Saved via ChatGPT → Notion (${mode})` } }] }
    });
    return blocks;
}

function splitTextToBlocks(text) {
    const lines = text.split(/\n/);
    const blocks = [];
    let buf = [];
    let inCode = false;
    let codeLang = '';
    for (const line of lines) {
        const fence = line.match(/^```(.*)/);
        if (fence) {
            if (!inCode) {
                inCode = true; codeLang = (fence[1] || '').trim();
            } else {
                // flush code
                blocks.push({
                    object: 'block',
                    type: 'code',
                    code: { language: mapLang(codeLang), rich_text: [{ type: 'text', text: { content: buf.join('\n') } }] }
                });
                buf = []; inCode = false; codeLang = '';
            }
            continue;
        }
        if (inCode) {
            buf.push(line); continue;
        }
        if (line.trim() === '') {
            if (buf.length) {
                blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: buf.join(' ') } }] } });
                buf = [];
            }
        } else {
            buf.push(line);
        }
    }
    if (buf.length) {
        if (inCode) {
            blocks.push({ object: 'block', type: 'code', code: { language: 'plain text', rich_text: [{ type: 'text', text: { content: buf.join('\n') } }] } });
        } else {
            blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: buf.join(' ') } }] } });
        }
    }
    return blocks;
}


function mapLang(lang) {
    const l = (lang || '').toLowerCase();
    const map = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'shell' };
    return map[l] || l || 'plain text';
}