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
            if (!this.msg || this.msg.length === 0) return;
            
            const message = this.msg[0];
            
            // Skip status broadcast
            if (message.key && message.key.remoteJid === "status@broadcast") return;
            if (!message.message) return;
            
            // Mark as read pertama kali
            await this.markAsRead(message);
            
            const m = await this.serial(this.client, message);
            N8NService.forwardIncomingMessage(m, this.session);

            const bot = new Client(this.client, m.from);
            const CMD = m.command ? m.command : null;
            
            if (!CMD) {
                await this.messageHandler(m, bot);
            }
            
        } catch (error) {
            console.log("Error in mainHandler:", error);
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
            console.log("Error in messageHandler:", error);
        }
    }

    async markAsRead(message) {
        try {
            // Validasi struktur message
            if (!message || !message.key || !message.key.remoteJid || !message.key.id) {
                console.log("Invalid message structure for markAsRead");
                return;
            }
            
            const remoteJid = message.key.remoteJid;
            const participant = message.key.participant || undefined;
            const msgId = message.key.id;
            
            console.log(`Marking message as read: ${msgId} from ${remoteJid}`);
            
            // Method 1: readMessages (standard Baileys)
            if (typeof this.client.readMessages === "function") {
                await this.client.readMessages([{
                    remoteJid: remoteJid,
                    id: msgId,
                    participant: participant
                }]);
                console.log("Success using readMessages");
                return;
            }
            
            // Method 2: sendReceipt (alternative Baileys)
            if (typeof this.client.sendReceipt === "function") {
                await this.client.sendReceipt(remoteJid, participant, [msgId], "read");
                console.log("Success using sendReceipt");
                return;
            }
            
            // Method 3: chatRead (modern Baileys)
            if (typeof this.client.chatRead === "function") {
                await this.client.chatRead(remoteJid, message.key);
                console.log("Success using chatRead");
                return;
            }
            
            console.log("No available method for mark as read");
            
        } catch (error) {
            console.log("Failed to mark message as read:", error.message);
        }
    }
}