# cedar-node
Cedar node.js backport

Efficiently-updatable double-array trie in nodej.js backported from [Rust](https://github.com/MnO2/cedarwood) and [Java](https://github.com/cmuramoto/cedar-java).

This trie is designed to store very large datasets and has constant O(k) lookup time (where k is the length of the string), regardless of the number of keys.

Even for node performance is pretty much OK, with ~1.8 million lookups/s with 100 million keys of length 8.

### Usage

#### Basic

```node
const cedar = new Cedar(true) // optional, false=encode keys in utf-8 before updates/lookups

cedar.update('foo', 10)

cedar.lookup('foo') // {value: 10, from: 257}. From is a pointer to a cursor in prefix searches

cedar = new Cedar(true) 

// bulk update (keys will be mapped to corresponding indices)
cedar.build(['foo', 'bar', 'roo'])

cedar.lookup('bar') // {value: 10, from: ...}

cedar.erase('bar') // 10

cedar.lookup('bar') // null

// keys is a stream, strings are created lazyly on demand 
[...cedar.keys()] // ['foo', 'roo']

// values is a stream, numbers are created lazyly on demand 
[...cedar.values()] // [0, 2]

```

#### Prefix matches and completing suffixes

```node

const values = ['banana', 'barata', 'bacanal', 'bacalhau', 'mustnotmatch_ba']

const cedar = new Cedar()
cedar.build(values)

for (const v of cedar.predict(prefix)) {
    const match = values[v.value]
    
    assertEquals(prefix.length + v.length, match.length)

    assertEquals(0, match.indexOf(prefix))

    // completes suffix of the matching prefix: 'ba' => ['nana', 'rata', 'canal', 'calhau']
    const suffix = cedar.suffix(v.from, v.length)

    // concat if necessary to find the match
    assertEquals(prefix + suffix, match)

    count++
}

```

#### Text Parsing

```
const dict = ['fo', 'foo', 'ba', 'bar']

const Cedar = new Cedar()
cedar.build(dict)

// -----------012345678910
const text = "foo foo bar"; 

cedar.parse(text,(begin, end, value) => {
  console.log({begin, end, value, sub: text.substring(begin,end)})
})

// {begin: 0, end: 2, value: 0, sub: 'fo'}
// {begin: 0, end: 3, value: 1, sub: 'foo'}
// {begin: 4, end: 6, value: 0, sub: 'fo'}
// {begin: 4, end: 7, value: 1, sub: 'fo'}
// {begin: 8, end: 10, value: 2, sub: 'ba'}
// {begin: 8, end: 11, value: 3, sub: 'bar'}

// same as parse, but returns a stream of matches {begin, end, value}
[...cedar.hits(text)]
```

#### Serialization

```node

let cedar = new Cedar()
cedar.build(...stream)

const buffer = cedar.serialize()

// exported function
cedar = deserializeTrie(buffer)

```

#### Large Streams

Cedar's build method is useful only for small datasets with data residing on heap. Storing very large datasets is no issue as long as there's memory available. Since the Cedar's internal data structures are represented as (4) contiguous buffers, it has virtually zero impact on garbage collection.

The only caveat is, as buffers grow large, allocation may stall. See [Java](https://github.com/cmuramoto/cedar-java) for more details.
