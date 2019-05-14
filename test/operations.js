'use strict'

import test from 'ava'
import Operations from '../src/operations'

function noop () {}
const noopFs = {
  stat: noop,
  readdir: noop,
  open: noop,
  read: noop,
  close: noop
}

function cbToPromise (fn) {
  return (...args) =>
    new Promise(resolve => {
      fn(...args, (...results) => resolve(results))
    })
}

const path = '/path'

test('basic conversion of fs-like', t => {
  const fs = { ...noopFs }
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  t.is(typeof fns.getattr, 'function')
  t.is(typeof fns.readdir, 'function')
  t.is(typeof fns.open, 'function')
  t.is(typeof fns.create, 'function')
  t.is(typeof fns.read, 'function')
  t.is(typeof fns.release, 'function')

  t.is(typeof fns.write, 'undefined')
})

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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const getattr = cbToPromise(fns.getattr)

  // -ve number
  _err = -23
  count = 0
  _path = undefined
  results = await getattr(path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [_err])

  // string code
  _err = 'ENOTDIR'
  count = 0
  _path = undefined
  results = await getattr(path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-20])

  // not an object
  _err = true
  count = 0
  _path = undefined
  results = await getattr(path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-1])

  // { code }
  _err = { code: 'ENOSYS' }
  count = 0
  _path = undefined
  results = await getattr(path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-38])

  // { errno }
  _err = { errno: -123 }
  count = 0
  _path = undefined
  results = await getattr(path)
  t.is(_path, path)
  t.is(count, 1)
  t.deepEqual(results, [-123])

  // other object
  _err = { foo: 'bar' }
  count = 0
  _path = undefined
  results = await getattr(path)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const utimens = cbToPromise(fns.utimens)

  await utimens(path, 123400000000, 789000000000)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const release = cbToPromise(fns.release)

  await release(path, 456)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const fsync = cbToPromise(fns.fsync)

  await fsync(path, 17, true)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const open = cbToPromise(fns.open)

  await open(path, 0)
  t.deepEqual(_args, [path, 'r'])
  _args = null

  await open(path, 2)
  t.deepEqual(_args, [path, 'r+'])
  _args = null

  await open(path, 64 | 1024 | 2)
  t.deepEqual(_args, [path, 'a+'])
  _args = null

  await open(path, 64 | 128 | 1)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const create = cbToPromise(fns.create)

  const results = await create(path, 0o755)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const read = cbToPromise(fns.read)

  _ret = [0, 17]
  let results = await read(path, 11, 22, 33, 44)
  t.deepEqual(_args, [11, 22, 0, 33, 44])
  t.deepEqual(results, [17])

  _ret = [-234]
  results = await read(path, 11, 22, 33, 44)
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
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const write = cbToPromise(fns.write)

  _ret = [0, 17]
  let results = await write(path, 11, 22, 33, 44)
  t.deepEqual(_args, [11, 22, 0, 33, 44])
  t.deepEqual(results, [17])

  _ret = [-234]
  results = await write(path, 11, 22, 33, 44)
  t.deepEqual(results, [-234])
})

test('pre-call intercept', async t => {
  let _args

  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const getattr = cbToPromise(fns.getattr)

  const undo = ops.beforeCall('getattr', async ctx => {
    return [1, 2, 3]
  })

  let result = await getattr(path)
  t.deepEqual(result, [1, 2, 3])

  undo()
  result = await getattr(path)
  t.deepEqual(result, [undefined])
})

test('post-call intercept', async t => {
  let _args

  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const getattr = cbToPromise(fns.getattr)

  const undo = ops.afterCall('getattr', async ctx => {
    ctx.results = [3, 4, 5]
  })

  let result = await getattr(path)
  t.deepEqual(result, [3, 4, 5])

  undo()
  result = await getattr(path)
  t.deepEqual(result, [undefined])
})

test('intercept that throws', async t => {
  let _args
  let err = new Error('oops')
  err.code = 'ENOTDIR'

  const fs = {
    stat: (...args) => {
      _args = args
      const _cb = _args.pop()
      Promise.resolve().then(_cb)
    }
  }
  const ops = new Operations(fs)
  const fns = ops.getFuseOps()
  const getattr = cbToPromise(fns.getattr)

  const undo = ops.afterCall('getattr', async ctx => {
    throw err
  })

  let result = await getattr(path)
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
  const ops = new Operations(fs)

  let undo = ops.beforeCall('foobar', () => {})
  undo()

  undo = ops.beforeCall('getattr', 17)
  undo()
  t.pass()
})
