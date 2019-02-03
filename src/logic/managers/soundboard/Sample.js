const path = require("path");
// eslint-disable-next-line no-unused-vars
const { User, Guild, VoiceConnection } = require("discord.js");

class Sample {
    /**
     * @param {SoundboardManager} manager 
     * @param {{}} doc 
     */
    constructor(manager, doc) {
        this.manager = manager;

        this.db = manager.samples;

        /** @type {string} */
        this.name = doc.name;
        /** @type {number} */
        this.plays = doc.plays;
        /** @type {string} */
        this.filename = doc.filename;
        /** @type {Date} */
        this.created_at = doc.created_at;
        /** @type {Date} */
        this.modified_at = doc.modified_at;
        /** @type {Date} */
        this.last_played_at = doc.last_played_at;
    }

    get file() {
        return path.join(this.manager.BASE, this.id + ".ogg");
    }

    get importable() {
        return true;
    }

    /**
     * @param {VoiceConnection} connection 
     */
    async play(connection) {
        const dispatcher = connection.playFile(this.file);
        dispatcher.once("start", () => {
            connection.player.streamingData.pausedTime = 0;
        });
        await this.db.then(db => db.updateOne({ id: this.id }, { $inc: { plays: 1 }, $set: { last_played_at: new Date } }));
        return dispatcher;
    }

    /**
     * @param {User} user
     */
    isOwner(user) {
        return this.owners.some(id => id === user.id);
    }
    /**
     * @param {Guild} guild
     */
    isGuild(guild) {
        return this.guilds.some(id => id === guild.id);
    }
}

class PredefinedSample extends Sample {
    /**
     * @param {SoundboardManager} manager
     * @param {{}} doc
     */
    constructor(manager, doc) {
        super(manager, doc);

        this.db = manager.predefined;
    }

    get file() {
        return path.join(this.manager.BASE, "predefined", this.name + ".ogg");
    }

    get importable() {
        return false;
    }

    /**
     * @param {VoiceConnection} connection 
     */
    async play(connection) {
        const dispatcher = connection.playFile(this.file);
        dispatcher.once("start", () => {
            connection.player.streamingData.pausedTime = 0;
        });
        await this.db.then(db => db.updateOne({ name: this.name }, { $inc: { plays: 1 }, $set: { last_played_at: new Date } }));
        return dispatcher;
    }

    isOwner() {
        return true;
    }
    isGuild() {
        return true;
    }
}

class UserSample extends Sample {
    /**
     * @param {SoundboardManager} manager
     * @param {{}} doc
     */
    constructor(manager, doc) {
        super(manager, doc);

        /** @type {SampleID} */
        this.id = doc.id;
        /** @type {string} */
        this.creator = doc.creator;
        /** @type {string[]} */
        this.owners = doc.owners;
        /** @type {string[]} */
        this.guilds = doc.guilds;
    }

    /**
     * @param {User} user
     */
    isCreator(user) {
        return this.creator === user.id;
    }
}

class GuildSample extends Sample {
    /**
     * @param {SoundboardManager} manager
     * @param {{}} doc
     */
    constructor(manager, doc) {
        super(manager, doc);

        /** @type {SampleID} */
        this.id = doc.id;
        /** @type {string} */
        this.guild = doc.guild;
        /** @type {string[]} */
        this.owners = doc.owners;
        /** @type {string[]} */
        this.guilds = doc.guilds;
    }

    /**
     * @param {Guild} guild
     */
    isCreator(guild) {
        return this.guild === guild.id;
    }
}

module.exports = {
    Sample,
    PredefinedSample,
    UserSample,
    GuildSample
};