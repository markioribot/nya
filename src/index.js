const discordKeys = require("../keys/discord.json");
const discordKeyDev = require("../keys/discord_dev.json");
const log = require("./modules/log");
const Discord = require("discord.js");
const { MongoClient } = require("mongodb");
const ConfigManager = require("./logic/managers/ConfigManager");
const LocaleManager = require("./logic/managers/LocaleManager");
const Core = require("./logic/core/Core");

Array.prototype.last = function () {
    return this[this.length - 1];
};

function setStatus(client) {
    client.user.setStatus("online");
    client.user.setActivity("!trixie", { type: "PLAYING" });
}

new class App {
    constructor() {
        this.client = new Discord.Client({ autoReconnect: true }).setMaxListeners(Infinity);

        this.attachClientListeners();

        this.initialize().then(() => {
            log.debug("App", "I am ready");

            setStatus(this.client);
            setInterval(() => setStatus(this.client), 3600000 * 12);
        }).catch(err => {
            log.error("Failed to log in");
            log.error(err);
            process.exit(1);
        });
    }

    async loadDB() {
        return await MongoClient
            .connect("mongodb://localhost:27017/", {
                autoReconnect: true,
                useNewUrlParser: true
            })
            .then(client => client.db(process.env.NODE_ENV === "development" ? "trixiedev" : "trixiebot"));
    }

    async initialize() {
        this.db = await this.loadDB();

        const Parameter = ConfigManager.Parameter;
        this.config = new ConfigManager(this.client, this.db, [
            new Parameter("prefix", "❗ Prefix", "!", String),

            // new Parameter("calling", "📞 Accept calls servers", false, Boolean),
            new Parameter("uom", "📐 Measurement preference", "cm", ["cm", "in"]),
            // new Parameter("time", "🕑 Time display preference", "24h", ["24h", "12h"]),

            new Parameter([
                new Parameter("announce.channel", "Channel. 'none' disables announcements", null, Discord.TextChannel, true),
                new Parameter("announce.bots", "Announce Bots", true, Boolean)
            ], "🔔 Announce new/leaving/banned users"),

            new Parameter([
                new Parameter("welcome.enabled", "true/false", false, Boolean),
                new Parameter("welcome.text", "Custom Text ('{{user}}' as user, empty = default)", null, String, true)
            ], "👋 Announce new users"),

            new Parameter([
                new Parameter("leave.enabled", "true/false", false, Boolean),
                new Parameter("leave.text", "Custom Text ('{{user}}' as user, empty = default)", null, String, true)
            ], "🚶 Announce leaving users"),

            new Parameter([
                new Parameter("ban.enabled", "true/false", false, Boolean),
                new Parameter("ban.text", "Custom Text ('{{user}}' as user, empty = default)", null, String, true)
            ], "🔨 Announce banned users")
        ]);

        this.locale = new LocaleManager(this.client, this.db, [
            "en", "de", "hu"
        ]);

        this.client.db = this.db;
        this.client.config = this.config;
        this.client.locale = this.locale;

        await new Promise(resolve => {
            this.client.once("ready", () => resolve());

            this.client.login(process.env.NODE_ENV === "development" ? discordKeyDev.token : discordKeys.token);
        });

        this.core = new Core(this.client, this.config, this.db);

        await this.core
            .setCommandsPackage("features")
            .startMainComponents();
    }

    attachClientListeners() {
        this.client.addListener("warn", warn => log.warn(warn));

        this.client.addListener("error", error => log.error(
            error.stack ||
                error.error ?
                error.error.stack || error.error :
                error
        ));

        this.client.addListener("debug", debug => {
            if (/heartbeat/i.test(debug)) return;
            log.debug("discord.js", debug);
        });

        this.client.addListener("disconnect", closeEvent => log.debug("discord.js", closeEvent));

        this.client.addListener("reconnecting", () => log.debug("discord.js", "Reconnecting"));

        this.client.addListener("resume", replayed => log.debug("discord.js", `Resumed ${replayed} time`));
    }
};

process.addListener("uncaughtException", error => {
    log.error(error.stack || error);
    process.exit();
});

process.addListener("unhandledRejection", (reason, p) => {
    log.warn("Unhandled Rejection at:", p);
});

process.addListener("warning", warning => {
    log.warn(warning.message); // Print the warning message
    log.warn(warning.stack);   // Print the stack trace
});
