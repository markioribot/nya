const secureRandom = require("../random/secureRandom");

class RandomChance {
    constructor() {
        this.array = [];
    }

    /**
     * Add items to the chances
     * @param {any} item 
     * @param {number} distribution 
     */
    add(item, distribution = 1) {
        for (let i = 0; i < distribution; i++) this.array.push(item);
    }

    /**
     * Pick a random item from the chances list
     * @returns {any}
     */
    async random() {
        return await secureRandom(this.array);
    }
}

module.exports = RandomChance;