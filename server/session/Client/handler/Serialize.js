import {
  downloadContentFromMessage,
  getContentType,
  getDevice,
  isJidBroadcast,
  isJidGroup,
  jidNormalizedUser,
  toBuffer,
} from "@whiskeysockets/baileys";
import fs from "fs";
import { moment } from "../../../config/index.js";
import Client from "./Client.js";

const { PREFIX } = process.env;

export default class Serialize extends Client {
  constructor() {
    super();
  }
  async serial(client, msg) {
    const m = {};
    if (msg.key) {
      m.id = msg.key.id;
      m.fromMe = msg.key.fromMe;
      m.from = msg.key.remoteJid;
      
      // Handle @lid format dengan senderPn dari Baileys terbaru
      if (/@lid/.test(msg.key.remoteJid) && msg.key.senderPn) {
        msg.key.remoteJid = msg.key.senderPn;
        m.from = msg.key.senderPn;
      }
      
      m.sender = m.fromMe
        ? jidNormalizedUser(client.user.id) || ""
        : isJidGroup(msg.key.remoteJid)
        ? jidNormalizedUser(msg.key.participant)
        : isJidBroadcast(msg.key.remoteJid)
        ? jidNormalizedUser(msg.key.participant)
        : jidNormalizedUser(msg.key.remoteJid);
      m.isGroupMsg = m.from.endsWith("@g.us");
      m.device = getDevice(m.id);
      
      // Resolve phone number dari JID (termasuk @lid format)
      m.phoneNumber = await this.resolvePhoneNumber(client, m.sender, m.from, m.isGroupMsg, msg.key.senderPn);
    }
    m.botNumber = client.user.id.split(":")[0] + "@s.whatsapp.net";
    m.type = getContentType(msg.message);
    m.pushname = msg.pushName;
    m.t = msg.messageTimestamp;
    m.time = moment(m.t * 1000).format("DD/MM/YY HH:mm:ss");
    if (["ephemeralMessage", "viewOnceMessage"].includes(m.type)) {
      msg.message = msg.message[m.type].message;
      m.type = getContentType(msg.message);
    }
    m.body =
      m.type === "conversation"
        ? msg.message?.conversation
        : m.type == "imageMessage"
        ? msg.message?.imageMessage?.caption
        : m.type == "videoMessage"
        ? msg.message?.videoMessage?.caption
        : m.type == "extendedTextMessage"
        ? msg.message?.extendedTextMessage?.text
        : m.type == "buttonsResponseMessage"
        ? msg.message?.buttonsResponseMessage?.selectedButtonId
        : m.type == "listResponseMessage"
        ? msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId
        : m.type == "templateButtonReplyMessage"
        ? msg.message?.templateButtonReplyMessage?.selectedId
        : m.type === "messageContextInfo"
        ? msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId || msg.message?.buttonsResponseMessage?.selectedButtonId || msg.text
        : "";
    m.mentions = msg.message[m.type]?.contextInfo ? msg.message[m.type]?.contextInfo.mentionedJid : [];
    if (msg.message[m.type]?.contextInfo?.quotedMessage) {
      m.quoted = {};
      m.quoted.message = msg.message[m.type].contextInfo.quotedMessage;
      m.quoted.key = {
        id: msg.message[m.type].contextInfo.stanzaId,
        fromSelf: msg.message[m.type].contextInfo.participant === client.user.id.split(":")[0] + "@s.whatsapp.net",
        remoteJid: m.from,
      };
      m.quoted.type = getContentType(m.quoted.message);
      m.quoted.device = getDevice(m.quoted.key.id);
      m.quoted.delete = () => client.sendMessage(m.from, { delete: m.quoted.key });
      m.quoted.download = (path = null) => this.downloadMedia(m.quoted.message, path);
    } else {
      m.quoted = null;
    }
    if (m.isGroupMsg) {
      m.group = {};
      m.group.groupMetadata = await client.groupMetadata(m.from);
      m.group.admins = m.group.groupMetadata.participants.filter((v) => v.admin !== null).map((x) => x.id);
      m.group.isSenderGroupAdmin = m.group.admins.includes(m.sender);
      m.group.isBotGroupAdmin = m.group.admins.includes(m.botNumber);
    } else {
      m.group = null;
    }
    if (m.type) {
      m.isMedia = {};
      m.isMedia.isImage = m.type == "imageMessage";
      m.isMedia.isVideo = m.type == "videoMessage";
      m.isMedia.isAudio = m.type == "audioMessage";
      m.isMedia.isSticker = m.type == "stickerMessage";
      m.isMedia.isContact = m.type == "contactMessage";
      m.isMedia.isLocation = m.type == "locationMessage";
      if (m.quoted) {
        const quotedType = Object.keys(m.quoted.message)[0];
        m.isMedia.isQuotedImage = quotedType == "imageMessage";
        m.isMedia.isQuotedVideo = quotedType == "videoMessage";
        m.isMedia.isQuotedAudio = quotedType == "audioMessage";
        m.isMedia.isQuotedSticker = quotedType == "stickerMessage";
        m.isMedia.isQuotedContact = quotedType == "contactMessage";
        m.isMedia.isQuotedLocation = quotedType == "locationMessage";
      }
    }
    m.isCmd = m.body ? m.body.startsWith(PREFIX) : false;
    m.command = m.isCmd ? m.body.slice(1).trim().split(/ +/).shift().toLowerCase() : null;
    m.msg = msg;
    m.download = (path = null) => this.downloadMedia(msg.message, path);
    return m;
  }

  async resolvePhoneNumber(client, sender, from, isGroupMsg, senderPn) {
    try {
      // Prioritas 1: gunakan senderPn dari Baileys (untuk @lid format)
      if (senderPn) {
        // senderPn sudah dalam format @s.whatsapp.net
        return senderPn.includes("@") ? senderPn.split("@")[0] : senderPn;
      }
      
      // Prioritas 2: untuk group message, gunakan sender (participant)
      // Untuk direct message, gunakan from
      const jid = isGroupMsg ? sender : from;
      
      // Jika sudah format @s.whatsapp.net, ekstrak langsung
      if (jid && jid.includes("@s.whatsapp.net")) {
        return jid.split("@")[0];
      }
      
      // Untuk format @lid atau format lain, coba resolve dengan onWhatsApp
      if (jid && jid.includes("@")) {
        try {
          const result = await client.onWhatsApp(jid);
          if (result && result.length > 0 && result[0].jid) {
            // onWhatsApp mengembalikan JID dalam format @s.whatsapp.net
            const resolvedJid = result[0].jid;
            if (resolvedJid.includes("@s.whatsapp.net")) {
              return resolvedJid.split("@")[0];
            }
          }
        } catch (error) {
          // Jika onWhatsApp gagal, fallback ke ekstraksi biasa
        }
      }
      
      // Fallback: ekstrak bagian sebelum @
      return jid ? jid.split("@")[0] : "";
    } catch (error) {
      // Jika semua gagal, return sender/from apa adanya
      return (isGroupMsg ? sender : from).split("@")[0];
    }
  }

  async downloadMedia(msg, returnType, pathFile) {
    try {
      console.log("[SERIALIZE] downloadMedia - msg keys:", Object.keys(msg));
      const type = Object.keys(msg)[0];
      console.log("[SERIALIZE] downloadMedia - detected type:", type);
      
      const mimeMap = {
        imageMessage: "image",
        videoMessage: "video",
        stickerMessage: "sticker",
        documentMessage: "document",
        audioMessage: "audio",
      };
      
      if (!mimeMap[type]) {
        console.error("[SERIALIZE] downloadMedia - Unknown media type:", type);
        return null;
      }
      
      console.log("[SERIALIZE] downloadMedia - Starting download for type:", mimeMap[type]);
      const stream = await downloadContentFromMessage(msg[type], mimeMap[type]);
      
      if (returnType === "stream") {
        return stream;
      }
      
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      console.log("[SERIALIZE] downloadMedia - Downloaded buffer size:", buffer.length);
      
      if (pathFile) {
        await fs.promises.writeFile(pathFile, buffer);
        return pathFile;
      } else {
        return buffer;
      }
    } catch (error) {
      console.error("[SERIALIZE] downloadMedia - Error:", error.message);
      console.error("[SERIALIZE] downloadMedia - Stack:", error.stack);
      return null;
    }
  }
}
