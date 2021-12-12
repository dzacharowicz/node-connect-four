import {GameFunctions, Render} from "./game.js";
import * as boardFunctions from "./SVGBoard.js";

var waiting = true;

const obj = {
	msg: "",
	player1: "=NO PLAYER=",
	player2: "=NO PLAYER=",
	turn: "=NO PLAYER=",
	functionality: false,
	board: [[],[],[],[],[],[],[]],
	users: 0,
	chat: [],
	room: "",
	winCells: []
}

// render functions

Render.invalid = function() {
	txt("h1", "Invalid Room");
	stat("Invalid Room");
};
Render.crash = function(code) {
	stat("Error");
	addError(`Error Code ${code}`);
	boardFunctions.setFunctionality(false);
	goToHomepage();
};
Render.warn = function(msg){
	addWarning("Warning", msg);
};
Render.board = function(givenBoard){
	boardFunctions.setBoard(givenBoard);
};
Render.playerNames = function(p1, p2){
	txt("#player1Cont .playerName", p1);
	txt("#player2Cont .playerName", p2);
};
Render.turn = function(bool){
	if (!waiting) {
		const n = bool + 1;
		const p = document.querySelector(`#player${n}Cont .playerName`).innerHTML;
		stat(`Next Move: ${p} (player ${n})`);
	}
};
Render.functionality = function(bool){
	boardFunctions.setFunctionality(bool);
};
Render.userNumber = function(num){
	txt("#usersCount", `${num} users`);
};
Render.move = function(col, color, functionality, afterMove=false){
	boardFunctions.move(col, color, functionality, afterMove);
};
Render.chat = function({username, msg}){
	addMessage(username, msg);
};
Render.roomName = function(name){
	txt("h1", name);
};
Render.win = function(winner, cells){
	const p = document.querySelector(`#${winner}Cont .playerName`).innerHTML;
	stat(`${p} (${winner}) Wins!!!`);
	boardFunctions.setGlowingTokens(cells);
	newGameButton();
};
Render.tie = function(){
	stat("The board is full, it's a tie");
	newGameButton();
};
Render.me = function(me){
	document.querySelector("#changeRoom").disabled = me == "watcher";
	boardFunctions.setColor(me != "player2");
};
Render.gameOn = function(){
	stat("Game Starts");
	waiting = false;
};
Render.gameWaiting = function(){
	stat("Waiting for players to join...");
	waiting = true;
};
Render.forceName = function() {
	addChange("Select Name", "", name => GameFunctions.chgName(name), true);
};

// set graphics

boardFunctions.putTokenInSVG(document.querySelector("#player1svgToken"), true);
boardFunctions.putTokenInSVG(document.querySelector("#player2svgToken"), false);

// ui functions

function sendChatMessage() {
	const inp = document.querySelector("#messageInput");
	const txt = inp.value.trim();
	inp.value = "";
	if (txt) GameFunctions.chat(txt);
}

document.querySelector("#messageInput").onkeyup = function(e) {
	if (e.keyCode === 13) sendChatMessage();
};

document.querySelector("#sendMessage").onclick = sendChatMessage;

document.querySelector("#changeName").onclick = function() {
	addChange("Change Name", "", name => GameFunctions.chgName(name));
};

document.querySelector("#changeRoom").onclick = function() {
	addChange("Change Room's Name", document.querySelector("h1").innerHTML, name => GameFunctions.chgRoomName(name));
};

boardFunctions.setCallFunction(GameFunctions.move);

boardFunctions.init(document.querySelector("svg#board"), document.querySelector("canvas"));

// text functions
	const txt = (selector, val) => document.querySelector(selector).innerHTML = val;
	const estxt = selector => (val => txt(selector, val));
	const stat = estxt("#statusTitle");

// api

			async function api(func, obj) {
				if (!["new_game", "new_player", "user_exist", "copy_game"].includes(func)) {
					throw new Error(`Unsupported function "${func}"`);
					return;
				}
				const url = `../api/${func}`;
				const response = await fetch(url, {
					method: "POST",
					cache: "no-cache",
					headers: {
						"Content-Type": "application/json"
					},
					body: JSON.stringify(obj)
				});
				try {
					const data = await response.json();
					return data;
				} catch(e) {
					const data = await response.body();
					return {
						err: true,
						e,
						data
					};
				}
			}

// buttons

function newGameButton() {
	addButton("Play Again", e => {
		const button = e.target.closest(".tempButton");
		button.innerHTML = "Loading...";
		button.onclick = undefined;
		button.disabled = true;
		api("copy_game", {
			token: window.location.pathname.split("/").pop()
		});
	});
}
	
// additional functions

			function placeTemplate(templateSelector, parentSelector, changesObject) {
				const div = document.querySelector(templateSelector).content.cloneNode(true);
				for (let selector in changesObject) {
					for (let attribute in changesObject[selector]) {
						div.querySelector(selector)[attribute] = changesObject[selector][attribute];
					}
				}
				document.querySelector(parentSelector).appendChild(div);
				return div;
			}
			
			function addMessage(sender, content) {
				placeTemplate("#msgTemplate", "#messageCont", {
					".messageSender": {innerHTML: sender},
					".messageContent": {innerHTML: content}
				});
			}
			
			function addWarning(title, content) {
				placeTemplate("#warningTemplate", "body", {
					".warningTitle": {innerHTML: title},
					".warningContent": {innerHTML: content},
					".close": {onclick: e => e.target.closest(".warning").remove()}
				});
			}
			
			function addError(errTxt) {
				document.querySelector("svg#board").style.display = "none";
				placeTemplate("#errorTemplate", "#svgCont", {
					".error": {innerHTML: errTxt}
				});
			}
			
			function addChange(title, val, func, force=false) {
				const closeAttributes = force ? {disabled: "true"} : {onclick: e => e.target.closest(".changeText").remove()};
				placeTemplate("#changeTemplate", "body", {
					".changeTitle": {innerHTML: title},
					".changeInput": {value: val},
					".sendChange": {onclick: e => {
						func(e.target.closest(".changeText").querySelector(".changeInput").value);
						e.target.closest(".changeText").remove();
					}},
					".close": closeAttributes
				});
			}
			
			function addButton(txt, func) {
				placeTemplate("#buttonTemplate", "#statusTitle", {
					".tempButton": {
						innerHTML: txt,
						onclick: func
					}
				});
			}