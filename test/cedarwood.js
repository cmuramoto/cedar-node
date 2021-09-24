const { Cedar } = require('../index')

const { assertEquals, assertArrayEquals, assertNull, log, randomAlpha } = require('./share')

const cedarwood_suite = {
    test_prefixes: () => {
        let dict = ["a", "ab", "abc", "アルゴリズム", "データ", "構造", "网", "网球", "网球拍", "中", "中华", "中华人民", "中华人民共和国"]

        let cedar = new Cedar()

        cedar.build(dict)

        let result = [...cedar.prefixes("abcdefg")].map(v => v.value)
        assertArrayEquals([0, 1, 2], result)

        result = [...cedar.prefixes("网球拍卖会")].map(v => v.value)
        assertArrayEquals([6, 7, 8], result)

        result = [...cedar.prefixes("中华人民共和国")].map(v => v.value)
        assertArrayEquals([9, 10, 11, 12], result)

        result = [...cedar.prefixes("データ構造とアルゴリズム")].map(v => v.value)
        assertArrayEquals([4], result)

    },
    test_common_prefix_predict: () => {
        let dict = ["a", "ab", "abc", "abcdef"]

        let cedar = new Cedar()

        cedar.build(dict)

        let result = [...cedar.predict("a")].map(v => v.value)
        assertArrayEquals([0, 1, 2, 3], result)

        result = [...cedar.predict("a")].map(v => v.length)
        assertArrayEquals([0, 1, 2, 5], result)
    },
    test_common_prefix_search: () => {
        let dict = ["a", //
            "ab", //
            "abc", //
            "アルゴリズム", //
            "データ", //
            "構造", //
            "网", //
            "网球", //
            "网球拍", //
            "中", //
            "中华", //
            "中华人民", //
            "中华人民共和国"]
        let cedar = new Cedar()

        cedar.build(dict)

        let result = [...cedar.prefixes("abcdefg")].map(v => v.value)

        assertArrayEquals([0, 1, 2], result)

        result = [...cedar.prefixes("网球拍卖会")].map(v => v.value)
        assertArrayEquals([6, 7, 8], result)

        result = [...cedar.prefixes("中华人民共和国")].map(v => v.value)
        assertArrayEquals([9, 10, 11, 12], result)

        result = [...cedar.prefixes("データ構造とアルゴリズム")].map(v => v.value)

        assertArrayEquals([4], result)
    },
    test_duplication: () => {
        let cedar = new Cedar()

        let dict = ["些许端", "些須", "些须", "亜", "亝", "亞", "亞", "亞丁", "亞丁港"]

        cedar.build(dict)

        assertEquals(6, cedar.lookup("亞").value)
        assertEquals(8, cedar.lookup("亞丁港").value)
        assertEquals(4, cedar.lookup("亝").value)
        assertEquals(1, cedar.lookup("些須").value)
    }, test_erase: () => {
        let dict = ["a", "ab", "abc"]
        let cedar = new Cedar(true)

        cedar.build(dict)

        assertEquals(0, cedar.lookup("a").value)
        assertEquals(1, cedar.lookup("ab").value)
        assertEquals(2, cedar.lookup("abc").value)

        cedar.erase("abc")
        assertEquals(0, cedar.lookup("a").value)
        assertEquals(1, cedar.lookup("ab").value)
        assertNull(cedar.lookup("abc"))

        cedar.erase("ab")
        assertEquals(0, cedar.lookup("a").value)
        assertNull(cedar.lookup("ab"))
        assertNull(cedar.lookup("abc"))

        cedar.erase("a")
        assertNull(cedar.lookup("a"))
        assertNull(cedar.lookup("ab"))
        assertNull(cedar.lookup("abc"))
    },
    test_exact_match_search: () => {
        let dict = ["a", "ab", "abc"]
        let cedar = new Cedar()
        cedar.build(dict)

        let result = cedar.lookup("abc")
        assertEquals(2, result.value)
    },
    test_insert_and_delete: () => {
        let dict = ["a"]
        let cedar = new Cedar()
        cedar.build(dict)

        let result = cedar.lookup("a")
        assertEquals(0, result.value)

        result = cedar.lookup("ab")
        assertNull(result)

        cedar.update("ab", 1)
        result = cedar.lookup("ab")
        assertEquals(1, result.value)

        cedar.erase("ab")
        result = cedar.lookup("ab")
        assertNull(result)

        cedar.update("abc", 2)
        result = cedar.lookup("abc")
        assertEquals(2, result.value)

        cedar.erase("abc")
        result = cedar.lookup("abc")
        assertNull(result)

        result = cedar.lookup("a")
        assertEquals(0, result.value)
    },
    test_mass_erase: () => {
        let max = 1000

        let set = new Set()
        while (set.size < max) {
            let chars = randomAlpha(30)

            set.add(chars)
        }

        let dict = [...set]
        let cedar = new Cedar()
        cedar.build(dict)

        for (let i = 0; i < dict.length; i++) {
            let s = dict[i]
            assertEquals(i, cedar.lookup(s).value)
            cedar.erase(s)
            assertNull(cedar.lookup(s))
        }
    },
    test_quickcheck_like: () => {
        let max = 1000

        let set = new Set()
        while (set.size < max) {
            let chars = randomAlpha(30)

            set.add(chars)
        }

        let cedar = new Cedar()
        let dict = [...set]
        cedar.build(dict)

        for (let i = 0; i < max; i++) {
            assertEquals(i, cedar.lookup(dict[i]).value)
        }
    },
    test_quickcheck_like_with_deep_trie: () => {
        let max = 1000
        let set = new Set()
        let sb = ''
        for (let i = 0; i < max; i++) {
            let c = randomAlpha(1)
            sb += c
            set.add(sb)
        }

        let dict = [...set]
        let cedar = new Cedar()
        cedar.build(dict)

        for (let i = 0; i < max; i++) {
            let s = dict[i]
            assertEquals(i, cedar.lookup(s).value)
        }
    },
    test_unicode_grapheme_cluster: () => {
        let dict = ["a", "abc", "abcde\u0301"]

        let cedar = new Cedar()

        cedar.build(dict)

        let result = [...cedar.prefixes("abcde\u0301\u1100\u1161\uAC00")].map(v => v.value)
        assertArrayEquals([0, 1, 2], result)
    },
    test_unicode_han_sip: () => {
        let dict = ["讥䶯䶰", "讥䶯䶰䶱䶲", "讥䶯䶰䶱䶲䶳䶴䶵𦡦"]

        let cedar = new Cedar()
        cedar.build(dict)

        let result = [...cedar.prefixes("讥䶯䶰䶱䶲䶳䶴䶵𦡦")].map(v => v.value)
        assertArrayEquals([0, 1, 2], result)
    },
    test_update: () => {
        let dict = ["a", "ab", "abc"]

        let cedar = new Cedar()
        cedar.build(dict)

        cedar.update("abcd", 3)

        assertEquals(0, cedar.lookup("a").value)
        assertEquals(1, cedar.lookup("ab").value)
        assertEquals(2, cedar.lookup("abc").value)
        assertEquals(3, cedar.lookup("abcd").value)
        assertNull(cedar.lookup("abcde"))

        dict = ["a", "ab", "abc"]

        cedar = new Cedar()
        cedar.build(dict)
        cedar.update("bachelor", 1)
        cedar.update("jar", 2)
        cedar.update("badge", 3)
        cedar.update("baby", 4)

        assertEquals(1, cedar.lookup("bachelor").value)
        assertEquals(2, cedar.lookup("jar").value)
        assertEquals(3, cedar.lookup("badge").value)
        assertEquals(4, cedar.lookup("baby").value)
        assertNull(cedar.lookup("abcde"))

        dict = ["a", "ab", "abc"]
        cedar = new Cedar()
        cedar.build(dict)

        cedar.update("中", 1)
        cedar.update("中华", 2)
        cedar.update("中华人民", 3)
        cedar.update("中华人民共和国", 4)

        assertEquals(1, cedar.lookup("中").value)
        assertEquals(2, cedar.lookup("中华").value)
        assertEquals(3, cedar.lookup("中华人民").value)
        assertEquals(4, cedar.lookup("中华人民共和国").value)
        assertNull(cedar.lookup("abcde"))
    }
}

const run = () => {
    const stats = {
        ok: [],
        err: []
    }
    Object.entries(cedarwood_suite).forEach(([k, v]) => {
        try {
            v()
            log(`${k} ok`)
            stats.ok.push(k)
        } catch (e) {
            log(`${k} error`)
            console.error(e.stack)
            stats.err.push(k)
        }
    })

    log(`Test finished. Passed: ${stats.ok.length}`)
    if (stats.err.length) {
        log(`Failed: ${JSON.stringify(stats.err)}`)
    }
}

run()