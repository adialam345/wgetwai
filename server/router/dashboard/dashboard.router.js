import fs from "fs";
import express from "express";
import SessionDatabase from "../../database/db/session.db.js";
import { AutoReply } from "../../database/db/messageRespon.db.js";
import HistoryMessage from "../../database/db/history.db.js";
import CallbackDatabase from "../../database/db/callback.db.js";
const router = express.Router();

const { SESSION_PATH, LOG_PATH } = process.env;

const db = new SessionDatabase();
const callbackDb = new CallbackDatabase();

router.get("/", async (req, res) => {
	const entries = fs.existsSync(SESSION_PATH)
		? fs.readdirSync(SESSION_PATH, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "store")
		: [];
	const session_name = entries.length ? entries[0].name : null;
	const loggerPath =
		session_name && fs.existsSync(`${LOG_PATH}/${session_name}.txt`) ? `${LOG_PATH.replace("./public/", "")}/${session_name}.txt` : null;
	const session = session_name ? await db.findOneSessionDB(session_name) : null;
	const callbackSetting = session_name ? await callbackDb.getCallback(session_name) : null;
	res.render("dashboard/dashboard", {
		loggerPath,
		session,
		session_name,
		callbackSetting,
		layout: "layouts/main",
	});
});

router.get("/send-message", async (req, res) => {
	const session = await db.findAllSessionDB();
	res.render("dashboard/sendMessage", {
		session,
		layout: "layouts/main",
	});
});

router.get("/auto-reply", async (req, res) => {
	const session = await db.findAllSessionDB();
	const replyList = await new AutoReply().checkReplyMessage();
	res.render("dashboard/autoReply", {
		session,
		replyList,
		layout: "layouts/main",
	});
});

router.get("/api-doc", async (req, res) => {
	res.render("dashboard/apidoc", {
		layout: "layouts/main",
	});
});

router.get("/history-message", async (req, res) => {
	let db = await new HistoryMessage().getAllMessage();
	res.render("dashboard/history", {
		layout: "layouts/main",
		db,
	});
});

export default router;
