import {WSUser} from "./ws.js";
import {config} from "./config.js";

const URI = `ws://${location.hostname}:${config.wsPort}/ws`;
const NAME = config.wsClientStorageName;
const ROOM = window.location.pathname.split("/").pop();
const ws = new WSUser(URI, NAME, ROOM);

const Game = {
	board: Array(7).fill(0).map(x => []),
	me: "watcher",
	player1: "",
	player2: "",
	users: 0,
	roomName: "",
	status: "pending",
	turn: true,
	functionality: false
};

const GameFunctions = {
	chgName: name => ws.send("change_name", {name}),
	chgRoomName: name => Game.me != "watcher" ? ws.send("change_room_name", {name}) : false,
	gameStatus: () => ws.send("get_game_status", {}),
	move: col => Number.isInteger(col) && col <= 6 && col >= 0 ? ws.send("game_move", {col}) : false,
	chat: msg => ws.send("chat_msg", {msg})
};

const Render = {
	invalid: () => false,
	crash: () => false,
	warn: () => false,
	board: () => false,
	playerNames: () => false,
	turn: () => false,
	functionality: () => false,
	userNumber: () => false,
	move: () => false,
	chat: () => false,
	roomName: () => false,
	win: () => false,
	tie: () => false,
	me: () => false,
	gameOn: () => false,
	gameWaiting: () => false,
	forceName: () => false
};

ws.onwserror = err => {
	Game.status = "err";
	console.log(err);
	// gui crash
	if (err.code == WSUser.ROOM_DOES_NOT_EXIST) {
		Render.invalid();
	} else {
		Render.crash(err.code);
	}
	Game.status = "err";
};

ws.onerror = err => {
	console.log(err);
	// warning alert
	Render.warn(err.msg);
};

ws.onstatuschange = status => {
	//if (status == "on") Game.status = "on";
};

ws.on("game_status", obj => {
	const g = obj.result;
	Game.board = g.board;
	Game.player1 = g.users.filter(user => user.position == "player1")[0]?.metadata.name || "";
	Game.player2 = g.users.filter(user => user.position == "player2")[0]?.metadata.name || "";
	Game.status = g.status;
	Game.turn = g.turn;
	Game.users = g.users.length;
	Game.me = g.position;
	Game.functionality = Game.status == "on" && ((Game.me == "player1" && g.turn) || (Game.me == "player2" && !g.turn));
	Game.roomName = g.roomName || "Untitled Room";
	// render game
	Render.board(Game.board);
	Render.playerNames(Game.player1, Game.player2);
	Render.me(Game.me);
	Render.turn(Game.turn);
	Render.userNumber(Game.users);
	Render.roomName(Game.roomName);
	Render.functionality(Game.functionality);
	switch (Game.status) {
		case "pending":
			Render.gameWaiting();
			break;
		case "on":
			Render.gameOn();
			break;
		case "tie":
			Render.tie();
			break;
		default:
			// find wins
			const winningCells = collectWinningCells();
			Render.win(Game.status, winningCells);
	}
	if (!g.users.filter(user => user.me)[0]?.metadata.name) Render.forceName();
});

ws.on("game_move", obj => {
	const m = obj.result;
	const lastTokenColor = m.lastPlayed == "player1";
	Game.board[m.lastMove].push(lastTokenColor)
	Game.turn = (m.status == "on" ? !Game.turn : Game.turn);
	Game.status = m.status;
	let afterMove = false;
	if (m.status == "tie") {
		afterMove = Render.tie;
	} else if (m.status == "player1" || m.status == "player2") {
		// find wins
		const winningCells = collectWinningCells(m.lastMove);
		afterMove = () => Render.win(m.status, winningCells);
	}
	// render move
	Render.move(m.lastMove, lastTokenColor, Game.status == "on" && Game.me != "watcher" && Game.me != m.lastPlayed, afterMove);
});

ws.on("user_enter", obj => {
	Game.users = obj.result.users;
	Render.userNumber(Game.users);
	if (obj.result.position == "player1" || obj.result.position == "player2") {
		Game[obj.result.position] == obj.result.metadata.name;
		Render.playerNames(Game.player1, Game.player2);
	}
	if (obj.result.gameJustStarted) {
		Game.status = "on";
		Game.functionality = Game.me == "player1";
		Render.functionality(Game.functionality);
		Render.gameOn();
	}
});

ws.on("user_left", obj => {
	Game.users--;
	Render.userNumber(Game.users);
});

ws.on("chat_msg", obj => {
	const msg = obj.result;
	if (!msg.allow_link) msg.msg = msg.msg.replaceAll("<", "&lt");
	// render chat
	Render.chat(msg);
});

ws.on("new_room_name", obj => {
	Game.roomName = obj.result.name;
	// render room name
	Render.roomName(Game.roomName);
});

ws.on("player_changed_name", obj => {
	Game[obj.result.position] = obj.result.name;
	Render.playerNames(Game.player1, Game.player2);
});

ws.on("failed_move", obj => {
	Render.warn(obj.result.msg);
});

function collectWinningCells(col=false) {
	if (col === false) {
		for (let i = 0; i < 7; i++) {
			const winningCells = collectWinningCells(i);
			if (winningCells.length > 1) return winningCells;
		}
		return [];
	}
	// find wins
	const row = Game.board[col].length - 1;
	if (row < 0) return [];
	return [[col, row], ...findWinDownward(col), ...findWin(col, row), ...findWin(col, row, 1), ...findWin(col, row, -1)];
}

function findWin(col, row, dir=0) {
	const cells = [];
	const sign = Game.board[col][row];
	let i;
	for (i = 1; col - i >= 0; i++) {
		if (Game.board[col - i][row - (i * dir)] === sign) {
			cells.push([col - i, row - (i * dir)]);
		} else {
			break;
		}
	}
	for (i = 1; col + i < 7; i++) {
		if (Game.board[col + i][row + (i * dir)] === sign) {
			cells.push([col + i, row + (i * dir)]);
		} else {
			break;
		}
	}
	return (cells.length >= 3 ? cells : []);
}

function findWinDownward(col) {
	const l = Game.board[col].length;
	if (l < 4) return [];
	const sign = Game.board[col][l - 1];
	const res = [];
	for (let i = l - 4; i < l; i++) {
		if (Game.board[col][i] !== sign) return [];
		res.push([col, i]);
	}
	return res;
}

ws.connect();
export {GameFunctions, Render};