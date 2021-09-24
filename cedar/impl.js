/*eslint-disable */

const CEDAR_NO_VALUE = -1
const NONE = -2
const ASSERTIONS = true
// (cedar:primitive fields) + (iobuffers:[pos,capacity,length]) + (header:offsets)
const FIELD_OVERHEAD = (7 * 4) + (12 * 4) + (5 * 4)

const range = function* (from, to) {
    while (from < to) {
        yield from++
    }
}

const expect_buffer = b => {
    if (ASSERTIONS && (b?.constructor?.name !== 'Buffer')) {
        throw new Error(`Expected buffer. Was ${b}`)
    }
    return b
}

const utf8 = s => {
    return typeof s === 'string' ? Buffer.from(s, 'utf-8') : expect_buffer(s)
}

const BlockType = {
    Full: 0,
    Closed: 1,
    Open: 2
}

const debug_assert = (expect, msg = '') => {
    if (ASSERTIONS && !expect) {
        throw new Error(msg)
    }
}

class IOBuffer {
    constructor (cap, unit) {
        this.buffer = Buffer.alloc(unit * cap)
        this.unit = unit
        this.cap = cap
        this.pos = 0
    }

    static preLoad (buffer, offset, unit, proto) {
        const o = {}
        o.unit = unit
        const len = buffer.readInt32LE(offset)
        o.pos = buffer.readInt32LE(offset + 4)
        o.cap = buffer.readInt32LE(offset + 8)
        o.buffer = Buffer.alloc(len)

        return Object.setPrototypeOf(o, proto)
    }

    align (offset) {
        const rem = offset % this.unit
        return offset + rem
    }

    grow (more = 1) {
        const newLen = more * this.unit + this.byteLength

        const next = Buffer.alloc(newLen)

        this.buffer.copy(next)

        this.buffer = next

        this.cap += more
    }

    resize (newSize, set = (buffer, off) => { }) {
        const newLen = newSize * this.unit

        const next = Buffer.alloc(newLen)

        this.buffer.copy(next, 0, 0, Math.min(this.buffer.byteLength, next.byteLength))

        let ix = this.pos
        this.pos = newSize
        this.buffer = next
        this.cap = newSize

        let off = this.toOffset(ix)
        for (; ix < newSize; ix++) {
            set(next, off)
            off += this.unit
        }
    }

    growIfFull (more = 64) {
        if (this.pos >= this.cap) {
            this.grow(more)
        }
    }

    jump () {
        this.pos = this.cap
    }

    get capacity () {
        return this.buffer.byteLength / this.unit
    }

    get byteLength () {
        return this.buffer.byteLength
    }

    get metadataLength () {
        return 16
    }

    get offset () {
        return this.unit * this.pos
    }

    toOffset (index) {
        return index * this.unit
    }

    safeOffset (index) {
        const off = this.toOffset(index)
        if (ASSERTIONS && (index < 0 || index >= this.pos || (off + this.unit) > this.byteLength)) {
            throw new Error(`Out of bounds ${index}`)
        }
        return off
    }

    zeroOut () {
        this.buffer.fill(0)
    }

    * stream () {
        const span = range(0, this.pos)

        for (const ix of span) {
            yield this.at(ix)
        }
    }

    at (index) {
        const off = this.safeOffset(index)
        return this.toObj(off)
    }

    storeMeta (buffer, offset) {
        buffer.writeInt32LE(this.byteLength, offset)
        buffer.writeInt32LE(this.pos, offset + 4)
        buffer.writeInt32LE(this.cap, offset + 8)
        return offset + 12
    }

    storeData (target, offset) {
        this.buffer.copy(target, offset)
    }

    loadData (source, offset) {
        source.copy(this.buffer, 0, offset, offset + this.byteLength)
    }

    compare (other) {
        if (!other) {
            return false
        }
        if (other === this) {
            return true
        }

        if (this.unit !== other.unit || this.cap !== other.cap ||
            this.pos !== other.pos || this.byteLength !== other.byteLength) {
            return false
        }

        for (let i = 0; i < this.buffer.length; i++) {
            const ti = this.buffer[i]
            const oi = other.buffer[i]
            if (ti !== oi) {
                return false
            }
        }

        return true
    }
}

class NodeBuffer extends IOBuffer {

    constructor (cap) {
        super(cap, 8)
    }

    static preLoad (buffer, offset) {
        return IOBuffer.preLoad(buffer, offset, 8, NodeBuffer.prototype)
    }

    push (base, check) {
        this.growIfFull()
        this.buffer.writeInt32LE(base, this.offset)
        this.buffer.writeInt32LE(check, this.offset + 4)
        this.pos++
    }

    base (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt32LE(off)
    }

    check (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt32LE(off + 4)
    }

    update (ix, base, check) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt32LE(base, off)
        this.buffer.writeInt32LE(check, off + 4)
    }

    update_base (ix, base) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt32LE(base, off)
    }

    update_check (ix, check) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt32LE(check, off + 4)
    }

    push_node ({ base, check }) {
        this.push(base, check)
    }

    toObj (off) {
        const buffer = this.buffer
        const base = buffer.readInt32LE(off)
        const check = buffer.readInt32LE(off + 4)
        return { base, check }
    }

    resize (newSize) {
        super.resize(newSize, (buffer, off) => {
            buffer.writeInt32LE(0, off)
            buffer.writeInt32LE(0, off + 4)
        })
    }

    [Symbol.iterator] () {
        return this.stream()
    }
}

class NInfoBuffer extends IOBuffer {

    static preLoad (buffer, offset) {
        return IOBuffer.preLoad(buffer, offset, 2, NInfoBuffer.prototype)
    }

    constructor (cap) {
        super(cap, 2)
    }

    /**
     *
     * @param {number} sibling
     * @param {number} child
     */
    push (sibling, child) {
        this.growIfFull()
        const off = this.offset
        this.buffer.writeUInt8(sibling, off)
        this.buffer.writeUInt8(child, off + 1)
        this.pos++
    }

    toObj (off) {
        const buffer = this.buffer
        const sibling = buffer.readUInt8(off)
        const child = buffer.readUInt8(off + 1)
        return { sibling, child }
    }

    resize (newSize) {
        super.resize(newSize, (buffer, off) => {
            buffer.writeUInt8(0, off)
            buffer.writeUInt8(0, off + 1)
        })
    }

    child (index) {
        const off = this.safeOffset(index)
        return this.buffer.readUInt8(off + 1)
    }

    sibling (index) {
        const off = this.safeOffset(index)
        return this.buffer.readUInt8(off)
    }

    update_child (index, child) {
        const off = this.safeOffset(index)
        this.buffer.writeUInt8(child, off + 1)
    }

    update_sibling (index, sibling) {
        const off = this.safeOffset(index)
        this.buffer.writeUInt8(sibling, off)
    }

    update (index, sibling, child) {
        const off = this.safeOffset(index)
        this.buffer.writeUInt8(sibling, off)
        this.buffer.writeUInt8(child, off + 1)
    }

    [Symbol.iterator] () {
        return this.stream()
    }
}

class BlockBuffer extends IOBuffer {

    static preLoad (buffer, offset) {
        return IOBuffer.preLoad(buffer, offset, 20, BlockBuffer.prototype)
    }

    constructor (cap) {
        super(cap, 20)
    }

    push (prev, next, num, reject, trial, eHead) {
        this.growIfFull()
        const off = this.offset
        const buffer = this.buffer
        buffer.writeInt32LE(prev, off)
        buffer.writeInt32LE(next, off + 4)
        buffer.writeInt16LE(num, off + 8)
        buffer.writeInt16LE(reject, off + 10)
        buffer.writeInt32LE(trial, off + 12)
        buffer.writeInt32LE(eHead, off + 16)
        this.pos++
    }

    pushDefault () {
        this.push(0, 0, 256, 257, 0, 0)
    }

    resize (newSize) {
        super.resize(newSize, (buffer, off) => {
            buffer.writeInt32LE(0, off)
            buffer.writeInt32LE(0, off + 4)
            buffer.writeInt16LE(256, off + 8)
            buffer.writeInt16LE(257, off + 10)
            buffer.writeInt32LE(0, off + 12)
            buffer.writeInt32LE(0, off + 16)
        })
    }

    toObj (off) {
        const buffer = this.buffer
        const prev = buffer.readInt32LE(off)
        const next = buffer.readInt32LE(off + 4)
        const num = buffer.readInt16LE(off + 8)
        const reject = buffer.readInt16LE(off + 10)
        const trial = buffer.readInt32LE(off + 12)
        const eHead = buffer.readInt32LE(off + 16)

        return { prev, next, num, reject, trial, eHead }
    }

    update_prev (ix, prev) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt32LE(prev, off)
    }

    update_next (ix, next) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt32LE(next, off + 4)
    }

    update_num (ix, num) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt16LE(num, off + 8)
    }

    update_reject (ix, reject) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt16LE(reject, off + 10)
    }

    update_trial (ix, trial) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt16LE(trial, off + 12)
    }

    update_head (ix, eHead) {
        const off = this.safeOffset(ix)
        this.buffer.writeInt32LE(eHead, off + 16)
    }

    increment_num (ix, val) {
        const off = this.safeOffset(ix)
        const num = this.buffer.readInt16LE(off + 8)
        this.buffer.writeInt16LE(num + val, off + 8)
    }

    increment_trial (ix, val) {
        const off = this.safeOffset(ix)
        const trial = this.buffer.readInt16LE(off + 12)
        this.buffer.writeInt16LE(trial + val, off + 12)
    }

    prev (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt32LE(off)
    }

    next (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt32LE(off + 4)
    }

    num (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt16LE(off + 8)
    }

    reject (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt16LE(off + 10)
    }

    trial (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt32LE(off + 12)
    }

    head (ix) {
        const off = this.safeOffset(ix)
        return this.buffer.readInt32LE(off + 16)
    }

    [Symbol.iterator] () {
        return this.stream()
    }
}

class RejectBuffer extends IOBuffer {

    static preLoad (buffer, offset) {
        return IOBuffer.preLoad(buffer, offset, 2, RejectBuffer.prototype)
    }

    constructor (cap) {
        super(cap, 2)
    }

    /**
     *
     * @param {number} value
     */
    push (value) {
        this.growIfFull()
        this.buffer.writeInt16LE(value, this.offset)
        this.pos++
    }

    toObj (off) {
        return this.buffer.readInt16LE(off)
    }

    update (idx, value) {
        this.buffer.writeInt16LE(value, this.safeOffset(idx))
    }

    [Symbol.iterator] () {
        return this.stream()
    }
}

// No-ops in 56-bit math?
const as_i32 = v => v
const as_usize = v => v
const as_u8 = v => v & 0xFF


class Cedar {

    static deserialize (buffer) {
        return deserialize_cedar(buffer, Cedar.prototype)
    }

    constructor (ascii = true) {
        const array = new NodeBuffer(256)
        const infos = new NInfoBuffer(256)
        infos.zeroOut()
        infos.jump()
        const blocks = new BlockBuffer(1)
        blocks.pushDefault()

        const reject = new RejectBuffer(257)
        for (let j = 0; j < 257; j++) {
            reject.push(j + 1)
        }

        array.push_node({ base: 0, check: -1 })

        for (let i = 1; i < 256; i++) {
            array.push_node({
                base: -(i - 1),
                check: -(i + 1)
            })
        }

        array.update_base(1, -255)
        array.update_check(255, -1)

        blocks.update_head(0, 1)

        this.array = array
        this.infos = infos
        this.blocks = blocks
        this.reject = reject

        this.blocks_head_full = 0
        this.blocks_head_closed = 0
        this.blocks_head_open = 0
        this.capacity = 256
        this.size = 256
        this.ordered = true
        this.max_trial = 1
    }

    /**
     *
     * @param {string|Buffer} key (must be ascii)
     * @param {number} value
     */
    update (key, value) {
        if (value === CEDAR_NO_VALUE) {
            throw new Error(`Value can't be ${CEDAR_NO_VALUE}`)
        }
        key = utf8(key)
        const from = 0
        const pos = 0
        return update_trie(this, key, value, from, pos)
    }

    /**
     *
     * @param {string|Buffer} key
     * @param {{from:number}} ptr
     * @param {number} start
     * @param {number} end
     * @returns {number}
     */
    find (key, ptr = { from: 0 }, start = 0, end = -1) {
        key = utf8(key)
        debug_assert(start >= 0, 'Out of bounds')
        let to = 0
        let pos = 0
        end = (!end || end <= start) ? key.length : end
        const span = end - start
        const { array } = this

        while (pos < span) {
            to = as_usize(array.base(ptr.from) ^ as_i32(key[start + pos]))
            if (array.check(as_usize(to)) !== as_i32(ptr.from)) {
                return null
            }

            ptr.from = to
            pos++
        }

        const n = array.at(as_usize(array.base(ptr.from)))
        if (n.check !== as_i32(ptr.from)) {
            return CEDAR_NO_VALUE
        } else {
            return n.base
        }
    }

    prefixes (key) {
        return new PrefixIter(this, key)
    }

    predict (key) {
        return new PredictIter(this, key, false)
    }

    parse (text, onMatch = (begin, end, value) => { }) {
        for (const match of this.hits(text)) {
            onMatch(match.begin, match.end, match.value)
        }
    }

    erase (key) {
        const ptr = { from: 0 }
        const value = this.find(key, ptr)

        if (value !== null && value !== CEDAR_NO_VALUE) {
            erase_(this, ptr.from)
        }

        return value
    }

    * hits (text, noCopy = true) {
        for (const m of new ScanIter(this, text).stream(noCopy)) {
            yield m
        }
    }

    lookup (key) {
        const ptr = { from: 0 }

        const value = this.find(key, ptr)

        if (value !== null && value !== CEDAR_NO_VALUE) {
            return { value, from: ptr.from }
        }

        return null
    }

    dump () {
        const o = { ...this }
        o.array = [...o.array]
        o.infos = [...o.infos]
        o.blocks = [...o.blocks]
        o.reject = [...o.reject]
        return o
    }

    allocStall () {
        return this.alloc_stall || 0
    }

    allocation () {
        const { array, infos, blocks, reject } = this

        return {
            array: array.byteLength,
            infos: infos.byteLength,
            blocks: blocks.byteLength,
            reject: reject.byteLength,
            image: FIELD_OVERHEAD + array.byteLength + infos.byteLength + blocks.byteLength + reject.byteLength,
            stall: this.allocStall()
        }
    }

    /**
     *
     * @param {string[]} keys
     */
    build (keys) {
        for (let i = 0; i < keys.length; i++) {
            this.update(keys[i], i)
        }
    }

    serializeTo (buffer) {
        store_data(buffer, this)
    }

    serialize () {
        const buffer = Buffer.allocUnsafe(header(this).totalLen)
        this.serializeTo(buffer)
        return buffer
    }

    compare (other) {
        if (!other) {
            return false
        }

        if (other === this) {
            return true
        }

        for (const e of Object.entries(this)) {
            const [k, v] = e

            if ((typeof v === "number" || typeof v === "boolean") && v !== other[k]) {
                return false
            }
        }

        if (!this.array.compare(other.array) || !this.infos.compare(other.infos) ||
            !this.blocks.compare(other.blocks) || !this.reject.compare(other.reject)
        ) {
            return false
        }

        return true
    }

    /**
     * @param {number} len
     * @param {number} to
     * @param {Buffer|null} scratch
     * @returns
     */
    suffix (to, len, scratch, stringify = true) {
        const lim = len
        scratch = (!scratch || scratch.byteLength < len) ? Buffer.alloc(len) : scratch
        to = as_usize(to)
        while (len--) {
            const from = as_usize(this.array.check(to))
            scratch[len] = (this.array.base(from) ^ to) & 0xFF
            to = as_usize(from)
        }

        return stringify ? scratch.slice(0, lim).toString() : scratch
    }

    *keys (stringify = true) {
        const scratch = Buffer.alloc(256)

        for (const v of this.predict('')) {
            yield this.suffix(v.from, v.length, scratch, stringify)
        }
    }

    *indices () {
        for (const v of this.predict('')) {
            yield v.value
        }
    }

    *entries (stringify = true) {
        const scratch = Buffer.alloc(256)

        for (const v of this.predict('')) {
            yield {
                key: this.suffix(v.from, v.length, scratch, stringify),
                value: v.value
            }
        }
    }
}

class PrefixIter {
    /**
     * @param {Cedar} cedar
     * @param {Buffer} key
     * @param {number} from
     * @param {number} i
     */
    constructor (cedar, key) {
        this.cedar = cedar
        this.key = utf8(key)
    }

    [Symbol.iterator] () {
        return this.stream()
    }

    * stream () {
        const ptr = { from: 0 }
        let i = 0

        const { key, cedar } = this
        const limit = key.length

        while (i < limit) {
            const val = cedar.find(key, ptr, i, i + 1)
            if (val !== null) {
                if (val === CEDAR_NO_VALUE) {
                    i++
                    continue
                } else {
                    yield { at: i + 1, value: val }
                    i++
                }
            } else {
                break
            }
        }
    }
}

class PredictIter {
    /**
     * @param {Cedar} cedar
     * @param {string} key
     * @param {number} from
     * @param {number} i
     */
    constructor (cedar, key) {
        this.cedar = cedar
        this.key = utf8(key || '')
        this.from = 0
        this.p = 0
        this.root = 0
        this.value = CEDAR_NO_VALUE
    }

    [Symbol.iterator] () {
        return this.stream()
    }

    * stream (noAlloc = false) {
        const scratch = { value: CEDAR_NO_VALUE, from: 0, length: 0 }
        if (this.from === 0 && this.p === 0) {
            if (!this.key || this.cedar.find(this.key, this) !== null) {
                this.root = this.from

                begin(this.cedar, this.from, this.p, this)

                for (const v of this.next_until_none(scratch, noAlloc)) {
                    yield v
                }
            } else {
                return
            }
        } else {
            for (const v of this.next_until_none(scratch, noAlloc)) {
                yield v
            }
        }
    }

    * next_until_none (scratch, noAlloc = false) {
        while (this.value !== NONE) {
            scratch.value = this.value
            scratch.length = this.p
            scratch.from = this.from
            find_next(this.cedar, this)

            yield noAlloc ? scratch : { ...scratch }
        }
    }
}

class ScanIter {
    /**
     * @param {Cedar} cedar
     * @param {string} text
     * @param {number} from
     * @param {number} i
     */
    constructor (cedar, text) {
        this.cedar = cedar
        this.text = utf8(text)
    }

    [Symbol.iterator] () {
        return this.stream()
    }

    * stream (noCopy = true) {
        const ptr = { from: 0 }
        let i = 0
        const { text, cedar } = this
        const length = text.length
        const scratch = { begin: 0, end: 0, value: CEDAR_NO_VALUE }

        for (let base = 0; base < length; base++) {
            const limit = length - base
            while (i < limit) {
                const off = base + i
                const val = cedar.find(text, ptr, off, off + 1)

                if (val !== null) {
                    if (val === CEDAR_NO_VALUE) {
                        i++
                        continue
                    } else {
                        scratch.begin = base
                        scratch.end = base + i + 1
                        scratch.value = val

                        i++

                        yield noCopy ? scratch : { ...scratch }
                    }
                } else {
                    break
                }
            }
            i = 0
            ptr.from = 0
        }
    }
}



/**
 * @param {Cedar} cedar
 * @param {Buffer} key
 * @param {number} value
 * @param {number} from
 * @param {number} pos
 */
const update_trie = (cedar, key, value, from, pos) => {
    if (from === 0 && !key.length) {
        throw new Error('Failed to insert zero-length key')
    }

    while (pos < key.length) {
        from = follow(cedar, from, key[pos])
        pos++
    }

    const to = follow(cedar, from, 0)

    cedar.array.update_base(to, value)
    return value
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} from
 * @param {number} base
 * @param {number} label
 * @param {boolean} hasChild
 */
const push_sibling = (cedar, from, base, label, hasChild) => {
    let keep_order

    if (cedar.ordered) {
        keep_order = label > cedar.infos.child(from)
    } else {
        keep_order = cedar.infos.child(from) === 0
    }

    let sibling
    let c_ix = as_usize(from)
    let c = cedar.infos.child(c_ix)
    let is_child = true

    if (hasChild && keep_order) {
        is_child = false

        while (true) {
            const code = as_i32(c)
            c = cedar.infos.sibling(c_ix = as_usize(base ^ code))
            if (!(cedar.ordered && (c !== 0) && (c < label))) {
                break
            }
        }
    }

    sibling = c
    c = label

    if (is_child) {
        cedar.infos.update_child(c_ix, c)
    } else {
        cedar.infos.update_sibling(c_ix, c)
    }

    cedar.infos.update_sibling(as_usize(base ^ as_i32(label)), sibling)
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} from
 * @param {number} label
 * @returns
 */
const follow = (cedar, from, label) => {
    const base = cedar.array.base(from)

    let to = 0

    if (base < 0 || cedar.array.check(as_usize(base ^ as_i32(label))) < 0) {
        to = pop_e_node(cedar, base, label, as_i32(from))
        const branch = to ^ as_i32(label)

        push_sibling(cedar, from, branch, label, base >= 0)
    } else {
        to = base ^ as_i32(label)
        if (cedar.array.check(as_usize(to)) !== as_i32(from)) {
            to = resolve(cedar, from, base, label)
        }
    }

    return to
}

/**
 *
 * @param {Cedar} cedar
 * @returns
 */
const add_block = (cedar) => {
    if (cedar.size === cedar.capacity) {
        cedar.capacity += cedar.capacity
        let stall = new Date()
        cedar.array.resize(cedar.capacity)
        cedar.infos.resize(cedar.capacity)
        cedar.blocks.resize(cedar.capacity >> 8)
        cedar.alloc_stall = (cedar.alloc_stall || 0) + (new Date() - stall)
    }

    cedar.blocks.update_head(cedar.size >> 8, as_i32(cedar.size))

    cedar.array.update(cedar.size, -(as_i32(cedar.size) + 255), -(as_i32(cedar.size) + 1))

    for (let i = cedar.size + 1; i < cedar.size + 255; i++) {
        cedar.array.update(i, -(as_i32(i) - 1), -(as_i32(i) + 1))
    }

    cedar.array.update(cedar.size + 255, -(as_i32(cedar.size) + 254), -as_i32(cedar.size))

    const isEmpty = cedar.blocks_head_open === 0
    const idx = as_i32(cedar.size >> 8)
    debug_assert(cedar.blocks.num(as_usize(idx)) > 1)
    push_block(cedar, idx, BlockType.Open, isEmpty)

    cedar.size += 256

    return as_i32((cedar.size >> 8) - 1)
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} idx
 * @param {BlockType} from
 * @param {BlockType} to
 * @param {boolean} toBlockEmpty
 */
const transfer_block = (cedar, idx, from, to, toBlockEmpty) => {
    const isLast = idx === cedar.blocks.next(as_usize(idx))
    const isEmpty = toBlockEmpty && cedar.blocks.num(as_usize(idx))

    pop_block(cedar, idx, from, isLast)
    push_block(cedar, idx, to, isEmpty)
}

/**
 *
 * @param {Cedar} cedar
 * @param {BlockType} type
 */
const get_head = (cedar, type) => {
    let head

    switch (type) {
        case BlockType.Open:
            head = cedar.blocks_head_open
            break
        case BlockType.Closed:
            head = cedar.blocks_head_closed
            break
        case BlockType.Full:
            head = cedar.blocks_head_full
            break
        default:
            throw new Error(`Invalid BlockType: ${type}`)
    }

    return head
}

/**
 *
 * @param {Cedar} cedar
 * @param {BlockType} type
 */
const set_head = (cedar, type, head) => {
    switch (type) {
        case BlockType.Open:
            cedar.blocks_head_open = head
            break
        case BlockType.Closed:
            cedar.blocks_head_closed = head
            break
        case BlockType.Full:
            cedar.blocks_head_full = head
            break
        default:
            throw new Error(`Invalid BlockType: ${type}`)
    }
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} idx
 * @param {BlockType} from
 * @param {boolean} last
 */
const pop_block = (cedar, idx, from, last) => {
    let head
    if (last) {
        head = 0
    } else {
        head = get_head(cedar, from)
        const b = cedar.blocks.at(as_usize(idx))
        cedar.blocks.update_next(as_usize(b.prev), b.next)
        cedar.blocks.update_prev(as_usize(b.next), b.prev)

        if (idx === head) {
            head = b.next
        }
    }

    if (head !== undefined) {
        set_head(cedar, from, head)
    }
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} idx
 * @param {BlockType} to
 * @param {boolean} empty
 */
const push_block = (cedar, idx, to, empty) => {
    let head = get_head(cedar, to)

    if (empty) {
        cedar.blocks.update_next(as_usize(idx), idx)
        cedar.blocks.update_prev(as_usize(idx), idx)
        head = idx
    } else {
        cedar.blocks.update_prev(as_usize(idx), cedar.blocks.prev(as_usize(head)))
        cedar.blocks.update_next(as_usize(idx), head)
        const t = cedar.blocks.prev(as_usize(head))
        cedar.blocks.update_next(as_usize(t), idx)
        cedar.blocks.update_prev(as_usize(head), idx)
        head = idx
    }

    set_head(cedar, to, head)
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} base
 * @param {number} label
 * @param {*} from
 * @returns
 */
const pop_e_node = (cedar, base, label, from) => {
    let e
    if (base < 0) {
        e = find_place(cedar)
    } else {
        e = base ^ as_i32(label)
    }

    const { array, blocks } = cedar
    const idx = e >> 8
    const n = array.at(as_usize(e))

    blocks.increment_num(as_usize(idx), -1)
    if (blocks.num(as_usize(idx)) === 0) {
        if (idx !== 0) {
            transfer_block(cedar, idx, BlockType.Closed, BlockType.Full, cedar.blocks_head_full === 0)
        }
    } else {
        array.update_check(as_usize(-n.base), n.check)
        array.update_base(as_usize(-n.check), n.base)

        if (e === cedar.blocks.head(as_usize(idx))) {
            blocks.update_head(as_usize(idx), -n.check)
        }

        if (idx !== 0 && cedar.blocks.num(as_usize(idx)) === 1 && cedar.blocks.trial(as_usize(idx)) !== cedar.max_trial) {
            transfer_block(cedar, idx, BlockType.Open, BlockType.Closed, cedar.blocks_head_closed === 0)
        }
    }

    if (label !== 0) {
        array.update_base(as_usize(e), -1)
    } else {
        array.update_base(as_usize(e), 0)
    }
    array.update_check(as_usize(e), from)
    if (base < 0) {
        array.update_base(as_usize(from), e ^ as_i32(label))
    }
    return e
}

/**
 *
 * @param {Cedar} cedar
 * @returns
 */
const find_place = (cedar) => {
    if (cedar.blocks_head_closed !== 0) {
        return cedar.blocks.head(as_usize(cedar.blocks_head_closed))
    }

    if (cedar.blocks_head_open !== 0) {
        return cedar.blocks.head(as_usize(cedar.blocks_head_open))
    }

    return add_block(cedar) << 8
}

/**
 *
 * @param {Cedar} cedar
 * @param {number[]} child
 * @returns
 */
const find_places = (cedar, child) => {
    let idx = cedar.blocks_head_open

    if (idx !== 0) {
        debug_assert(cedar.blocks.num(as_usize(idx)) > 1)
        const bz = cedar.blocks.prev(as_usize(cedar.blocks_head_open))
        const nc = child.length

        while (true) {
            const idxu = as_usize(idx)
            if (cedar.blocks.num(idxu) >= nc && nc < cedar.blocks.reject(idxu)) {
                let e = cedar.blocks.head(idxu)
                while (true) {
                    const base = e ^ as_i32(child[0])
                    let i = 1
                    while (cedar.array.check(as_usize(base ^ as_i32(child[i]))) < 0) {
                        if (i === child.length - 1) {
                            cedar.blocks.update_head(idxu, e)
                            return e
                        }
                        i++
                    }

                    e = -cedar.array.check(as_usize(e))
                    if (e === cedar.blocks.head(as_usize(idx))) {
                        break
                    }
                }
            }

            cedar.blocks.update_reject(idxu, nc)
            if (cedar.blocks.reject(idxu) < cedar.reject.at(as_usize(cedar.blocks.num(idxu)))) {
                cedar.reject.update(as_usize(cedar.blocks.num(idxu)), cedar.blocks.reject(idxu))
            }

            const idx_ = cedar.blocks.next(idxu)

            cedar.blocks.increment_trial(idxu, 1)

            // move this block to the 'Closed' block list since it has reached the max_trial
            if (cedar.blocks.trial(idxu) === cedar.max_trial) {
                transfer_block(cedar, idx, BlockType.Open, BlockType.Closed, cedar.blocks_head_closed === 0)
            }

            // we have finsihed one round of this cyclic doubly-linked-list.
            if (idx === bz) {
                break
            }

            // going to the next in this linked list group
            idx = idx_
        }
    }

    return add_block(cedar) << 8
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} base
 * @param {number} c
 * @param {number} label
 * @param {boolean} notTerminal
 */
const set_child = (cedar, base, c, label, notTerminal) => {
    const child = []

    if (c === 0) {
        child.push(c)
        c = cedar.infos.sibling(as_usize(base ^ as_i32(c)))
    }

    if (cedar.ordered) {
        while (c !== 0 && c <= label) {
            child.push(c)
            c = cedar.infos.sibling(as_usize(base ^ as_i32(c)))
        }
    }

    if (notTerminal) {
        child.push(label)
    }

    while (c !== 0) {
        child.push(c)
        c = cedar.infos.sibling(as_usize(base ^ as_i32(c)))
    }

    return child
}


/**
 *
 * @param {Cedar} cedar
 * @param {number} base_n
 * @param {number} base_p
 * @param {number} c_n
 * @param {number} c_p
 */
const consult = (cedar, base_n, base_p, c_n, c_p) => {
    const { infos } = cedar
    while (true) {
        c_n = infos.sibling(as_usize(base_n ^ as_i32(c_n)))
        c_p = infos.sibling(as_usize(base_p ^ as_i32(c_p)))

        if (!(c_n !== 0 && c_p !== 0)) {
            break
        }
    }

    return c_p !== 0
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} from_n
 * @param {number} base_n
 * @param {number} label_n
 */
const resolve = (cedar, from_n, base_n, label_n) => {
    const to_pn = base_n ^ as_i32(label_n)

    // the `base` and `from` for the conflicting one.
    const from_p = cedar.array.check(as_usize(to_pn))
    const base_p = cedar.array.base(as_usize(from_p))

    // whether to replace siblings of newly added
    const flag = consult(cedar,
        base_n,
        base_p,
        cedar.infos.child(as_usize(from_n)),
        cedar.infos.child(as_usize(from_p))
    )

    let children

    if (flag) {
        children = set_child(cedar, base_n, cedar.infos.child(as_usize(from_n)), label_n, true)
    } else {
        children = set_child(cedar, base_p, cedar.infos.child(as_usize(from_p)), 255, false)
    }

    let base

    if (children.length === 1) {
        base = find_place(cedar)
    } else {
        base = find_places(cedar, children)
    }

    base ^= as_i32(children[0])

    let from, base_

    if (flag) {
        from = as_i32(from_n)
        base_ = base_n
    } else {
        from = from_p
        base_ = base_p
    }

    if (flag && children[0] === label_n) {
        cedar.infos.update_child(as_usize(from), label_n)
    }

    cedar.array.update_base(as_usize(from), base)

    for (let i = 0; i < children.length; i++) {
        const to = pop_e_node(cedar, base, children[i], from)
        const to_ = base_ ^ as_i32(children[i])

        if (i === children.length - 1) {
            cedar.infos.update_sibling(as_usize(to), 0)
        } else {
            cedar.infos.update_sibling(as_usize(to), children[i + 1])
        }

        if (flag && to_ === to_pn) {
            continue
        }

        cedar.array.update_base(as_usize(to), cedar.array.base(as_usize(to_)))

        const condition = cedar.array.base(as_usize(to)) > 0 && children[i] !== 0

        if (condition) {
            let c = cedar.infos.child(as_usize(to_))

            cedar.infos.update_child(as_usize(to), c)

            while (true) {
                const idx = as_usize(cedar.array.base(as_usize(to)) ^ as_i32(c))
                cedar.array.update_check(idx, to)
                c = cedar.infos.sibling(idx)

                if (c === 0) {
                    break
                }
            }
        }

        if (!flag && to_ === as_i32(from_n)) {
            from_n = as_usize(to)
        }

        if (!flag && to_ === to_pn) {
            push_sibling(cedar, from_n, to_pn ^ as_i32(label_n), label_n, true)
            cedar.infos.update_child(as_usize(to_), 0)

            if (label_n !== 0) {
                cedar.array.update_base(as_usize(to_), -1)
            } else {
                cedar.array.update_base(as_usize(to_), 0)
            }

            cedar.array.update_check(as_usize(to_), as_i32(from_n))
        } else {
            push_e_node(cedar, to_)
        }
    }

    if (flag) {
        return base ^ as_i32(label_n)
    } else {
        return to_pn
    }
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} to
 */
const push_e_node = (cedar, e) => {
    let idx = e >> 8
    let idxu = as_usize(idx)

    const { array, blocks, infos, reject } = cedar

    blocks.increment_num(idxu, 1)

    if (blocks.num(idxu) === 1) {
        blocks.update_head(idxu, e)
        array.update(as_usize(e), -e, -e)

        if (idx !== 0) {
            transfer_block(cedar, idx, BlockType.Full, BlockType.Closed, cedar.blocks_head_closed == 0)
        }
    } else {
        let prev = blocks.head(idxu)

        let next = -array.check(as_usize(prev))

        array.update(as_usize(e), -prev, -next)

        array.update_check(as_usize(prev), -e)
        array.update_base(as_usize(next), -e)

        if (blocks.num(idxu) === 2 || blocks.trial(idxu) === cedar.max_trial) {
            debug_assert(blocks.num(idxu) > 1)
            if (idx !== 0) {
                transfer_block(cedar, idx, BlockType.Closed, BlockType.Open, cedar.blocks_head_open === 0)
            }
        }

        blocks.update_trial(idxu, 0)
    }

    if (blocks.reject(idxu) < reject.at(blocks.num(idxu))) {
        blocks.update_reject(idxu, reject.at(blocks.num(idxu)))
    }

    infos.update(as_usize(e), 0, 0)
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} from
 * @param {number} p
 * @param {number} root
 * @returns
 */
const find_next = (cedar, target) => {
    const { array, infos } = cedar
    let { from, p, root } = target
    from = as_usize(from)
    let c = infos.sibling(as_usize(array.base(from)))

    while (c === 0 && from !== root) {
        c = infos.sibling(from)
        from = as_usize(array.check(from))
        p--
    }

    if (c !== 0) {
        from = as_usize(array.base(from) ^ as_i32(c))
        begin(cedar, from, p + 1, target)
    } else {
        target.value = NONE
        target.from = from
        target.p = p
    }
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} from
 * @param {number} p
 * @returns
 */
const begin = (cedar, from, p, target) => {
    const { array, infos } = cedar
    let c = infos.child(from)

    if (from === 0) {
        const base = array.base(from)
        c = infos.sibling(as_usize(base ^ as_i32(c)))

        if (c === 0) {
            target.value = NONE
            target.from = from
            target.p = p
            return
        }
    }

    while (c !== 0) {
        from = as_usize(array.base(from) ^ as_i32(c))
        c = infos.child(from)
        p++
    }

    const value = array.base(as_usize(array.base(from) ^ as_i32(c)))
    target.value = value
    target.from = from
    target.p = p
}

const store_meta = (buffer, cedar, header) => {
    buffer.writeInt32LE(cedar.blocks_head_closed, 0)
    buffer.writeInt32LE(cedar.blocks_head_open, 4)
    buffer.writeInt32LE(cedar.blocks_head_full, 8)
    buffer.writeInt32LE(cedar.blocks_head_full, 8)
    buffer.writeInt32LE(cedar.capacity, 12)
    buffer.writeInt32LE(cedar.size, 16)
    buffer.writeInt32LE(cedar.ordered ? 1 : 0, 20)
    buffer.writeInt32LE(cedar.max_trial, 24)

    let offset = 28

    offset = cedar.array.storeMeta(buffer, offset)
    offset = cedar.infos.storeMeta(buffer, offset)
    offset = cedar.blocks.storeMeta(buffer, offset)
    offset = cedar.reject.storeMeta(buffer, offset)

    buffer.writeInt32LE(header.array.offset, offset)
    buffer.writeInt32LE(header.infos.offset, offset + 4)
    buffer.writeInt32LE(header.blocks.offset, offset + 8)
    buffer.writeInt32LE(header.reject.offset, offset + 12)
}

const load_meta = (buffer, cedar) => {
    cedar.blocks_head_closed = buffer.readInt32LE(0)
    cedar.blocks_head_open = buffer.readInt32LE(4)
    cedar.blocks_head_full = buffer.readInt32LE(8)
    cedar.capacity = buffer.readInt32LE(12)
    cedar.size = buffer.readInt32LE(16)
    cedar.ordered = buffer.readInt32LE(20) === 1
    cedar.max_trial = buffer.readInt32LE(24)

    let offset = 28

    cedar.array = NodeBuffer.preLoad(buffer, offset)
    cedar.infos = NInfoBuffer.preLoad(buffer, offset += 12)
    cedar.blocks = BlockBuffer.preLoad(buffer, offset += 12)
    cedar.reject = RejectBuffer.preLoad(buffer, offset += 12)
    offset += 12

    const header = {
        array: {
            offset: buffer.readInt32LE(offset)
        },
        infos: {
            offset: buffer.readInt32LE(offset + 4)
        },
        blocks: {
            offset: buffer.readInt32LE(offset + 8)
        },
        reject: {
            offset: buffer.readInt32LE(offset + 12)
        }
    }

    return header
}

const header = cedar => {
    const h = {
        array: {
            offset: 0
        },
        infos: {
            offset: 0
        },
        blocks: {
            offset: 0
        },
        reject: {
            offset: 0
        }
    }

    let offset

    offset = h.array.offset = FIELD_OVERHEAD
    offset = h.infos.offset = cedar.infos.align(offset + cedar.array.byteLength)
    offset = h.blocks.offset = cedar.blocks.align(offset + cedar.infos.byteLength)
    offset = h.reject.offset = cedar.reject.align(offset + cedar.blocks.byteLength)

    h.totalLen = offset + cedar.reject.byteLength

    return h
}

const store_data = (buffer, cedar) => {
    const h = header(cedar)
    const { array, infos, blocks, reject } = h

    store_meta(buffer, cedar, h)

    cedar.array.storeData(buffer, array.offset)
    cedar.infos.storeData(buffer, infos.offset)
    cedar.blocks.storeData(buffer, blocks.offset)
    cedar.reject.storeData(buffer, reject.offset)
}

const load_data = (buffer, cedar) => {
    const header = load_meta(buffer, cedar)
    const { array, infos, blocks, reject } = header

    cedar.array.loadData(buffer, array.offset)
    cedar.infos.loadData(buffer, infos.offset)
    cedar.blocks.loadData(buffer, blocks.offset)
    cedar.reject.loadData(buffer, reject.offset)
}

const deserialize_cedar = (buffer, proto) => {
    const cedar = Object.setPrototypeOf({}, proto)

    load_data(buffer, cedar)

    return cedar
}

/**
 *
 * @param {Cedar} cedar
 * @param {number} from
 */
const erase_ = (cedar, from) => {
    const { array, infos } = cedar

    let e = array.base(from)
    let has_sibling = false

    for (; ;) {
        const n = array.at(from)
        has_sibling = infos.sibling(as_usize(n.base ^ as_i32(infos.child(from)))) != 0

        if (has_sibling) {
            pop_sibling(cedar, as_i32(from), n.base, as_u8(n.base ^ e))
        }

        push_e_node(cedar, e)
        e = as_i32(from)

        from = as_usize(array.check(from))

        if (has_sibling) {
            break
        }
    }
}

const pop_sibling = (cedar, from, base, label) => {
    const { infos } = cedar
    var ix = as_usize(from)
    var c = infos.child(ix)
    var sibling = c !== label

    if (sibling) {
        do {
            var code = as_i32(c)
            c = infos.sibling(ix = as_usize(base ^ code))
        } while (c !== label)
    }

    var code = as_i32(label)
    c = infos.sibling(base ^ code)
    if (sibling) {
        infos.update_sibling(ix, c)
    } else {
        infos.update_child(ix, c)
    }
}

/* eslint-enable */

/**
 *
 * @param {Buffer} buffer
 * @returns {ITrie}
 */
const deserializeTrie = (buffer) => {
    return Cedar.deserialize(buffer)
}

module.exports = { Cedar, deserializeTrie }