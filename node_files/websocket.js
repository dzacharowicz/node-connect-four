const WebSocket = require("ws");
const EventEmitter = require("events");
const {v4: uuidv4} = require("uuid");

class WSRooms extends EventEmitter {
	#wss;
	#rooms = {};
	#users = {};
	#connections = new Map();
	
	#restrictToAllowedFunctions = false;
	#allowedFunctions;
	
	static ERR_INVALID_MESSAGE = 0;
	static ERR_INVALID_ROOM = 1;
	static ERR_INVALID_USER = 2;
	static ERR_INVALID_ACTION = 3;
	static ERR_CONNECTION_REGISTERED = 4;
	static ERR_CONNECTION_NOT_REGISTERED = 5;
	static ERR_CONNECTION_CLOSES = 6;
	static ERR_NO_JSON = 7;
	static ERRMSG = [
		"Invalid message",
		"Invalid room",
		"Invalid user",
		"Invalid action",
		"Connection is already registered",
		"Connection is not registered",
		"Connection closes by server",
		"Message is not JSON"
	];
	
	constructor(port, restrictToAllowedFunctions=false, functionNames=false) {
		super();
		if (restrictToAllowedFunctions) {
			const allowedFunctions = ["register", "close"];
			if (Array.isArray(functionNames)) {
				allowedFunctions.push(...functionNames);
			} else if (typeof(functionNames) == "string") {
				allowedFunctions.push(functionNames);
			}
			this.#restrictToAllowedFunctions = true;
			this.#allowedFunctions = new Set(allowedFunctions);
		}
		this.#wss = new WebSocket.Server({port});
		this.#wss.on("connection", ws => {
			ws.on("message", msg => {
				let obj;
				try {
					obj = JSON.parse(msg);
				} catch(e) {
					console.log(e);
					return this.err(ws, WSRooms.ERR_NO_JSON, msg);
				}
				if (!obj.act || !obj.data) return this.err(ws, WSRooms.ERR_INVALID_MESSAGE, obj);
				let newUser = false;
				if (obj.act == "register") {
					if (this.#connections.has(ws)) return this.err(ws, WSRooms.ERR_CONNECTION_REGISTERED, {});
					if (!obj.data.room || !(obj.data.room in this.#rooms)) return this.err(ws, WSRooms.ERR_INVALID_ROOM, obj.data);
					if (obj.data.new_user !== true && (!obj.data.user || !(obj.data.user in this.#users))) {
						return this.err(ws, WSRooms.ERR_INVALID_USER, obj.data);
					} else if (!obj.data.user) {
						const newUserId = uuidv4();
						this.newUser(newUserId, obj.data.metadata || {});
						obj.data.user = newUserId;
						newUser = true;
					} else if (!(obj.data.user in this.#users)) {
						this.newUser(obj.data.user, obj.data.metadata || {});
					}
					const user = this.#users[obj.data.user];
					const room = this.#rooms[obj.data.room];
					this.#connections.set(ws, {
						user: obj.data.user,
						room: obj.data.room
					});
					if (!user.connections.includes(ws)) user.connections.push(ws);
					if (!room.connections.includes(ws)) room.connections.push(ws);
				} else if (!this.#connections.has(ws)) {
					return this.err(ws, WSRooms.ERR_CONNECTION_NOT_REGISTERED, {});
				}
				if (this.#restrictToAllowedFunctions && !this.#allowedFunctions.has(obj.act)) return this.err(ws, WSRooms.ERR_INVALID_ACTION, {act: obj.act});
				if (newUser) ws.send(this.resObj("new_user", {id: obj.data.user}));
				this.emit(obj.act, {
					act: obj.act,
					data: obj.data,
					user: {
						id: this.#connections.get(ws).user,
						metadata: this.#users[this.#connections.get(ws).user].metadata,
						connections: this.#users[this.#connections.get(ws).user].connections.length
					},
					room: {
						id: this.#connections.get(ws).room,
						metadata: this.#rooms[this.#connections.get(ws).room].metadata,
						connections: this.#rooms[this.#connections.get(ws).room].connections.length
					},
					answer: (act, result, success=true) => ws.send(this.resObj(act, result, success))
				});
			});
			ws.on("close", () => {
				if (!this.#connections.has(ws)) return;
				const connectionData = this.#connections.get(ws);
				const user = this.#users[connectionData.user];
				const room = this.#rooms[connectionData.room];
				user.connections = user.connections.filter(w => w != ws);
				room.connections = room.connections.filter(w => w != ws);
				this.#connections.delete(ws);
				this.emit("close", {
					act: "close",
					data: {},
					user: {
						id: connectionData.user,
						metadata: user.metadata,
						connections: user.connections.length
					},
					room: {
						id: connectionData.room,
						metadata: room.metadata,
						connections: user.connections.length
					}
				});
			});
		});
	}
	
	newUser(name, metadata={}) {
		if (name === true) name = uuidv4();
		if (name in this.#users) return false;
		this.#users[name] = {
			metadata,
			connections: []
		};
		return {
			id: name,
			metadata,
			connections: 0
		}
	}
	
	newRoom(name, metadata={}) {
		if (name in this.#rooms) return false;
		this.#rooms[name] = {
			metadata,
			connections: []
		};
		return {
			id: name,
			metadata,
			connections: 0
		}
	}
	
	getUser(name) {
		if (!(name in this.#users)) return {
			exist: false
		};
		return {
			exist: true,
			metadata: this.#users[name].metadata
		};
	}
	
	bcUser(user, act, result, success=true) {
		if (!this.#users[user]) return false;
		this.#users[user].connections.forEach(ws => ws.send(this.resObj(act, result, success)));
		return true;
	}
	
	bcRoom(room, act, result, success=true) {
		if (!this.#rooms[room]) return false;
		this.#rooms[room].connections.forEach(ws => ws.send(this.resObj(act, result, success)));
		return true;
	}
	
	bcUserRoom(user, room, act, result, success=true) {
		if (!this.#users[user] || !this.#rooms[room]) return false;
		this.#users[user].connections.filter(conn => this.#rooms[room].connections.includes(conn)).forEach(ws => ws.send(this.resObj(act, result, success)));
		return true;
	}
	
	getUsersByRoom(room) {
		const all_users = this.#rooms[room]?.connections.map(ws => this.#connections.get(ws).user) ?? false;
		if (!all_users) return false;
		const users = all_users.filter((user, i) => all_users.indexOf(user, i + 1) == -1);
		return users.map(user => Object({
			id: user,
			metadata: this.#users[user].metadata,
			connections: this.#users[user].connections.length
		}));
	}
	
	getRoomsByUser(user) {
		const all_rooms = this.#users[user]?.connections.map(ws => this.#connections.get(ws).room) ?? false;
		if (!all_rooms) return false;
		const rooms = all_rooms.filter((room, i) => all_rooms.indexOf(room, i + 1) == -1);
		return rooms.map(room => Object({
			id: room,
			metadata: this.#rooms[room].metadata,
			connections: this.#rooms[room].connections.length
		}));
	}
	
	deleteUser(user) {
		if (!this.#users[user]) return true;
		this.#users[user].connections.forEach(ws => {
			const room_connections = this.#rooms[this.#connections.get(ws).room].connections;
			const i = room_connections.indexOf(ws);
			if (i != -1) room_connections.splice(i, 1);
			this.#connections.delete(ws);
			this.err(ws, WSRooms.ERR_CONNECTION_CLOSES, {close_notice: true});
			ws.close();
		});
		delete(this.#users[user]);
		return true;
	}
	
	deleteRoom(room) {
		if (!this.#rooms[room]) return true;
		this.#rooms[room].connections.forEach(ws => {
			const user_connections = this.#users[this.#connections.get(ws).user].connections;
			const i = user_connections.indexOf(ws);
			if (i != -1) user_connections.splice(i, 1);
			this.#connections.delete(ws);
			this.err(ws, WSRooms.ERR_CONNECTION_CLOSES, {close_notice: true});
			ws.close();
		});
		delete(this.#rooms[room]);
		return true;
	}
	
	cleanUsers(filter_function_by_metadata=false) {
		var count = 0;
		for (let user in this.#users) {
			if (this.#users[user].connections.length == 0) {
				if (typeof(filter_function_by_metadata) != "function" || filter_function_by_metadata(this.#users[user].metadata)) {
					delete(this.#users[user]);
					count++;
				}
			}
		}
		return count;
	}
	
	cleanRooms() {
		var count = 0;
		for (let room in this.#rooms) {
			if (this.#rooms[room].connections.length == 0) {
				if (typeof(filter_function_by_metadata) != "function" || filter_function_by_metadata(this.#rooms[room].metadata)) {
					delete(this.#rooms[room]);
					count++;
				}
			}
		}
		return count;
	}
	
	resObj(act, result, success=true) {
		return JSON.stringify({
			act,
			success,
			result
		});
	}
	
	err(ws, code, data) {
		ws.send(JSON.stringify({
			err: true,
			code,
			msg: WSRooms.ERRMSG[code],
			data
		}));
	}
}

module.exports = WSRooms;