const fetch = require("node-fetch");
const log = require("../modules/log");
const CONST = require("../modules/CONST");
const Discord = require("discord.js");
const { EventEmitter } = require("events");

const BaseCommand = require("../class/BaseCommand");
const TreeCommand = require("../class/TreeCommand");
const HelpContent = require("../logic/commands/HelpContent");
const Category = require("../logic/commands/Category");

class StreamProcessor extends EventEmitter {
    /**
     * @param {Manager} manager 
     */
    constructor(manager) {
        super();
        this.manager = manager;
        this.database = manager.database;
        this.client = manager.client;

        /** @type {OnlineChannel[]} */
        this.online = [];

        this.on("online", channel => {
            this.online.push(channel);
        });
        this.on("offline", channel => {
            this.removeChannel(channel);
        });
    }

    testURL(url) {
        return false;
    }

    async getDBEntry(guild, userId) {
        return await this.database.findOne({
            service: this.name,
            guildId: guild.id,
            userId: userId
        });
    }

    formatURL(channel, fat) { return ""; }

    async addChannel(config) {
        return new Channel(this.manager, this, config.channel, config);
    }
    async removeChannel(config) {
        const oldChannel = this.online.findIndex(oldChannel =>
            oldChannel.channel.guild.id === config.channel.guild.id &&
            oldChannel.userId === config.userId);
        if (oldChannel >= 0)
            this.online.splice(oldChannel, 1);
    }
}

class Picarto extends StreamProcessor {
    constructor(manager) {
        super(manager);

        setInterval(() => this.checkChanges(), 60 * 1000);
        this.checkChanges();
    }

    testURL(url) {
        return /^(http\:\/\/|https\:\/\/)?(www\.picarto\.tv|picarto\.tv)\/[-a-zA-Z0-9@:%_+.~]{2,25}\b/.test(url);
    }

    async getChannel(channel, url) {
        const regexp = /^(?:http\:\/\/|https\:\/\/)?(?:www\.picarto\.tv|picarto\.tv)\/([-a-zA-Z0-9@:%_+.~]{2,25})\b/;

        const [, channel_name] = regexp.exec(url);

        if (!channel_name) return new Config(this, channel);

        let channelPage;
        try {
            channelPage = await this.request("channel/name/" + channel_name);
        } catch (err) {
            return new Config(this, channel, channel_name);
        }

        const user_id = channelPage.user_id.toString();

        const savedConfig = await this.getDBEntry(channel.guild, user_id);
        if (savedConfig) return new Config(this, channel, channel_name, user_id, savedConfig._id);

        return new Config(this, channel, channel_name, user_id);
    }

    formatURL(channel, fat = false) {
        if (fat) return this.url + "/" + "**" + channel.name + "**";
        else return "https://" + this.url + "/" + channel.name;
    }

    async request(api) {
        const r = await fetch(this.base + api);
        return await r.json();
    }

    async checkChanges() {
        // get all online channels
        /** @type {any[]} */
        const picartoOnline = await this.request("online?adult=true");

        const stream = this.manager.getConfigs(this);

        stream.addListener("data", config => this.checkChange(picartoOnline, config));
        stream.once("end", () => { });
        stream.once("error", err => { log(err); });
    }

    /**
     * @param {any[]} picartoOnline 
     * @param {Channel} savedConfig 
     */
    async checkChange(picartoOnline, savedConfig) {
        const g_channel = savedConfig.channel;
        const oldChannel = this.online.find(oldChannel =>
            savedConfig.userId === oldChannel.userId &&
            savedConfig.channel.guild.id === oldChannel.channel.guild.id);

        let channelPage = picartoOnline.find(channelPage => savedConfig.userId === channelPage.user_id.toString());
        if (!channelPage) {
            // remove the channel from the recently online list                
            if (savedConfig.messageId || oldChannel) this.emit("offline", oldChannel || savedConfig);
        } else {
            // if the channel was not recently online, set it online
            if (oldChannel || savedConfig.messageId) return;

            channelPage = await this.request("channel/id/" + channelPage.user_id);

            const onlineChannel = new OnlineChannel(savedConfig, {
                title: channelPage.title,
                followers: channelPage.followers,
                totalviews: channelPage.viewers_total,
                avatar: channelPage.avatar,
                nsfw: channelPage.adult,
                category: channelPage.category,
                tags: channelPage.tags,
                thumbnail: g_channel.nsfw ?
                    `${channelPage.thumbnails.web_large}?${Date.now()}` :
                    channelPage.adult ?
                        "https://66.media.tumblr.com/6c2c27a36111b356b65cf21746b72698/tumblr_p4tu9xcuEv1v9xi8y_og_500.jpg" :
                        `${channelPage.thumbnails.web_large}?${Date.now()}`
            });

            this.emit("online", onlineChannel);
        }
    }

    get base() { return "https://api.picarto.tv/v1/"; }
    get url() { return "picarto.tv"; }
    get name() { return "picarto"; }
}

class Manager extends EventEmitter {
    constructor(db, client, services) {
        super();

        this.database = db.collection("alert");
        this.db_config = db.collection("alert_config");
        this.client = client;

        this.services = [];
        this.services_mapped = {};
        for (let Service of services) {
            const service = new Service(this);
            service.on("offline", async oldChannel => {
                if (!oldChannel) return;

                this.online.splice(this.online.indexOf(oldChannel), 1);

                await this.database.updateOne({
                    _id: oldChannel._id
                }, { $set: { messageId: null } });

                if (await this.isCleanup(oldChannel.channel.guild))
                    await oldChannel.delete();
            });
            service.on("online", async channel => {
                /** @type {Discord.RichEmbed} */
                let embed = null;
                if (await this.isCompact(channel.channel.guild)) {
                    embed = new Discord.RichEmbed()
                        .setColor(CONST.COLOR.PRIMARY)
                        .setURL(channel.url)
                        .setAuthor(channel.name, channel.avatar)
                        .setTitle(channel.title)
                        .setThumbnail(channel.thumbnail)
                        .setFooter(`${channel.nsfw ? "NSFW | " : ""}${channel.category ? `Category: ${channel.category} | ` : ""}${channel.tags ? `Tags: ${channel.tags.join(", ")}` : ""}`);
                } else {
                    embed = new Discord.RichEmbed()
                        .setColor(CONST.COLOR.PRIMARY)
                        .setURL(channel.url)
                        .setAuthor(channel.name)
                        .setTitle(channel.title)
                        .addField("Followers", channel.followers, true)
                        .addField("Total Viewers", channel.totalviews, true)
                        .setThumbnail(channel.avatar)
                        .setImage(channel.thumbnail)
                        .setFooter(`${channel.nsfw ? "NSFW | " : ""}${channel.category ? `Category: ${channel.category} | ` : ""}${channel.tags ? `Tags: ${channel.tags.join(", ")}` : ""}`);
                }

                const onlineMessage = await channel.channel.sendTranslated("{{user}} is live!", {
                    user: channel.name
                }, { embed });

                channel.setMessage(onlineMessage);

                this.online.push(channel);

                await this.database.updateOne({
                    _id: channel._id
                }, {
                    $set: {
                        name: channel.name,
                        messageId: onlineMessage.id
                    }
                });
            });
            this.services.push(service);
            this.services_mapped[service.name] = service;
        }

        /** @type {OnlineChannel[]} */
        this.online = [];
    }

    getConfigs(service) {
        const stream = this.database.find({ service: service.name });

        const custom_stream = new EventEmitter;

        stream.addListener("data", config => {
            const guild = this.client.guilds.get(config.guildId);
            if (!guild)
                return this.removeChannel(new Config(service, null, config.name, config.userId, config._id));
            if (!guild.available) return;

            const g_channel = guild.channels.get(config.channelId);
            if (!g_channel)
                return this.removeChannel(new Config(service, null, config.name, config.userId, config._id));

            const online = this.online.find(online =>
                online.service === service.name &&
                online.channel.id === g_channel.id &&
                online.userId === config.userId);
            if (online) return custom_stream.emit("data", online);

            custom_stream.emit("data", new Channel(this, service, g_channel, config));
        });

        stream.once("error", err => custom_stream.emit("error", err));
        stream.once("end", () => custom_stream.emit("end"));

        return custom_stream;
    }

    /**
     * @returns {Config}
     */
    async parseConfig(channel, url) {
        for (let service of this.services) {
            if (!service.testURL(url)) continue;

            return await service.getChannel(channel, url);
        }

        return null;
    }

    /**
     * @param {Config} config 
     */
    async addChannel(config) {
        for (let service of this.services) {
            if (service.name !== config.service.name) continue;

            await this.database.insertOne({
                service: config.service.name,
                guildId: config.channel.guild.id,
                channelId: config.channel.id,
                userId: config.userId,
                name: config.name,
                messageId: null
            });

            return await service.addChannel(config);
        }
    }

    /**
     * @param {Config} config 
     */
    async removeChannel(config) {
        for (let service of this.services) {
            if (service.name !== config.service.name) continue;

            await this.database.deleteOne({ _id: config._id });

            await service.removeChannel(config);

            return;
        }
    }

    async getChannels(guild) {
        const configs = await this.database.find({
            guildId: guild.id
        }).toArray();

        const channels = [];
        for (let config of configs) {
            const service = this.services_mapped[config.service];
            if (!service) continue;

            const channel = guild.channels.get(config.channelId);
            if (!channel) {
                await this.removeChannel(new Config(service, channel, config.name, config.userId, config._id));
                continue;
            }

            channels.push(new Channel(this, service, channel, config));
        }

        return channels;
    }

    async getOnlineChannels(guild) {
        return this.online.filter(online => online.channel.guild.id === guild.id);
    }

    async isCompact(guild) {
        return !!(await this.db_config.findOne({ guildId: guild.id, compact: true }));
    }

    async setCompact(guild) {
        await this.db_config.updateOne({ guildId: guild.id }, { $set: { compact: true } }, { upsert: true });
    }

    async unsetCompact(guild) {
        await this.db_config.updateOne({ guildId: guild.id }, { $set: { compact: false } }, { upsert: true });
    }

    async isCleanup(guild) {
        return !(await this.db_config.findOne({ guildId: guild.id, cleanup: false }));
    }

    async setCleanup(guild) {
        await this.db_config.updateOne({ guildId: guild.id }, { $set: { cleanup: true } }, { upsert: true });
    }

    async unsetCleanup(guild) {
        await this.db_config.updateOne({ guildId: guild.id }, { $set: { cleanup: false } }, { upsert: true });
    }
}

class Channel {
    constructor(manager, service, channel, conf = {}) {
        this.manager = manager;
        this.service = service;
        this.channel = channel;

        this.userId = conf.userId;
        this.name = conf.name;
        this.messageId = conf.messageId;
        this._id = conf._id;
    }

    get url() {
        return this.getURL(false);
    }

    getURL(fat = false) {
        return this.service.formatURL(this, fat);
    }

    async delete() {
        if (!this.messageId) return;

        const onlineMessage = await this.channel.fetchMessage(this.messageId).catch(() => { });
        this.messageId = null;
        if (!onlineMessage || !(onlineMessage.deletable && !onlineMessage.deleted)) return;

        await onlineMessage.delete().catch(() => { });
    }
}

class OnlineChannel extends Channel {
    constructor(manager, service, channel, conf = {}) {
        if (manager instanceof Channel && arguments.length === 2) {
            conf = service;
            super(manager.manager, manager.service, manager.channel, manager);
        } else {
            super(manager, service, channel, conf);
        }

        this.title = conf.title;
        this.totalviews = conf.totalviews;
        this.followers = conf.followers;
        this.avatar = conf.avatar;
        this.thumbnail = conf.thumbnail;
        this.nsfw = !!conf.nsfw;
        this.category = conf.category;
        this.tags = conf.tags;

        this.message = null;
    }

    setMessage(m) {
        this.message = m;
    }

    async delete() {
        if (this.messageId && !this.message) {
            const onlineMessage = await this.channel.fetchMessage(this.messageId).catch(() => { });
            this.messageId = null;
            if (!onlineMessage) return;
            this.message = onlineMessage;
        }

        if (this.message.deletable && !this.message.deleted)
            await this.message.delete().catch(() => { });

        this.messageId = null;
        this.message = null;
    }
}

class Config {
    constructor(service, channel, name, userId, _id) {
        this.service = service;
        this.channel = channel || null;
        this.name = name || null;
        this.userId = userId || null;
        this._id = _id || null;
    }
}

module.exports = async function install(cr, client, config, db) {
    const manager = new Manager(db, client, [
        Picarto,

    ]);

    const alertCommand = cr.register("alert", new TreeCommand)
        .setHelp(new HelpContent()
            .setDescription("Make Trixie announce streamers when they go live.\nWorks only with Picarto at the moment.")
            .setUsage("<page url> <?channel>", "Subscribe Trixie to a Picarto channel!")
            .addParameter("page url", "copy the url of the stream page and paste it in here")
            .addParameterOptional("channel", "the channel to post the alert to later. If omitted will be this channel"))
        .setCategory(Category.MODERATION);

    /**
     * SUB COMMANDS
     */

    alertCommand.registerSubCommand("remove", new class extends BaseCommand {
        async call(message, url) {
            if (url === "") {
                return;
            }

            const g_channel = message.mentions.channels.first() || message.channel;

            if (!/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/.test(url)) {
                await message.channel.sendTranslated("`page url` should be a vaid url! Instead I got a lousy \"{{url}}\"", {
                    url
                });
                return;
            }

            const config = await manager.parseConfig(g_channel, url);
            if (!config) {
                await message.channel.sendTranslated("MMMMMMMMMMMMHHHHHHHH I don't know this website :c");
                return;
            }
            if (!config.name) {
                await message.channel.sendTranslated("You should also give me your channel page in the url instead of just the site!");
                return;
            }
            if (!config.userId || !config._id) {
                await message.channel.sendTranslated("I was not subscribed to this streamer.");
                return;
            }

            await manager.removeChannel(config);

            await message.channel.sendTranslated("Stopped alerting for {{name}}", {
                name: config.name
            });
        }
    })
        .setHelp(new HelpContent().setUsage("<page url>", "unsubscribe Trixie from a Picarto channel"));

    alertCommand.registerSubCommand("list", new class extends BaseCommand {
        async call(message) {
            const s_channels = await manager.getChannels(message.guild);

            if (s_channels.length === 0) {
                await message.channel.sendTranslated("Hehe, nothing here lol. Time to add some.");
                return;
            }

            /** @type {Map<any, Channel>} */
            const sorted_by_channels = new Map;
            for (const s_channel of s_channels)
                sorted_by_channels.set(s_channel.channel, [...(sorted_by_channels.get(s_channel.channel) || []), s_channel]);

            const embed = new Discord.RichEmbed().setColor(CONST.COLOR.PRIMARY);
            for (const [g_channel, s_channels] of sorted_by_channels) {
                let str = "";
                for (const s_channel of s_channels) str += s_channel.getURL(true) + "\n";

                embed.addField("#" + g_channel.name, str);
            }

            await message.channel.send({ embed });
        }
    })
        .setHelp(new HelpContent().setUsage("", "list all active streaming alerts"));

    alertCommand.registerDefaultCommand(new class extends BaseCommand {
        async call(message, content) {
            if (content === "") {
                return;
            }
            const g_channel = message.mentions.channels.first() || message.channel;

            const url = content.replace(new RegExp(g_channel.toString(), "g"), "").trim();
            if (url === "") {
                await message.channel.sendTranslated("`page url` should be a vaid url! Instead I got nothing");
                return;
            }
            if (!/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/.test(url)) {
                await message.channel.sendTranslated("`page url` should be a vaid url! Instead I got a lousy \"{{url}}\"", {
                    url
                });
                return;
            }

            const config = await manager.parseConfig(g_channel, url);
            if (!config) {
                await message.channel.sendTranslated("MMMMMMMMMMMMHHHHHHHH I don't know this website :c");
                return;
            }
            if (!config.name) {
                await message.channel.sendTranslated("You should also give me your channel page in the url instead of just the site!");
                return;
            }
            if (!config.userId) {
                await message.channel.sendTranslated("That user does not exist!");
                return;
            }
            console.log(config);
            if (config._id) {
                await message.channel.sendTranslated("This server is already subscribed to this streamer.");
                return;
            }

            await manager.addChannel(config);

            await message.channel.sendTranslated("Will be alerting y'all there when {{name}} goes online!", {
                name: config.name
            });
        }
    });

    alertCommand.registerSubCommandAlias("*", "add");
};