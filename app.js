import fs from 'fs'
import demofile from 'demofile'

const meta = {}
const playerMeta = new Map()
const teams = {}
let rounds = [ [] ]

const bombsiteCenters = {}
let checkEquipmentValueAtTick = -1

let replaceSteamIds = false

if (process.argv[3]) {
	const segments = process.argv[3].split(',')

	if (segments.length >= 2) {
		replaceSteamIds = {
			replace: segments.slice(1),
			with: segments[0],
		}
	}
}

fs.readFile(process.argv[2], async (err, buffer) => {
	const steamId = (player) => {
		if (! player || ! player.steamId) return 'unknown_user'

		if (replaceSteamIds && replaceSteamIds.replace.includes(player.steamId)) return replaceSteamIds.with

		return (player.steamId === 'BOT')
			? `BOT_${player.userId}`
			: player.steamId
	}

	const teamData = (number) => {
		return {
			name: demoFile.teams[number].clanName,
			score: demoFile.teams[number].score,
			score_first_half: demoFile.teams[number].scoreFirstHalf,
			score_second_half: demoFile.teams[number].scoreSecondHalf,
			score_overtime: demoFile.teams[number].getProp('DT_Team', 'm_scoreOvertime'),
			flag: demoFile.teams[number].flagImage,
			players: demoFile.teams[number].members.map(steamId).filter((player) => {
				return player !== 'unknown_user'
			}),
		}
	}

	const vectorInside = (v, min, max) => {
		return v.x >= min.x && v.x <= max.x
			&& v.y >= min.y && v.y <= max.y
			&& v.z >= min.z && v.z <= max.z
	}

	const bombsiteName = (siteIndex, userid) => {
		const entity = demoFile.entities.entities[siteIndex]
		const vectorMin = entity.getProp('DT_CollisionProperty', 'm_vecMins')
		const vectorMax = entity.getProp('DT_CollisionProperty', 'm_vecMaxs')

		if (bombsiteCenters.a && vectorInside(bombsiteCenters.a, vectorMin, vectorMax)) return 'a'
		if (bombsiteCenters.b && vectorInside(bombsiteCenters.b, vectorMin, vectorMax)) return 'b'

		// if neither site is within the vector, take the one the interacting player is closer to
		const user = demoFile.entities.getByUserId(userid)

		const distanceA = Math.sqrt(
			Math.pow(bombsiteCenters.a.x - user.position.x, 2),
			Math.pow(bombsiteCenters.a.y - user.position.y, 2),
			Math.pow(bombsiteCenters.a.z - user.position.z, 2),
		)

		const distanceB = Math.sqrt(
			Math.pow(bombsiteCenters.b.x - user.position.x, 2),
			Math.pow(bombsiteCenters.b.y - user.position.y, 2),
			Math.pow(bombsiteCenters.b.z - user.position.z, 2),
		)

		return (distanceB < distanceA) ? 'b' : 'a'
	}

	const filterOutBots = (player) => {
		return (player)
			? player.steamId !== 'BOT'
			: false
	}

	const demoFile = new demofile.DemoFile()

	const log = (type, data) => {
		rounds[rounds.length - 1].push(
			Object.assign({ type, tick: demoFile.currentTick }, data)
		)
	}

	const initTeamData = (force = false) => {
		if (force || ! teams.t || ! teams.ct) {
			teams.t = teamData(2)
			teams.ct = teamData(3)
		}
	}

	const assignOrSwapTeams = (forceNoSwap = false) => {
		initTeamData()

		let remainingPlayersCt = 0

		for (const player of demoFile.teams[3].members) {
			if (player && teams.ct.players.includes(player.steamId) && player.steamId !== 'BOT') remainingPlayersCt++
		}

		let remainingPlayersT = 0

		for (const player of demoFile.teams[2].members) {
			if (player && teams.t.players.includes(player.steamId) && player.steamId !== 'BOT') remainingPlayersT++
		}

		if (forceNoSwap
			|| remainingPlayersT > demoFile.teams[2].members.filter(filterOutBots).length / 2
			|| remainingPlayersCt > demoFile.teams[3].members.filter(filterOutBots).length / 2) {
			// same teams, merge player arrays
			teams.t = Object.assign(teamData(2), {
				players: teams.t.players.concat(demoFile.teams[2].members.map(steamId).filter((player) => {
					return ! teams.t.players.includes(player) && player !== 'unknown_user'
				}))
			})

			teams.ct = Object.assign(teamData(3), {
				players: teams.ct.players.concat(demoFile.teams[3].members.map(steamId).filter((player) => {
					return ! teams.ct.players.includes(player) && player !== 'unknown_user'
				}))
			})
		} else {
			// teams switched (probably), swap teams (but don't discard players that were in the team before the switch but aren't anymore)
			const previousTPlayers = teams.t.players.slice()
			const previousCtPlayers = teams.ct.players.slice()

			teams.t = Object.assign(teamData(2), {
				players: previousCtPlayers.concat(demoFile.teams[2].members.map(steamId).filter((player) => {
					return ! previousCtPlayers.includes(player) && player !== 'unknown_user'
				}))
			})

			teams.ct = Object.assign(teamData(3), {
				players: previousTPlayers.concat(demoFile.teams[3].members.map(steamId).filter((player) => {
					return ! previousTPlayers.includes(player) && player !== 'unknown_user'
				}))
			})
		}
	}

	// Meta
	demoFile.on('start', () => {
		meta.server_name = demoFile.header.serverName
		meta.map = demoFile.header.mapName
		meta.duration = demoFile.header.playbackTime
		meta.ticks = demoFile.header.playbackTicks
		meta.tickrate = demoFile.tickRate
	})

	// Player Data
	demoFile.stringTables.on('update', (e) => {
		if (e.table.name !== 'userinfo' || e.userData === null || (e.userData.guid === 'BOT' && e.userData.name === 'GOTV')) return

		const guid = (e.userData.guid === 'BOT')
			? `BOT_${e.userData.userId}`
			: (
				(replaceSteamIds && replaceSteamIds.replace.includes(e.userData.guid))
					? replaceSteamIds.with
					: e.userData.guid
			)

		playerMeta.set(guid, {
			guid,
			name: (e.userData.guid === 'BOT')
				? `BOT ${e.userData.name}`
				: e.userData.name,
			userId: e.userData.userId,
			bot: e.userData.guid === 'BOT',
		})
	})

	demoFile.entities.on('change', (e) => {
		if (e.tableName === 'DT_CSPlayerResource') {
			if (e.varName === 'm_bombsiteCenterA') {
				bombsiteCenters.a = e.newValue
			} else if (e.varName === 'm_bombsiteCenterB') {
				bombsiteCenters.b = e.newValue
			}
		}
	})

	// Round Start
	demoFile.gameEvents.on('round_start', (e) => {
		log('round_start', { number: demoFile.gameRules.roundsPlayed })
	})

	// Freeze Time ends
	demoFile.gameEvents.on('round_freeze_end', (e) => {
		const disallowedEventsThisRound = rounds[rounds.length - 1]
			.filter(({ type }) => ! ['item_pickup', 'round_start'].includes(type))

		if (disallowedEventsThisRound.length > 0) rounds.push([])

		log('freeze_time_ended', { number: demoFile.gameRules.roundsPlayed })

		assignOrSwapTeams()

		checkEquipmentValueAtTick = demoFile.currentTick + 4 * demoFile.tickRate
	})

	// Money and Equipment Value
	demoFile.on('tickend', (tick) => {
		if (tick !== checkEquipmentValueAtTick) return

		for (const player of demoFile.entities.players) {
			if ((player.teamNumber !== 2 && player.teamNumber !== 3) || player.isHltv) continue

			log('money_equipment', {
				player: steamId(player),
				money_remaining: player.account,
				equipment_value: player.currentEquipmentValue,
			})
		}
	})

	// MVPs
	demoFile.gameEvents.on('round_mvp', (e) => {
		const mvp = demoFile.entities.getByUserId(e.userid)

		log('mvp', { mvp: steamId(mvp) })
	})

	// Round Ended
	demoFile.gameEvents.on('round_end', (e) => {
		if (e.message === '#SFUI_Notice_Game_Commencing') return

		log('round_winner', {
			winner: e.winner,
			reason: e.reason,
			// message: e.message,
		})
	})

	// Round Officially Ended
	demoFile.gameEvents.on('round_officially_ended', () => {
		rounds.push([])

		if (process.stdout.isTTY) console.info(teams.t.score, 'T - CT', teams.ct.score)
	})

	// Player Flashed
	demoFile.gameEvents.on('player_blind', (e) => {
		let victim = demoFile.entities.getByUserId(e.userid)
		if (! victim || ! victim.isAlive) return

		log('flashed', {
			attacker: steamId(demoFile.entities.getByUserId(e.attacker)),
			victim: steamId(victim),
			entity_id: e.entityid,
			duration: e.blind_duration,
		})
	})

	// Damage
	demoFile.gameEvents.on('player_hurt', (e) => {
		log('damage', {
			attacker: steamId(demoFile.entities.getByUserId(e.attacker)),
			victim: steamId(demoFile.entities.getByUserId(e.userid)),

			damage: e.dmg_health,
			armor: e.dmg_armor,
			weapon: e.weapon,
			hitbox: e.hitgroup,
		})
	})

	// Freeze Time ended (first round)
	demoFile.gameEvents.on('round_announce_match_start', (e) => {
		if (process.stdout.isTTY) console.info('match started')

		rounds = [ [] ]
		initTeamData(true)

		log('freeze_time_ended', { number: demoFile.gameRules.roundsPlayed })
	})

	// Kills/Deaths
	demoFile.gameEvents.on('player_death', (e) => {
		const assister = (e.assister === 0)
			? false
			: demoFile.entities.getByUserId(e.assister)

		log('kill', {
			attacker: steamId(demoFile.entities.getByUserId(e.attacker)),
			victim: steamId(demoFile.entities.getByUserId(e.userid)),

			assister: (assister === false) ? false : steamId(assister),
			flash_assist: e.assistedflash,

			weapon: e.weapon,
			headshot: e.headshot,

			through_wall: e.penetrated,
			noscope: e.noscope,
			through_smoke: e.thrusmoke,
			attacker_flashed: e.attackerblind,
		})
	})

	// Plants
	demoFile.gameEvents.on('bomb_planted', (e) => {
		log('plant', {
			planter: steamId(demoFile.entities.getByUserId(e.userid)),
			site: bombsiteName(e.site, e.userid),
		})
	})

	// Defuses
	demoFile.gameEvents.on('bomb_defused', (e) => {
		log('defuse', {
			defuser: steamId(demoFile.entities.getByUserId(e.userid)),
			site: bombsiteName(e.site, e.userid),
		})
	})

	// Bomb Explosions
	demoFile.gameEvents.on('bomb_exploded', (e) => {
		log('exploded', {
			planter: steamId(demoFile.entities.getByUserId(e.userid)),
			site: e.site,
		})
	})

	// Smokes Detonated
	demoFile.gameEvents.on('smokegrenade_detonate', (e) => {
		log('smoke_detonated', {
			thrower: steamId(demoFile.entities.getByUserId(e.userid)),
		})
	})

	// HEs Detonated
	demoFile.gameEvents.on('hegrenade_detonate', (e) => {
		log('he_detonated', {
			thrower: steamId(demoFile.entities.getByUserId(e.userid)),
		})
	})

	// HEs Detonated
	demoFile.gameEvents.on('flashbang_detonate', (e) => {
		log('flashbang_detonated', {
			thrower: steamId(demoFile.entities.getByUserId(e.userid)),
			entity_id: e.entityid,
		})
	})

	// Grenades thrown
	demoFile.gameEvents.on('weapon_fire', (e) => {
		if (! ['weapon_incgrenade', 'weapon_molotov', 'weapon_flashbang', 'weapon_smokegrenade', 'weapon_hegrenade'].includes(e.weapon)) return

		const thrower = demoFile.entities.getByUserId(e.userid)

		let grenade = e.weapon.substring(7)

		if (grenade === 'incgrenade') grenade = 'molotov'
		else if (grenade === 'hegrenade') grenade = 'he'
		else if (grenade === 'smokegrenade') grenade = 'smoke'

		log(`${grenade}_thrown`, {
			thrower: steamId(thrower),
		})
	})

	// Bot Takeovers
	demoFile.gameEvents.on('bot_takeover', (e) => {
		log('bot_takeover', {
			human: steamId(demoFile.entities.getByUserId(e.userid)),
			bot: steamId(demoFile.entities.getByUserId(e.botid)),
		})
	})

	// Item Pickups
	demoFile.gameEvents.on('item_pickup', (e) => {
		log('item_pickup', {
			player: steamId(demoFile.entities.getByUserId(e.userid)),
			item: e.item,
		})
	})

	demoFile.parse(buffer)

	const applyFinalScore = (name, number) => {
		if (! teams[name]) return teams[name] = teamData(number)

		teams[name].score = demoFile.teams[number].score
		teams[name].score_first_half = demoFile.teams[number].scoreFirstHalf
		teams[name].score_second_half = demoFile.teams[number].scoreSecondHalf
		teams[name].score_overtime = demoFile.teams[number].getProp('DT_Team', 'm_scoreOvertime')
	}

	demoFile.on('end', (e) => {
		while (rounds[rounds.length - 1].length === 0) rounds.splice(rounds.length - 1)

		assignOrSwapTeams(true)

		applyFinalScore('t', 2)
		applyFinalScore('ct', 3)

		meta.game_mode = demoFile.conVars.vars.get('game_mode') || 0
		meta.game_type = demoFile.conVars.vars.get('game_type') || 0

		meta.max_rounds = demoFile.conVars.vars.get('mp_maxrounds')
		meta.has_halftime = demoFile.conVars.vars.get('mp_halftime') === '1'

		const json = JSON.stringify({
			meta,
			playerMeta: Object.fromEntries(playerMeta),
			teams,
			rounds,
		})

		if (! process.stdout.isTTY) {
			return console.info(json)
		}

		fs.writeFile('demo.json', json, (err) => {
			if (err) throw err
		})

		console.info({
			meta,
			playerMeta,
			t: teams.t,
			ct: teams.ct,
			rounds: rounds.length,
		})
	})
})
