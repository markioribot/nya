const log = require("../modules/log");
const Command = require("../modules/Command");

const available_roles = {
    "Artist Stuff": [
        "artist",
        "Commissions Open"
    ],
    "Conventions/Meetups": [
        "GalaCon 2018",
        "DerpyFest 2018"
    ]
};

let roles_message = "";
for (let category in available_roles) {
    roles_message += `__**${category}**__\n`;
    roles_message += "```\n";
    for (let role of available_roles[category])
        roles_message += `${role}\n`;
    roles_message += "```\n";
}

const roles_array = {};
for (let category in available_roles)
    for (let role of available_roles[category])
        roles_array[role.toLowerCase()] = role;

const command = new Command(async function onmessage(message) {
    let text = message.content.toLowerCase();
    if (text.startsWith("!selfrole remove")) {
        text = text.trim().split(/ +/g).join(" "); // remove double spaces
        let role = text.replace("!selfrole remove", "");
        if (role === "") {
            message.channel.send(this.usage);
            return;
        }
        role = role.substring(1);

        if (!roles_array[role]) {
            message.channel.send("Hmm... I couldn't really find your role. Check that again");
            return;
        }

        const role_obj = message.guild.roles.find("name", roles_array[role]);
        if (!role_obj) {
            message.channel.send("Uh apparently this server doesn't have this role available right now.");
            return;
        }

        if (!message.member.roles.has(role_obj.id)) {
            message.channel.send("Can't remove a role without having it first.");
            return;
        }

        await message.member.removeRole(role_obj);
        message.channel.send("Role removed.");
        log(`Removed role ${roles_array[role]} from user ${message.member.user.username}`);
    }
    else if (text.startsWith("!selfrole")) {
        text = text.trim().split(/ +/g).join(" "); // remove double spaces
        let role = text.replace("!selfrole", "");
        if (role === "") {
            message.channel.send(this.usage);
            return;
        }
        role = role.substring(1);

        if (!roles_array[role]) {
            message.channel.send("Hmm... I couldn't really find your role. Here's a list of available ones:\n" + roles_message);
            return;
        }

        const role_obj = message.guild.roles.find("name", roles_array[role]);
        if (!role_obj) {
            message.channel.send("Uh apparently this server doesn't have this role available right now.");
            return;
        }

        if (message.member.roles.has(role_obj.id)) {
            message.channel.send("You already have this role! Yay?");
            return;
        }

        await message.member.addRole(role_obj);
        message.channel.send("Role added! /)");
        log(`Added role ${roles_array[role]} to user ${message.member.user.username}`);
    }
}, {
    usage: `\`!selfrole <role>\` to add
\`role\` - The role you would like to have added

\`!selfrole remove <role>\` to remove
\`role\` - The role you would like to have removed`
});

module.exports = command;
