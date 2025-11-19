import axios from "axios";
import fs from "fs";
import path from "path";
import { helpers } from "../../lib/index.js";
import CallbackDatabase from "../database/db/callback.db.js";

const { N8N_WEBHOOK_URL, N8N_WEBHOOK_TOKEN, HOST } = process.env;
const callbackDB = new CallbackDatabase();

class N8NService {
	static async forwardIncomingMessage(message, sessionName) {
		try {
			console.log("[N8N] forwardIncomingMessage - START");
			console.log("[N8N] forwardIncomingMessage - message.type:", message.type);
			console.log("[N8N] forwardIncomingMessage - sessionName:", sessionName);
			
			const callbackConfig = sessionName ? await callbackDB.getCallback(sessionName) : null;
			const targetUrl = callbackConfig?.callback_url || N8N_WEBHOOK_URL;
			
			console.log("[N8N] forwardIncomingMessage - targetUrl:", targetUrl);
			
			if (!targetUrl) {
				console.log("[N8N] forwardIncomingMessage - No target URL, skipping");
				return;
			}

			const type = this.mapType(message.type);
			console.log("[N8N] forwardIncomingMessage - mapped type:", type);
			
			const payload = {
				session: sessionName,
				sender: this.extractPhoneNumber(message),
				pushname: message.pushname || "",
				from: message.fromDisplay || message.from,
				isGroup: message.isGroupMsg,
				type,
				message: message.body || "",
				timestamp: message.t,
				time: message.time,
				device: message.device,
			};
			
			console.log("[N8N] forwardIncomingMessage - payload created:", JSON.stringify(payload, null, 2));

			if (this.shouldAttachFile(type)) {
				console.log("[N8N] forwardIncomingMessage - Type requires file attachment");
				const media = await this.persistMedia(message, sessionName);
				if (media) {
					console.log("[N8N] forwardIncomingMessage - Media persisted successfully");
					payload.url = media.url;
					payload.fileName = media.filename;
					payload.mimetype = media.mimetype;
					payload.bytes = media.bytes;
				} else {
					console.error("[N8N] forwardIncomingMessage - Media persist FAILED, sending without media");
					payload.url = null;
				}
			} else {
				console.log("[N8N] forwardIncomingMessage - No file attachment needed");
				payload.url = null;
			}

			console.log("[N8N] forwardIncomingMessage - Sending to webhook...");
			console.log("[N8N] forwardIncomingMessage - Final payload:", JSON.stringify(payload, null, 2));
			
			await axios.post(targetUrl, payload, {
				headers: this.buildHeaders(callbackConfig?.callback_token),
				timeout: Number(process.env.N8N_TIMEOUT || 15000),
			});
			
			console.log("[N8N] forwardIncomingMessage - Webhook sent successfully");
		} catch (error) {
			console.error("[N8N] Failed to forward incoming message:", error.message);
			console.error("[N8N] Error stack:", error.stack);
		}
	}

	static mapType(contentType) {
		switch (contentType) {
			case "imageMessage":
				return "image";
			case "videoMessage":
				return "video";
			case "audioMessage":
				return "audio";
			case "documentMessage":
				return "document";
			case "stickerMessage":
				return "sticker";
			case "buttonsResponseMessage":
			case "listResponseMessage":
			case "templateButtonReplyMessage":
				return "text";
			default:
				return "text";
		}
	}

	static shouldAttachFile(type) {
		return ["image", "video", "audio", "document", "sticker"].includes(type);
	}

	static normalizeJid(jid = "") {
		return jid.includes("@") ? jid.split("@")[0] : jid;
	}

	static extractPhoneNumber(message) {
		// Prioritas 1: gunakan phoneNumber yang sudah di-resolve dari Serialize
		if (message.phoneNumber) {
			return message.phoneNumber;
		}
		
		// Prioritas 2: untuk direct message (bukan group), gunakan message.from
		// Prioritas 3: untuk group message, gunakan message.sender (participant)
		const jid = message.isGroupMsg ? message.sender : message.from;
		
		// Jika JID mengandung @s.whatsapp.net, ekstrak nomor telepon
		if (jid && jid.includes("@s.whatsapp.net")) {
			return jid.split("@")[0];
		}
		
		// Fallback: coba dari sender jika from tidak valid
		if (message.sender && message.sender.includes("@s.whatsapp.net")) {
			return message.sender.split("@")[0];
		}
		
		// Fallback: gunakan normalizeJid untuk format lainnya
		return this.normalizeJid(jid || message.sender || "");
	}

	static buildHeaders(token) {
		const headers = { "Content-Type": "application/json" };
		const finalToken = token || N8N_WEBHOOK_TOKEN;
		if (finalToken) {
			headers["x-api-key"] = finalToken;
		}
		return headers;
	}

	static getBaseHost() {
		const base = HOST || "https://wgetwai.antarixa.qzz.io";
		return base.endsWith("/") ? base : `${base}/`;
	}

	static getExtension(mimetype = "") {
		const map = {
			"image/jpeg": ".jpg",
			"image/png": ".png",
			"image/webp": ".webp",
			"video/mp4": ".mp4",
			"audio/ogg; codecs=opus": ".ogg",
			"audio/mpeg": ".mp3",
			"application/pdf": ".pdf",
			"application/vnd.ms-excel": ".xls",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
		};
		return map[mimetype] || "";
	}

	static async persistMedia(message, sessionName) {
		try {
			console.log("[N8N] persistMedia - message.type:", message.type);
			console.log("[N8N] persistMedia - message.msg exists:", !!message.msg);
			console.log("[N8N] persistMedia - message.msg?.message exists:", !!message.msg?.message);
			
			const rawMessage = message.msg?.message?.[message.type];
			if (!rawMessage) {
				console.error("[N8N] persistMedia - rawMessage not found for type:", message.type);
				return null;
			}
			
			console.log("[N8N] persistMedia - rawMessage found, mimetype:", rawMessage.mimetype);
			
			const mimetype = rawMessage.mimetype || "application/octet-stream";
			const ext = this.getExtension(mimetype) || `.${(mimetype.split("/")[1] || "bin").split(";")[0]}`;
			const baseDir = path.join("public", "uploads", sessionName || "default");
			await fs.promises.mkdir(baseDir, { recursive: true });
			const filename = `${Date.now()}-${helpers.randomText(6)}${ext}`;
			const filePath = path.join(baseDir, filename);
			
			console.log("[N8N] persistMedia - Attempting to download...");
			const buffer = await message.download();
			
			if (!buffer) {
				console.error("[N8N] persistMedia - Download returned null/empty buffer");
				return null;
			}
			
			console.log("[N8N] persistMedia - Download success, buffer size:", buffer.length);
			
			await fs.promises.writeFile(filePath, buffer);
			console.log("[N8N] persistMedia - File saved to:", filePath);
			
			const relative = path.posix.join("uploads", sessionName || "default", filename);
			const baseHost = this.getBaseHost();
			const url = new URL(relative, baseHost).toString();
			
			console.log("[N8N] persistMedia - URL generated:", url);
			
			return { url, filename, mimetype, bytes: buffer.length };
		} catch (error) {
			console.error("[N8N] Failed to persist media:", error.message);
			console.error("[N8N] Error stack:", error.stack);
			return null;
		}
	}
}

export default N8NService;

