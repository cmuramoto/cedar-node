const MAX = 100000000

const LOG_MODULUS = 10000000

const PAD = '00000000'

const pad = n => {
    return (PAD + n).slice(-PAD.length)
}

const { Cedar } = require('../index')

const { assertErased, assertFound, assertNotFound, assertNotErased, log, range } = require('./share')

const traceProgress = (v, cedar) => {
    if ((v + 1) % LOG_MODULUS === 0) {
        const args = ['Done', v + 1]
        if (cedar) {
            args.push(JSON.stringify(cedar.allocation()))
        }
        log(args)
    }
}

const ops = n => {
    n = MAX / n
    n = Math.round(n * 100) / 100
    return `${n}ops/ms`
}

const run = () => {

    const cedar = new Cedar()

    let now = new Date()
    for (const v of range(0, MAX)) {
        cedar.update(pad(v), v)

        traceProgress(v, cedar)
    }
    const w = new Date() - now
    log(`Write OK (${MAX} keys). Allocation: ${JSON.stringify(cedar.allocation())}`)

    now = new Date()
    for (const v of range(0, MAX)) {
        const key = pad(v)
        const value = cedar.find(key)

        assertFound(v, value)

        traceProgress(v)
    }
    const r = new Date() - now
    log(`Read OK (${MAX} keys).`)

    now = new Date()
    for (const v of range(0, MAX)) {
        const key = pad(v)
        const value = cedar.erase(key)

        assertErased(v, value)

        traceProgress(v)
    }
    const d = new Date() - now
    log(`Erase OK (${MAX} keys).`)

    now = new Date()
    for (const v of range(0, MAX)) {
        const key = pad(v)
        const value = cedar.find(key)

        assertNotFound(v, value)

        traceProgress(v)
    }
    const rd = new Date() - now
    log(`Read (erased) OK (${MAX} keys).`)

    now = new Date()
    for (const v of range(0, MAX)) {
        const key = pad(v)
        const value = cedar.erase(key)

        assertNotErased(v, value)

        traceProgress(v)
    }
    const ed = new Date() - now
    log(`Erased (erased) OK (${MAX} keys).`)

    log(`Write    ${w}ms. Avg: ${ops(w)}. Avg (-stall): ${ops(w - cedar.allocStall())}`)
    log(`Read     ${r}ms. Avg: ${ops(r)}`)
    log(`Erase    ${d}ms. Avg: ${ops(d)}`)
    log(`Read(E)  ${rd}ms. Avg: ${ops(rd)}`)
    log(`Erase(E) ${ed}ms. Avg: ${ops(ed)}`)
}


run()
