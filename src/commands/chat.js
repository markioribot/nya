const SimpleCommand = require("../core/commands/SimpleCommand");
const OverloadCommand = require("../core/commands/OverloadCommand");
const HelpContent = require("../util/commands/HelpContent");
const Category = require("../util/commands/Category");
const CommandScope = require("../util/commands/CommandScope");

const log = require("../log");
const config = require("../config");
const typing = require("../modules/typing");

const request = require("request-promise-native");
const base_url = "https://cleverbot.io/1.0/";

class CleverbotError extends Error { }

class Session {
    /**
     * Creates a new cleverbot session
     * @param {Cleverbot} client 
     * @param {string} nick 
     */
    constructor(client, nick) {
        this.client = client;
        this.nick = nick;
    }

    /**
     * @param {string} input 
     */
    async ask(input) {
        const body = await request.post({
            url: base_url + "ask", form: {
                user: this.client.user,
                key: this.client.key,
                nick: this.nick,
                text: input
            }
        });

        if (JSON.parse(body).status == "success") {
            return JSON.parse(body).response;
        }
        else {
            throw new CleverbotError(JSON.parse(body).status);
        }
    }
}

class Cleverbot {
    /**
     * Creates a new Cleverbot API instance
     * @param {string} user 
     * @param {string} key 
     */
    constructor(user, key) {
        this.user = user;
        this.key = key;
        /**@type {Set<string>} */
        this._cache = new Set;
    }

    /**
     * @param {string} nick your session id. Creates new session id if non-existant
     */
    async create(nick) {
        if (this._cache.has(nick)) {
            return new Session(this, nick);
        }

        const body = await request.post({
            url: base_url + "create",
            form: {
                user: this.user,
                key: this.key,
                nick: nick
            }
        });

        /** @type {string} */
        let status;

        try {
            status = JSON.parse(body).status;
        } catch (e) {
            status = "API endpoints unreachable";
        }

        if (status == "success") {
            nick = JSON.parse(body).nick;
            this._cache.add(nick);
            return new Session(this, nick);
        }
        else if (status == "Error: reference name already exists") {
            this._cache.add(nick);
            return new Session(this, nick);
        }
        else {
            throw new CleverbotError(status);
        }
    }
}

module.exports = async function install(cr) {
    if (!config.has("cleverbot.user") || !config.has("cleverbot.key")) return log.namespace("config", "Found no API credentials for Cleverbot.io - Disabled chat command");

    const bot = new Cleverbot(config.get("cleverbot.user"), config.get("cleverbot.key"));

    cr.registerCommand("chat", new OverloadCommand)
        .registerOverload("1+", new SimpleCommand(async (message, input) => {
            await typing.startTyping(message.channel);

            try {
                const session = await bot.create(message.author.id);

                const reply = await session.ask(input);

                await typing.stopTyping(message.channel);
                if (message.channel.type === "text")
                    await message.channel.send(`${message.member.toString()} ${reply}`);
                else
                    await message.channel.send(`${message.author.toString()} ${reply}`);
            } catch (_) {
                await typing.stopTyping(message.channel);
            }
        }))
        .setHelp(new HelpContent()
            .setDescription("Talk with Trixie1!!! (using a cleverbot integration)"))
        .setCategory(Category.FUN)
        .setScope(CommandScope.ALL);
    
    cr.registerAlias("chat", "cleverbot");
};