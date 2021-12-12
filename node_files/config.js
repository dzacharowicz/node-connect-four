var config = {
	mongoURL: "mongodb://localhost:27017/",
	dbname: "connect-four-db",
	collection: "game",
	wsPort: 7070,
	httpPort: 7000
	wsClientStorageName: "cn4game",
	sendToClient: ["wsPort", "wsClientStorageName"]
};

module.export(config);