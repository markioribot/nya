const CONST = require("../modules/CONST");
const Discord = require("discord.js");

const BaseCommand = require("../class/BaseCommand");
const HelpContent = require("../logic/commands/HelpContent");
const Category = require("../logic/commands/Category");

const { userToString } = require("../modules/util");

module.exports = async function install(cr) {
    cr.register("whois", new class extends BaseCommand {
        async call(message) {
            const member = message.alt_mentions.members.first() || message.member;

            const embed = new Discord.RichEmbed().setColor(CONST.COLOR.PRIMARY);

            embed.setAuthor(userToString(member, true), member.user.avatarURL);
            embed.setThumbnail(member.user.avatarURL);

            const profile = await member.user.fetchProfile().then(profile => profile).catch(() => null);

            if (member.user.bot) embed.addField("Is Bot", "✅");
            embed.addField("ID", member.user.id, true);
            if (member.nickname) embed.addField("Nickname", member.nickname, true);
            embed.addField("Status", member.user.presence.status, true);
            if (member.user.presence.game) embed.addField("Game", member.user.presence.game, true);
            if (profile && profile.premium) embed.addField("Discord Nitro", profile.premiumSince ? "Since " + profile.premiumSince.toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "✅");
            embed.addField("Registered", member.user.createdAt.toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC", true);
            embed.addField("Joined", member.joinedAt.toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC", true);
            if (member.highestRole) embed.addField("Highest Role", member.highestRole, true);

            await message.channel.send({ embed });
        }
    })
        .setHelp(new HelpContent()
            .setDescription("Receive information about a user or about yourself")
            .setUsage("<@user>")
            .addParameterOptional("@user", "If given, return info about that user, otherwise return info about yourself"))
        .setCategory(Category.INFO);
};