import fs from 'fs'
import demofile from 'demofile'

const meta = {}
const playerMeta = new Map()
const teams = new Map()
let rounds = [ [] ]

fs.readFile('demo.dem', async (err, buffer) => {
	const teamData = (number) => {
		return {
			name: demoFile.teams[number].clanName,
			score: demoFile.teams[number].score,
			score_first_half: demoFile.teams[number].scoreFirstHalf,
			score_second_half: demoFile.teams[number].scoreSecondHalf,
			flag: demoFile.teams[number].flagImage,
			players: demoFile.teams[number].members.map((player) => {
				return (player && player.steamId) ? player.steamId : 'unknown_user'
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
		if (e.table.name !== 'userinfo' || e.userData === null || e.userData.guid === 'BOT') return

		playerMeta.set(e.userData.guid, e.userData)
	})

	// Round Start
	demoFile.gameEvents.on('round_start', (e) => {
		log('start', {})
	})

	// Freeze Time ends
	demoFile.gameEvents.on('round_freeze_end', (e) => {
		log('freeze_time_ended', {})
	})

	// MVPs
	demoFile.gameEvents.on('round_mvp', (e) => {
		const mvp = demoFile.entities.getByUserId(e.userid)

		log('mvp', { mvp: (mvp) ? mvp.steamId : 'unknown_user' })
	})

	// Round Ended
	demoFile.gameEvents.on('round_end', (e) => {
		if (e.message === '#SFUI_Notice_Game_Commencing') return

		log('winner', {
			winner: e.winner,
			reason: e.reason,
			message: e.message, // TODO this should be replaceable with reason alone
		})
	})

	// Round Officially Ended
	demoFile.gameEvents.on('round_officially_ended', () => {
		rounds.push([])

		teams.set('t', teamData(2))
		teams.set('ct', teamData(3))

		console.info(teams.get('t').score, 'T - CT', teams.get('ct').score)
	})

	// Player Flashed
	demoFile.gameEvents.on('player_blind', (e) => {
		let victim = demoFile.entities.getByUserId(e.userid)
		if (! victim || ! victim.isAlive) return

		const attacker = demoFile.entities.getByUserId(e.attacker)

		log('flashed', {
			attacker: (attacker) ? attacker.steamId : 'unknown_user',
			victim: (victim) ? victim.steamId : 'unknown_user',
			entity_id: e.entityid,
			duration: e.blind_duration,
		})
	})

	// Damage
	demoFile.gameEvents.on('player_hurt', (e) => {
		const attacker = demoFile.entities.getByUserId(e.attacker)
		const victim = demoFile.entities.getByUserId(e.userid)

		log('damage', {
			attacker: (attacker) ? attacker.steamId : 'unknown_user',
			victim: (victim) ? victim.steamId : 'unknown_user',

			damage: e.dmg_health,
			armor: e.dmg_armor,
			weapon: e.weapon,
			hitbox: e.hitgroup,
		})
	})

	demoFile.gameEvents.on('round_announce_match_start', (e) => {
		console.info('match started')

		rounds = [ [] ]

		log('freeze_time_ended')
	})

	// Kills/Deaths
	demoFile.gameEvents.on('player_death', (e) => {
		const attacker = demoFile.entities.getByUserId(e.attacker)
		const victim = demoFile.entities.getByUserId(e.userid)
		const assister = (e.assister === 0)
			? false
			: demoFile.entities.getByUserId(e.assister)

		log('kill', {
			attacker: (attacker) ? attacker.steamId : 'unknown_user',
			victim: (victim) ? victim.steamId : 'unknown_user',

			assister: (assister === false) ? false : ((assister) ? assister.steamId : 'unknown_user'),
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
			planter: (planter) ? planter.steamId : 'unknown_user',
			site: e.site,
		})
	})

	// Defuses
	demoFile.gameEvents.on('bomb_defused', (e) => {
		const defuser = demoFile.entities.getByUserId(e.userid)

		log('defuse', {
			defuser: (defuser) ? defuser.steamId : 'unknown_user',
			site: e.site,
		})
	})

	demoFile.parse(buffer)

	demoFile.on('end', (e) => {
		if (rounds[rounds.length - 1].length === 0) rounds.splice(rounds.length - 1)

		fs.writeFile('demo.json', JSON.stringify({
			meta,
			playerMeta,
			teams,
			rounds,
		}), (err) => {
			if (err) throw err
		})

		console.info({
			meta,
			playerMeta,
			teams,
			rounds,
		})

		// console.log(rounds)
	})
})
