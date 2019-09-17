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

const random = require("random-number-csprng");

module.exports = async function secureRandom(...args) {
    if (args.length === 0) {
        return (await random(0, 99)) / 100;
    } else if (args.length === 1) {
        if (typeof args[0] === "number") {
            return args[0] <= 1 ? 0 : await random(0, args[0] - 1);
        } else if (args[0] instanceof Array) {
            return args[0].length <= 1 ? args[0][0] : args[0][await random(0, args[0].length - 1)];
        } else {
            throw new TypeError("First argument should be number or Array");
        }
    } else if (args.length === 2) {
        return args[0] === args[1] ||
            args[0] === args[1] - 1 ? 0 : await random(args[0], args[1] - 1);
    }
};
