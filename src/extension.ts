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

            const range = document.getWordRangeAtPosition(
                position, 
                /<tg-emoji emoji-id=['"](\d+)['"]>.*?<\/tg-emoji>/
            );

            if (!range) return null;

            const text = document.getText(range);
            const match = /emoji-id=['"](\d+)['"]/.exec(text);
            
            if (!match) return null;
            const emojiId = match[1];

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

export function deactivate() {}