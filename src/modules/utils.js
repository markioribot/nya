const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");

module.exports.walk =
    /**
     * @param {string} dir 
     * @returns {Promise<string[]>}
     */
    function walk(dir) {
        return new Promise((resolve, reject) => {
            let results = [];

            fs.readdir(dir, (err, files) => {
                if (err) return reject(err);
                let pending = files.length;
                if (!pending) return resolve(results);

                for(let file of files) {
                    file = path.resolve(dir, file);

                    fs.stat(file, (err, stat) => {
                        if (err) return reject(err);
                        if (stat && stat.isDirectory()) {
                            walk(file).then(files => {
                                results = results.concat(files);
                                if (!--pending) resolve(results);
                            }).catch(err => reject(err));
                        } else {
                            results.push(file);
                            if (!--pending) resolve(results);
                        }
                    });
                }
            });
        });
    };

/**
 * @param {number} ms 
 * @returns {Promise<void>}
 */
module.exports.timeout = function timeout(ms) {
    return new Promise(res => setTimeout(res, ms));
};

/**
 * @param {string} string 
 */
module.exports.resolveStdout = function resolveStdout(string) {
    return string.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
};

module.exports.roll = async function roll(array, roller, end) {
    return new Promise(resolve => {
        let index = 0;
        const next = () => {
            index++;
            if (index < array.length) {
                const r = roller(array[index], index, () => next());
                if (r.then) r.then(() => next());
            } else {
                if (end) { end(); resolve(); }
            }
        };
        if (array.length === 0) {
            if (end) end();
            resolve();
            return;
        }
        const r = roller(array[index], index, next);
        if (r.then) r.then(next);
    });
};

module.exports.isPlainObject = function isPlainObject(input) {
    return input && !Array.isArray(input) && typeof input === "object";
};

module.exports.findDefaultChannel = function findDefaultChannel(guild) {
    return guild.channels.find(c => new RegExp("general", "g").test(c.name)) ||
        guild.channels
            .filter(c => c.type === "text" && c.send && {}.toString.call(c.send) === "[object Function]")
            .sort((a, b) => a.position - b.position)
            .find(c => c.permissionsFor(guild.me).has("SEND_MESSAGES"));
};

const ownerId = "108391799185285120";
module.exports.isOwner = function isOwner(member) {
    if (member instanceof Discord.GuildMember) member = member.user;
    const id = member.id;
    return id === ownerId;
};