const assertErased = (ix, value) => {
    if (value !== ix) {
        throw new Error(`Erase Failed at ${ix}`)
    }
}

const assertFound = (ix, value) => {
    if (value !== ix) {
        throw new Error(`Find Failed at ${ix}`)
    }
}

const assertNotFound = (ix, value) => {
    if (value !== null && value >= 0) {
        throw new Error(`Should have removed at ${ix}`)
    }
}

const assertNotErased = (ix, value) => {
    if (value !== null && value >= 0) {
        throw new Error(`Should have removed at ${ix}`)
    }
}

const assertEquals = (exp, found) => {
    if (exp !== found) {
        throw new Error(`Expected ${JSON.stringify(exp)}. Found: ${JSON.stringify(found)}`)
    }
}

const range = function* (from, to) {
    while (from < to) {
        yield from++
    }
}

const log = (...msg) => {
    console.log(`[${new Date().toISOString()}]`, ...msg)
}

const assertArrayEquals = (exp, found) => {
    if ((!exp && found) || (exp && !found)) {
        throw new Error(`Expected ${JSON.stringify(exp)}. Found: ${JSON.stringify(found)}`)
    }

    for (let i = 0; i < Math.min(exp.length, found.length); i++) {
        if (exp[i] !== found[i]) {
            throw new Error(`Expected ${JSON.stringify(exp[i])} at ${i}. Found: ${JSON.stringify(found[i])}`)
        }
    }

    if (exp.length !== found.length) {
        throw new Error(`Expected ${exp.length} entries. Found: ${found.length}`)
    }
}

const assertNull = v => {
    if (v) {
        throw new Error(`Expected null. Found: ${JSON.stringify(v)}`)
    }
}

const randomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min
}


const randomAlpha = (length) => {
    let s = ''

    for (var i = 0; i < length; i++) {
        s += String.fromCharCode(randomInt(65, 90))
    }

    return s
}

module.exports = {
    assertErased, assertFound, assertNotFound, assertNotErased,
    assertEquals, assertArrayEquals, assertNull,
    log, range, randomAlpha
}