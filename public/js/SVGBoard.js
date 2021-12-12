			// module variables
			
			var svg;
			var canvas;
			var functionality = false;
			var foc = -1;
			var freeze = false;
			var clr = true;
			var board = Array(7).fill(0);
			var callFunction = () => undefined;
			
			// easy svg building functions
			
			function svgElement(name, attributes={}, parent=false) {
				const el = document.createElementNS("http://www.w3.org/2000/svg", name);
				for (let att in attributes) {
					if (att == "style" && typeof(attributes[att]) == "object") {
						let style = "";
						for (let prop in attributes["style"]) {
							style += `${prop}: ${attributes["style"][prop]};`;
						}
						attributes["style"] = style;
					} else if (att == "children") {
						continue;
					} else if (att == "points" && Array.isArray(attributes[att])) {
						attributes.points = attributes.points.map(point => `${point[0]},${point[1]}`).join(" ");
					} else if ((att == "filter" || att == "mask" || att == "clip-path") && attributes[att].substr(0, 4) != "url(") {
						attributes[att] = `url(${attributes[att]})`;
					}
					el.setAttribute(att, attributes[att].toString());
				}
				if (typeof(parent.appendChild) == "function") parent.appendChild(el);
				if (attributes.children) svgTree(el, attributes.children);
				return el;
			}
			
			function svgTree(parent, children=[]) {
				for (let child of children) {
					if (!child.name) continue;
					const name = child.name;
					delete(child.name);
					svgElement(name, child, parent);
				}
			}
			
			// basic object creation: board and token
			
			function createBoard(svg) {
				svg.setAttribute("viewBox", "0 0 700 800");
				// draw board
				const circleHoles = [];
				const circlesShadow = [];
				const ctrlAreas = [];
				for (let i = 0; i < 7; i++) {
					for (let j = 0; j < 6; j++) {
						circlesShadow.push({
							name: "circle",
							cx: 48 + (i * 100),
							cy: 248 + (j * 100),
							r: 35,
							style: {
								fill: "CornflowerBlue"
							},
							filter: "#blur"
						}, {
							name: "circle",
							cx: 52 + (i * 100),
							cy: 252 + (j * 100),
							r: 33,
							style: {
								fill: "darkblue"
							},
							filter: "#blur"
						}, {
							name: "circle",
							cx: 48 + (i * 100),
							cy: 248 + (j * 100),
							r: 31,
							style: {
								fill: "darkblue"
							},
							filter: "#blur"
						}, {
							name: "circle",
							cx: 52 + (i * 100),
							cy: 252 + (j * 100),
							r: 32,
							style: {
								fill: "CornflowerBlue"
							},
							filter: "#blur"
						});
						circleHoles.push({
							name: "circle",
							cx: 50 + (i * 100),
							cy: 250 + (j * 100),
							r: 28,
							fill: "black"
						});
					}
					ctrlAreas.push({
						name: "rect",
						id: `ctrlArea_${i}`,
						x: i * 100,
						y: 0,
						width: 100,
						height: 800,
						opacity: 0
					});
				}
				svgTree(svg, [
					{
						name: "filter",
						id: "blur",
						x: "0",
						y: "0",
						children: [
							{
								name: "feGaussianBlur",
								stdDeviation: "2"
							}
						]
					}, {
						name: "mask",
						id: "boardMask",
						children: [
							{
								name: "rect",
								width: 700,
								height: 600,
								x: 0,
								y: 200,
								fill: "white"
							}, {
								name: "g",
								children: circleHoles
							}
						]
					}, {
						name: "g",
						id: "tokensLayer"
					}, {
						// blue board
						name: "g",
						children: [
							{
								name: "polygon",
								points: [
									[0, 200],
									[700, 200],
									[0, 800]
								],
								style: {
									fill: "CornflowerBlue"
								},
								filter: "#blur"
							}, {
								name: "polygon",
								points: [
									[700, 200],
									[700, 800],
									[0, 800]
								],
								style: {
									fill: "darkblue"
								},
								filter: "#blur"
							}, {
								name: "polygon",
								points: [
									[5, 205],
									[695, 205],
									[5, 795]
								],
								style: {
									fill: "darkblue"
								},
								filter: "#blur"
							}, {
								name: "polygon",
								points: [
									[695, 205],
									[695, 795],
									[5, 795]
								],
								style: {
									fill: "CornflowerBlue"
								},
								filter: "#blur"
							}, {
								name: "rect",
								width: 680,
								height: 580,
								x: 10,
								y: 210,
								style: {
									fill: "royalblue"
								}
							}, {
								name: "g",
								children: circlesShadow
							}
						],
						mask: "#boardMask"
					}, {
						name: "g",
						id: "ctrlLayer",
						children: ctrlAreas
					}
				]);
				if (canvas) cnvBoard(canvas);
			}
			
			function createToken(color, id, pos=false) {
				const token = svgElement("g", {
					children: [
						{
							name: "circle",
							cx: 0,
							cy: 0,
							r: 45,
							fill: color ? "gold" : "OrangeRed"
						}, {
							name: "path",
							d: "M -25 25 A 25 25 0 1 1 25 -25",
							stroke: color ? "GoldenRod" : "FireBrick",
							"stroke-width": 3,
							fill: "none",
							filter: "#blur"
						}, {
							name: "path",
							d: "M -25 25 A 25 25 0 0 0 25 -25",
							stroke: color ? "LemonChiffon" : "pink",
							"stroke-width": 3,
							fill: "none",
							filter: "#blur"
						}
					],
					id,
					class: color ? "yellowToken" : "orangeToken"
				});
				if (pos !== false) token.setAttribute("style", `transform: translate(${pos[0]}px, ${pos[1]}px)`);
				return token;
			}
			
			// token positioning
			
			function fillBoard(svg, givenBoard) {
				const g = svg.querySelector("g#tokensLayer");
				givenBoard.forEach((column, i) => column.forEach((cell, j) => {
					const token = createToken(cell, `token_${i}_${j}`, [50 + (i * 100), 750 - (j * 100)]);
					g.appendChild(token);
				}));
				board = givenBoard.map(col => col.length);
				if (canvas) cnvTokenBoard(canvas, givenBoard);
			}
			
			function suggestToken(svg, color, col) {
				const g = svg.querySelector("g#tokensLayer");
				const x = 50 + (col * 100);
				const token = createToken(color, "suggestedToken");
				g.appendChild(token);
				const animation = svgElement("animateTransform", {
					attributeName: "transform",
					attributeType: "XML",
					type: "translate",
					dur: "1s",
					values: `${x}, 50; ${x}, 150; ${x}, 140`,
					keyTimes: "0; 0.6; 1",
					calcMode: "spline",
					keySplines: "0 0 0.3 1; 0 0 0.3 1",
					repeatCount: 1,
					fill: "freeze"
				}, token);
				animation.beginElement();
				return animation;
			}
			
			function removeSuggestedToken(svg) {
				svg.querySelector("#suggestedToken")?.remove();
			}
			
			function addToken(svg, color, col, endEvent=false) {
				if (col < 0 || col >= 7) {
					throw new Error("Invalid Column number", col);
					return;
				}
				const row = board[col];
				if (row == 6) {
					throw new Error("Column is full", col);
					return;
				}
				const g = svg.querySelector("g#tokensLayer");
				const x = 50 + (col * 100);
				const y = 150 + ((6 - row) * 100);
				const len = Math.sqrt(0.03 * (6 - row));
				const token = createToken(color, `token_${col}_${row}`);
				g.appendChild(token);
				const animation = svgElement("animateTransform", {
					attributeName: "transform",
					attributeType: "XML",
					type: "translate",
					dur: `${len}s`,
					values: `${x}, 140; ${x}, ${y}`,
					keyTimes: `0; 1`,
					calcMode: "spline",
					keySplines: "0.2 0 1 0.8",
					repeatCount: 1,
					fill: "freeze"
				}, token);
				if (endEvent) animation.addEventListener("endEvent", endEvent);
				if (canvas) animation.addEventListener("endEvent", () => cnvToken(canvas, color, col, row));
				animation.beginElement();
				board[col]++;
				return animation;
			}
			
			// token glowing effect
			
			function glowToken(token) {
				const color = token.getAttribute("class") == "yellowToken";
				const regColor = color ? "gold" : "OrangeRed";
				const brightColor = color ? "LemonChiffon" : "pink";
				const circle = token.querySelector("circle");
				const animation = svgElement("animate", {
					attributeName: "fill",
					dur: "2s",
					//from: regColor,
					//to: brightColor,
					values: `${regColor}; ${brightColor}; ${regColor}; ${regColor}`,
					keyTimes: "0; 0.45; 0.9; 1",
					repeatCount: "indefinite"
				}, circle);
				animation.beginElement();
				return animation;
			}
			
			function glowBoard(svg, arr) {
				for (let cell of arr) {
					const [i, j] = cell;
					const token = svg.querySelector(`#token_${i}_${j}`);
					glowToken(token);
				}
				if (canvas) cnvTokenGlow(canvas, arr);
			}
			
			// functionality addition
			
			function addCtrl(svg, events={}) {
				for (let i = 0; i < 7; i++) {
					const area = svg.querySelector(`#ctrlArea_${i}`);
					for (let ev in events) {
						area[ev] = ((j, e) => (() => events[e](j)))(i, ev);
					}
				}
			}
			
			// canvas icon
			
			function setIcon(canvas) {
				const url = canvas.toDataURL();
				let icon = document.querySelector('link[rel="icon"]');
				if (!icon) {
					icon = document.createElement("link");
					icon.setAttribute("rel", "icon");
					document.head.appendChild(icon);
				}
				icon.setAttribute("href", url);
				return url;
			}
			
			function cnvBoard(canvas, board=false) {
				const ctx = canvas.getContext("2d");
				const blue = [65, 105, 225, 255];
				const blueRow = Array(14).fill(blue);
				const row = Array(4).fill(0).concat(...blueRow).concat(Array(4).fill(0));
				const matrix = Array(128).fill(0).concat(...Array(12).fill(row)).concat(Array(128).fill(0));
				const uintMatrix = new Uint8ClampedArray(matrix);
				const data = new ImageData(uintMatrix, 16);
				ctx.putImageData(data, 0, 0);
				setIcon(canvas);
			}
			
			function cnvToken(canvas, color, col, row) {
				const ctx = canvas.getContext("2d");
				const pixel = color ? [255, 215, 0, 255] : [255, 69, 0, 255];
				const token = pixel.concat(pixel, pixel, pixel);
				const uintMatrix = new Uint8ClampedArray(token);
				const data = new ImageData(uintMatrix, 2);
				const i = 1 + col * 2;
				const j = 12 - row * 2;
				ctx.putImageData(data, i, j);
				setIcon(canvas);
			}
			
			function cnvTokenBoard(canvas, board) {
				const ctx = canvas.getContext("2d");
				const blue = [65, 105, 225, 255];
				const yellow = [255, 215, 0, 255];
				const orange = [255, 69, 0, 255];
				const matrix = Array(128).fill(0);
				for (let j = 5; j >= 0; j--) {
					const row = [];
					row.push(0, 0, 0, 0);
					for (let i = 0; i < 7; i++) {
						if (board[i].length <= j) {
							row.push(...blue, ...blue);
						} else if (board[i][j]) {
							row.push(...yellow, ...yellow);
						} else {
							row.push(...orange, ...orange);
						}
					}
					row.push(0, 0, 0, 0);
					matrix.push(...row, ...row);
				}
				matrix.push(...Array(128).fill(0));
				const uintMatrix = new Uint8ClampedArray(matrix);
				const data = new ImageData(uintMatrix, 16);
				ctx.putImageData(data, 0, 0);
				setIcon(canvas);
			}
			
			function cnvTokenGlow(canvas, arr) {
				const noGlowURL = setIcon(canvas);
				const ctx = canvas.getContext("2d");
				const whiteData = new ImageData(new Uint8ClampedArray(Array(16).fill(255)), 2);
				for (let [col, row] of arr) {
					const i = 1 + col * 2;
					const j = 12 - row * 2;
					ctx.putImageData(whiteData, i, j);
				}
				const glowURL = setIcon(canvas);
				const icon = document.querySelector('link[rel="icon"]');
				icon.setAttribute("href", noGlowURL);
				icon.dataset.glow = "";
				const iconFlip = () => {
					icon.dataset.glow = icon.dataset.glow ? "" : "1";
					icon.setAttribute("href", icon.dataset.glow ? glowURL : noGlowURL);
				};
				setInterval(iconFlip, 1000);
			}
			
			// exported functions
			
			function init(svgEl, cnvEl) {
				if (!(svgEl instanceof SVGElement)) {
					throw TypeError("Function's argument must be an SVGElement");
					return;
				}
				svg = svgEl;
				canvas = cnvEl;
				createBoard(svg);
				addCtrl(svg, {
					onmouseenter: col => {
						if (!functionality || board[col] == 6) return;
						foc = col;
						suggestToken(svg, clr, col);
					},
					onmouseleave: col => {
						if (!functionality || board[col] == 6) return;
						if (foc == col) {
							foc = -1;
							removeSuggestedToken(svg);
						}
					},
					onclick: col => {
						if (!functionality || board[col] == 6) return;
						if (foc == col) {
							functionality = false;
							foc = -1;
							callFunction(col);
						} else {
							foc = col;
							suggestToken(svg, clr, col);
						}
					}
				});
				window.addEventListener("blur", e => {
					if (!functionality) return;
					foc = -1;
					removeSuggestedToken(svg);
				});
			}
			
			function setColor(color) {
				clr = color;
			}
			
			function setCallFunction(func) {
				if (typeof(func) != "function" || func.length > 1) {
					throw new TypeError("Argument should be a function of length lesser or equal to 1");
					return;
				}
				callFunction = func;
			}
			
			function setFunctionality(f=true) {
				if (!svg) return;
				functionality = f;
			}
			
			function move(col, color, f=false, after=false) {
				if (!svg) return;
				const functionalityEvent = (f ? () => {functionality = true;} : false);
				let endEvent;
				if (typeof(after) != "function" || after.length > 0) after = false;
				if (functionalityEvent && after) {
					endEvent = () => {
						functionalityEvent();
						after();
					};
				} else {
					endEvent = functionalityEvent || after;
				}
				removeSuggestedToken(svg);
				addToken(svg, color, col, endEvent);
			}
			
			function setBoard(arr) {
				if (!svg) return;
				if (!Array.isArray(arr) || arr.length != 7 || arr.some(obj => !Array.isArray(obj) || obj.length > 6)) return;
				return fillBoard(svg, arr);
			}
			
			function setGlowingTokens(arr) {
				if (!svg) return;
				if (!Array.isArray(arr) || arr.some(obj => !Array.isArray(obj) || obj.length != 2 || obj[0] < 0 || obj[1] < 0 || obj[0] >= 7 || obj[1] >= 6)) return;
				return glowBoard(svg, arr);
			}
			
			function putTokenInSVG(svgEl, color) {
				if (!(svgEl instanceof SVGElement)) {
					throw TypeError("Function's argument must be an SVGElement");
					return;
				}
				svgEl.setAttribute("viewBox", "-50 -50 100 100");
				const token = createToken(color, `token-color-${color}`);
				svgEl.appendChild(token);
			}
			
			// export object
			
			export {init, setColor, setCallFunction, setFunctionality, move, setBoard, setGlowingTokens, putTokenInSVG};