/*
 * Copyright (C) 2018-2019 Christian Schäfer / Loneless
 *
 * TrixieBot is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * TrixieBot is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const log = require("../../log").namespace("owner cmd");
const fs = require("fs-extra");
const { exec } = require("child_process");
const path = require("path");
const { promisify } = require("util");
const { findDefaultChannel } = require("../../util/util");
const { resolveStdout } = require("../../util/string");
const { splitArgs } = require("../../util/string");
const ipc = require("../../modules/concurrency/ipc");
const Discord = require("discord.js");

const SimpleCommand = require("../../core/commands/SimpleCommand");
const BaseCommand = require("../../core/commands/BaseCommand");
const Category = require("../../util/commands/Category");
const CommandScope = require("../../util/commands/CommandScope");

const extnames = {
    ".js": "javascript",
    ".css": "css",
    ".html": "html",
    ".md": "markdown",
    ".json": "json",
};

// eslint-disable-next-line no-unused-vars
module.exports = function install(cr, client, config, db) {
    cr.registerCommand("file", new class extends BaseCommand {
        async noPermission(message) { await message.channel.sendTranslated("no"); }

        async call(message, msg) {
            const file = path.resolve(path.join(process.cwd(), msg));
            if (!(await fs.exists(file))) {
                await message.channel.send("Doesn't exist");
                return;
            }

            const stat = await fs.stat(file);

            if (!stat.isFile()) {
                await message.channel.send("Not a file. Sorry :(");
                return;
            }

            if (stat.size > 1024 * 15) {
                await message.channel.send(`File too big. Should be smaller than 15kb, but this one is freaking huuuuuge: ${stat.size / 1024}kb`);
                return;
            }

            const language = extnames[path.extname(msg)] || "";
            const highWaterMark = 2000 - (2 * 4) - language.length;

            let tmp = await fs.readFile(file, { encoding: "utf8" });

            while (tmp.length > 0) {
                let lastIndex = tmp.substring(0, highWaterMark).lastIndexOf("\n");
                const result = tmp.substring(0, lastIndex).replace(/`/g, "´");
                tmp = tmp.substring(lastIndex + 1);
                await message.channel.send(`\`\`\`${result}\`\`\``);
            }

            log(`Sent file contents of ${msg}`);
        }
    }).setIgnore(false).setCategory(Category.OWNER);

    cr.registerCommand("exec", new SimpleCommand(async (message, msg) => {
        const content = await promisify(exec)(msg);
        let escaped = resolveStdout("Out:\n" + content.stdout + "\nErr:\n" + content.stderr);

        while (escaped.length > 0) {
            let lastIndex = escaped.substring(0, 2000 - (2 * 3)).lastIndexOf("\n");
            const result = escaped.substring(0, lastIndex).replace(/`/g, "´");
            escaped = escaped.substring(lastIndex + 1);
            await message.channel.send(`\`\`\`${result}\`\`\``);
        }

        log(`Sent stdout for command ${msg}`);
    })).setIgnore(false).setCategory(Category.OWNER);

    cr.registerCommand("eval", new SimpleCommand(async (message, msg) => {
        const content = await eval(`(async () => {${msg}})()`);
        await message.channel.send("```\n" + content + "\n```");
        log(`Evaluated ${msg} and sent result`);
    })).setIgnore(false).setCategory(Category.OWNER);

    cr.registerCommand("broadcast", new SimpleCommand((message, msg) => {
        client.guilds.forEach(guild => {
            if (!guild.available) return;
            const defaultChannel = findDefaultChannel(guild);
            if (!defaultChannel) return;
            defaultChannel.send("Broadcast from creator", {
                embed: new Discord.RichEmbed().setDescription(msg),
            }).catch(() => { /* Do nothing */ });
        });
        log(`Broadcasted message ${msg}`);
    })).setIgnore(false).setCategory(Category.OWNER);

    cr.registerCommand("send", new SimpleCommand((message, msg) => {
        const s = splitArgs(msg, 2);
        const guild = client.guilds.get(s[0]);
        if (!guild.available) return;
        const defaultChannel = findDefaultChannel(guild);
        defaultChannel.send(s[1]);
    })).setIgnore(false).setCategory(Category.OWNER);

    cr.registerCommand("backup", new SimpleCommand(async message => {
        const url = await ipc.awaitAnswer("admin:mongoarchive");

        await message.channel.send(`Get your archive here: ${url}`);
    }))
        .setCategory(Category.OWNER)
        .setScope(CommandScope.FLAGS.DM);

    cr.registerCommand("reboot", new SimpleCommand(async message => {
        await message.channel.send("Gracefully rebooting...");

        await client.destroy();
        process.exit();
    }))
        .setCategory(Category.OWNER)
        .setScope(CommandScope.ALL);
};
