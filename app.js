import fs from 'fs'
import demofile from 'demofile'

const meta = {}
const playerMeta = new Map()
const teams = {}
let rounds = [ [] ]

let checkEquipmentValueAtTick = -1

fs.readFile(process.argv[2], async (err, buffer) => {
	const steamId = (player) => {
		if (! player || ! player.steamId) return 'unknown_user'

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

	const demoFile = new demofile.DemoFile()

	const log = (type, data) => {
		rounds[rounds.length - 1].push(
			Object.assign({ type, tick: demoFile.currentTick }, data)
		)
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
			: e.userData.guid

		playerMeta.set(guid, {
			guid,
			name: (e.userData.guid === 'BOT')
				? `BOT ${e.userData.name}`
				: e.userData.name,
			userId: e.userData.userId,
			bot: e.userData.guid === 'BOT',
		})
	})

	// Round Start
	demoFile.gameEvents.on('round_start', (e) => {
		if (rounds[rounds.length - 1].length > 0) rounds.push([])

		log('round_start', { number: demoFile.gameRules.roundsPlayed })
	})

	// Freeze Time ends
	demoFile.gameEvents.on('round_freeze_end', (e) => {
		log('freeze_time_ended', { number: demoFile.gameRules.roundsPlayed })

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

		if (teams.t && teams.ct) {
			let remainingPlayers = 0

			for (const player of demoFile.teams[2].members) {
				if (teams.t.players.includes(player.steamId)) remainingPlayers++
			}

			if (remainingPlayers >= demoFile.teams[2].members.length / 2) {
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
				const previousTPlayers = teams.t.players
				const previousCtPlayers = teams.ct.players

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
		} else {
			teams.t = teamData(2)
			teams.ct = teamData(3)
		}

		if (process.stdout.isTTY) console.info(teams.t.score, 'T - CT', teams.ct.score)
	})

	// Player Flashed
	demoFile.gameEvents.on('player_blind', (e) => {
		let victim = demoFile.entities.getByUserId(e.userid)
		if (! victim || ! victim.isAlive) return

		const attacker = demoFile.entities.getByUserId(e.attacker)

		log('flashed', {
			attacker: steamId(attacker),
			victim: steamId(victim),
			entity_id: e.entityid,
			duration: e.blind_duration,
		})
	})

	// Damage
	demoFile.gameEvents.on('player_hurt', (e) => {
		const attacker = demoFile.entities.getByUserId(e.attacker)
		const victim = demoFile.entities.getByUserId(e.userid)

		log('damage', {
			attacker: steamId(attacker),
			victim: steamId(victim),

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

		log('freeze_time_ended', { number: demoFile.gameRules.roundsPlayed })
	})

	// Kills/Deaths
	demoFile.gameEvents.on('player_death', (e) => {
		const attacker = demoFile.entities.getByUserId(e.attacker)
		const victim = demoFile.entities.getByUserId(e.userid)
		const assister = (e.assister === 0)
			? false
			: demoFile.entities.getByUserId(e.assister)

		log('kill', {
			attacker: steamId(attacker),
			victim: steamId(victim),

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
		const planter = demoFile.entities.getByUserId(e.userid)

		log('plant', {
			planter: steamId(planter),
			site: e.site,
		})
	})

	// Defuses
	demoFile.gameEvents.on('bomb_defused', (e) => {
		const defuser = demoFile.entities.getByUserId(e.userid)

		log('defuse', {
			defuser: steamId(defuser),
			site: e.site,
		})
	})

	// Bomb Explosions
	demoFile.gameEvents.on('bomb_exploded', (e) => {
		const planter = demoFile.entities.getByUserId(e.userid)

		log('exploded', {
			planter: steamId(planter),
			site: e.site,
		})
	})

	// Smokes Detonated
	demoFile.gameEvents.on('smokegrenade_detonate', (e) => {
		const thrower = demoFile.entities.getByUserId(e.userid)

		log('smoke_detonated', {
			thrower: steamId(thrower),
		})
	})

	// HEs Detonated
	demoFile.gameEvents.on('hegrenade_detonate', (e) => {
		const thrower = demoFile.entities.getByUserId(e.userid)

		log('he_detonated', {
			thrower: steamId(thrower),
		})
	})

	// HEs Detonated
	demoFile.gameEvents.on('flashbang_detonate', (e) => {
		const thrower = demoFile.entities.getByUserId(e.userid)

		log('flashbang_detonated', {
			thrower: steamId(thrower),
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
		const human = demoFile.entities.getByUserId(e.userid)
		const bot = demoFile.entities.getByUserId(e.botid)

		log('bot_takeover', {
			human: steamId(human),
			bot: steamId(bot),
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
		if (rounds[rounds.length - 1].length === 0) rounds.splice(rounds.length - 1)

		applyFinalScore('t', 2)
		applyFinalScore('ct', 3)

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
			teams,
			rounds: rounds.length,
		})
	})
})
