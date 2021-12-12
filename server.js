const express = require("express");
const {v4: uuidv4} = require("uuid");
const CN4game = require("./node_files/game.js");
const WSRooms = require("./node_files/websocket.js");
const config = require("./node_files/config.js");

/*
	Communication with server:
	1:	http	register
	2:	ws		start chat
	3:	ws		stop chat
	4:	ws		send message
	5:	ws		get message
	6:	ws		offer game
	7:	ws		accept game
	8:	ws		terminate game
	9:	ws		send in-game message
	10:	ws		get in-game message
	11:	ws		make game move
	12:	ws		get game change
	13:	ws		get game status
*/

const app = express();

const mongoUrl = config.mongoURL;
const dbname = config.dbname;
const collection = config.collection;
const wsPort = config.wsPort;

const game = new CN4game(mongoUrl, dbname, collection);
const wss = new WSRooms(wsPort);

// websocket functions

wss.on("register", async obj => {
	const token = obj.room.id;
	const user = obj.user.id;
	const getGameStatus = await game.getGame(token);
	if (!getGameStatus.success) return obj.answer("game_status", {msg: gameStatus.msg}, false);
	const gameStatus = getGameStatus.result;
	const users = wss.getUsersByRoom(token);
	let gameJustStarted = false;
	if (user == gameStatus.player1) {
		gameStatus.position = "player1";
	} else if (user == gameStatus.player2) {
		gameStatus.position = "player2";
	} else if (gameStatus.status == "pending") {
		const playerAdded = await game.addPlayer(token, user);
		if (playerAdded.success) {
			gameStatus.player1 = playerAdded.result.player1;
			gameStatus.player2 = playerAdded.result.player2;
			if (gameStatus.status != playerAdded.result.status) {
				gameStatus.status = playerAdded.result.status;
				gameJustStarted = true;
			}
			gameStatus.position = "player" + (gameStatus.player1 == user ? "1" : "2");
		}
	} else {
		gameStatus.position = "watcher";
	}
	gameStatus.users = users.map(u => Object({
		position: (u.id == gameStatus.player1 ? "player1" : (u.id == gameStatus.player2 ? "player2" : "watcher")),
		metadata: u.metadata,
		me: u.id == user
	}));
	gameStatus.player1 = Boolean(gameStatus.player1);
	gameStatus.player2 = Boolean(gameStatus.player2);
	gameStatus.roomName = obj.room.metadata.name;
	delete(gameStatus._id);
	obj.answer("game_status", gameStatus);
	wss.bcRoom(token, "user_enter", {
		position: gameStatus.position,
		metadata: obj.user.metadata,
		users: obj.room.connections,
		gameJustStarted
	});
});

wss.on("close", async obj => {
	const token = obj.room.id;
	const user = obj.user.id;
	const getGameStatus = await game.getGame(token);
	if (!getGameStatus.success) return;
	let position;
	if (user == getGameStatus.result.player1) {
		position = "player1";
	} else if (user == getGameStatus.result.player2) {
		position = "player2";
	} else {
		position = "watcher";
	}
	wss.bcRoom(token, "user_left", {
		position,
		metadata: obj.user.metadata
	});
});

wss.on("change_name", async obj => {
	if (obj.data.name) obj.user.metadata.name = obj.data.name;
	const rooms = wss.getRoomsByUser(obj.user.id).map(room => room.id);
	rooms.forEach(async room => {
		const g = await game.getGame(room);
		if (!g.success || (obj.user.id != g.result.player1 && obj.user.id != g.result.player2)) return;
		wss.bcRoom(g.result.token, "player_changed_name", {
			position: "player" + (g.result.player1 == obj.user.id ? "1" : "2"),
			name: obj.data.name
		});
	});
});

wss.on("change_room_name", async obj => {
	if (!obj.data.name) return;
	const token = obj.room.id;
	const gameStatus = await game.getGame(token);
	if (!gameStatus.success) return;
	if (gameStatus.result.player1 != obj.user.id && gameStatus.result.player2 != obj.user.id) return;
	obj.room.metadata.name = obj.data.name;
	wss.bcRoom(token, "new_room_name", {name: obj.data.name});
});

wss.on("get_game_status", async obj => {
	const token = obj.room.id;
	const user = obj.user.id;
	const getGameStatus = await game.getGame(token);
	if (!getGameStatus.success) return obj.answer("game_status", {msg: gameStatus.msg}, false);
	const gameStatus = getGameStatus.result;
	const users = wss.getUsersByRoom(token);
	if (user == gameStatus.player1) {
		gameStatus.position = "player1";
	} else if (user == gameStatus.player2) {
		gameStatus.position = "player2";
	} else {
		gameStatus.position = "watcher";
	}
	gameStatus.users = users.map(u => Object({
		position: (u.id == gameStatus.player1 ? "player1" : (u.id == gameStatus.player2 ? "player2" : "watcher")),
		metadata: u.metadata
	}));
	gameStatus.player1 = Boolean(gameStatus.player1);
	gameStatus.player2 = Boolean(gameStatus.player2);
	gameStatus.roomName = obj.room.metadata.name;
	delete(gameStatus._id);
	obj.answer("game_status", gameStatus);
});

wss.on("game_move", async obj => {
	if (obj.data.col === undefined) return obj.answer("failed_move", {msg: "No column number"}, false);
	const token = obj.room.id;
	const user = obj.user.id;
	const col = obj.data.col;
	const res = await game.move(token, user, col);
	if (!res.success) return obj.answer("failed_move", {msg: res.msg}, false);
	wss.bcRoom(token, "game_move", res.result);
});

wss.on("chat_msg", obj => {
	if (!obj.data.msg || typeof(obj.data.msg) != "string") return;
	const room = obj.room.id;
	wss.bcRoom(room, "chat_msg", {
		username: obj.user.metadata.name || "Anonymous User",
		msg: obj.data.msg
	});
});

// restore db

game.sweepOldGames()
	.then(res => console.log(res))
	.then(() => game.getAllGames())
	.then(tokens => tokens.forEach((token, i) => console.log(wss.newRoom(token, {name: `New Room ${i}`}))));

// http functions

app.use(express.static("public"));
app.use(express.json());

app.post("/api/new_game", async (req, res) => {
	let player = req.body.player || "";
	const newGame = await game.newGame(player);
	const gameToken = newGame.token;
	const host = req.get("host");
	wss.newRoom(gameToken, {name: "New Room"});
	res.json({gameToken, url: `${host}/game/${gameToken}`, registeredUser: player});
});

app.post("/api/new_player", (req, res) => {
	let name = req.body.name;
	if (!name) return res.json({success: false});
	res.json(wss.newUser(true, {name}));
});

app.post("/api/user_exist", (req, res) => {
	let id = req.body.id;
	if (!id) return res.json({exist: false});
	res.json(wss.getUser(id));
});

app.post("/api/copy_game", async (req, res) => {
	const token = req.body.token;
	if (!token) return res.json({success: false, msg: "No token was given"});
	const currentGame = await game.getGame(token);
	if (!currentGame.success) return res.json({success: false, msg: "Invalid token"});
	const player1 = currentGame.result.player1;
	const player2 = currentGame.result.player2;
	const newGame = await game.newGame(player1, player2);
	const gameToken = newGame.token;
	const host = req.get("host");
	wss.newRoom(gameToken, {name: "New Room"});
	wss.bcRoom(token, "chat_msg", {
		username: "Game Admin",
		msg: `<a href="${gameToken}">New Game</a>`,
		allow_link: true
	});
	res.json({gameToken, url: `${host}/game/${gameToken}`});
});

app.get("/game/:gameId", (req, res) => {
	res.sendFile(__dirname + "/dynamic/game.html");
});

app.get("/js/config.js", (req, res) => {
	const configObj = {};
	for (prop of config.sendToClient) {
		configObj[prop] = config[prop];
	}
	const configTxt = JSON.stringify(configObj);
	const javascript = `
		const config = ${configTxt};
		export {config};
	`;
	res.type(".js");
	res.send(javascript);
});

app.listen(config.httpPort);
