/*
 * Copyright (C) 2018-2019 Christian Schäfer / Loneless
 *
 * TrixieBot is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * TrixieBot is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs-extra");

const log = require("../log").namespace("core");
const config = require("../config");
const { walk } = require("../util/files");
const { timeout } = require("../util/promises");
const helpToJSON = require("../util/commands/helpToJSON");
const nanoTimer = require("../modules/timer");
const random = require("../modules/random/random");
const calendar_events = require("../modules/calendar_events");
const AliasCommand = require("./commands/AliasCommand");
const CommandScope = require("../util/commands/CommandScope");
const LocaleManager = require("./managers/LocaleManager");
const ConfigManager = require("./managers/ConfigManager");
const { Parameter } = ConfigManager;

const CommandProcessor = require("./CommandProcessor");
const WebsiteManager = require("./managers/WebsiteManager");
const UpvotesManager = require("./managers/UpvotesManager");
const MemberLog = require("./listeners/MemberLog");

const Discord = require("discord.js");

const Translation = require("../modules/i18n/Translation");

function fetchPost(url, opts) {
    if (opts.json) {
        opts.body = JSON.stringify(opts.json);
        delete opts.json;
    }
    return fetch(url, { method: "POST", ...opts });
}

class Core {
    /**
     * @param {Discord.Client} client
     * @param {Db} db
     */
    constructor(client, db) {
        this.client = client;
        this.db = db;

        this.config = new ConfigManager(this.client, this.db, [
            new Parameter("prefix", new Translation("config.prefix", "❗ Prefix"), config.get("prefix") || "!", String),

            new Parameter("uom", new Translation("config.uom", "📐 Measurement preference"), "cm", ["cm", "in"]),

            new Parameter([
                new Parameter("announce.channel", new Translation("config.announce_ch", "Channel. 'none' disables announcements"), null, Discord.TextChannel, true),
                new Parameter("announce.bots", new Translation("config.announce_bot", "Announce Bots"), true, Boolean),
            ], new Translation("config.announce", "🔔 Announce new/leaving/banned users")),

            new Parameter([
                new Parameter("welcome.enabled", "true/false", false, Boolean),
                new Parameter("welcome.text", new Translation("config.text", "Custom Text ('{{user}}' as user, empty = default)"), null, String, true),
            ], new Translation("config.welcome", "👋 Announce new users")),

            new Parameter([
                new Parameter("leave.enabled", "true/false", false, Boolean),
                new Parameter("leave.text", new Translation("config.text", "Custom Text ('{{user}}' as user, empty = default)"), null, String, true),
            ], new Translation("config.leave", "🚶 Announce leaving users")),

            new Parameter([
                new Parameter("ban.enabled", "true/false", false, Boolean),
                new Parameter("ban.text", new Translation("config.text", "Custom Text ('{{user}}' as user, empty = default)"), null, String, true),
            ], new Translation("config.ban", "🔨 Announce banned users")),
        ]);

        this.locale = new LocaleManager(this.client, this.db);

        this.processor = new CommandProcessor(this.client, this.config, this.locale, this.db);
        this.website = new WebsiteManager(this.processor.REGISTRY, this.client, this.config, this.locale, this.db);
        this.upvotes = new UpvotesManager(this.client, this.db);

        this.member_log = new MemberLog(this.client, this.config, this.locale);
    }

    async startMainComponents(commands_package) {
        for (const voice of this.client.voiceConnections.array()) voice.disconnect();

        await this.client.user.setStatus("dnd");
        await this.client.user.setActivity("!trixie | Booting...", { type: "PLAYING" });

        await this.loadCommands(commands_package);
        await this.attachListeners();
        await this.setStatus();
        this.setupDiscordBots();
    }

    async loadCommands(commands_package) {
        if (!commands_package || typeof commands_package !== "string") throw new Error("Cannot load commands if not given a path to look at!");

        log("Installing Commands...");

        const timer = nanoTimer();

        const files = await walk(path.resolve(__dirname, "..", commands_package))
            .then(files => files.filter(file => path.extname(file) === ".js"));

        await Promise.all(files.map(async file => {
            const install = require(path.resolve("../" + commands_package, file));
            await install(this.processor.REGISTRY, {
                client: this.client, config: this.config, locale: this.locale, db: this.db, error_cases: this.processor.error_cases,
            });
        }));

        const install_time = nanoTimer.diff(timer) / nanoTimer.NS_PER_SEC;

        log("Building commands.json");

        const jason = {
            prefix: this.config.default_config.prefix,
            commands: [],
        };

        for (const [name, cmd] of this.processor.REGISTRY.commands) {
            if (cmd instanceof AliasCommand) continue;
            if (!cmd.help) continue;
            if (!cmd.hasScope(CommandScope.FLAGS.GUILD)) continue;
            if (!cmd.isInSeason()) continue;
            jason.commands.push({
                name,
                help: helpToJSON(this.config.default_config, name, cmd),
            });
        }

        // by sorting we're getting around an always different order of commands, which
        // confuses git
        jason.commands = jason.commands.sort((a, b) => {
            if (a.name < b.name) { return -1; }
            if (a.name > b.name) { return 1; }
            return 0;
        });

        const str = JSON.stringify(jason, null, 2);
        await fs.writeFile(path.join(process.cwd(), "assets", "commands.json"), str, { mode: 0o666 });
        await fs.writeFile(path.join(process.cwd(), "..", "trixieweb", "client", "src", "assets", "commands.json"), str, { mode: 0o666 });

        const build_time = (nanoTimer.diff(timer) / nanoTimer.NS_PER_SEC) - install_time;

        log(`Commands installed. files:${files.length} commands:${this.processor.REGISTRY.commands.size} install_time:${install_time.toFixed(3)}s build_time:${build_time.toFixed(3)}s`);
    }

    attachListeners() {
        this.client.addListener("message", message => this.processor.onMessage(message));
    }

    async setStatus() {
        let timeout_ref = null;

        const statuses = await fs.readFile(path.join(__dirname, "../../assets/text/statuses.txt"), "utf8")
            .then(txt => txt.split("\n").filter(s => s !== ""));

        const updateStatus = async () => {
            clearTimeout(timeout_ref);
            timeout_ref = setTimeout(updateStatus, 3 * 60000);

            this.client.user.setStatus("online");

            // Server count

            this.client.user.setActivity(`!trixie | ${this.client.guilds.size.toLocaleString("en")} servers`, { type: "WATCHING" });

            await timeout(60000);

            // Website

            this.client.user.setActivity("!trixie | trixie.loneless.art", { type: "PLAYING" });

            await timeout(60000);

            // Status text

            let status = null;
            for (let event of calendar_events) {
                if (!event.isToday()) continue;

                status = event.getStatus();
                break;
            }

            status = status || random(statuses);

            this.client.user.setActivity(`!trixie | ${status}`, { type: "PLAYING" });
        };

        for (let event of calendar_events) {
            event.on("start", updateStatus).on("end", updateStatus);
        }

        updateStatus();
    }

    setupDiscordBots() {
        this.updateStatistics();
        setInterval(() => this.updateStatistics(), 3600 * 1000);
    }

    async updateStatistics() {
        const server_count = this.client.guilds.size;

        const promises = [];

        if (config.has("botlists.divinediscordbots_com"))
            promises.push(fetchPost(`https://divinediscordbots.com/bot/${this.client.user.id}/stats`, {
                json: { server_count },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: config.get("botlists.divinediscordbots_com"),
                },
            }).catch(err => err));

        if (config.has("botlists.botsfordiscord_com"))
            promises.push(fetchPost(`https://botsfordiscord.com/api/bot/${this.client.user.id}`, {
                json: { server_count },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: config.get("botlists.botsfordiscord_com"),
                },
            }).catch(err => err));

        if (config.has("botlists.discord_bots_gg"))
            promises.push(fetchPost(`https://discord.bots.gg/api/v1/bots/${this.client.user.id}/stats`, {
                json: { guildCount: server_count },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: config.get("botlists.discord_bots_gg"),
                },
            }).catch(err => err));

        if (config.has("botlists.botlist_space"))
            promises.push(fetchPost(`https://botlist.space/api/bots/${this.client.user.id}`, {
                json: { server_count },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: config.get("botlists.botlist_space"),
                },
            }).catch(err => err));

        if (config.has("botlists.ls_terminal_ink"))
            promises.push(fetchPost(`https://ls.terminal.ink/api/v2/bots/${this.client.user.id}`, {
                json: { bot: { count: server_count } },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: config.get("botlists.ls_terminal_ink"),
                },
            }).catch(err => err));

        if (config.has("botlists.discordbotlist_com"))
            promises.push(fetchPost(`https://discordbotlist.com/api/bots/${this.client.user.id}/stats`, {
                json: {
                    guilds: server_count,
                    users: this.client.guilds.reduce((prev, curr) => prev + curr.memberCount, 0),
                    voice_connections: this.client.voiceConnections.size,
                },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bot " + config.get("botlists.discordbotlist_com"),
                },
            }).catch(err => err));

        if (config.has("botlists.discordbots_org"))
            promises.push(fetchPost(`https://discordbots.org/api/bots/${this.client.user.id}/stats`, {
                json: { server_count },
                headers: {
                    "Content-Type": "application/json",
                    Authorization: config.get("botlists.discordbots_org"),
                },
            }).catch(err => err));

        await Promise.all(promises);
    }
}

module.exports = Core;
