import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode";
import fs from "fs";
import { modules } from "../../lib/index.js";
import { socket, moment } from "../config/index.js";
import SessionDatabase from "../database/db/session.db.js";
import Message from "./Client/handler/Message.js";

const { SESSION_PATH, LOG_PATH } = process.env;
let sessions = {};

class ConnectionSession extends SessionDatabase {
  constructor() {
    super();
    this.sessionPath = SESSION_PATH;
    this.logPath = LOG_PATH;
    this.count = 0;

    // Ensure base directories exist to avoid ENOENT errors when writing files
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
    }
    const storeDir = `${this.sessionPath}/store`;
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  getClient() {
    return sessions ?? null;
  }

  async deleteSession(session_name, options = {}) {
    const { removeFromDB = true } = options;
    if (fs.existsSync(`${this.sessionPath}/${session_name}`)) fs.rmSync(`${this.sessionPath}/${session_name}`, { force: true, recursive: true });
    if (fs.existsSync(`${this.sessionPath}/store/${session_name}.json`)) fs.unlinkSync(`${this.sessionPath}/store/${session_name}.json`);
    if (fs.existsSync(`${this.logPath}/${session_name}.txt`)) fs.unlinkSync(`${this.logPath}/${session_name}.txt`);
    if (removeFromDB) {
      await this.deleteSessionDB(session_name);
    } else {
      await this.updateStatusSessionDB(session_name, "STOPPED");
    }
    sessions = {};
  }

  async generateQr(input, session_name) {
    let rawData = await qrcode.toDataURL(input, { scale: 8 });
    let dataBase64 = rawData.replace(/^data:image\/png;base64,/, "");
    await modules.sleep(3000);
    socket.emit(`update-qr`, { buffer: dataBase64, session_name });
    this.count++;
    console.log(
      modules.color("[QR]", "#EB6112"),
      modules.color(`[${session_name}] QR Code ready - Scan now!`, "#E6B0AA")
    );
  }

  async safeLogout(client) {
    if (!client || typeof client.logout !== "function") return;
    try {
      await client.logout();
    } catch (error) {
      // Prevent Baileys from throwing and killing the app when WS already closed
      // Silent ignore - no need to log this
    }
  }

  async createSession(session_name) {
    const sessionDir = `${this.sessionPath}/${session_name}`;
    
    // Pastikan folder session dibuat sebelum useMultiFileAuthState
    if (!fs.existsSync(sessionDir)) {
      try {
        fs.mkdirSync(sessionDir, { recursive: true });
      } catch (err) {
        console.error(
          modules.color("[ERROR]", "#EB6112"),
          modules.color(`Failed to create session directory: ${err.message}`, "#E6B0AA")
        );
        throw err;
      }
    }
    
    // Pastikan store directory juga ada
    const storeDir = `${this.sessionPath}/store`;
    if (!fs.existsSync(storeDir)) {
      try {
        fs.mkdirSync(storeDir, { recursive: true });
      } catch (err) {
        // Silent - will retry if needed
      }
    }
    
    try {
      let { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      const options = {
        printQRInTerminal: false,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"),
        version,
      };

      const client = makeWASocket(options);
      sessions = { ...client, isStop: false };

      // Wrap saveCreds dengan error handling untuk prevent crash
      client.ev.on("creds.update", async () => {
        try {
          // Pastikan folder session masih ada sebelum save
          if (!fs.existsSync(sessionDir)) {
            console.log(
              modules.color("[WARN]", "#F39C12"),
              modules.color(`[${session_name}] Session directory not found, skipping creds save`, "#F39C12")
            );
            return;
          }
          await saveCreds();
        } catch (error) {
          console.error(
            modules.color("[ERROR]", "#EB6112"),
            modules.color(`[${session_name}] Failed to save credentials: ${error.message}`, "#E6B0AA")
          );
          // Don't crash server, just log the error
        }
      });
      client.ev.on("connection.update", async (update) => {
        if (this.count >= 3) {
          this.deleteSession(session_name, { removeFromDB: false });
          socket.emit("connection-status", { session_name, result: "No Response, QR Scan Canceled" });
          console.log(
            modules.color("[QR]", "#EB6112"),
            modules.color(`[${session_name}] QR expired - No response after 3 attempts`, "#E6B0AA")
          );
          client.ev.removeAllListeners("connection.update");
          return;
        }

        if (update.qr) this.generateQr(update.qr, session_name);

        if (update.isNewLogin) {
          this.count = 0;
          // In Baileys 6.7.7, user info is available via client.user.id after login
          const userId = client.user?.id || state.creds.me?.id || "";
          const phoneNumber = userId ? userId.split(":")[0] : "";
          if (phoneNumber) {
            await this.createSessionDB(session_name, phoneNumber);
            let files = `${this.logPath}/${session_name}.txt`;
            // Make sure log directory exists (in case environment changed after constructor)
            if (!fs.existsSync(this.logPath)) {
              fs.mkdirSync(this.logPath, { recursive: true });
            }
            if (!fs.existsSync(files)) {
              fs.writeFileSync(files, `Success Create new Session : ${session_name}, ${phoneNumber}\n`);
            }
            const readLog = fs.readFileSync(files, "utf8");
            return socket.emit("logger", {
              session_name,
              result: readLog,
              files,
              session_number: phoneNumber,
              status: "CONNECTED",
            });
          }
        }

        const { lastDisconnect, connection } = update;
        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
          if (reason === DisconnectReason.badSession) {
            console.log(
              modules.color("[ERROR]", "#EB6112"),
              modules.color(`[${session_name}] Bad session file - Please scan QR again`, "#E6B0AA")
            );
            this.deleteSession(session_name, { removeFromDB: false });
            this.safeLogout(client);
            return socket.emit("connection-status", { session_name, result: "Bad Session File, Please Create QR Again" });
          } else if (reason === DisconnectReason.connectionClosed) {
            const checked = this.getClient();
            if (checked.isStop == false) {
              // Auto-reconnect - no need to log
              this.createSession(session_name);
            } else if (checked.isStop == true) {
              await this.updateStatusSessionDB(session_name, "STOPPED");
              console.log(
                modules.color("[STOP]", "#EB6112"),
                modules.color(`[${session_name}] Session stopped`, "#E6B0AA")
              );
              socket.emit("session-status", { session_name, status: "STOPPED" });
            }
          } else if (reason === DisconnectReason.connectionLost) {
            // Auto-reconnect - no need to log
            this.createSession(session_name);
          } else if (reason === DisconnectReason.connectionReplaced) {
            console.log(
              modules.color("[WARN]", "#EB6112"),
              modules.color(`[${session_name}] Connection replaced - Another session opened`, "#E6B0AA")
            );
            this.safeLogout(client);
            this.deleteSession(session_name, { removeFromDB: false });
            return socket.emit("connection-status", {
              session_name,
              result: `[Session: ${session_name}] Connection Replaced, Another New Session Opened, Please Create QR Again`,
            });
          } else if (reason === DisconnectReason.loggedOut) {
            console.log(
              modules.color("[WARN]", "#EB6112"),
              modules.color(`[${session_name}] Device logged out - Please scan QR again`, "#E6B0AA")
            );
            this.safeLogout(client);
            this.deleteSession(session_name, { removeFromDB: false });
            return socket.emit("connection-status", { session_name, result: `[Session: ${session_name}] Device Logged Out, Please Create QR Again` });
          } else if (reason === DisconnectReason.restartRequired) {
            // Auto-reconnect - no need to log
            this.createSession(session_name);
          } else if (reason === DisconnectReason.timedOut) {
            // Auto-reconnect - no need to log
            this.createSession(session_name);
          } else {
            console.log(
              modules.color("[WARN]", "#EB6112"),
              modules.color(`[${session_name}] Unknown disconnect reason: ${reason}`, "#E6B0AA")
            );
            client.end(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`);
          }
        } else if (connection == "open") {
          this.count = 0;
          await this.updateStatusSessionDB(session_name, "CONNECTED");
          socket.emit("session-status", { session_name, status: "CONNECTED" });
          console.log(
            modules.color("[✓]", "#82E0AA"),
            modules.color(`[${session_name}] Connected successfully`, "#82E0AA")
          );
        }
      });

      client.ev.on("messages.upsert", async ({ messages, type }) => {
        try {
          if (type !== "notify") return;
          const message = new Message(client, { messages, type }, session_name);
          await message.mainHandler();
        } catch (error) {
          console.error(
            modules.color("[ERROR]", "#EB6112"),
            modules.color(`[${session_name}] Error handling message: ${error.message}`, "#E6B0AA")
          );
          // Don't crash server, just log the error
        }
      });
    } catch (error) {
      console.error(
        modules.color("[ERROR]", "#EB6112"),
        modules.color(`[${session_name}] Failed to create session: ${error.message}`, "#E6B0AA")
      );
      // Hapus session directory jika ada error
      if (fs.existsSync(sessionDir)) {
        try {
          fs.rmSync(sessionDir, { force: true, recursive: true });
        } catch (err) {
          // Silent cleanup error
        }
      }
      socket.emit("connection-status", {
        session_name,
        result: `Error creating session: ${error.message}. Please try again.`,
      });
      await this.updateStatusSessionDB(session_name, "STOPPED");
    }
  }
}

export default ConnectionSession;
