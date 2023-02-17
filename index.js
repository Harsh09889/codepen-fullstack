import express from "express";
import cors from "cors";
import { PORT } from "./config/constants.js";
import { connectDb } from "./database/db/index.js";
import authRouter from "./routes/authRouter.js";
import codeRouter from "./routes/codeRouter.js";
import http from "http";
import { Server } from "socket.io";
import path from "path";
const __dirname = path.resolve();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "https://cloneofcodepen.netlify.app/",
		allowedHeaders: ["my-custom-header"],
		credentials: true,
	},
});

app.use(express.json());
app.use(cors({ credentials: true, origin: true }));

app.use("/api/auth", authRouter);
app.use("/api/code", codeRouter);

app.use(express.static("build"));
app.use((req, res, next) => {
	res.sendFile(path.join(__dirname, "build", "index.html"));
});

const userSocketMap = {};

function getAllConnectedClients(roomId) {
	return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
		(socketId) => {
			return {
				socketId,
				username: userSocketMap[socketId],
			};
		}
	);
}

io.on("connection", (socket) => {
	console.log("Socket Connected", socket.id);

	socket.on("join", ({ roomId, username }) => {
		userSocketMap[socket.id] = username;
		socket.join(roomId);
		const clients = getAllConnectedClients(roomId);
		clients.forEach(({ socketId }) => {
			io.to(socketId).emit("joined", {
				clients,
				username,
				socketId: socket.id,
			});
		});
	});

	socket.on("code_change", ({ roomId, code }) => {
		socket.in(roomId).emit("code_change", { code });
	});

	socket.on("disconnecting", () => {
		const rooms = [...socket.rooms];
		rooms.forEach((roomId) => {
			socket.in(roomId).emit("disconnected", {
				socketId: socket.id,
				username: userSocketMap[socket.id],
			});
		});

		delete userSocketMap[socket.id];
		socket.leave();
	});
});

server.listen(PORT, () => {
	console.log("App is listening at", PORT);
});

connectDb();
