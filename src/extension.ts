import * as vscode from 'vscode';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {
    console.log('Telegram Emoji Preview is active');

    const emojiUrlCache = new Map<string, string>();

    const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
        async provideHover(document, position, token) {

            const config = vscode.workspace.getConfiguration('telegramEmojiPreview');
            const botToken = config.get<string>('botToken');

            if (!botToken) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown('⚠️ **Telegram Token missing.**\n\nPlease go to VS Code Settings (`Ctrl+,`) -> search "Telegram" -> enter your Bot Token.');
                return new vscode.Hover(md);
            }

            // Regex supports:
            // 1. <tg-emoji emoji-id="123" or "VAR" or {VAR}>
            // 2. icon_custom_emoji_id="123" or "VAR" or VAR or {VAR}
            const range = document.getWordRangeAtPosition(
                position,
                /(<tg-emoji\s+emoji-id\s*=\s*['"{]?([\w_]+)['"}]?>.*?<\/tg-emoji>)|(icon_custom_emoji_id\s*=\s*['"{]?([\w_]+)['"}]?)/
            );

            if (!range) return null;

            const text = document.getText(range);
            // Capture groups: 
            // 1. html tag inner ID
            // 2. property ID
            const match = /(?:emoji-id\s*=\s*['"{]?([\w_]+)['"}]?)|(?:icon_custom_emoji_id\s*=\s*['"{]?([\w_]+)['"}]?)/.exec(text);

            if (!match) return null;
            let emojiId = match[1] || match[2];

            if (emojiId && !/^\d+$/.test(emojiId)) {
                const docText = document.getText();
                const varMatch = new RegExp(`\\b${emojiId}\\s*=\\s*['"](\\d+)['"]`).exec(docText);
                if (varMatch) {
                    emojiId = varMatch[1];
                } else {
                    return null;
                }
            }

            // 3. Получаем URL (из кэша или сети)
            let url = emojiUrlCache.get(emojiId);
            if (!url) {
                url = await fetchTelegramFileUrl(emojiId, botToken);
                if (url) {
                    emojiUrlCache.set(emojiId, url);
                }
            }

            if (!url) {
                return new vscode.Hover('Telegram Emoji: Image not found (check Token or ID)');
            }

            // 4. Показываем картинку
            const md = new vscode.MarkdownString();
            md.supportHtml = true;
            md.appendMarkdown(`### Preview\n![Emoji](${url}|height=100)`);

            return new vscode.Hover(md, range);
        }
    });

    context.subscriptions.push(hoverProvider);

    async function fetchTelegramFileUrl(emojiId: string, token: string): Promise<string | undefined> {
        try {
            const stickerRes = await axios.get(`https://api.telegram.org/bot${token}/getCustomEmojiStickers`, {
                data: { custom_emoji_ids: [emojiId] }
            });

            if (!stickerRes.data.ok || !stickerRes.data.result.length) return undefined;

            const sticker = stickerRes.data.result[0];
            let targetFileId = sticker.file_id;

            if (sticker.is_video || sticker.is_animated) {
                if (sticker.thumbnail) {
                    targetFileId = sticker.thumbnail.file_id;
                }
            }

            const fileRes = await axios.get(`https://api.telegram.org/bot${token}/getFile`, {
                params: { file_id: targetFileId }
            });

            if (!fileRes.data.ok) return undefined;

            return `https://api.telegram.org/file/bot${token}/${fileRes.data.result.file_path}`;

        } catch (error) {
            console.error('Telegram API Error:', error);
            return undefined;
        }
    }
}

export function deactivate() { }