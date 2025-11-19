import "dotenv/config";
import http from "http";
import moment from "moment-timezone";
import { Server } from "socket.io";
import { modules } from "../../lib/index.js";
import SessionDatabase from "../database/db/session.db.js";
import ConnectionSession from "../session/Session.js";
import App from "./App.js";
import { connectDatabase } from "./Database.js";

// Global error handlers untuk prevent server crash
process.on("unhandledRejection", (reason, promise) => {
	console.error(modules.color("[UNHANDLED REJECTION]", "#EB6112"), modules.color(`${reason}`, "#E6B0AA"));
	console.error("Promise:", promise);
	// Jangan crash server, hanya log error
});

process.on("uncaughtException", (error) => {
	console.error(modules.color("[UNCAUGHT EXCEPTION]", "#EB6112"), modules.color(`${error.message}`, "#E6B0AA"));
	console.error("Stack:", error.stack);
	// Jangan crash server untuk error non-fatal
	// Server hanya akan crash jika benar-benar fatal
});

const server = new App();

moment.tz.setDefault("Asia/Jakarta").locale("id");

const { SESSION_NAME, AUTO_START } = process.env;

// Create HTTP server explicitly for Socket.IO
const httpServer = http.createServer(server.app);

const io = new Server(httpServer, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
		credentials: true
	},
	allowEIO3: true
});

io.on("connection", (socket) => {
	console.log(modules.color("[SOCKET]", "#82E0AA"), modules.color(`Client connected: ${socket.id}`, "#F8C471"));
	socket.on("disconnect", () => {
		console.log(modules.color("[SOCKET]", "#EB6112"), modules.color(`Client disconnected: ${socket.id}`, "#E6B0AA"));
	});
});

// Start HTTP server
httpServer.listen(server.PORT, async () => {
	await connectDatabase();
	// Tidak auto-generate QR saat startup, hanya update status di DB
	// QR hanya muncul ketika user klik tombol "Generate QR" di dashboard
	await new SessionDatabase().startProgram();
	console.log(modules.color("[APP]", "#EB6112"), modules.color(moment().format("DD/MM/YY HH:mm:ss"), "#F8C471"), modules.color(`App Listening at http://localhost:${server.PORT}`, "#82E0AA"));
});

// Export io as socket for backward compatibility
const socket = io;

export { socket, io, moment };
