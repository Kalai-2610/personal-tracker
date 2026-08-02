class CacheMechanism {
    static cache = new Map();
    
    static set(key, value) {
        this.cache.set(key, value);
    }

    static get(key) {
        return this.cache.get(key);
    }

    static has(key) {
        return this.cache.has(key);
    }

    static delete(key) {
        return this.cache.delete(key);
    }

    static clear() {
        this.cache.clear();
    }
}

module.exports = CacheMechanism;