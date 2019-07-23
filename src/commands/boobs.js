const fetch = require("node-fetch");
const CONST = require("../const");
const Discord = require("discord.js");

const SimpleCommand = require("../core/commands/SimpleCommand");
const HelpContent = require("../util/commands/HelpContent");
const Category = require("../util/commands/Category");
const CommandScope = require("../util/commands/CommandScope");

async function randomBoob(reconnectTries = 0) {
    let file;
    try {
        const response = await fetch("http://api.oboobs.ru/boobs/0/1/random");
        const result = await response.json();
        file = "http://media.oboobs.ru/" + result[0].preview.replace("_preview", "");
    } catch (err) {
        reconnectTries++;
        if (reconnectTries > 5) throw err;
        file = await randomBoob(reconnectTries);
    }

    return file;
}

module.exports = async function install(cr) {
    cr.registerCommand("boobs", new SimpleCommand(async () => {
        const url = await randomBoob();
        return new Discord.RichEmbed()
            .setColor(CONST.COLOR.PRIMARY)
            .setImage(url);
    }))
        .setHelp(new HelpContent().setDescription("I wonder what this does"))
        .setExplicit(true)
        .setCategory(Category.IMAGE)
        .setScope(CommandScope.ALL);
    cr.registerAlias("boobs", "boobies");
    cr.registerAlias("boobs", "bewbs");
};