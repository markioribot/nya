const config = require("../config");
const log = require("../log");
const fetch = require("node-fetch");

const SimpleCommand = require("../core/commands/SimpleCommand");
const HelpContent = require("../util/commands/HelpContent");
const Category = require("../util/commands/Category");
const CommandScope = require("../util/commands/CommandScope");

function getArtist(tags) {
    const arr = tags.split(/,\s*/g);
    for (const tag of arr) {
        if (/^artist:[\w\s]+/gi.test(tag)) {
            const artist = tag.replace(/^artist:/i, "");
            return artist;
        }
    }
}

async function get(params) {
    const scope = params.scope || "search";
    delete params.scope;

    let string = [];
    for (const key in params)
        string.push(key + "=" + params[key]);
    string = string.join("&");

    const result = await fetch(`https://derpibooru.org/${scope}.json?key=${config.get("derpibooru.key")}&${string}`, {
        timeout: 10000
    });
    return await result.json();
}

const filter_tags = ["underage", "foalcon", "bulimia", "self harm", "suicide", "animal cruelty", "gore", "foal abuse"];

const tags = ["pony", "vulva", "-penis", "nudity", "-photo", ...filter_tags.map(tag => "-" + tag), "upvotes.gte:150"];

const query = tags.map(t => encodeURIComponent(t)).join(",").replace(/\s+/g, "+").toLowerCase();

async function process(message) {
    const image = await get({
        q: query,
        random_image: "true"
    }).then(({ id }) => get({
        scope: id
    }));

    const artist = getArtist(image.tags);

    let str = "";
    if (artist) str += `**${artist}** `;
    str += `*<https://derpibooru.org/${image.id}>* `;
    str += `https:${image.representations.large}`;

    await message.channel.send(str);
}

module.exports = async function install(cr) {
    if (!config.has("derpibooru.key")) return log.namespace("config", "Found no API token for Derpibooru - Disabled horsepussy command");

    cr.registerCommand("horsepussy", new SimpleCommand(message => process(message)))
        .setHelp(new HelpContent()
            .setDescription("Get some gud quality horse pussi OwO"))
        .setExplicit(true)
        .setCategory(Category.IMAGE)
        .setScope(CommandScope.ALL);

    cr.registerAlias("horsepussy", "horsepussi");
    cr.registerAlias("horsepussy", "ponypussy");
    cr.registerAlias("horsepussy", "ponypussi");
    cr.registerAlias("horsepussy", "ponepussi");
    cr.registerAlias("horsepussy", "ponypoossy");
};