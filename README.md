# csgo-demo-parser
This is exclusively used in the demo import process of [drweissbrot/csgo-stats](https://github.com/drweissbrot/csgo-stats), which provides a Counter-Strike: Global Offensive match history.

## Usage outside of csgo-stats
Clone, `cd` into the directory, and install dependencies via Yarn. Then find yourself a CS:GO demo and run:

```sh
node app.js /path/to/demo.dem
```

Optionally, you can also pass another argument containing a comma-separated list of Steam2 IDs. If you do, the parser will replace any instance of the provided IDs with the first ID. In csgo-stats, this is used to track the stats of a user across their main account and smurf accounts. Only works for a single person though, you can't (as of now) provide multiple players.

```sh
node app.js /path/to/demo.dem STEAM_1:1:53558216,STEAM_1:0:56997699
```

Either way, if you're running the command directly this will print out some data about the demo, and write all events stored in the demo (that are relevant to csgo-stats) to a `demo.json` file.
If you're not running the command in a TTY, the events will be echoed out direcly.

The data that's returned contains some info about the demo (tickrate, map, etc.), Steam2 IDs and names for all players, the teams, and all interesting demo events for each round (e.g. kills, damage, thrown grenades, item pickups, etc.).
