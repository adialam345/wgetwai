import { AutoReply, ButtonResponse, ListResponse } from "../../../database/db/messageRespon.db.js";
import Client from "./Client.js";
import Serialize from "./Serialize.js";
import N8NService from "../../../integrations/n8n.service.js";

export default class Message extends Serialize {
    constructor(client, msg, session_name) {
        super();
        this.session = session_name;
        this.client = client;
        this.msg = msg.messages;
        this.type = msg.type;
    }

    async mainHandler() {
        try {
            console.log("[MESSAGE] mainHandler - START");
            
            if (!this.msg || this.msg.length === 0) {
                console.log("[MESSAGE] mainHandler - No messages");
                return;
            }
            
            const message = this.msg[0];
            
            // Skip status broadcast
            if (message.key && message.key.remoteJid === "status@broadcast") {
                console.log("[MESSAGE] mainHandler - Skipping status broadcast");
                return;
            }
            if (!message.message) {
                console.log("[MESSAGE] mainHandler - No message content");
                return;
            }
            
            console.log("[MESSAGE] mainHandler - Processing message");
            
            // Mark as read pertama kali
            await this.markAsRead(message);
            
            console.log("[MESSAGE] mainHandler - Serializing message");
            const m = await this.serial(this.client, message);
            console.log("[MESSAGE] mainHandler - m.from:", m.from);
            console.log("[MESSAGE] mainHandler - m.fromDisplay:", m.fromDisplay);
            console.log("[MESSAGE] mainHandler - m.originalJid:", m.originalJid);
            
            console.log("[MESSAGE] mainHandler - Forwarding to N8N");
            await N8NService.forwardIncomingMessage(m, this.session);
            console.log("[MESSAGE] mainHandler - N8N forward complete");

            console.log("[MESSAGE] mainHandler - Creating bot with JID:", m.from);
            const bot = new Client(this.client, m.from);
            const CMD = m.command ? m.command : null;
            
            if (!CMD) {
                await this.messageHandler(m, bot);
            }
            
        } catch (error) {
            console.error("[MESSAGE] mainHandler - Error:", error.message);
            console.error("[MESSAGE] mainHandler - Stack:", error.stack);
        }
    }

    async messageHandler(m, bot) {
        try {
            const buttonResponse = new ButtonResponse();
            const listResponse = new ListResponse();
            const replyResponse = new AutoReply();

            const keywordReply = await replyResponse.checkMessageUser(m.botNumber, m.body);
            const keywordButton = await buttonResponse.checkKeyword(m.body, m.from);
            const keywordList = await listResponse.checkKeyword(m.body, m.from);

            if (keywordButton) {
                await bot.reply(keywordButton.response, m.msg);
                await buttonResponse.deleteKeyword(keywordButton.msg_id, keywordButton.keyword);
            } else if (keywordList) {
                await bot.reply(keywordList.response, m.msg);
            } else if (keywordReply) {
                await bot.reply(keywordReply.response, m.msg);
            } else if (m.body === "Bot") {
                await bot.reply("Yes Sir..", m.msg);
            } else if (m.body === "Test") {
                await bot.reply("Okee", m.msg);
            }
            
            // Mark as read lagi setelah processing selesai
            await this.markAsRead(m.msg);
            
        } catch (error) {
            // Silent - errors are handled gracefully
        }
    }

    async markAsRead(message) {
        try {
            // Validasi struktur message
            if (!message || !message.key || !message.key.remoteJid || !message.key.id) {
                return;
            }
            
            const remoteJid = message.key.remoteJid;
            const participant = message.key.participant || undefined;
            const msgId = message.key.id;
            
            // Method 1: readMessages (standard Baileys)
            if (typeof this.client.readMessages === "function") {
                await this.client.readMessages([{
                    remoteJid: remoteJid,
                    id: msgId,
                    participant: participant
                }]);
                return;
            }
            
            // Method 2: sendReceipt (alternative Baileys)
            if (typeof this.client.sendReceipt === "function") {
                await this.client.sendReceipt(remoteJid, participant, [msgId], "read");
                return;
            }
            
            // Method 3: chatRead (modern Baileys)
            if (typeof this.client.chatRead === "function") {
                await this.client.chatRead(remoteJid, message.key);
                return;
            }
            
        } catch (error) {
            // Silent - mark as read failures are not critical
        }
    }
}