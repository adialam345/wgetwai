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
	let sessions = await db.findAllSessionDB() || [];

	// Scan for physical session folders
	if (fs.existsSync(SESSION_PATH)) {
		const files = fs.readdirSync(SESSION_PATH, { withFileTypes: true });
		const folders = files.filter(dirent => dirent.isDirectory() && dirent.name !== 'store').map(dirent => dirent.name);

		// Find folders that are not in the DB
		const dbSessionNames = sessions.map(s => s.session_name);
		const orphanedSessions = folders.filter(folder => !dbSessionNames.includes(folder));

		// Add orphaned sessions to the list
		orphanedSessions.forEach(name => {
			sessions.push({
				session_name: name,
				session_number: 'Not in DB',
				status: 'STOPPED' // Assume stopped if not in DB
			});
		});
	}

	res.render("dashboard/dashboard", {
		sessions,
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
