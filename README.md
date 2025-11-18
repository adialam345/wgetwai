<div align="center">

# **WhatsApp - Gateway**

<img src="./public/image/readme/dashboard.png" width="500" alt="Img Dashboard" >

Simple WhatsApp Gateway, Built Using Baileys, Express, Sequelize + [mazer](https://github.com/zuramai/mazer)

</div>

<p align="center">
<a href="https://github.com/fawwaz37/whatsapp-gateway/stargazers" target="_blank"><img src="https://img.shields.io/github/stars/fawwaz37/whatsapp-gateway" alt="Stars" /></a>
<a href="https://github.com/fawwaz37/whatsapp-gateway/network/members" target="_blank"><img src="https://img.shields.io/github/forks/fawwaz37/whatsapp-gateway" alt="Forks" /></a>
</p>

# Note

If you want to **request a feature**, contact my number wa.me/6287715579966

Because there are no other features added to this free repo

# Installation

Requirements

-   [Node.js](https://nodejs.org/en/)
-   [Git](https://git-scm.com/downloads)
-   [VS Code](https://code.visualstudio.com/download) or Any Text Editor

## Cloning this repo

```cmd
> git clone https://github.com/fawwaz37/whatsapp-gateway.git
> cd whatsapp-gateway
```

Use `code .` to open file in VS Code

```cmd
> code .
```

## Editing the file

`.env` Configurations

```env

# Listening Host - socket
HOST=http://localhost:8080

# Default session name
SESSION_NAME=session_1

# If AUTO_START=y, Auto Start Session With Default name
AUTO_START=n

# It doesn't need to be replaced, it's okay
PREFIX=.
SESSION_PATH=./session
LOG_PATH=./public/log

# Configure the database, fill it with your own
DB_NAME=wa-gateway
DB_USER=root
DB_PASSWORD=
DB_HOST=localhost
DB_PORT=3306
DB_DIALECT=mysql

# Optional: n8n integration
N8N_WEBHOOK_URL=https://your-n8n-host/webhook/fonnte-inbox
N8N_WEBHOOK_TOKEN=
N8N_SESSION_NAME=session_1
N8N_API_TOKEN=change-me
N8N_TIMEOUT=15000
API_SEND_TOKEN=change-me

```

## Installing the dependencies

```cmd
> npm install
```

## Running App

```cmd
> npm start
```

**After Start Database and Table Auto Create**

Then Browse http://localhost:8080 . You will see the Dashboard.

<img src="./public/image/readme/dashboard.png" width="500" alt="Img Dashboard" >

## API Docs

You Can See All Documentation Here <a target="_blank" href="https://documenter.getpostman.com/view/16528402/VVXC3EjU">POSTMAN</a>

## N8N Integration

1. **Receive WhatsApp events in n8n**
	- Set `N8N_WEBHOOK_URL` to the webhook from your workflow (e.g. `https://n8n.yourdomain.com/webhook/fonnte-inbox`).
	- Optionally set `N8N_WEBHOOK_TOKEN` to send an `x-api-key` header for extra security.
	- Incoming messages will be forwarded with `sender`, `type`, `message`, `url`, `session`, and metadata matching the shared workflow.
	- Callback bisa diatur dari Dashboard (kartu **Callback Webhook**) atau lewat REST:
	  ```bash
	  curl -X POST http://localhost:8080/api/callback \
	    -H "Content-Type: application/json" \
	    -d '{"session_name":"session_2","callback_url":"https://n8n.example.com/webhook/fonnte-inbox","callback_token":"optional-token"}'
	  ```
	- List or remove callbacks:
	  - `GET /api/callback` → all callbacks (use `?session_name=session_2` for a single session)
	  - `DELETE /api/callback/:session_name` → remove a session-specific callback (falls back to `.env` URL).
	- Media files are saved under `public/uploads/<session>/` and exposed via `HOST/uploads/...` so n8n can download them.

2. **Send replies from n8n**
	- Update the HTTP Request nodes that previously called `https://api.fonnte.com/send/` to hit `http://<gateway-host>:8080/n8n/send`.
	- Use the same `Authorization` header value as `N8N_API_TOKEN` (plain token or `Bearer <token>`).
	- The gateway will use `N8N_SESSION_NAME` (defaults to `SESSION_NAME`) so you don’t need to include the session in each request.
	- Alternatif kompatibel Fonnte: `POST /api/send` dengan header `Authorization: <API_SEND_TOKEN>` dan body form/JSON `target`, `message`, `sessions?`, `type=text`.

3. **Troubleshooting**
	- Ensure `HOST` is reachable from n8n so it can fetch media files.
	- Check the server logs for `[N8N]` entries if a webhook call fails (missing env vars, network errors, etc.).
