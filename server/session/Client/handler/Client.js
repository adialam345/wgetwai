import { 
  downloadContentFromMessage, 
  toBuffer,
  generateThumbnail,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} from "@whiskeysockets/baileys";
import axios from "axios";
import fs from "fs";
import MessageDatabase from "../../../database/db/message.db.js";

class Client {
  constructor(client, target, session_name = null) {
    this.client = client;
    this.from = target;
    this.session_name = session_name;
    this.messageDB = session_name ? new MessageDatabase() : null;
  }

  async storeMessage(result) {
    if (!this.messageDB || !this.session_name || !result?.key) return;
    try {
      await this.messageDB.storeMessage(
        this.session_name,
        result.key.id,
        result.key.remoteJid || this.from,
        result.key.fromMe || true,
        result.message || {}
      );
    } catch (error) {
      // Silent error - don't break message flow
      console.error(`[CLIENT] Error storing message:`, error.message);
    }
  }

  async sendText(text) {
    console.log("[CLIENT] sendText - Sending to JID:", this.from);
    console.log("[CLIENT] sendText - Message:", text.substring(0, 50));
    const mentions = [...text.matchAll(/@(\d{0,16})/g)].map((v) => v[1] + "@s.whatsapp.net");
    const result = await this.client.sendMessage(this.from, { text, mentions });
    await this.storeMessage(result);
    console.log("[CLIENT] sendText - Message sent successfully");
    return result;
  }

  async reply(text, quoted) {
    console.log("[CLIENT] reply - Replying to JID:", this.from);
    console.log("[CLIENT] reply - Message:", text.substring(0, 50));
    const mentions = [...text.matchAll(/@(\d{0,16})/g)].map((v) => v[1] + "@s.whatsapp.net");
    const result = await this.client.sendMessage(this.from, { text, mentions }, { quoted });
    await this.storeMessage(result);
    console.log("[CLIENT] reply - Reply sent successfully");
    return result;
  }

  async sendProduct(path, body = "", footer = "", businessOwnerJid = "0", options = {}) {
    let image = await prepareWAMessageMedia({ image: { url: path } }, { upload: this.client.waUploadToServer });
    let catalog = await generateWAMessageFromContent(
      this.from,
      proto.Message.fromObject({
        productMessage: {
          product: {
            productImage: image.imageMessage,
            productId: "123",
            title: options.title ? options.title : "",
            description: options.title ? options.title : "",
            currencyCode: options.currencyCode ? options.currencyCode : "IDR",
            footerText: options.title ? options.title : "",
            priceAmount1000: options.price ? options.price : "2000000",
            productImageCount: 1,
            firstImageId: "123",
            salePriceAmount1000: options.salePrice ? options.salePrice : "10000000",
            retailerId: options.retailer ? options.retailer : "",
            url: options.urlProduct ? options.urlProduct : "zekais.com",
          },
          footer,
          body,
          businessOwnerJid: `${businessOwnerJid}@s.whatsapp.net`,
        },
      }),
      { userJid: this.from }
    );
    await this.client.relayMessage(this.from, catalog.message, { messageId: catalog.key.id });
    // Store relayed message
    if (catalog.message && catalog.key) {
      await this.storeMessage({ key: catalog.key, message: catalog.message });
    }
  }

  async sendLocation(lat, long) {
    const result = await this.client.sendMessage(this.from, { location: { degreesLatitude: lat, degreesLongitude: long } });
    await this.storeMessage(result);
    return result;
  }

  async sendContact(listNumber = [], listName = []) {
    let list = [];
    for (let i = 0; i < listNumber.length; i++) {
      let number = listNumber[i].replace(/[^0-9]/g, "");
      list.push({
        vcard:
          "BEGIN:VCARD\n" +
          "VERSION:3.0\n" +
          `FN:${listName[i]}\n` +
          "ORG:;\n" +
          "TEL;type=CELL;type=VOICE;waid=" +
          number +
          ":+" +
          number +
          "\n" +
          "END:VCARD",
      });
    }
    const result = await this.client.sendMessage(this.from, { contacts: { displayName: listName[0], contacts: list } });
    await this.storeMessage(result);
    return result;
  }

  async sendSticker(api = false, mime, file, pack, author, keepScale = true, circle = false, removebg = false, quoted = false) {
    const sticker = axios.create({
      baseURL: "https://sticker-api-tpe3wet7da-uc.a.run.app",
    });

    let fixFile = api ? fs.readFileSync(file) : file;

    if (mime == "image") {
      const data = {
        image: `data:image/jpeg;base64,${fixFile.toString("base64")}`,
        stickerMetadata: {
          pack,
          author,
          keepScale,
          circle,
          removebg,
        },
      };
      sticker.post("/prepareWebp", data).then(async (res) => {
        const result = await this.client.sendMessage(this.from, { sticker: Buffer.from(res.data.webpBase64, "base64") }, { quoted });
        await this.storeMessage(result);
      });
      if (api) fs.unlinkSync(file);
    } else if (mime == "video") {
      const data = {
        file: `data:video/mp4;base64,${fixFile.toString("base64")}`,
        stickerMetadata: {
          pack,
          author,
          keepScale,
        },
        processOptions: {
          crop: false,
          fps: 10,
          startTime: "00:00:00.0",
          endTime: "00:00:7.0",
          loop: 0,
        },
      };
      sticker.post("/convertMp4BufferToWebpDataUrl", data).then(async (data) => {
        const result = await this.client.sendMessage(this.from, { sticker: Buffer.from(data.data.split(";base64,")[1], "base64") }, { quoted });
        await this.storeMessage(result);
      });
      if (api) fs.unlinkSync(file);
    }
  }

  async sendMedia(path, caption = "", options = {}, quoted = "") {
    let mime = options.file.mimetype.split("/")[0];
    const mentions = [...caption.matchAll(/@(\d{0,16})/g)].map((v) => v[1] + "@s.whatsapp.net");
    if (mime == "image" || mime == "video") {
      let jpegThumbnail = await generateThumbnail(path, mime);
      let prepare =
        mime == "image"
          ? { image: { url: path }, caption, mentions, jpegThumbnail, ...options }
          : { video: { url: path }, caption, mentions, jpegThumbnail, ...options };
      const message = await prepareWAMessageMedia(prepare, { upload: this.client.waUploadToServer });
      let msgType = mime == "image" ? { imageMessage: message.imageMessage } : { videoMessage: message.videoMessage };
      let media = await generateWAMessageFromContent(this.from, msgType, { quoted, mediaUploadTimeoutMs: 600000 });
      await this.client.relayMessage(this.from, media.message, { messageId: media.key.id }).catch((error) => console.log(error));
      // Store relayed message
      if (media.message && media.key) {
        await this.storeMessage({ key: media.key, message: media.message });
      }
    } else if (mime == "audio") {
      const message = await prepareWAMessageMedia(
        { audio: { url: path }, mimetype: options.file.mimetype, fileName: options.file.name },
        { upload: this.client.waUploadToServer }
      );
      let media = await generateWAMessageFromContent(this.from, { audioMessage: message.audioMessage }, { quoted, mediaUploadTimeoutMs: 600000 });
      await this.client.relayMessage(this.from, media.message, { messageId: media.key.id }).catch((error) => console.log(error));
      // Store relayed message
      if (media.message && media.key) {
        await this.storeMessage({ key: media.key, message: media.message });
      }
      const captionResult = await this.client.sendMessage(this.from, { text: caption });
      await this.storeMessage(captionResult);
    } else {
      const message = await prepareWAMessageMedia(
        { document: { url: path }, mimetype: options.file.mimetype, fileName: options.file.name },
        { upload: this.client.waUploadToServer }
      );
      let media = await generateWAMessageFromContent(
        this.from,
        { documentMessage: message.documentMessage },
        { quoted, mediaUploadTimeoutMs: 600000 }
      );
      await this.client.relayMessage(this.from, media.message, { messageId: media.key.id }).catch((error) => console.log(error));
      // Store relayed message
      if (media.message && media.key) {
        await this.storeMessage({ key: media.key, message: media.message });
      }
      if (caption != "") {
        const captionResult = await this.client.sendMessage(this.from, { text: caption });
        await this.storeMessage(captionResult);
      }
    }
  }

  async sendList(text = "", footer = "", title = "", buttonText = "", sections = []) {
    const listMessage = {
      text,
      footer,
      title,
      buttonText,
      sections,
    };
    const result = await this.client.sendMessage(this.from, listMessage);
    await this.storeMessage(result);
    return result;
  }

  async sendButton(text = "", footer = "", button = [], path = "", mimetype = "", options = {}) {
    const mentions = [...text.matchAll(/@(\d{0,16})/g)].map((v) => v[1] + "@s.whatsapp.net");
    if (path) {
      let mime = mimetype.split("/")[0];
      let thumb = await generateThumbnail(path, mime);
      const message = await prepareWAMessageMedia(
        { image: { url: path }, jpegThumbnail: thumb, ...options },
        { upload: this.client.waUploadToServer }
      );
      let media = generateWAMessageFromContent(
        this.from,
        proto.Message.fromObject({
          templateMessage: {
            hydratedTemplate: {
              imageMessage: message.imageMessage,
              hydratedContentText: text,
              hydratedFooterText: footer,
              hydratedButtons: button,
            },
          },
        }),
        { mediaUploadTimeoutMs: 600000 }
      );
      await this.client.relayMessage(this.from, media.message, { messageId: media.key.id }).catch((error) => console.log(error));
      // Store relayed message
      if (media.message && media.key) {
        await this.storeMessage({ key: media.key, message: media.message });
      }
      fs.unlinkSync(path);
    } else {
      const buttonMessage = {
        text,
        footer,
        templateButtons: button,
        headerType: 4,
        mentions,
        viewOnce: true, // Sementara
      };
      const result = await this.client.sendMessage(this.from, buttonMessage);
      await this.storeMessage(result);
      return result;
    }
  }

  async downloadMedia(msg, pathFile) {
    return new Promise(async (resolve, reject) => {
      try {
        const type = Object.keys(msg)[0];
        const mimeMap = {
          imageMessage: "image",
          videoMessage: "video",
          stickerMessage: "sticker",
          documentMessage: "document",
          audioMessage: "audio",
        };
        const stream = await downloadContentFromMessage(msg[type], mimeMap[type]);
        let buffer = await toBuffer(stream);
        if (pathFile) {
          fs.promises.writeFile(pathFile, buffer).then(resolve(pathFile));
        } else {
          resolve(stream);
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}

export default Client;
