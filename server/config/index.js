import "dotenv/config";
import moment from "moment-timezone";
import { Server } from "socket.io";
import { modules } from "../../lib/index.js";
import SessionDatabase from "../database/db/session.db.js";
import ConnectionSession from "../session/Session.js";
import App from "./App.js";
import { connectDatabase } from "./Database.js";

const server = new App();

moment.tz.setDefault("Asia/Jakarta").locale("id");

const { SESSION_NAME, AUTO_START } = process.env;

const serverHttp = server.app.listen(server.PORT, async () => {
	await connectDatabase();
	// Tidak auto-generate QR saat startup, hanya update status di DB
	// QR hanya muncul ketika user klik tombol "Generate QR" di dashboard
	await new SessionDatabase().startProgram();
	console.log(modules.color("[APP]", "#EB6112"), modules.color(moment().format("DD/MM/YY HH:mm:ss"), "#F8C471"), modules.color(`App Listening at http://localhost:${server.PORT}`, "#82E0AA"));
});

const io = new Server(serverHttp);
const socket = io.on("connection", (socket) => {
	socket.on("disconnect", () => {
		// Silent disconnect - no need to log
	});
	return socket;
});

export { socket, io, moment };
