			import {config} from "./config.js";

			const name = "WSUserID@${config.wsClientStorageName}-WSRooms"
			const newButton = document.querySelector("#new");
			const status = document.querySelector("h2");
			const nameDiv = document.querySelector("#name");
			const nameInput = document.querySelector("#nameInput");
			const nameSave = document.querySelector("#nameSave");
			const details = document.querySelector("#details");
			const urlTxt = document.querySelector("#url");
			const copyButton = document.querySelector("#copy");
			const gotoButton = document.querySelector("#goto");
			
			newButton.onclick = async function() {
				showStatus("Loading...");
				newButton.disabled = true;
				let player = await checkUser();
				if (!player) {
					nameSave.onclick = async function() {
						const newName = nameInput.value.trim();
						if (!newName) return showStatus("Enter Name");
						showStatus("Loading...");
						nameSave.disabled = true;
						const playerRes = await api("new_player", {name: newName});
						if (!playerRes.id) {
							console.log("Error on api call", e);
							showStatus("Error");
							return false;
						}
						localStorage.setItem(name, playerRes.id);
						const url = await newGame(playerRes.id);
						if (url) {
							hideStatus();
							showURL(url);
						}
					}
					hideStatus();
					nameDiv.style.display = "grid";
				} else {
					const url = await newGame(player);
					if (url) {
						hideStatus();
						showURL(url);
					}
				}
			};
			
			async function checkUser() {
				const player = localStorage.getItem(name) || "";
				if (!player) return false;
				const res = await api("user_exist", {id: player});
				if (!res.exist) return false;
				return player;
			}
			
			async function newGame(player) {
				const res = await api("new_game", {player});
				if (res.err) {
					console.log("Error on api call", e);
					showStatus("Error");
					return false;
				}
				hideStatus();
				return res.url;
			}
			
			function showURL(url) {
				urlTxt.value = url;
				copyButton.onclick = () => {
					navigator.clipboard.writeText(url).then(() => showStatus("URL Copied"), () => showStatus("Couldn't Copy"));
				};
				gotoButton.href = url.substr(url.search("game"));
				details.style.display = "grid";
			}
			
			function showStatus(txt=false) {
				if (txt !== false) status.innerHTML = txt;
				status.style.display = "block";
			}
			
			function hideStatus() {
				status.style.display = "none";
			}
			
			// api

			async function api(func, obj) {
				if (!["new_game", "new_player", "user_exist", "copy_game"].includes(func)) {
					throw new Error(`Unsupported function "${func}"`);
					return;
				}
				const url = `api/${func}`;
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
