async function api(func, obj) {
	if (!["new_game", "new_player", "user_exist", "copy_game"].includes(func)) {
		throw new Error(`Unsupported function "${func}"`);
		return;
	}
	const url = `${location.host}/api/${func}`;
	const response = await fetch(url);
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