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
			const callbackConfig = sessionName ? await callbackDB.getCallback(sessionName) : null;
			const targetUrl = callbackConfig?.callback_url || N8N_WEBHOOK_URL;
			if (!targetUrl) return;

			const type = this.mapType(message.type);
			const payload = {
				session: sessionName,
				sender: this.normalizeJid(message.sender),
				pushname: message.pushname || "",
				from: message.from,
				isGroup: message.isGroupMsg,
				type,
				message: message.body || "",
				timestamp: message.t,
				time: message.time,
				device: message.device,
			};

			if (this.shouldAttachFile(type)) {
				const media = await this.persistMedia(message, sessionName);
				if (media) {
					payload.url = media.url;
					payload.fileName = media.filename;
					payload.mimetype = media.mimetype;
					payload.bytes = media.bytes;
				}
			} else {
				payload.url = null;
			}

			await axios.post(targetUrl, payload, {
				headers: this.buildHeaders(callbackConfig?.callback_token),
				timeout: Number(process.env.N8N_TIMEOUT || 15000),
			});
		} catch (error) {
			console.error("[N8N] Failed to forward incoming message:", error.message);
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

	static buildHeaders(token) {
		const headers = { "Content-Type": "application/json" };
		const finalToken = token || N8N_WEBHOOK_TOKEN;
		if (finalToken) {
			headers["x-api-key"] = finalToken;
		}
		return headers;
	}

	static getBaseHost() {
		const base = HOST || "http://localhost:8080";
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
			const rawMessage = message.msg?.message?.[message.type];
			if (!rawMessage) return null;
			const mimetype = rawMessage.mimetype || "application/octet-stream";
			const ext = this.getExtension(mimetype) || `.${(mimetype.split("/")[1] || "bin").split(";")[0]}`;
			const baseDir = path.join("public", "uploads", sessionName || "default");
			await fs.promises.mkdir(baseDir, { recursive: true });
			const filename = `${Date.now()}-${helpers.randomText(6)}${ext}`;
			const filePath = path.join(baseDir, filename);
			const buffer = await message.download();
			if (!buffer) return null;
			await fs.promises.writeFile(filePath, buffer);
			const relative = path.posix.join("uploads", sessionName || "default", filename);
			const baseHost = this.getBaseHost();
			const url = new URL(relative, baseHost).toString();
			return { url, filename, mimetype, bytes: buffer.length };
		} catch (error) {
			console.error("[N8N] Failed to persist media:", error.message);
			return null;
		}
	}
}

export default N8NService;

