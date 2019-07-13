'use strict'

import test from 'ava'
import FuseFS from '../src'

const path = '/path'

test('error conversion', async t => {
  let _err
  let _path
  let count = 0
  let results
  const fs = {
    stat: (path, _cb) => {
      count++
      _path = path
      Promise.resolve().then(() => _cb(_err))
    }
  }
  const ffs = new FuseFS(fs)

  // -ve number
  _err = -23
  count = 0
  _path = undefined
  results = await ffs.invoke('getattr', path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [_err])

  // string code
  _err = 'ENOTDIR'
  count = 0
  _path = undefined
  results = await ffs.invoke('getattr', path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-20])

  // not an object
  _err = true
  count = 0
  _path = undefined
  results = await ffs.invoke('getattr', path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-1])

  // { code }
  _err = { code: 'ENOSYS' }
  count = 0
  _path = undefined
  results = await ffs.invoke('getattr', path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-38])

  // { errno }
  _err = { errno: -123 }
  count = 0
  _path = undefined
  results = await ffs.invoke('getattr', path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-123])

  // other object
  _err = { foo: 'bar' }
  count = 0
  _path = undefined
  results = await ffs.invoke('getattr', path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-1])
})

test('utimens', async t => {
  let _args
  const fs = {
    utimes: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)

  await ffs.invoke('utimens', path, 123400000000, 789000000000)
  t.deepEqual(_args, [path, 123.4, 789])
})

test('release', async t => {
  let _args
  const fs = {
    close: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)

  await ffs.invoke('release', path, 456)
  t.deepEqual(_args, [456])
})

test('fsync', async t => {
  let _args
  const fs = {
    fsync: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)

  await ffs.invoke('fsync', path, 17, true)
  t.deepEqual(_args, [17])
})

test('open', async t => {
  let _args
  const fs = {
    open: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)

  await ffs.invoke('open', path, 0)
  t.deepEqual(_args, [path, 'r'])

  _args = null
  await ffs.invoke('open', path, 2)
  t.deepEqual(_args, [path, 'r+'])

  _args = null
  await ffs.invoke('open', path, 64 | 1024 | 2)
  t.deepEqual(_args, [path, 'a+'])

  _args = null
  await ffs.invoke('open', path, 64 | 128 | 1)
  t.deepEqual(_args, [path, 'wx'])
})

test('create', async t => {
  let _args
  const fs = {
    open: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(() => _cb(0, 17))
    }
  }
  const ffs = new FuseFS(fs)

  const results = await ffs.invoke('create', path, 0o755)
  t.deepEqual(_args, [path, 'w', 0o755])
  t.deepEqual(results, [0, 17])
})

test('read', async t => {
  let _args
  let _ret
  const fs = {
    read: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(() => _cb(..._ret))
    }
  }
  const ffs = new FuseFS(fs)
  _ret = [0, 17]
  let results = await ffs.invoke('read', path, 11, 22, 33, 44)
  t.deepEqual(_args, [11, 22, 0, 33, 44])
  t.deepEqual(results, [17])

  _ret = [-234]
  results = await ffs.invoke('read', path, 11, 22, 33, 44)
  t.deepEqual(results, [-234])
})

test('write', async t => {
  let _args
  let _ret
  const fs = {
    write: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(() => _cb(..._ret))
    }
  }
  const ffs = new FuseFS(fs)
  _ret = [0, 17]
  let results = await ffs.invoke('write', path, 11, 22, 33, 44)
  t.deepEqual(_args, [11, 22, 0, 33, 44])
  t.deepEqual(results, [17])

  _ret = [-234]
  results = await ffs.invoke('write', path, 11, 22, 33, 44)
  t.deepEqual(results, [-234])
})

test('before intercept', async t => {
  let _args

  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)
  const undo = ffs.before('getattr', ctx => {
    ctx.results = [1, 2, 3]
  })

  let result = await ffs.invoke('getattr', path)
  t.deepEqual(result, [1, 2, 3])

  undo()
  undo()
  result = await ffs.invoke('getattr', path)
  t.deepEqual(result, [undefined])
})

test('after intercept', async t => {
  let _args

  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)

  const undo = ffs.after('getattr', async ctx => {
    ctx.results = [3, 4, 5]
  })

  let result = await ffs.invoke('getattr', path)
  t.deepEqual(result, [3, 4, 5])

  undo()
  result = await ffs.invoke('getattr', path)
  t.deepEqual(result, [undefined])
})

test('intercept that throws', async t => {
  let _args
  const err = new Error('oops')
  err.code = 'ENOTDIR'

  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)
  const undo = ffs.after('foobar', 'getattr', ctx => {
    throw err
  })

  const result = await ffs.invoke('getattr', path)
  t.deepEqual(result, [-20])

  undo()
})

test('bad intercepts', async t => {
  let _args
  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)

  let undo = ffs.before('foobar', () => {})
  undo()

  undo = ffs.before('getattr', 17)
  undo()
  t.pass()
})

test('intercept returning thenable', async t => {
  let _args
  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)
  ffs.before('getattr', ctx => {
    const p = Promise.resolve().then(() => {
      ctx.results = [1, 2, 3]
    })
    return { then: p.then.bind(p) }
  })

  const result = await ffs.invoke('getattr', path)
  t.deepEqual(result, [1, 2, 3])
})

test.cb('invoke like FUSE', t => {
  let _args
  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)
  ffs.fuseOps.getattr(path, err => {
    t.falsy(err)
    t.deepEqual(_args, [path])
    t.end()
  })
})

test('invoke with missing method', async t => {
  let _args
  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ffs = new FuseFS(fs)
  const results = await ffs.invoke('foobar', path)
  t.deepEqual(results, [-1])
})
