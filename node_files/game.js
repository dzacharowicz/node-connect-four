const MongoClient = require("mongodb").MongoClient;
const EventEmitter = require("events");
const {v4: uuidv4} = require("uuid");

class CN4game extends EventEmitter {
	#url;
	#dbname;
	#clct;
	
	constructor(url, dbname, collection) {
		super();
		this.#url = url;
		this.#dbname = dbname;
		this.#clct = collection;
	}
	
	async newGame(player1="", player2="") {
		const {db, db_close} = await this.#db();
		const game = {
			token: uuidv4(),
			player1,
			player2,
			status: (player1 && player2 ? "on" : "pending"),
			turn: true,
			board: Array(7).fill(0).map(x => []),
			last_change: new Date()
		}
		await db.insertOne(game);
		db_close();
		return this.res(game.token, "new", game);
	}
	
	async getGame(token) {
		const {db, db_close} = await this.#db();
		const game = await db.findOne({token}, {_id: 0});
		if (!game) {
			db_close();
			return this.err(token, "getGame", "Invalid token");
		}
		return this.res(token, "getGame", game);
	}
	
	async getAllGames() {
		const {db, db_close} = await this.#db();
		const games = await db.find({}, {_id: 0, token: 1}).toArray();
		return games.map(game => game.token);
	}
	
	async addPlayer(token, player, player2="") {
		if (!player) {
			return this.err(token, "addPlayer", "No player was given");
		}
		const {db, db_close} = await this.#db();
		const game = await db.findOne({token}, {player1: 1, player2: 1, status: 1});
		if (!game) {
			db_close();
			return this.err(token, "addPlayer", "Invalid token");
		} else if (game.status != "pending") {
			db_close();
			return this.err(token, "addPlayer", "Players were already selected");
		}
		const set = {last_change: new Date()};
		if (!game.player1) {
			set.player1 = player;
			if (player2) {
				set.player2 = player2;
				set.status = "on";
			}
		} else {
			set.player2 = player;
			set.status = "on";
		}
		set.last_change = new Date();
		await db.updateOne({token}, {$set: set});
		db_close();
		return this.res(token, "addPlayer", {
			player1: set.player1 || game.player1,
			player2: set.player2 || "",
			status: set.status || "pending"
		});
	}
	
	async move(token, player, col) {
		const {db, db_close} = await this.#db();
		const game = await db.findOne({token});
		if (!game) {
			db_close();
			return this.err(token, "move", "Invalid token");
		} else if (game.status != "on") {
			db_close();
			return this.err(token, "move", "Game is not active");
		} else if (player != (game.turn ? game.player1 : game.player2)) {
			db_close();
			return this.err(token, "move", "Not player's turn");
		} else if (col >= 7 || col < 0) {
			db_close();
			return this.err(token, "move", "Column index out of range");
		} else if (game.board[col].length == 6) {
			db_close();
			return this.err(token, "move", "Chosen column is full");
		}
		game.board[col].push(game.turn);
		const played = "player" + (game.turn ? "1" : "2");
		const psh = {};
		psh["board." + col] = game.turn;
		const res = {
			lastMove: col,
			lastPlayed: played,
			status: game.status,
			board: game.board
		};
		const set = {last_change: new Date()}
		if (this.checkWin(game.board, col, game.turn)) {
			// game won
			set.status = res.status = played;
		} else if (this.checkTie(game.board)) {
			// tie
			set.status = res.status = "tie";
		} else {
			// game keeps on
			set.turn = !game.turn;
		}
		await db.updateOne({token}, {
			$set: set,
			$push: psh
		});
		db_close();
		return this.res(token, "move", res);
	}
	
	checkWin(board, col, turn) {
		const b = (turn ? "1" : "0").repeat(4);
		const o = turn ? "0" : "1";
		const pos = board[col].length - 1;
		const pivot = (column, new_pos) => column.length <= new_pos || new_pos < 0 ? o : (column[new_pos] + 0);
		// vertical
		if (board[col].map(bool => bool ? 1 : 0).join("").search(b) != -1) return true;
		// horizontal
		if (board.map(column => pivot(column, pos)).join("").search(b) != -1) return true;
		// downward
		if (board.map((column, i) => pivot(column, pos + col - i)).join("").search(b) != -1) return true;
		// upward
		if (board.map((column, i) => pivot(column, pos - col + i)).join("").search(b) != -1) return true;
		// no win
		return false;
	}
	
	checkTie(board) {
		return board.map(column => column.length == 6).indexOf(false) == -1;
	}
	
	async deleteGame(token) {
		const {db, db_close} = this.#db();
		const deleted = await db.deleteOne({token});
		db_close();
		if (deleted.deletedCount < 1) {
			return this.err(token, "deleteGame", "Could not delete");
		} else {
			return this.res(token, "deleteGame", {token});
		}
	}
	
	async sweepOldGames(minutes=180, warning=15) {
		const {db, db_close} = await this.#db();
		const now = new Date();
		const games_to_delete = await db.find({last_change: {$lt: new Date(now - (minutes * 60000))}}).toArray();
		const games_to_warn = await db.find({last_change: {$gte: new Date(now - (minutes * 60000)), $lt: now - ((minutes - warning) * 60000)}}).toArray();
		await db.deleteMany({last_change: {$lt: new Date(now - (minutes * 60000))}});
		return this.res("", "sweepOldGames", {
			deleted: games_to_delete.map(game => game.token),
			warning: games_to_warn.map(game => game.token)
		});
	}
	
	async #db() {
		const db = await MongoClient.connect(this.#url).catch(err => console.log(err));
		const dbo = await db.db(this.#dbname);
		return {db: dbo.collection(this.#clct), db_close: () => db.close()};
	}
	
	err(token, act, msg) {
		const r = {
			act,
			success: false,
			token,
			msg
		};
		this.emit(act, r);
		return r;
	}
	
	res(token, act, result) {
		const r = {
			act,
			success: true,
			token,
			result
		};
		this.emit(act, r);
		return r;
	}
}

module.exports = CN4game;