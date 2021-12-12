
class WSUser {
	#ws;
	#name;
	#user;
	#room;
	#uri;
	#status;
	#functions = {};
	#onerror;
	#onstatuschange;
	#onwserror;
	
	static ERR_INVALID_MESSAGE = 0;
	static ERR_INVALID_ROOM = 1;
	static ERR_INVALID_USER = 2;
	static ERR_INVALID_ACTION = 3;
	static ERR_CONNECTION_REGISTERED = 4;
	static ERR_CONNECTION_NOT_REGISTERED = 5;
	static ERR_CONNECTION_CLOSES = 6;
	static ERR_NO_JSON = 7;
	static ERR_INPUT_NO_JSON = 8;
	static ERR_INPUT_INVALID_ACTION = 9;
	static ERR_INPUT_NO_ACTION = 10;
	static ERR_NO_USER_ID = 11;
	
	// ws closing errors
	static ERR_WS_ERROR = 0;
	static ERR_CONNECTION_FUNCTION = 1;
	static ERR_CONNECTION_FAILED = 2;
	static ERR_ROOM_DOES_NOT_EXIST = 3;
	static ERR_CONNECTION_CLOSED = 4;
	
	constructor(uri, name, room) {
		this.#name = `WSUserID@${name}-WSRooms`;
		this.#room = room;
		this.#uri = uri;
		this.#status = "init";
	}
	
	connect() {
		try{
			const ws = new WebSocket(this.#uri);
			const timer = setInterval(() => {
				if (ws.readyState === 1) {
					clearInterval(timer);
					this.#ws = ws;
					this.#status = "handshakes";
					this.onstatuschange(this.#status);
					ws.onmessage = msg => {
						this.#message(msg.data);
					}
					ws.onerror = e => this.#error(WSUser.ERR_WS_ERROR, e);
					ws.onclose = e => this.#error(WSUser.ERR_CONNECTION_CLOSED, e);
					this.#register();
				} else if (ws.readyState > 1) {
					clearInterval(timer);
					this.#error(WSUser.ERR_CONNECTION_FAILED, ws);
				}
			}, 10);
		} catch(e) {
			this.#error(WSUser.ERR_CONNECTION_FUNCTION, e);
		}
	}
	
	#register() {
		const data = {room: this.#room};
		const userID = localStorage.getItem(this.#name);
		if (userID) {
			data.user = userID;
		}
		data.new_user = true;
		this.send("register", data);
		this.#status = "on";
		this.onstatuschange(this.#status);
	}
	
	#error(code, data) {
		// websocket error
		console.log("err", code, data);
		this.#status = "err";
		if (this.#ws) this.#ws.close();
		this.onstatuschange(status);
		this.onwserror({
			error: true,
			code,
			data
		});
	}
	
	#message(msg) {
		let obj;
		try {
			obj = JSON.parse(msg);
		} catch(e) {
			return this.onerror({
				err: true,
				code: WSUser.ERR_INPUT_NO_JSON,
				msg: "Input socket is non JSON",
				data: {msg, e}
			});
		}
		if (obj.err === true) {
			if (obj.code === WSUser.ERR_INVALID_ROOM) {
				this.#error(WSUser.ERR_ROOM_DOES_NOT_EXIST, obj);
			} else if (obj.code === WSUser.ERR_INVALID_USER) {
				localStorage.removeItem(this.#name);
				this.#register();
			} else {
				this.onerror(obj);
			}
		} else if (!obj.act) {
			this.onerror({
				err: true,
				code: WSUser.ERR_INPUT_NO_ACTION,
				msg: "Action is missing in input socket",
				data: obj
			});
		} else if (obj.act == "new_user") {
			const user = obj.result?.id;
			if (!user) {
				this.onerror({
					err: true,
					code: WSUser.ERR_NO_USER_ID,
					msg: "No user id in input",
					data: obj
				});
			} else {
				localStorage.setItem(this.#name, user);
				this.#status = "on";
				this.onstatuschange(this.#status);
			}
		} else if (!(obj.act in this.#functions)) {
			this.onerror({
				err: true,
				code: WSUser.ERR_INPUT_INVALID_ACTION,
				msg: "No function was defined for the input action",
				data: obj
			});
		} else {
			this.#functions[obj.act](obj);
		}
	}
	
	on(act, func) {
		if (act == "new_user") throw new Error("Function name 'new_user' is reserved");
		if (typeof(act) != "string" || act == "") throw new Error("Function must have a name");
		if (typeof(func) != "function" || func.length > 1) throw new Error("Second argument must be a function which accepts mostly one argument");
		this.#functions[act] = func;
	}
	
	send(act, data) {
		if (this.#status != "on" && act != "register") return false;
		this.#ws.send(JSON.stringify({act, data}));
		return true;
	}
	
	get name() {
		return this.#name;
	}
	
	get user() {
		return this.#user;
	}
	
	get room() {
		return this.#room;
	}
	
	get status() {
		return this.#status;
	}
	
	get onerror() {
		if (!this.#onerror) return e => console.log(e);
		return this.#onerror;
	}
	
	set onerror(func) {
		if (typeof(func) == "function" && func.length <= 1) this.#onerror = func;
	}
	
	get onwserror() {
		if (!this.#onwserror) return e => console.log(e);
		return this.#onwserror;
	}
	
	set onwserror(func) {
		if (typeof(func) == "function" && func.length <= 1) this.#onwserror = func;
	}
	
	get onstatuschange() {
		if (!this.#onstatuschange) return () => undefined;
		return this.#onstatuschange;
	}
	
	set onstatuschange(func) {
		if (typeof(func) == "function" && func.length <= 1) this.#onstatuschange = func;
	}
}

export {WSUser};