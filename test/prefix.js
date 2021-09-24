
const { Cedar, deserializeTrie } = require('../index')

const { assertEquals } = require('./share')

const run = () => {

  const values = ['banana', 'barata', 'bacanal', 'bacalhau', 'mustnotmatch_ba']

  const c = new Cedar()
  c.build(values)
  const buffer = c.serialize()
  const cedar = deserializeTrie(buffer)
  assertEquals(true, cedar.compare(cedar))

  const prefix = 'ba'
  const empty = ''

  console.log(`Streaming suffixes of ${prefix}`)
  let count = 0
  for (const v of cedar.predict(prefix)) {
    const match = values[v.value]
    console.log(`${JSON.stringify(v)} => ${match}`)

    assertEquals(prefix.length + v.length, match.length)

    assertEquals(0, match.indexOf(prefix))

    const suffix = cedar.suffix(v.from, v.length)

    assertEquals(prefix + suffix, match)

    count++
  }

  assertEquals(count, values.length - 1)

  count = 0

  console.log('Streaming all')
  //empty = stream whole tree
  for (const v of cedar.predict(empty)) {
    const match = values[v.value]

    assertEquals(v.length, match.length)
    count++

    const suffix = cedar.suffix(v.from, v.length)

    assertEquals(empty + suffix, match)
  }

  assertEquals(count, values.length)

  const keys = [...cedar.keys()]
  const indices = [...cedar.indices()]

  assertEquals(keys.length, values.length)
  assertEquals(indices.length, values.length)

  values.forEach(v => assertEquals(keys.find(t => t === v), v))
  indices.forEach(ix => assertEquals(values.find(t => t === keys[ix]), keys[ix]))

}

(
  () => {
    try {
      run()
    } catch (e) {
      console.log(e)
    } finally {
      setTimeout(() => { process.exit(0) }, 100)
    }
  }
)()
