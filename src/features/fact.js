const { promisify } = require("util");
const { timeout } = require("../modules/util");
const log = require("../modules/log");
const Twit = require("twit");
const Command = require("../class/Command");

Array.prototype.last = function lastItem() {
    return this[this.length - 1];
};
Array.prototype.random = function randomItem() {
    return this[Math.floor(Math.random() * this.length)];
};

const twitter = new Twit(require("../../keys/twitter.json"));
twitter.get = promisify(twitter.get);

const facts = new Set();

const firstSetLoaded = new Promise(async function loadTweets(resolve) {
    let tweets_available = true;
    let smallest_id = null;
    let newest_id = null;
    while (tweets_available) {
        const data = await twitter.get("statuses/user_timeline", {
            screen_name: "UberFacts",
            count: 200,
            include_rts: false,
            exclude_replies: true,
            trim_user: true,
            max_id: smallest_id || void 0
        });
        if (!newest_id) newest_id = data[0].id_str;
        if (data.length <= 1) tweets_available = false;
        else {
            smallest_id = data.last().id_str;
            data.filter(tweet => !tweet.entities.urls[0]).map(tweet => facts.add(tweet.text));
        }
        resolve(facts); // indicates that the set now has a few values, and then just continue fetching more
        await timeout(60000 * 15 / 900); // care about rate limits
    }

    log("Loaded all uberfacts:", facts.size);
}).catch(log);

async function getFact() {
    const facts = await firstSetLoaded;
    return [...facts].random();
}

class FactCommand extends Command {
    async onmessage(message) {
        if (!message.prefixUsed) return;
        if (!/^fact\b/i.test(message.content)) return;

        const fact = await getFact();
        await message.channel.send(fact);
        log("Fact requested");
    }
    usage(prefix) {
        return `\`${prefix}fact\` gets random UberFacts fact`;
    }
}

module.exports = FactCommand;
