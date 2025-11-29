import Message from "../models/message.model.js";
import { Op } from "sequelize";

class MessageDatabase {
	constructor() {
		this.message = Message;
	}

	async storeMessage(session_name, message_id, remote_jid, from_me, message_data) {
		try {
			// Store message as JSON string
			const messageJson = JSON.stringify(message_data);
			await this.message.create({
				session_name,
				message_id,
				remote_jid,
				from_me,
				message_data: messageJson,
			});
		} catch (error) {
			// Ignore duplicate key errors (message already stored)
			if (error.name !== "SequelizeUniqueConstraintError") {
				console.error("[MESSAGE_DB] Error storing message:", error.message);
			}
		}
	}

	async getMessage(session_name, message_id) {
		try {
			const msg = await this.message.findOne({
				where: {
					session_name,
					message_id,
				},
			});
			if (!msg) {
				return undefined;
			}
			// Parse JSON string back to object
			return JSON.parse(msg.message_data);
		} catch (error) {
			console.error("[MESSAGE_DB] Error retrieving message:", error.message);
			return undefined;
		}
	}

	async deleteMessage(session_name, message_id) {
		try {
			await this.message.destroy({
				where: {
					session_name,
					message_id,
				},
			});
		} catch (error) {
			console.error("[MESSAGE_DB] Error deleting message:", error.message);
		}
	}

	async deleteOldMessages(session_name, daysOld = 7) {
		try {
			const date = new Date();
			date.setDate(date.getDate() - daysOld);
			await this.message.destroy({
				where: {
					session_name,
					createdAt: {
						[Op.lt]: date,
					},
				},
			});
		} catch (error) {
			console.error("[MESSAGE_DB] Error deleting old messages:", error.message);
		}
	}
}

export default MessageDatabase;

