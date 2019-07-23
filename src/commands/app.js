const INFO = require("../info");
const CONST = require("../const");
const Discord = require("discord.js");

const TextCommand = require("../core/commands/TextCommand");
const SimpleCommand = require("../core/commands/SimpleCommand");
const HelpContent = require("../util/commands/HelpContent");
const Category = require("../util/commands/Category");
const CommandScope = require("../util/commands/CommandScope");

module.exports = async function install(cr, client) {
    cr.registerCommand("donate", new TextCommand("https://paypal.me/loneless ❤"))
        .setHelp(new HelpContent().setDescription("**TrixieBot costs $12 a month and a lot of time to maintain.**\nIf you like this bot, please consider giving the devs a little tip ❤"))
        .setCategory(Category.INFO)
        .setScope(CommandScope.ALL);    

    cr.registerCommand("version", new TextCommand(`v${INFO.VERSION}`))
        .setHelp(new HelpContent().setDescription("Returns the currently running version of TrixieBot"))
        .setCategory(Category.INFO)
        .setScope(CommandScope.ALL);
    cr.registerAlias("version", "v");

    if (INFO.INVITE) cr.registerCommand("invite", new TextCommand(INFO.INVITE))
        .setHelp(new HelpContent().setDescription("Gives a link to invite TrixieBot to your own server."))
        .setCategory(Category.INFO)
        .setScope(CommandScope.ALL);

    cr.registerCommand("vote", new TextCommand(":eyes: https://discordbots.org/bot/397037692963258368/vote"))
        .setHelp(new HelpContent().setDescription("Vote for TrixieBot on bot listing sites! Pls"))
        .setCategory(Category.INFO)
        .setScope(CommandScope.ALL);
    
    cr.registerCommand("trixie", new SimpleCommand(m => ({
        embed: new Discord.RichEmbed()
            .setColor(CONST.COLOR.PRIMARY)
            .setAuthor("TrixieBot", client.user.avatarURL, INFO.WEBSITE)
            .setDescription("**Trixie is an all-in-one Discord Bot for pony lovers**\n\n" +
                "She offers a variety of great features, many of which to satisfy the needs of My Little Pony fans and server admins.\n\n" +
                "Her set of commands range from utility stuff, simple fun, imageboard commands, custom commands, soundboards, to even a full web dashboard to configure Trixie and watch the growth of your server and so much more!\n" +
                "For a list of all commands, go `" + m.prefix + "help`.\n\n" + 
                (INFO.WEBSITE ? ("Website " + INFO.WEBSITE + "\n" + 
                "Web Dashboard " + INFO.WEBSITE + "/dashboard") : ""))
            .setFooter(`TrixieBot v${INFO.VERSION}`)
    })))
        .setHelp(new HelpContent().setDescription("First command to call."))
        .setCategory(Category.INFO)
        .setScope(CommandScope.ALL);
};