import CallbackSetting from "../models/callback.model.js";

class CallbackDatabase {
	constructor() {
		this.callback = CallbackSetting;
	}

	async setCallback(session_name, callback_url, callback_token) {
		return this.callback.upsert({ session_name, callback_url, callback_token });
	}

	async getCallback(session_name) {
		if (!session_name) return null;
		return this.callback.findOne({ where: { session_name } });
	}

	async getAllCallback() {
		return this.callback.findAll();
	}

	async deleteCallback(session_name) {
		if (!session_name) return;
		await this.callback.destroy({ where: { session_name } });
	}
}

export default CallbackDatabase;

